---
title: MinIO S3 Object Storage Service (High Availability)
permalink: /docs/8-storage/2-s3-object-storage-service-minio-ha/
description: How to deploy a highly-available MinIO S3 object storage service on Longhorn inside the PiKube Kubernetes cluster, and how it complements the external MinIO instance on blueberry-master.
last_modified_at: "2025-11-20"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="minio"
    src="../resources/storage/minio-bird-logo.jpg"
    width="25%"
    height="%">
    <img alt="minio"
    src="../resources/storage/minio-logo.jpg"
    width="75%"
    height="%">
</p>

PiKube uses **two complementary MinIO deployments**, each with a distinct role in the overall storage and backup strategy:

- **External MinIO (blueberry-master, `s3.quantfinancehub.com:9091`)**
  - Runs directly on the `blueberry-master` bare‑metal node.
  - Holds **cluster‑critical backups**: Longhorn, Velero, Restic, and other infrastructure state.
  - Lives *outside* Kubernetes so it remains available even if the cluster is down or Longhorn is broken.

- **In-cluster HA MinIO (this document)**
  - Runs **inside Kubernetes** as a **MinIO Tenant** managed by the **MinIO Operator**.
  - Stores **application and observability data**: Loki logs, Tempo traces, and future app buckets.
  - Sits on top of **Longhorn volumes on NVMe nodes**, providing high availability inside the cluster.

Together they implement this strategy:

> **Runtime data path:**
> Applications and observability components write to **in-cluster MinIO on Longhorn (NVMe)** for fast, resilient storage.
>
> **Backup / DR path:**
> The in-cluster MinIO buckets are **backed up or replicated to the external MinIO** on `blueberry-master`, so you can rebuild the cluster and recover data even if Kubernetes or Longhorn are temporarily unavailable.

This document focuses on the **in-cluster HA MinIO** deployment. It provides:

- A clear architecture overview.
- Step-by-step installation using the MinIO Operator and a single Tenant.
- Verification steps to confirm availability and metrics.
- A recommended pattern to wire the HA MinIO Tenant to the external MinIO instance on `blueberry-master`.

---

## 1. Architecture Overview

### 1.1 Roles of the two MinIO instances

- **External MinIO (blueberry‑master)** – documented in
  `docs/3-external-services/1-s3-backup-backend-minio-setup.md`

  - Endpoint: `https://s3.quantfinancehub.com:9091`
  - Alias: `PiKubeS3Vault`
  - Uses local filesystem `/storage/minio` on `blueberry-master`
  - TLS via Let’s Encrypt + Cloudflare DNS‑01
  - Buckets:
    - `k3s-longhorn` – Longhorn backups
    - `k3s-velero` – Velero backups
    - `restic` – OS / filesystem backups
    - plus observability buckets (e.g. `k3s-loki`, `k3s-tempo`) in the current setup

- **In-cluster MinIO Tenant (this doc)** – **desired primary S3 for apps and observability**

  - Endpoint (API): `https://s3.picluster.quantfinancehub.com`
  - Endpoint (console): `https://minio.picluster.quantfinancehub.com`
  - Runs as a **MinIO Tenant** in namespace `minio`, managed by the MinIO Operator
  - Uses **Longhorn** volumes on the three NVMe workers:
    - `lemon-worker`, `clementine-worker`, `grapefruit-worker`
  - Primary buckets:
    - `k3s-loki` – Loki log storage
    - `k3s-tempo` – Tempo trace storage

The target state is:

- Loki, Tempo, and other S3‑consuming apps use the **in-cluster Tenant endpoint** (`s3.picluster.quantfinancehub.com`).
- The in-cluster buckets are **replicated or backed up to external MinIO** (`PiKubeS3Vault`) as part of the backup strategy.

### 1.2 High‑level design of the HA Tenant

The HA MinIO Tenant is a **distributed MinIO cluster**:

- **3 MinIO servers (pods)**, one scheduled on each NVMe worker:
  - `lemon-worker`, `clementine-worker`, `grapefruit-worker`
- Each server uses **2 Longhorn volumes** of `10Gi` each:
  - Total of 6 Longhorn PVCs
  - All PVCs use `storageClassName: longhorn`
- MinIO Tenant is configured for **distributed mode** (erasure‑coded, highly available).
- Pods are scheduled using:
  - **Node affinity** for NVMe nodes (e.g. `pikube.io/has-nvme=true`)
  - Optionally **Volcano** as `schedulerName` for gang scheduling.
- The Tenant is exposed via:
  - **NGINX Ingress** for API: `s3.picluster.quantfinancehub.com`
  - **NGINX Ingress** for console: `minio.picluster.quantfinancehub.com`
  - TLS issued by **cert-manager** with `ClusterIssuer letsencrypt-issuer`
- Prometheus scrapes MinIO metrics via a **ServiceMonitor** and surfaces them in Grafana.

---

## 2. Prerequisites

Before deploying the HA MinIO Tenant, ensure the following are in place:

1. **Longhorn installed and healthy**
   - `kubectl -n longhorn-system get pods` → all Longhorn components `Running`
   - `kubectl get sc` → `longhorn` is the default StorageClass
   - NVMe mounts on Ultra workers:
     - On `lemon-worker`, `clementine-worker`, `grapefruit-worker`: `/var/lib/longhorn/fast` mounted and used by Longhorn as data path.

2. **Ingress and TLS stack**
   - NGINX Ingress controller deployed and working (per `docs/5-networking/4-ingress-controller-nginx.md`)
   - cert-manager installed and `ClusterIssuer letsencrypt-issuer` is `Ready`
   - External DNS and internal DNS are working for:
     - `s3.picluster.quantfinancehub.com`
     - `minio.picluster.quantfinancehub.com`

3. **Monitoring stack (optional but recommended)**
   - `kube-prometheus-stack` installed in `monitoring` namespace, using Longhorn
   - NGINX/Grafana/Prometheus Ingresses working as per `docs/9-monitoring/7-monitoring-prometheus.md`

4. **Node labels for NVMe workers**
   - The three Ultra workers have labels:
     - `pikube.io/has-nvme=true`
     - `pikube.io/device-type=orange-pi-5-ultra`

   Verify:

   ```bash
   kubectl get nodes -L pikube.io/has-nvme,pikube.io/device-type
   ```

---

## 3. Step 1 – Install the MinIO Operator

> Run these commands from the gateway or an admin machine with `kubectl` access to PiKube.

1. **Create the `minio-operator` namespace**

   ```bash
   kubectl create namespace minio-operator
   ```

2. **Install or upgrade the MinIO Operator via Helm**

   ```bash
   helm repo add minio-operator https://operator.min.io/
   helm repo update

   helm upgrade --install minio-operator minio-operator/operator \
     --namespace minio-operator \
     --set image.repository=quay.io/minio/operator \
     --set image.tag=v6.0.1
   ```

   > You can bump `image.tag` to a newer, compatible v6 release as needed; keep Operator and Tenant images in the same major/minor family.

3. **Verify the Operator is running**

   ```bash
   kubectl -n minio-operator get pods
   ```

   You should see `minio-operator` pods in `Running` state.

---

## 4. Step 2 – Prepare namespace and secrets for the Tenant

1. **Create the `minio` namespace**

   ```bash
   kubectl create namespace minio
   ```

2. **Sync root credentials from Vault using External Secrets**

   PiKube already uses **External Secrets Operator** (`external-secrets` namespace) with a `ClusterSecretStore` named `vault-backend` pointing at the Vault instance on the gateway (`10.0.0.1`).
   External MinIO credentials are stored in Vault under:

   - `secret/minio/root` → fields `user`, `key`, and `config_env`

   The `config_env` field contains exported environment variables such as:

   ```bash
   export MINIO_ROOT_USER=...
   export MINIO_ROOT_PASSWORD=...
   ```

   To project these credentials into Kubernetes for the HA Tenant, create an `ExternalSecret` in the `minio` namespace:

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

   Apply it:

   ```bash
   kubectl apply -f minio-ha-root-env-externalsecret.yaml
   kubectl -n minio get externalsecret minio-ha-root-env
   kubectl -n minio get secret minio-env-config
   ```

   You should see `minio-env-config` created and managed by External Secrets, with a single key `config.env`.

3. **(Optional) Choose Loki/Tempo passwords and mirror into Vault**

   Choose strong passwords for Loki and Tempo S3 users. You can keep them only in your password manager, or also mirror them into Vault under a path like `secret/minio/tenant` for later use:

   ```bash
   export LOKI_PASSWORD="change-me-loki-pass"
   export TEMPO_PASSWORD="change-me-tempo-pass"
   ```

   These values are used later when creating MinIO users via `mc`.

4. **(Optional) Sync Loki/Tempo MinIO users from Vault with External Secrets**

   If you also store Loki/Tempo MinIO user credentials in Vault (for example under `secret/minio/loki` and `secret/minio/tempo` with fields `user` and `key`), you can project them into Kubernetes for use by Loki/Tempo Helm charts.

   Example `ExternalSecret` for Loki credentials into a `logging` namespace:

   ```yaml
   apiVersion: external-secrets.io/v1
   kind: ExternalSecret
   metadata:
     name: loki-minio-credentials
     namespace: logging
   spec:
     refreshInterval: 1h
     secretStoreRef:
       name: vault-backend
       kind: ClusterSecretStore
     target:
       name: loki-minio-secret
       creationPolicy: Owner
     data:
       - secretKey: MINIO_ACCESS_KEY_ID
         remoteRef:
           key: secret/minio/loki
           property: user
       - secretKey: MINIO_SECRET_ACCESS_KEY
         remoteRef:
           key: secret/minio/loki
           property: key
   ```

   Example for Tempo credentials into the `tracing` namespace:

   ```yaml
   apiVersion: external-secrets.io/v1
   kind: ExternalSecret
   metadata:
     name: tempo-minio-credentials
     namespace: tracing
   spec:
     refreshInterval: 1h
     secretStoreRef:
       name: vault-backend
       kind: ClusterSecretStore
     target:
       name: tempo-minio-secret
       creationPolicy: Owner
     data:
       - secretKey: MINIO_ACCESS_KEY_ID
         remoteRef:
           key: secret/minio/tempo
           property: user
       - secretKey: MINIO_SECRET_ACCESS_KEY
         remoteRef:
           key: secret/minio/tempo
           property: key
   ```

   Loki and Tempo can then read S3 credentials from `loki-minio-secret` and `tempo-minio-secret` respectively.

---

## 5. Step 3 – Deploy the HA MinIO Tenant on Longhorn

Create a file `minio-tenant-ha.yaml`:

```yaml
apiVersion: minio.min.io/v2
kind: Tenant
metadata:
  name: minio-ha
  namespace: minio
spec:
  image: quay.io/minio/minio:RELEASE.2024-12-18T13-15-44Z

  configuration:
    name: minio-env-config

  mountPath: /export
  requestAutoCert: false

  pools:
    - name: pool-0
      servers: 3
      volumesPerServer: 2
      volumeClaimTemplate:
        metadata:
          name: data
        spec:
          accessModes:
            - ReadWriteOnce
          resources:
            requests:
              storage: 10Gi
          storageClassName: longhorn
      resources:
        requests:
          memory: 1Gi
      nodeSelector:
        pikube.io/has-nvme: "true"

  buckets:
    - name: k3s-loki
    - name: k3s-tempo

  serviceMetadata:
    minioServiceLabels:
      service: minio
    consoleServiceLabels:
      service: console
```

Apply:

```bash
kubectl apply -f minio-tenant-ha.yaml
```

Wait for the Tenant to become ready:

```bash
kubectl -n minio get pods
kubectl -n minio get tenant minio-ha -o yaml | grep -i phase
```

You should see 3 MinIO pods `Running` and `phase: Ready`.

> [!NOTE] 🧮 About Volcano
>
> MinIO HA does **not** require the Volcano scheduler to function. The Tenant is scheduled by the default Kubernetes scheduler and constrained to NVMe nodes using `nodeSelector`.
>
> If you want to gang-schedule MinIO along with other storage-heavy workloads, you can add `schedulerName: volcano` and a `PodGroup` similar to the example in `platform/storage/36-minio`, but this is optional and not required for a reliable HA MinIO deployment on PiKube.

---

## 6. Step 4 – Expose the Tenant via NGINX and TLS

Create `minio-ingress-ha.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minio-api-ingress
  namespace: minio
  annotations:
    nginx.ingress.kubernetes.io/service-upstream: "true"
    # Allow large S3 requests from Loki/Tempo (log/trace chunks)
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
    cert-manager.io/cluster-issuer: letsencrypt-issuer
    cert-manager.io/common-name: s3.picluster.quantfinancehub.com
    # Let ExternalDNS manage internal DNS records in Bind9
    external-dns.alpha.kubernetes.io/hostname: s3.picluster.quantfinancehub.com
spec:
  ingressClassName: nginx
  tls:
    - secretName: minio-tls
      hosts:
        - s3.picluster.quantfinancehub.com
  rules:
    - host: s3.picluster.quantfinancehub.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: minio-ha
                port:
                  number: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minio-console-ingress
  namespace: minio
  annotations:
    nginx.ingress.kubernetes.io/service-upstream: "true"
    cert-manager.io/cluster-issuer: letsencrypt-issuer
    cert-manager.io/common-name: minio.picluster.quantfinancehub.com
    external-dns.alpha.kubernetes.io/hostname: minio.picluster.quantfinancehub.com
spec:
  ingressClassName: nginx
  tls:
    - secretName: minio-console-tls
      hosts:
        - minio.picluster.quantfinancehub.com
  rules:
    - host: minio.picluster.quantfinancehub.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: minio-ha-console
                port:
                  number: 9090
```

Apply:

```bash
kubectl apply -f minio-ingress-ha.yaml
```

Check that `minio-tls` and `minio-console-tls` Certificates are `Ready`, then test:

- `https://s3.picluster.quantfinancehub.com`
- `https://minio.picluster.quantfinancehub.com`

---

## 7. Step 5 – Create Loki and Tempo users and policies

The Tenant created `loki` and `tempo` users, but policies still need to be attached.

1. **Create an alias for the HA Tenant**

   ```bash
   mc alias set PiKubeS3HA https://s3.picluster.quantfinancehub.com \
     "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
   ```

2. **Ensure buckets exist**

   ```bash
   mc mb PiKubeS3HA/k3s-loki  || true
   mc mb PiKubeS3HA/k3s-tempo || true
   ```

3. **Create and attach policies**

   Define `lokistore-policy.json` and `tempostore-policy.json` as in the explanation above, then:

   ```bash
   mc admin policy create PiKubeS3HA loki  lokistore-policy.json
   mc admin policy create PiKubeS3HA tempo tempostore-policy.json

   mc admin policy attach PiKubeS3HA loki  --user loki
   mc admin policy attach PiKubeS3HA tempo --user tempo
   ```

4. **Test Loki/Tempo credentials**

   ```bash
   mc alias set loki-ha https://s3.picluster.quantfinancehub.com loki "${LOKI_PASSWORD}"
   mc ls loki-ha/k3s-loki

   mc alias set tempo-ha https://s3.picluster.quantfinancehub.com tempo "${TEMPO_PASSWORD}"
   mc ls tempo-ha/k3s-tempo
   ```

---

## 8. Step 6 – Enable Prometheus monitoring for HA MinIO

1) **Generate a Prometheus bearer token from MinIO**

Run this from any node with `mc` and cluster DNS access (or start a short‑lived pod, e.g. `kubectl -n minio run -it --rm --image=quay.io/minio/mc mc-gen --command -- /bin/sh`):

```bash
# Point mc at the in-cluster Tenant (ClusterIP on port 80)
mc alias set ha http://minio.minio.svc.cluster.local:80 root supers1cret0 --api s3v4

# Generate a Prometheus token for scraping
mc admin prometheus generate ha
```

Copy the `bearer_token` value that is printed.

2) **Store the token in Vault and sync it with External Secrets**

- Put the token into Vault (path `secret/minio/prometheus`, field `bearer_token`). Example:

```bash
vault kv put secret/minio/prometheus bearer_token="<PASTE_BEARER_TOKEN>"
```

- Create an ExternalSecret that mirrors this Vault entry into the Kubernetes Secret consumed by Prometheus:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: minio-ha-prometheus-token
  namespace: monitoring
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: minio-ha-monitor-token
    creationPolicy: Owner
  data:
    - secretKey: token
      remoteRef:
        key: secret/minio/prometheus
        property: bearer_token
```

Apply it:

```bash
kubectl apply -f minio-ha-prometheus-token.yaml
```

3) **Create `prometheus-minio-ha-servicemonitor.yaml`:**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: minio-ha-servicemonitor
  namespace: monitoring
  labels:
    app: minio-ha
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      service: minio
  namespaceSelector:
    matchNames:
      - minio
  endpoints:
    - port: http-minio
      path: /minio/v2/metrics/cluster
      interval: 30s
      scheme: http
      bearerTokenSecret:
        name: minio-ha-monitor-token
        key: token
```

Apply:

```bash
kubectl apply -f prometheus-minio-ha-servicemonitor.yaml
```

4) **Verify and visualize**

- In Prometheus UI → `Status > Targets`, the job `serviceMonitor/monitoring/minio-ha-servicemonitor/0` should be **UP** (no 403s).
- Query e.g. `minio_cluster_usage_total_bytes` to confirm samples exist.
- In Grafana, import dashboard ID **13502** and choose the **Prometheus** datasource; data should appear within ~1 minute (30s scrape + panel refresh).

---

## 9. Step 7 – Wire HA MinIO to External MinIO (blueberry-master)

To avoid losing observability and app data if the cluster or Longhorn fails, replicate or back up the HA Tenant buckets to the external MinIO (`PiKubeS3Vault`).

### 9.1 Scheduled `mc mirror` jobs (illustrative, low intensity)

For PiKube, a **periodic `mc mirror`** from HA MinIO to external MinIO is sufficient and less intensive than continuous replication. The pattern is:

1. Configure aliases (from a management node, e.g. `blueberry-master`):

   ```bash
   mc alias set PiKubeS3HA    https://s3.picluster.quantfinancehub.com picluster    minio-secret1
   mc alias set PiKubeS3Vault https://s3.quantfinancehub.com:9091      minioadmin   supers1cret0
   ```

2. One‑shot mirror of Loki and Tempo buckets:

   ```bash
   mc mirror --overwrite PiKubeS3HA/k3s-loki  PiKubeS3Vault/k3s-loki
   mc mirror --overwrite PiKubeS3HA/k3s-tempo PiKubeS3Vault/k3s-tempo
   ```

3. OPTIONAL – Kubernetes `CronJob` to run `mc mirror` on a schedule (e.g. every 15 minutes):

   ```yaml
   apiVersion: batch/v1
   kind: CronJob
   metadata:
     name: minio-ha-mirror
     namespace: vault  # or another ops namespace
   spec:
     schedule: "*/15 * * * *"
     jobTemplate:
       spec:
         template:
           spec:
             restartPolicy: OnFailure
             containers:
               - name: minio-mirror
                 image: minio/mc:latest
                 env:
                   - name: SRC_ALIAS
                     value: PiKubeS3HA
                   - name: SRC_ENDPOINT
                     value: https://s3.picluster.quantfinancehub.com
                   - name: SRC_ACCESS_KEY
                     valueFrom:
                       secretKeyRef:
                         name: minio-ha-root   # Secret or ESO-backed Secret for HA MinIO
                         key: accessKey
                   - name: SRC_SECRET_KEY
                     valueFrom:
                       secretKeyRef:
                         name: minio-ha-root
                         key: secretKey
                   - name: DST_ALIAS
                     value: PiKubeS3Vault
                   - name: DST_ENDPOINT
                     value: https://s3.quantfinancehub.com:9091
                   - name: DST_ACCESS_KEY
                     valueFrom:
                       secretKeyRef:
                         name: minio-vault-root
                         key: accessKey
                   - name: DST_SECRET_KEY
                     valueFrom:
                       secretKeyRef:
                         name: minio-vault-root
                         key: secretKey
                 command:
                   - /bin/sh
                   - -c
                   - |
                     mc alias set "$SRC_ALIAS" "$SRC_ENDPOINT" "$SRC_ACCESS_KEY" "$SRC_SECRET_KEY"
                     mc alias set "$DST_ALIAS" "$DST_ENDPOINT" "$DST_ACCESS_KEY" "$DST_SECRET_KEY"
                     mc mirror --overwrite "$SRC_ALIAS/k3s-loki"  "$DST_ALIAS/k3s-loki"
                     mc mirror --overwrite "$SRC_ALIAS/k3s-tempo" "$DST_ALIAS/k3s-tempo"
   ```

   You can adjust the schedule and namespaces as needed. This keeps external MinIO reasonably up to date without continuous replication load.

---

## 10. Next Steps – Loki and Tempo Integration

Once HA MinIO is installed and tested:

- Update Loki and Tempo Helm values to use:
  - Endpoint: `https://s3.picluster.quantfinancehub.com`
  - Buckets: `k3s-loki` / `k3s-tempo`
  - Access keys: `loki` / `tempo`

  Example Loki S3 configuration (Helm values) using the `loki-minio-secret` created by External Secrets:

  ```yaml
  storage:
    type: s3
    s3:
      s3: {}
      endpoint: s3.picluster.quantfinancehub.com
      bucketnames: k3s-loki
      region: eu-west-1
      access_key_id: ${MINIO_ACCESS_KEY_ID}
      secret_access_key: ${MINIO_SECRET_ACCESS_KEY}
      s3forcepathstyle: true

  # Enable environment variable expansion and wire in credentials from loki-minio-secret
  config:
    ingester:
      extraArgs:
        - '-config.expand-env=true'
      extraEnv:
        - name: MINIO_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: loki-minio-secret
              key: MINIO_ACCESS_KEY_ID
        - name: MINIO_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: loki-minio-secret
              key: MINIO_SECRET_ACCESS_KEY
    distributor:
      extraArgs:
        - '-config.expand-env=true'
      extraEnv:
        - name: MINIO_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: loki-minio-secret
              key: MINIO_ACCESS_KEY_ID
        - name: MINIO_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: loki-minio-secret
              key: MINIO_SECRET_ACCESS_KEY
    querier:
      extraArgs:
        - '-config.expand-env=true'
      extraEnv:
        - name: MINIO_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: loki-minio-secret
              key: MINIO_ACCESS_KEY_ID
        - name: MINIO_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: loki-minio-secret
              key: MINIO_SECRET_ACCESS_KEY
  ```

  Tempo’s Helm values follow the same pattern, using `tempo-minio-secret` as shown in `docs/9-monitoring/8-distributed-tracing-tempo.md`.

- Confirm:
  - Data appears in HA Tenant buckets.
  - Replication or mirror jobs are moving that data to external MinIO.

Over time, the Loki and Tempo docs under `docs/12-microservices/` will be updated so this HA Tenant becomes their **default S3 backend**, with external MinIO as the **backup anchor**.
