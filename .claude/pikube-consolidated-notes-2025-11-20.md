# PiKube Consolidated Notes – State as of 2025-11-20

This file consolidates the key findings and changes from all `.claude` session logs so far, and ties them back to the live cluster and the documentation in `docs/`.

It is meant to be the single high-level reference you can read before resuming work or starting a fresh GitOps repo from the validated state.

---

## 1. Hardware & Cluster Baseline

- **Cluster size:** 9-node K3s cluster
  - 3× control-plane + etcd (Raspberry Pi 4B)
  - 6× workers (1× RPi 5, 2× OPi 5, 3× OPi 5 Ultra)
- **Infrastructure nodes:**
  - `gateway` (10.0.0.1 / 192.168.0.10) – router, firewall, DNS forwarder, NTP, HAProxy, Vault
  - `raspberry-sentinel` (10.0.0.4) – monitoring
  - `hedgeway` (10.0.0.2) – edge node, currently offline
- **Network:**
  - Cluster network: `10.0.0.0/24`
  - Home network: `192.168.0.0/24`
  - Gateway bridges both and does NAT + nftables firewall
  - DNS:
    - `dnsmasq` on gateway – forwarder + DHCP
    - Bind9 on `blueberry-master` – authoritative for `picluster.quantfinancehub.com`
  - External DNS: Cloudflare for `quantfinancehub.com` (used by cert-manager for DNS-01).
- **K3s:**
  - Version: `v1.34.1+k3s1`
  - CNI: Flannel (for now)
  - Disabled built-ins: local-storage, servicelb, traefik, metrics-server (replaced by Longhorn, MetalLB, NGINX, kube-prometheus-stack).
- **Node labels:**
  - Each node labeled with `pikube.io/device-type`, `pikube.io/cpu-cores`, `pikube.io/memory-gb`, `pikube.io/storage-gb`, `pikube.io/storage-type`.
  - NVMe workers (`lemon`, `clementine`, `grapefruit`) have `pikube.io/has-nvme=true` and `pikube.io/storage-type=sd-card---nvme`.

---

## 2. Storage Strategy & Longhorn

### 2.1 Storage reality

- **NVMe nodes:** `lemon-worker`, `clementine-worker`, `grapefruit-worker` (CT1000P3PSSD8, ~931GiB each) + SD
- **SD-only workers:** `cranberry`, `orange`, `mandarine`
- **Masters and infra:** SD-only

### 2.2 Longhorn design (docs/8-storage/1-distributed-block-storage-longhorn.md)

- All nodes have `nfs-common`, `open-iscsi`, `cryptsetup`, `dmsetup`; `iscsid` running.
- Multipath is enabled on OPi nodes but configured to **ignore** Longhorn devices via a `blacklist { devnode "^sd[a-z0-9]+" }` in `/etc/multipath.conf`.

- **Fast tier (NVMe):**
  - NVMe formatted and mounted at `/var/lib/longhorn/fast` on the three OPi 5 Ultra workers.
  - Longhorn data path set to `/var/lib/longhorn/fast`.
  - Default StorageClass `longhorn` uses only these disks (via disk tags and/or node selectors).

- **Slow tier (SD):**
  - Optional; not configured by default.
  - Would use `/var/lib/longhorn/slow` and a `longhorn-slow` StorageClass for cold or bulk data.

### 2.3 Longhorn cleanup & reinstall (2025-11-18 session)

- Previous Longhorn install was partially uninstalled and left `longhorn-system` stuck in `Terminating`.
- Performed full cleanup:
  - Deleted Longhorn CRs, CRDs, StorageClasses, and namespace.
- Fresh install:
  - Reinstalled Longhorn via Helm with updated `longhorn-values.yaml` (matching docs).
  - Verified only NVMe nodes are schedulable for Longhorn volumes.
  - Validated PVC provisioning and basic persistence test (`testing-longhorn` namespace, `Hello Longhorn`).

Longhorn documentation and live cluster are now aligned.

---

## 3. External Services: Vault & MinIO

### 3.1 Vault (gateway)

- Vault `1.19.2` running on gateway (`10.0.0.1`), storage backend `raft`.
- Mounted at `https://vault.picluster.quantfinancehub.com:8200`.
- TLS is managed via cert-manager (Let’s Encrypt + Cloudflare DNS-01) with careful handling of certificate renewal + auto-unseal.
- Important paths:
  - `secret/cert-manager/cloudflare` → `dns_cloudflare_api_token` (used by cert-manager for DNS-01 via External Secrets).
  - `secret/minio/root` → `user`, `key`, `config_env` for MinIO root.
  - `secret/minio/{longhorn,velero,restic,loki,tempo}` → MinIO users/keys.
  - `secret/ddns-bind9` → TSIG key for ExternalDNS (Bind9 RFC2136).

### 3.2 External MinIO (blueberry-master) – DR/Backup anchor

- Service: systemd `minio.service` on `blueberry-master` (`10.0.0.10`).
- Endpoint: `https://s3.quantfinancehub.com:9091` (API) and `https://10.0.0.10:9092` (console).
- Data path: `/storage/minio` on SD.
- TLS:
  - Let’s Encrypt certs via Cloudflare DNS-01 (certbot + Cloudflare plugin).
  - Enhanced auto-renewal guide and hooks in `.claude/enhanced-tls-certificate-guide.md` and `docs/3-external-services/1-s3-backup-backend-minio-setup.md`.
- Buckets (at minimum):
  - `k3s-longhorn`, `k3s-velero`, `restic`, `k3s-loki`, `k3s-tempo`.
- Users: `longhorn`, `velero`, `restic` (+ others if needed) with per-bucket policies.

Role: **infrastructure/DR S3** – holds backups and mirrored data from in-cluster systems, not the primary backend for app workloads.

### 3.3 In-cluster MinIO HA Tenant – primary S3 for Loki/Tempo

- Operator: installed via Helm into `minio-operator` namespace (`quay.io/minio/operator:v6.x`).
- Tenant: `minio-ha` in namespace `minio`:
  - 3 servers (`minio-ha-pool-0-{0,1,2}`) scheduled on NVMe workers (`pikube.io/has-nvme=true`).
  - 2 Longhorn PVCs per server (6 PVCs total, 10Gi each, SC=`longhorn`).
  - Buckets: `k3s-loki`, `k3s-tempo`.
  - Exposed via NGINX Ingress:
    - API: `https://s3.picluster.quantfinancehub.com`
    - Console: `https://minio.picluster.quantfinancehub.com`
    - TLS via cert-manager + `ClusterIssuer letsencrypt-issuer`.
  - ServiceMonitor: `minio-ha-servicemonitor` in `monitoring`, scraping `/minio/v2/metrics/cluster` on `service=minio` in `minio` namespace.

#### 3.3.1 Root credentials via External Secrets

- Vault path: `secret/minio/root` with `config_env` containing:
  - `export MINIO_ROOT_USER=...`
  - `export MINIO_ROOT_PASSWORD=...`
- External Secrets Operator (ESO) and `ClusterSecretStore vault-backend` already installed.
- ExternalSecret in `minio`:

  ```yaml
  apiVersion: external-secrets.io/v1
  kind: ExternalSecret
  metadata:
    name: minio-ha-root-env
    namespace: minio
  spec:
    refreshInterval: 1h
    secretStoreRef:
      name: vault-backend
      kind: ClusterSecretStore
    target:
      name: minio-env-config
      creationPolicy: Owner
    data:
      - secretKey: config.env
        remoteRef:
          key: secret/minio/root
          property: config_env
  ```

- Resulting Secret: `minio-env-config` with key `config.env`. Operator sidecar mounts this and populates `/tmp/minio/config.env` in Tenant pods with correct root credentials and cluster arguments.

#### 3.3.2 Loki/Tempo S3 users and policies

- Vault paths:
  - `secret/minio/loki` → `user: loki`, `key: ...`
  - `secret/minio/tempo` → `user: tempo`, `key: ...`
- On `blueberry-master`, we created users and policies on HA MinIO via `mc`:
  - Users: `loki`, `tempo` with their keys from Vault.
  - Policies:
    - `lokistore-policy` → RW on `arn:aws:s3:::k3s-loki` and `.../k3s-loki/*`.
    - `tempostore-policy` → RW + tagging on `arn:aws:s3:::k3s-tempo` and `.../k3s-tempo/*`.
  - Attached policies to users and verified via test uploads and `mc ls`.

#### 3.3.3 Loki/Tempo credentials via External Secrets

- ESO examples documented:
  - `loki-minio-secret` in `logging` namespace from `secret/minio/loki`.
  - `tempo-minio-secret` in `tracing` namespace from `secret/minio/tempo`.
- Loki/Tempo Helm values are documented to use these Secrets and `-config.expand-env=true` to inject `access_key_id` / `secret_access_key` into their S3 configs.

#### 3.3.4 mc mirror to external MinIO

- HA → external MinIO mirrors:

  ```bash
  mc alias set PiKubeS3HA    https://s3.picluster.quantfinancehub.com picluster    <root_pass>
  mc alias set PiKubeS3Vault https://s3.quantfinancehub.com:9091      minioadmin   supers1cret0

  mc mirror --overwrite PiKubeS3HA/k3s-loki  PiKubeS3Vault/k3s-loki
  mc mirror --overwrite PiKubeS3HA/k3s-tempo PiKubeS3Vault/k3s-tempo
  ```

- Optional CronJob example is documented to run `mc mirror` on a schedule. This is intentionally “low intensity” and simpler than MinIO’s continuous replication.

---

## 4. Networking, DNS & ExternalDNS

- **Gateway:** nftables firewall, NAT, DNS via `dnsmasq`, NTP via `chrony`.
- **Internal DNS:** Bind9 on `blueberry-master` for `picluster.quantfinancehub.com`.
- **External DNS:** Cloudflare for `quantfinancehub.com` (used primarily by cert-manager).
- **ExternalDNS:**
  - Installed with RFC2136 provider targeting Bind9 using TSIG key from Vault (`secret/ddns-bind9`).
  - Watches K8s resources (Ingress/Service) with `external-dns.alpha.kubernetes.io/hostname` annotations and creates A/TXT records in Bind9.
  - Used to register services like NGINX Ingress IPs for `*.picluster.quantfinancehub.com`.

MinIO HA Ingresses are now annotated for ExternalDNS so that `s3.picluster.quantfinancehub.com` and `minio.picluster.quantfinancehub.com` resolve internally to the NGINX/MetalLB IP.

---

## 5. TLS & cert-manager

- cert-manager installed via Helm in `cert-manager` namespace.
- `ClusterIssuer letsencrypt-issuer` configured to use Cloudflare DNS-01 (token from Vault via ESO).
- Important adjustment: cert-manager was patched (and now documented via Helm values) to use public recursive DNS for ACME DNS-01 due to split-horizon DNS:
  - `--dns01-recursive-nameservers=1.1.1.1:53,8.8.8.8:53`
  - `--dns01-recursive-nameservers-only=true`
- Trust Manager installed in `cert-manager` (`jetstack/trust-manager`) for future CA bundle distribution.
- TLS is now consistently issued for:
  - Longhorn UI, MinIO external, MinIO HA Tenant, kube-prometheus-stack Ingresses (Grafana/Prometheus/Alertmanager), and any new Ingress annotated appropriately.

---

## 6. Monitoring Stack (kube-prometheus-stack) & ServiceMonitors

- `kube-prometheus-stack` installed in `monitoring` namespace using Longhorn for storage (`longhorn` SC, 50Gi PVCs for Prometheus/Alertmanager).
- Ingresses:
  - `https://monitoring.picluster.quantfinancehub.com/grafana/`
  - `https://monitoring.picluster.quantfinancehub.com/prometheus/`
  - `https://monitoring.picluster.quantfinancehub.com/alertmanager/`
  - NGINX Ingress + TLS + optional basic auth (Gateway credentials in Vault, projected via ESO where needed).
- RoutePrefixes and Grafana datasource URLs aligned to `/prometheus` and `/alertmanager`.
- Additional ServiceMonitors installed:
  - Ingress NGINX controller
  - Longhorn manager
  - ExternalDNS
  - Volcano scheduler
  - MinIO HA Tenant (`minio-ha-servicemonitor`)

These are all documented in `docs/9-monitoring/7-monitoring-prometheus.md` and implemented in the cluster.

---

## 7. Volcano Scheduler

- Volcano installed in `volcano-system` namespace via Helm (`v1.8.2`).
- CRDs present: `queues.scheduling.volcano.sh`, `podgroups.scheduling.volcano.sh`, etc.
- Queues created: `logging-critical`, `ai-workloads`, `monitoring`, `default-queue`.
- A basic test Job was run using `schedulerName: volcano` and a `Queue` annotation to validate scheduling.
- Documentation in `docs/4-kubernetes/3-volcano-scheduler.md` updated to align with:
  - `pikube.io/*` node labels
  - Correct `kubectl get queue` usage
  - Metrics/ServiceMonitor notes.

Volcano is **not** currently required for MinIO HA, but is available for future gang-scheduled workloads (e.g. Elasticsearch, heavier batch jobs).

---

## 8. Key Documentation Corrections/Alignments

- **Docs 0 & 1 (Definitions, Purpose, Architecture):** Corrected hardware specs, NVMe counts, RAM sizes, and storage numbers to match reality.
- **Doc 2 (Cluster Setup):** Validated gateway, DNS architecture, NTP, GPU memory, and node inventory.
- **Doc 3 (External Services):**
  - Validated MinIO and Vault live services.
  - Enhanced TLS and auto-renewal documentation for both.
- **Doc 4 (Kubernetes/K3s):**
  - K3s add-on disables documented.
  - System Upgrade Controller (SUC) plans aligned to real cluster.
- **Docs 5 & 6 (Networking, Certificates):**
  - ExternalDNS (Bind9 + TSIG) documented with Vault integration.
  - cert-manager’s DNS-01 behavior documented with split-horizon DNS fix.
- **Doc 8 (Storage):**
  - Longhorn doc updated for NVMe/SD tiers and iSCSI/multipath behavior.
  - New MinIO HA doc created to describe in-cluster Tenant on Longhorn and its integration with Loki/Tempo and external MinIO.
- **Doc 9 (Monitoring):**
  - kube-prometheus-stack values and Ingress fixed.
  - Tempo doc updated to use HA MinIO Tenant and ESO.
  - Observability framework doc updated to reference HA MinIO for Loki/Tempo.

All key components now have both: (a) a working implementation in the cluster and (b) an aligned doc section.

---

## 9. Next Steps

### 9.1 Loki & Tempo wiring

- **Loki:**
  - Deploy Loki using Helm with S3 storage configured to `https://s3.picluster.quantfinancehub.com`, bucket `k3s-loki`, credentials from `loki-minio-secret` (ESO from Vault).
  - Verify logs land in `k3s-loki` on HA MinIO and that `mc mirror` pushes them to external MinIO.

- **Tempo:**
  - Deploy Tempo (distributed) using the updated values that point to HA MinIO (bucket `k3s-tempo`) and credentials from `tempo-minio-secret`.
  - Ensure Grafana Tempo datasource is configured and logs ↔ traces correlation works (via derived fields in Loki).

### 9.2 mc mirror CronJob

- Implement the `minio-ha-mirror` CronJob (or equivalent) to run `mc mirror` on a schedule from HA MinIO → external MinIO for `k3s-loki` and `k3s-tempo`.
- Monitor its logs and ensure it doesn’t overload the environment.

### 9.3 Grafana dashboards for installed services

- Import or configure dashboards (via ConfigMaps or Grafana UI) for:
  - NGINX Ingress controller (controller metrics dashboard).
  - Longhorn (official Longhorn dashboard JSON).
  - ExternalDNS.
  - MinIO (HA Tenant and optionally external MinIO) – e.g. Grafana dashboard ID 13502.
  - Volcano scheduler metrics.
  - K3s / Kubernetes cluster health (node, namespace, workload dashboards).

- Approach:
  - Use kube-prometheus-stack’s `grafana.dashboards` or `ConfigMap` with `grafana_dashboard: "1"` and optional `grafana_folder` to organize.
  - Start by importing community dashboards via Grafana UI to validate metrics and then codify them as ConfigMaps for GitOps later.

### 9.4 SSO & security hardening

- Replace basic auth in front of Grafana, Prometheus, Longhorn, MinIO, ArgoCD, etc. with Keycloak + OAuth2-Proxy as described in `docs/7-single-sign-on/1-sso-with-keycloak-and-oauth2-proxy.md`.
- Keep Vault as the single source of truth for credentials and use ESO everywhere possible to avoid static secrets in manifests.

### 9.5 GitOps repo (fresh)

- Once cluster and docs are fully validated:
  - Build a new ArgoCD/GitOps repo from the corrected docs rather than reusing the legacy `pikube-argocd` repo.
  - Encode:
    - Base infra (Longhorn, NGINX, MetalLB, cert-manager, ESO, ExternalDNS, Vault integration).
    - Platform services (MinIO HA, Tempo, Loki, kube-prometheus-stack, Volcano).
    - App-level services later.

---

This consolidated note should make it possible to:

1. Rebuild the cluster from scratch using the docs you’ve corrected/extended.
2. Bring a GitOps repo up to date with the actual, validated state.
3. Decide the next workflows (Loki/Tempo deployment, dashboards, SSO, etc.) with full context.

