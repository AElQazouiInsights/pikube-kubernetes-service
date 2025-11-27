# PiKube Project Context - Quick Reference

**Last Updated:** 2025-11-21
**Purpose:** Persistent context for Claude Code sessions on PiKube project

---

## 🚀 Quick Start Commands

### Cluster Access
```bash
# Check cluster status
kubectl cluster-info
kubectl get nodes -o wide

# Gateway SSH
ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@192.168.0.10

# Cluster node SSH (from WSL)
ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.X

# Infrastructure node SSH (via gateway)
ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@192.168.0.10 \
  "ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.X 'command'"
```

### Cluster & Node Access Cheat Sheet

- **From this WSL/dev machine (Kube config already present):**
  - Use `kubectl config get-contexts` to confirm the current context is the PiKube cluster.
  - Standard queries:
    - `kubectl get nodes -o wide`
    - `kubectl get pods -A`
    - `kubectl get ingress -A`

- **SSH to the gateway (in front of the cluster):**
  ```bash
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@192.168.0.10
  # or, if DNS is configured:
  ssh -i ~/.ssh/gateway-pi pi@gateway.picluster.quantfinancehub.com
  ```

- **Direct SSH to Kubernetes nodes (from WSL, same LAN):**
  ```bash
  # Masters (control plane)
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.10  # blueberry-master
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.11  # strawberry-master
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.12  # blackberry-master

  # Workers
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.13  # cranberry-worker
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.15  # orange-worker
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.16  # mandarine-worker
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.17  # lemon-worker
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.18  # clementine-worker
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.19  # grapefruit-worker
  ```

- **SSH to infrastructure nodes via the gateway (when direct access is not possible):**
  ```bash
  # Example: run a command on raspberry-sentinel (10.0.0.4) via the gateway
  ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@192.168.0.10 \
    "ssh -i ~/.ssh/gateway-pi -o StrictHostKeyChecking=no pi@10.0.0.4 'hostname && uptime'"
  ```

- **From a Windows laptop on the same LAN:**
  - Use the same `ssh -i ~/.ssh/gateway-pi pi@gateway.picluster.quantfinancehub.com` pattern from PowerShell or WSL.
  - For HTTPS endpoints (Keycloak, Longhorn, etc.), rely on DNS resolving to `10.0.0.100` or add entries in `C:\Windows\System32\drivers\etc\hosts` if needed (as already documented in the SSO and Longhorn docs).

---

## 📂 Project Structure

```
/home/quantstacker/github/pikube-kubernetes-service/
├── .claude/                    # Session logs and project context
├── docs/                       # Documentation (numbered 0-15)
│   ├── 0-definitions.md       # ✅ REVIEWED
│   ├── 1-project-architecture-purpose/
│   │   ├── 1-project-purpose.md      # ✅ REVIEWED
│   │   └── 2-architecture.md         # ✅ REVIEWED & CORRECTED
│   ├── 2-cluster-setup/              # ⏭️ NEXT
│   ├── 3-external-services/
│   ├── 4-kubernetes/
│   ├── 5-networking/
│   ├── 6-certificate-management/
│   ├── 7-single-sign-on/
│   ├── 8-storage/
│   ├── 9-monitoring/
│   ├── 10-backup/
│   ├── 11-gitops/
│   ├── 12-microservices/
│   ├── 13-further-reading/
│   ├── 14-automation/
│   └── 15-ai-intelligent-operations/
├── design/                    # Architecture diagrams
└── node_modules/              # VitePress dependencies
```

---

## 🖥️ Cluster Topology (VERIFIED)

### Kubernetes Cluster (9 nodes)
```
Control Plane: gateway.picluster.quantfinancehub.com:6443
K3s Version: v1.34.1+k3s1
OS: Ubuntu 24.04.2 LTS
Container Runtime: containerd 2.1.4-k3s2
Age: 23+ days
```

### Master Nodes (3)
| Hostname | IP | Hardware | RAM | Storage | Kernel |
|----------|-----|----------|-----|---------|--------|
| blueberry-master | 10.0.0.10 | RPi 4B | 8GB | 128GB SanDisk | raspi |
| strawberry-master | 10.0.0.11 | RPi 4B | 4GB | 128GB SanDisk | raspi |
| blackberry-master | 10.0.0.12 | RPi 4B | 4GB | 128GB SanDisk | raspi |

### Worker Nodes (6)
| Hostname | IP | Hardware | RAM | Storage | Network | NPU |
|----------|-----|----------|-----|---------|---------|-----|
| cranberry-worker | 10.0.0.13 | RPi 5 | 8GB | 256GB SD | 1G | - |
| orange-worker | 10.0.0.15 | OPi 5 | 16GB | 256GB SD | 1G | 6 TOPS |
| mandarine-worker | 10.0.0.16 | OPi 5 | 16GB | 256GB SD | 1G | 6 TOPS |
| lemon-worker | 10.0.0.17 | OPi 5 Ultra | 16GB | 256GB SD + **931GB NVMe** | 2.5G | 6 TOPS |
| clementine-worker | 10.0.0.18 | OPi 5 Ultra | 16GB | 256GB SD + **931GB NVMe** | 2.5G | 6 TOPS |
| grapefruit-worker | 10.0.0.19 | OPi 5 Ultra | 16GB | 256GB SD + **931GB NVMe** | 2.5G | 6 TOPS |

### Infrastructure Nodes (3 - outside K8s)
| Hostname | IP | Hardware | RAM | Storage | Status |
|----------|-----|----------|-----|---------|--------|
| gateway | 192.168.0.10 / 10.0.0.1 | RPi 4B | 8GB | 128GB | ✅ Router/Firewall/HAProxy |
| raspberry-sentinel | 10.0.0.4 | RPi 3B+ | 1GB | 32GB | ✅ Monitoring |
| hedgeway | 10.0.0.2 | OPi Zero 2W | 4GB | 32GB | ❌ Offline |

---

## 🏷️ Custom Node Labels

```yaml
# Device identification
pikube.io/device-type: raspberry-pi-5 | raspberry-pi-4b | orange-pi-5 | orange-pi-5-ultra

# Resource labels
pikube.io/cpu-cores: 4 | 8
pikube.io/memory-gb: 8 | 16
pikube.io/storage-gb: 240 | 1240

# Storage labels
pikube.io/storage-type: sd-card | sd-card---nvme
pikube.io/has-nvme: true  # Only: grapefruit, lemon, clementine
```

---

## 💾 Storage Architecture

### Total Capacity: 4.7TB
- **NVMe (59.1%):** 2,794GB across 3 workers
- **Samsung EVO (32.8%):** 1,552GB across 7 nodes
- **SanDisk (10.1%):** 476GB across 5 nodes

### NVMe Nodes (⚡ Ultra Performance)
- **grapefruit-worker, lemon-worker, clementine-worker**
- **Model:** CT1000P3PSSD8 (Crucial) - 931.5GB each
- **Performance:** 1,947 MB/s seq read, 52,400 IOPS random read

---

## 🌐 Network Architecture

### Gateway (10.0.0.1 / 192.168.0.10)
- **Router/Firewall:** nftables
- **DNS:** dnsmasq
- **NTP:** chrony
- **DHCP:** dnsmasq
- **K8s API LB:** HAProxy

### Network Tiers
- **2.5G:** lemon, clementine, grapefruit (Orange Pi 5 Ultra)
- **1G:** All others (TP-Link switches, Cat 8 cabling)

---

## 🛠️ Technology Stack

### Orchestration
- **K3s:** Lightweight Kubernetes
- **containerd:** Container runtime
- **Volcano:** Batch scheduling for HPC/ML

### Observability
- **Metrics:** Prometheus
- **Logs:** Loki + EFK (Elasticsearch/Fluentd/Kibana)
- **Traces:** Grafana Tempo
- **Dashboards:** Grafana

### Security
- **Secrets:** HashiCorp Vault (external)
- **Certificates:** Cert-Manager + Let's Encrypt
- **SSO:** Keycloak + OAuth2-Proxy (operator-based Keycloak with CloudNativePG, oauth2-proxy + Redis; Longhorn UI already wired through SSO)
- **Secret Sync:** External Secrets Operator

### Storage
- **Block:** Longhorn (distributed storage)
- **Object:** Minio (S3-compatible, external)
- **Backup:** Velero + Restic

### Networking
- **CNI:** Flannel
- **Service Mesh:** Linkerd
- **Ingress:** NGINX + Traefik
- **Load Balancer:** MetalLB

### Automation
- **IaC:** Ansible
- **GitOps:** Argo CD
- **Init:** cloud-init

---

## 🔥 Critical Discoveries

### Documentation Corrections Applied (2025-11-06)
1. ✅ **3 nodes have NVMe, not 1** (lemon, clementine added)
2. ✅ **strawberry-master:** 4GB RAM (not 8GB)
3. ✅ **cranberry-worker:** 8GB RAM (not 4GB)
4. ✅ **Total storage:** 4.7TB (not 2.9TB)
5. ✅ **NVMe capacity:** 2.7TB (not 931GB)

### Node Access Patterns
- **Direct SSH:** Works for all K8s nodes (10.0.0.10-19)
- **Via gateway:** Required for raspberry-sentinel (10.0.0.4)
- **Gateway key needed:** Infrastructure nodes need `~/.ssh/gateway-pi` from gateway

### Power & Cooling
- **Power:** 2× Anker 60W chargers (120W total)
- **Cooling:** GeeekPi case with fans + individual heatsinks
- **Control:** USB-C switches with LED indicators per node

---

## 📋 Session Progress

### Completed
- [x] Document 0: Definitions
- [x] Document 1.1: Project Purpose
- [x] Document 1.2: Architecture (CORRECTED)
- [x] Document 7.1: Single Sign-On (Keycloak + OAuth2-Proxy) – validated against live cluster, Keycloak operator + CNPG + oauth2-proxy deployed
- [x] Document 12.1: Databases – CloudNativePG examples aligned with the running `keycloak-db` cluster

### Next Session
- [ ] Document 2: Cluster Setup
- [ ] Document 3: External Services
- [ ] Extend SSO in front of other UIs (Grafana, Prometheus, ArgoCD) using the Keycloak + OAuth2-Proxy pattern validated with Longhorn
- [ ] Verify external Vault & Minio
- [ ] Validate GitOps configuration (and introduce operator-based Keycloak in the fresh GitOps repo)

---

## 🎯 Project Goals

1. **Review documentation systematically** (docs 0-15)
2. **Validate against live cluster**
3. **Deploy step-by-step** following docs
4. **Enhance documentation** with real-world findings
5. **Fix discrepancies** between docs and reality

---

## 🧭 Working Methodology

1. **Doc‑driven manual install**
   - Use the VitePress docs as the *source of truth* for desired behaviour.
   - For each topic (networking, storage, SSO, monitoring, microservices, etc.), **first install and validate manually** in the live cluster using the commands/manifests from the docs.
   - If a component is already present (e.g. Longhorn, Keycloak, MinIO, monitoring stack), validate that the docs match the actual cluster state; if they don’t, fix the cluster *or* correct the docs so they converge.
   - This phase is deliberately manual so that every step is understood, reproducible from the docs, and debuggable without any automation “hiding” details.

2. **Tight feedback loop (cluster ↔ docs ↔ .claude)**
   - Every change is first validated against the live cluster (kubectl/helm + Vault on the gateway).
   - Once behaviour is confirmed, update the relevant doc section and append a short summary to `.claude` (session log + project context), so future work can assume the corrected state.

3. **Phase 1 – Manual baseline**
   - Goal: “You can rebuild PiKube from scratch **by hand** just by following the docs.”
   - Manually install and validate:
     - Core infra (K3s, networking, Longhorn, MetalLB, cert‑manager, ESO, ExternalDNS, Vault, MinIO).
     - Platform services (monitoring stack, Tempo/Loki, Volcano).
     - Security stack (Keycloak operator + CloudNativePG, oauth2‑proxy, SSO wiring in front of UIs).
     - Microservices building blocks (CNPG, Mongo operator, Kafka, etc).
   - Only when each area is stable and documented do we move it into automation.

4. **Phase 2 – Full automation with clear separation of concerns**
   - **Ansible**: Responsible for all host‑level and base infra:
     - OS configuration, users, SSH, packages.
     - K3s installation and base node configuration.
     - Gateway (HAProxy, DNS, NTP, DHCP), external Vault, external MinIO.
   - **GitOps (Argo CD / new repo)**:
     - All Kubernetes‑level concerns expressed as manifests/Helm/Kustomize.
     - Operators (CloudNativePG, Keycloak, MinIO Operator, ESO, etc.) and platform services (Longhorn, monitoring stack, SSO, microservices) managed declaratively.
     - GitOps repo structure is expected to roughly mirror the docs (e.g. apps “01-core”..“09-monitoring”), so that docs → manifests mapping is obvious.
   - The intent is:
     - Phase 1 – *Manual*: prove the docs are correct and complete.
     - Phase 2 – *IaC + GitOps*: extract the working manifests/Helm values from Phase 1 into:
       - Ansible (hosts, base infra).
       - ArgoCD Applications (Kubernetes‑level components), fed from a new GitOps repo.
     - The cluster should be recreatable non‑interactively from:
       - Ansible inventory + playbooks.
       - The GitOps repo that encodes the validated docs.

5. **Phase 3 – AI‑assisted operations and continuous evolution**
   - Leverage the monitoring stack and the **AI agent** architecture described in `docs/15-ai-intelligent-operations` to:
     - Observe metrics/logs/traces.
     - Suggest or automatically apply safe remediations and tuning.
     - Validate changes against SLOs and alerting rules.
   - Gradually add new microservices and applications (finance, event streaming, ML workloads, etc.) to:
     - Exercise the platform (Linkerd, Kafka, CNPG, Mongo, etc.).
     - Test and adopt new technologies in a controlled way, keeping docs and automation in sync.

---

## 📌 Important Paths

```bash
# Project root
/home/quantstacker/github/pikube-kubernetes-service

# Session logs
/home/quantstacker/github/pikube-kubernetes-service/.claude/

# Documentation
/home/quantstacker/github/pikube-kubernetes-service/docs/

# Latest session log
/home/quantstacker/github/pikube-kubernetes-service/.claude/pikube-documentation-review-session-20251106.md
```

---

## ⚠️ Known Issues

1. **hedgeway (10.0.0.2):** Currently offline/powered down
2. **External services:** Vault & Minio locations need verification
3. **Observability:** Need to confirm if both Loki + EFK are deployed

---

**Last Session:** 2025-11-21
**Next Focus:** Cluster Setup docs + rolling SSO in front of additional UIs
**Status:** ✅ Cluster + docs now include working Keycloak operator, CloudNativePG `keycloak-db`, oauth2-proxy, and Longhorn UI protected via SSO
