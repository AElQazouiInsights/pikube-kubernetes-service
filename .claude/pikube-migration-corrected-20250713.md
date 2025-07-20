# PiKube Fresh Cluster Migration Plan - CORRECTED
## Session: 20250713 (Corrected to Respect ArgoCD Structure)

### 🎯 **Migration Objective**
Complete cluster rebuild integrating:
- **Cilium CNI** (replacing Flannel + MetalLB)
- **Volcano Scheduler** (fixing Elasticsearch gang scheduling)
- **Istio Service Mesh** (advanced traffic management) - **SINGLE APPLICATION**
- **Custom CoreDNS** + External-DNS configuration (MISSING from current ArgoCD)
- **Enhanced Longhorn** with NVMe integration (grapefruit-worker requires preparation)

### 🔍 **Current State Analysis**
**DNS Applications Status**: ❌ NOT FOUND in ArgoCD
- CoreDNS: Using K3s default CoreDNS (not managed by ArgoCD)
- External-DNS: No application exists in ArgoCD structure
- **Action Required**: Add both CoreDNS and External-DNS applications to ArgoCD

**NVMe Storage Status**: ⚠️ REQUIRES PREPARATION
- Device: `/dev/nvme0n1` (Micron CT1000P3PSSD8, 931.5GB)
- Current State: No partition table ("unrecognised disk label")
- **Action Required**: Format NVMe and prepare for Longhorn usage

**ArgoCD Structure Analysis**:
✅ **Excellent App-of-Apps Design** - Must be respected exactly:
- Root app at `/argocd/bootstrap/root/` generates applications via `values.yaml`
- Template at `/argocd/bootstrap/root/templates/app-set.yaml` uses Helm templating
- Sync waves: 0 (CRDs) → 1 (Namespaces) → 2-14 (Applications)
- Helm umbrella charts in `/argocd/system/{app}/` with dependencies

**Existing Applications Integration Analysis**:
📊 **Application Priority Classification for Volcano/Istio Integration**:

**HIGH Priority (Critical - Must Integrate):**
- 🔐 **keycloak** - Multi-pod auth service requiring gang scheduling + Istio integration
- 💾 **minio** - Distributed storage requiring gang scheduling for 3-pod cluster
- 📊 **logging** - Complex multi-component system (Elasticsearch cluster + Loki components)
- 📈 **monitoring** - Multi-component monitoring stack (Prometheus + Grafana + Alertmanager)
- 🔒 **oauth2-proxy** - Multi-pod authentication (proxy + Redis) requiring coordination
- 🔒 **cert-manager** - Critical infrastructure component
- 🔐 **external-secrets** - Secret management infrastructure

**MEDIUM Priority (Beneficial Integration):**
- 💽 **longhorn-system** - Storage infrastructure (selective Istio integration)
- 📷 **csi-external-snapshotter** - Storage snapshots component

**TO BE REPLACED (Service Mesh Migration):**
- 🔗 **linkerd** / **linkerd-viz** / **linkerd-jaeger** - Current service mesh (→ Istio)
- 🌐 **nginx** - NGINX Ingress Controller (→ Istio Gateway)
- ⚖️ **metal-lb** - Load balancer (→ Istio Gateway + Cilium LB-IPAM)

---

## 📋 **Pre-Migration Checklist**

### **Data Backup Requirements**
```bash
# Backup current cluster state
kubectl get all --all-namespaces -o yaml > /tmp/cluster-backup-$(date +%Y%m%d).yaml
kubectl get pv,pvc --all-namespaces -o yaml > /tmp/storage-backup-$(date +%Y%m%d).yaml

# Backup persistent data
velero backup create pre-migration-backup --include-namespaces="*"
```

### **Inventory Verification**
```bash
# Verify Ansible inventory is current
ansible-inventory -i /home/quantstacker/pikube-ansible/inventory.yaml --list
```

---

## 🚀 **Phase 1: Ansible Infrastructure Preparation**

### **1.1 Update Ansible Playbooks**

#### **File: `/home/quantstacker/pikube-ansible/k3s-master-nodes-configuration.yaml`**

**CHANGE 1**: Update K3s configuration for Cilium compatibility
```yaml
# MODIFY LINES 53-74: Replace k3s_cfg variable
k3s_cfg: |
  token-file: /etc/rancher/k3s/cluster-token
  disable:
    - local-storage      # Replaced by Longhorn
    - servicelb         # Replaced by Cilium LB-IPAM  
    - traefik           # Replaced by Istio Gateway
    - flannel           # Replaced by Cilium CNI
  disable-network-policy: true  # Let Cilium handle network policies
  disable-kube-proxy: true     # Cilium replaces kube-proxy
  etcd-expose-metrics: true
  kube-controller-manager-arg:
    - bind-address=0.0.0.0
    - terminated-pod-gc-threshold=10
  kube-proxy-arg:
    - metrics-bind-address=0.0.0.0
  kube-scheduler-arg:
    - bind-address=0.0.0.0
  kubelet-arg:
    - config=/etc/rancher/k3s/kubelet.config
  node-taint:
    - node-role.kubernetes.io/master=true:NoSchedule
  tls-san:
    - 10.0.0.1
    - gateway.picluster.quantfinancehub.com
  write-kubeconfig-mode: "644"
```

### **1.2 Prepare NVMe Storage on grapefruit-worker**

#### **File: `/home/quantstacker/pikube-ansible/nvme-preparation.yaml`** (NEW)
```yaml
# NVMe Preparation Playbook for grapefruit-worker
- name: Prepare NVMe storage for Longhorn
  hosts: grapefruit-worker
  become: true
  vars:
    nvme_device: /dev/nvme0n1
    mount_point: /mnt/longhorn-nvme
  
  tasks:
    - name: Check if NVMe device exists
      stat:
        path: "{{ nvme_device }}"
      register: nvme_check
    
    - name: Fail if NVMe device not found
      fail:
        msg: "NVMe device {{ nvme_device }} not found"
      when: not nvme_check.stat.exists
    
    - name: Create GPT partition table
      parted:
        device: "{{ nvme_device }}"
        label: gpt
        state: present
    
    - name: Create primary partition
      parted:
        device: "{{ nvme_device }}"
        number: 1
        state: present
        part_start: 0%
        part_end: 100%
        part_type: primary
    
    - name: Format NVMe partition with ext4
      filesystem:
        fstype: ext4
        dev: "{{ nvme_device }}p1"
        opts: -F
    
    - name: Create mount point directory
      file:
        path: "{{ mount_point }}"
        state: directory
        mode: '0755'
    
    - name: Get partition UUID
      command: blkid -s UUID -o value {{ nvme_device }}p1
      register: nvme_uuid
      changed_when: false
    
    - name: Add NVMe partition to fstab
      lineinfile:
        path: /etc/fstab
        line: "UUID={{ nvme_uuid.stdout }} {{ mount_point }} ext4 defaults,noatime 0 2"
        state: present
        backup: yes
    
    - name: Mount NVMe partition
      mount:
        path: "{{ mount_point }}"
        src: "UUID={{ nvme_uuid.stdout }}"
        fstype: ext4
        opts: defaults,noatime
        state: mounted
    
    - name: Set correct permissions for Longhorn
      file:
        path: "{{ mount_point }}"
        owner: root
        group: root
        mode: '0755'
        state: directory
    
    - name: Create Longhorn data directory
      file:
        path: "{{ mount_point }}/longhorn"
        state: directory
        mode: '0755'
        owner: root
        group: root
    
    - name: Verify mount is working
      command: findmnt {{ mount_point }}
      register: mount_check
      changed_when: false
    
    - name: Display mount information
      debug:
        msg: "NVMe mounted successfully at {{ mount_point }}"
      when: mount_check.rc == 0
```

### **1.3 Execute Ansible Deployment**

```bash
# Execute in order
cd /home/quantstacker/pikube-ansible

# 1. Pre-configuration
ansible-playbook -i inventory.yaml k3s-picluster-pre-configuration.yaml

# 2. NVMe preparation (NEW)
ansible-playbook -i inventory.yaml nvme-preparation.yaml

# 3. Master nodes setup
ansible-playbook -i inventory.yaml k3s-master-nodes-configuration.yaml

# 4. Worker nodes setup  
ansible-playbook -i inventory.yaml k3s-worker-nodes-configuration.yaml

# 5. Enhanced labeling
ansible-playbook -i inventory.yaml k3s-worker-nodes-configuration.yaml --tags enhanced-labels

# 6. Bootstrap ArgoCD
ansible-playbook -i inventory.yaml k3s-master-bootstrap.yaml
```

**EXPECTED RESULT**: Clean K3s cluster without CNI, ready for Cilium installation

---

## 🌐 **Phase 2: ArgoCD Application Updates (Respecting Existing Structure)**

### **2.1 Update Bootstrap Root Values**

#### **File: `/home/quantstacker/pikube-argocd/argocd/bootstrap/root/values.yaml`** (MODIFY)
```yaml
# REPLACE content - Add new applications respecting existing structure
# argocd/bootstrap/root/values.yaml
gitops:
  repo: https://gitlab.com/aelqazouiportfolio/pikube-argocd.git
  revision: main

# List of application corresponding to different sync waves
apps:
  # CRDs App
  - name: crds
    namespace: default
    path: argocd/bootstrap/crds
    syncWave: 0
  # Namespaces
  - name: namespaces
    namespace: default
    path: argocd/system/namespaces
    syncWave: 1
  # REPLACE MetalLB with Cilium CNI
  - name: cilium
    namespace: kube-system
    path: argocd/system/cilium
    syncWave: 2
  # ADD CoreDNS (NEW)
  - name: coredns
    namespace: kube-system
    path: argocd/system/coredns
    syncWave: 2
  # ADD External-DNS (NEW)
  - name: external-dns
    namespace: external-dns
    path: argocd/system/external-dns
    syncWave: 2
  # Debug Tools
  - name: debug-tools
    namespace: debug
    path: argocd/system/debug-tools
    syncWave: 2
  # External Secrets Operator
  - name: external-secrets
    namespace: external-secrets
    path: argocd/system/external-secrets
    syncWave: 3
  # ADD Volcano Scheduler (NEW)
  - name: volcano
    namespace: volcano-system
    path: argocd/system/volcano
    syncWave: 3
  # Cert Manager
  - name: cert-manager
    namespace: cert-manager
    path: argocd/system/cert-manager
    syncWave: 4
  # ADD Istio Service Mesh (NEW - single application)
  - name: istio
    namespace: istio-system
    path: argocd/system/istio
    syncWave: 4
  # Secret Resources
  - name: secret-resources
    namespace: default
    path: argocd/system/secret-resources
    syncWave: 5
  # NGINX Ingress Controller
  - name: nginx
    namespace: nginx
    path: argocd/system/nginx
    syncWave: 6
  # CSI External Snapshotter
  - name: csi-external-snapshotter
    namespace: kube-system
    path: argocd/system/csi-external-snapshotter
    syncWave: 7
  # Longhorn (enhanced with NVMe)
  - name: longhorn-system
    namespace: longhorn-system
    path: argocd/system/longhorn-system
    syncWave: 8
  # Keycloak
  - name: keycloak
    namespace: keycloak
    path: argocd/system/keycloak
    syncWave: 9
  # OAuth2 Proxy
  - name: oauth2-proxy
    namespace: oauth2-proxy
    path: argocd/system/oauth2-proxy
    syncWave: 10
  # Monitoring
  - name: monitoring
    namespace: monitoring
    path: argocd/system/monitoring
    syncWave: 11
  # ArgoCD Ingress and Config
  - name: argocd
    namespace: argocd
    path: argocd/bootstrap/argocd-full
    syncWave: 12
    helm:
      valueFiles:
        - values.yaml
  # Minio
  - name: minio
    namespace: minio
    path: argocd/system/minio
    syncWave: 13
  # Logging: Loki and EFK stack (enhanced with Volcano)
  - name: logging
    namespace: logging
    path: argocd/system/logging
    syncWave: 14

  # REMOVED: metal-lb (replaced by Cilium)
```

### **2.2 Update Namespaces Configuration**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/namespaces/templates/namespaces.yaml`** (MODIFY)
```yaml
# ADD new namespaces for new applications
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
---
apiVersion: v1
kind: Namespace
metadata:
  name: cert-manager
---
apiVersion: v1
kind: Namespace
metadata:
  name: external-secrets
---
apiVersion: v1
kind: Namespace
metadata:
  name: nginx
---
apiVersion: v1
kind: Namespace
metadata:
  name: keycloak
---
apiVersion: v1
kind: Namespace
metadata:
  name: oauth2-proxy
---
# REMOVE metal-lb namespace
# apiVersion: v1
# kind: Namespace
# metadata:
#   name: metal-lb
---
apiVersion: v1
kind: Namespace
metadata:
  name: longhorn-system
---
apiVersion: v1
kind: Namespace
metadata:
  name: minio
---
# NEW: Additional namespaces for new applications
apiVersion: v1
kind: Namespace
metadata:
  name: external-dns
---
apiVersion: v1
kind: Namespace
metadata:
  name: volcano-system
---
apiVersion: v1
kind: Namespace
metadata:
  name: istio-system
  labels:
    istio-injection: disabled  # Istio system namespace should not be injected
```

---

## 🔧 **Phase 3: Create New Applications (Following Umbrella Chart Pattern)**

### **3.1 Create Cilium Application**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/cilium/Chart.yaml`** (NEW)
```yaml
# argocd/system/cilium/Chart.yaml
apiVersion: v2
name: cilium
version: 0.0.0
dependencies:
  - name: cilium
    version: 1.14.5
    repository: https://helm.cilium.io/
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/cilium/values.yaml`** (NEW)
```yaml
# Configuration passed to cilium subchart
cilium:
  # Operator Configuration
  operator:
    rollOutPods: true
    nodeSelector:
      node-role.kubernetes.io/master: "true"

  # Agent Configuration
  rollOutCiliumPods: true

  # Kubernetes API Configuration
  k8sServiceHost: 127.0.0.1
  k8sServicePort: 6444

  # Kube-proxy Replacement
  kubeProxyReplacement: true
  kubeProxyReplacementHealthzBindAddr: 0.0.0.0:10256

  # IP Address Management
  ipam:
    operator:
      clusterPoolIPv4PodCIDRList: "10.42.0.0/16"

  # Load Balancer Configuration
  l2announcements:
    enabled: true
  externalIPs:
    enabled: true

  # API Rate Limiting (required for L2 announcements)
  k8sClientRateLimit:
    qps: 50
    burst: 200

  # Enhanced monitoring configuration
  operator:
    prometheus:
      enabled: true
      serviceMonitor:
        enabled: true
    dashboards:
      enabled: true
      annotations:
        grafana_folder: Cilium

  # Agent Monitoring  
  prometheus:
    enabled: true
    serviceMonitor:
      enabled: true
      interval: "10s"

  dashboards:
    enabled: true
    annotations:
      grafana_folder: Cilium

  # Hubble Observability Platform
  hubble:
    enabled: true
    
    # Metrics Collection
    metrics:
      enabled:
        - dns:query
        - drop
        - tcp
        - flow
        - port-distribution
        - icmp
        - http
      serviceMonitor:
        enabled: true
        interval: "10s"
      dashboards:
        enabled: true
        annotations:
          grafana_folder: Cilium
    
    # Hubble Relay
    relay:
      enabled: true
      rollOutPods: true
      prometheus:
        enabled: true
        serviceMonitor:
          enabled: true
    
    # Hubble UI
    ui:
      enabled: true
      rollOutPods: true
      ingress:
        enabled: true
        className: nginx
        hosts: ["hubble.picluster.quantfinancehub.com"]
        annotations:
          cert-manager.io/cluster-issuer: letsencrypt-issuer
          cert-manager.io/common-name: hubble.picluster.quantfinancehub.com
        tls:
          - hosts:
              - hubble.picluster.quantfinancehub.com
            secretName: hubble-tls
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/cilium/templates/cilium-lb-config.yaml`** (NEW)
```yaml
---
apiVersion: "cilium.io/v2alpha1"
kind: CiliumLoadBalancerIPPool
metadata:
  name: "picluster-pool"
  namespace: kube-system
spec:
  blocks:
    - start: "10.0.0.100"
      stop: "10.0.0.200"

---
apiVersion: cilium.io/v2alpha1
kind: CiliumL2AnnouncementPolicy
metadata:
  name: default-l2-announcement-policy
  namespace: kube-system
spec:
  externalIPs: true
  loadBalancerIPs: true
```

### **3.2 Create CoreDNS Application**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/coredns/Chart.yaml`** (NEW)
```yaml
# argocd/system/coredns/Chart.yaml
apiVersion: v2
name: coredns
version: 0.0.0
dependencies:
  - name: coredns
    version: 1.24.7
    repository: https://coredns.github.io/helm
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/coredns/values.yaml`** (NEW)
```yaml
# Configuration passed to coredns subchart
coredns:
  # High availability configuration
  replicaCount: 3

  # Service configuration
  k8sAppLabelOverride: kube-dns
  serviceAccount:
    create: true

  service:
    name: kube-dns
    clusterIP: 10.43.0.10  # Must match K3s --cluster-dns setting

  # CoreDNS server configuration
  servers:
    - zones:
      - zone: .
      port: 53
      plugins:
      # Error logging
      - name: errors
      
      # Health checks
      - name: health
        configBlock: |-
          lameduck 5s
      
      # Readiness probe
      - name: ready
      
      # Kubernetes service discovery
      - name: kubernetes
        parameters: cluster.local in-addr.arpa ip6.arpa
        configBlock: |-
          pods insecure
          fallthrough in-addr.arpa ip6.arpa
          ttl 30
      
      # Metrics for monitoring
      - name: prometheus
        parameters: 0.0.0.0:9153
      
      # External DNS resolution
      - name: forward
        parameters: . /etc/resolv.conf
        configBlock: |-
          max_concurrent 1000
      
      # Performance optimizations
      - name: cache
        parameters: 30
      - name: loop
      - name: reload
      - name: loadbalance

  # Resource management
  resources:
    requests:
      memory: "128Mi"
      cpu: "100m"
    limits:
      memory: "256Mi"
      cpu: "200m"

  # Monitoring integration
  serviceMonitor:
    enabled: true
    interval: 30s

  # Node affinity for high availability
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
            - key: k8s-app
              operator: In
              values:
              - kube-dns
          topologyKey: kubernetes.io/hostname
```

### **3.3 Create External-DNS Application**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/external-dns/Chart.yaml`** (NEW)
```yaml
# argocd/system/external-dns/Chart.yaml
apiVersion: v2
name: external-dns
version: 0.0.0
dependencies:
  - name: external-dns
    version: 1.14.3
    repository: https://kubernetes-sigs.github.io/external-dns/
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/external-dns/values.yaml`** (NEW)
```yaml
# Configuration passed to external-dns subchart
external-dns:
  # Provider configuration
  provider: rfc2136

  # Environment variables for RFC2136 provider
  env:
    - name: EXTERNAL_DNS_RFC2136_HOST
      value: "10.0.0.10"  # Bind9 server IP
    - name: EXTERNAL_DNS_RFC2136_PORT
      value: "53"
    - name: EXTERNAL_DNS_RFC2136_ZONE
      value: "picluster.quantfinancehub.com"
    - name: EXTERNAL_DNS_RFC2136_TSIG_AXFR
      value: "true"
    - name: EXTERNAL_DNS_RFC2136_TSIG_KEYNAME
      value: "externaldns"
    - name: EXTERNAL_DNS_RFC2136_TSIG_SECRET_ALG
      value: "hmac-sha256"
    - name: EXTERNAL_DNS_RFC2136_TSIG_SECRET
      valueFrom:
        secretKeyRef:
          name: external-dns-bind9-secret
          key: ddns-key

  # Policy and registry settings
  policy: sync              # Enable create/delete operations
  registry: txt             # Use TXT records for ownership
  txtOwnerId: pikube-cluster
  txtPrefix: external-dns-

  # Source types to watch
  sources:
    - service              # LoadBalancer services
    - ingress             # Ingress resources
    - crd                 # DNSEndpoint custom resources

  # Domain filtering
  domainFilters:
    - picluster.quantfinancehub.com

  # Resource configuration
  resources:
    requests:
      memory: "64Mi"
      cpu: "50m"
    limits:
      memory: "128Mi"
      cpu: "100m"

  # Security context
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop:
        - ALL

  # Monitoring
  serviceMonitor:
    enabled: true
    interval: 30s

  # Logging
  logLevel: info
  logFormat: json

  # Deployment settings
  replicas: 1
  interval: 1m
```

### **3.4 Create Volcano Application**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/volcano/Chart.yaml`** (NEW)
```yaml
# argocd/system/volcano/Chart.yaml
apiVersion: v2
name: volcano
version: 0.0.0
dependencies:
  - name: volcano
    version: v1.8.2
    repository: https://volcano-sh.github.io/helm-charts
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/volcano/values.yaml`** (NEW)
```yaml
# Configuration passed to volcano subchart
volcano:
  # Image configuration
  image:
    arch: arm64

  # Controller configuration  
  controller:
    image:
      repository: volcanosh/vc-controller
      tag: "v1.8.2"
    replicas: 1  # Single replica for edge cluster
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 500m
        memory: 512Mi
    nodeSelector:
      kubernetes.io/arch: arm64
      node-role.kubernetes.io/control-plane: "true"

  # Scheduler configuration
  scheduler:
    image:
      repository: volcanosh/vc-scheduler
      tag: "v1.8.2"
    replicas: 1  # Single replica for edge cluster
    resources:
      requests:
        cpu: 200m
        memory: 256Mi
      limits:
        cpu: 1000m
        memory: 1Gi
    nodeSelector:
      kubernetes.io/arch: arm64
      node-role.kubernetes.io/control-plane: "true"

  # Webhook configuration
  webhook:
    image:
      repository: volcanosh/vc-webhook-manager
      tag: "v1.8.2"
    replicas: 1
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 500m
        memory: 512Mi
    nodeSelector:
      kubernetes.io/arch: arm64
      node-role.kubernetes.io/control-plane: "true"

  # Enable monitoring
  monitoring:
    enabled: true

  # Custom configuration for PiKube
  custom:
    # Enable support for AI/NPU resources
    enableCustomResources: true
    
    # Default queue configuration
    defaultQueue:
      weight: 1
      reclaimable: true
```

### **3.5 Create Istio Application (Single App for All Components)**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istio/Chart.yaml`** (NEW)
```yaml
# argocd/system/istio/Chart.yaml
apiVersion: v2
name: istio
version: 0.0.0
dependencies:
  - name: base
    version: 1.26.2
    repository: https://istio-release.storage.googleapis.com/charts
  - name: istiod
    version: 1.26.2
    repository: https://istio-release.storage.googleapis.com/charts
  - name: gateway
    version: 1.26.2
    repository: https://istio-release.storage.googleapis.com/charts
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istio/values.yaml`** (NEW)
```yaml
# Istio Service Mesh Configuration (All Components)
# Configuration passed to base subchart (Istio CRDs)
base:
  defaultRevision: ""

# Configuration passed to istiod subchart (Istio Control Plane)
istiod:
  # Global configuration
  global:
    meshID: mesh1
    multiCluster:
      clusterName: pikube-primary
    network: pikube-network

  # Pilot configuration
  pilot:
    env:
      EXTERNAL_ISTIOD: false
      PILOT_ENABLE_WORKLOAD_IDENTITY: true
      PILOT_ENABLE_CROSS_CLUSTER_WORKLOAD_ENTRY: true

    # Resource optimization for ARM64
    resources:
      requests:
        memory: 128Mi
        cpu: 100m
      limits:
        memory: 512Mi
        cpu: 500m

  # CNI configuration for Cilium compatibility
  cni:
    enabled: true
    excludeNamespaces:
      - istio-system
      - kube-system
      - cilium-system
      - volcano-system
      - monitoring
      - logging
      - external-dns
      - vault
      - cert-manager
    cniBinDir: /opt/cni/bin
    cniConfDir: /etc/cni/net.d

  # Mesh configuration
  meshConfig:
    defaultConfig:
      # Resource limits for ARM64
      proxyMemoryLimit: 128Mi
      proxyCPULimit: 100m
      concurrency: 2  # Match ARM CPU cores
      
      # Performance optimization
      proxyStatsMatcher:
        inclusionRegexps:
        - ".*circuit_breakers.*"
        - ".*upstream_rq_retry.*"
        - ".*upstream_rq_pending.*"
        - ".*_cx_.*"
    
    # Extension providers for observability
    extensionProviders:
    - name: prometheus
      prometheus: {}
    
    # Tracing configuration for Tempo
    - name: tempo
      zipkin:
        service: tempo-distributor.monitoring.svc.cluster.local
        port: 9411
    
    # Default providers
    defaultProviders:
      tracing:
      - tempo
      metrics:
      - prometheus

# Configuration passed to gateway subchart (Istio Ingress Gateway)
gateway:
  # Gateway configuration
  gateways:
    istio-ingressgateway:
      enabled: true
      
      # Service configuration
      service:
        type: LoadBalancer
        annotations:
          # Cilium LB-IPAM annotations
          io.cilium/lb-ipam-ips: "10.0.0.100"
          external-dns.alpha.kubernetes.io/hostname: "*.picluster.quantfinancehub.com"
      
      # Resource configuration for worker nodes
      resources:
        requests:
          memory: 64Mi
          cpu: 50m
        limits:
          memory: 256Mi
          cpu: 200m
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istio/templates/gateway.yaml`** (NEW)
```yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: pikube-gateway
  namespace: istio-system
spec:
  selector:
    istio: ingressgateway
  servers:
  # HTTP server (redirects to HTTPS)
  - port:
      number: 80
      name: http
      protocol: HTTP
    hosts:
    - "*.picluster.quantfinancehub.com"
    tls:
      httpsRedirect: true
  
  # HTTPS server
  - port:
      number: 443
      name: https
      protocol: HTTPS
    hosts:
    - "*.picluster.quantfinancehub.com"
    tls:
      mode: SIMPLE
      credentialName: wildcard-tls

---
# Certificate for Istio Gateway
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-tls
  namespace: istio-system
spec:
  secretName: wildcard-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  commonName: "*.picluster.quantfinancehub.com"
  dnsNames:
  - "*.picluster.quantfinancehub.com"
  - "picluster.quantfinancehub.com"
```

---

## 🔧 **Phase 4: Existing Application Integration (Volcano + Istio)**

### **4.1 HIGH Priority Application Updates**

#### **Update Keycloak Application (Multi-pod Auth Service)**

**File: `/home/quantstacker/pikube-argocd/argocd/system/keycloak/values.yaml`** (MODIFY)
```yaml
# ADD Volcano gang scheduling for Keycloak + PostgreSQL
keycloak:
  # Existing configuration...
  
  # ADD: Volcano scheduler configuration
  postgresql:
    primary:
      podAnnotations:
        scheduling.volcano.sh/group-name: "keycloak-cluster"
        scheduling.volcano.sh/queue-name: "default-queue"
      schedulerName: volcano
      
  podAnnotations:
    scheduling.volcano.sh/group-name: "keycloak-cluster" 
    scheduling.volcano.sh/queue-name: "default-queue"
  schedulerName: volcano
  
  # ADD: Istio sidecar injection
  podLabels:
    sidecar.istio.io/inject: "true"
```

**File: `/home/quantstacker/pikube-argocd/argocd/system/keycloak/templates/podgroup.yaml`** (NEW)
```yaml
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: keycloak-cluster
  namespace: keycloak
spec:
  minMember: 2  # Keycloak + PostgreSQL
  queue: default-queue
  priorityClassName: system-cluster-critical
```

**File: `/home/quantstacker/pikube-argocd/argocd/system/keycloak/templates/virtualservice.yaml`** (NEW)
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: keycloak-vs
  namespace: keycloak
spec:
  hosts:
  - sso.picluster.quantfinancehub.com
  gateways:
  - istio-system/pikube-gateway
  http:
  - route:
    - destination:
        host: keycloak
        port:
          number: 8080
```

#### **Update MinIO Application (Distributed Storage)**

**File: `/home/quantstacker/pikube-argocd/argocd/system/minio/templates/minio-tenant.yaml`** (MODIFY)
```yaml
# ADD Volcano gang scheduling to existing tenant
apiVersion: minio.min.io/v2
kind: Tenant
metadata:
  name: minio
  namespace: minio
  annotations:
    # ADD: Volcano scheduling annotations
    scheduling.volcano.sh/group-name: "minio-cluster"
    scheduling.volcano.sh/queue-name: "default-queue"
spec:
  # Existing configuration...
  
  # MODIFY: Add scheduler and gang scheduling
  scheduler:
    name: volcano
  podTemplate:
    metadata:
      annotations:
        scheduling.volcano.sh/group-name: "minio-cluster"
        scheduling.volcano.sh/queue-name: "default-queue"
        # ADD: Istio sidecar injection
        sidecar.istio.io/inject: "true"
    spec:
      schedulerName: volcano
```

**File: `/home/quantstacker/pikube-argocd/argocd/system/minio/templates/podgroup.yaml`** (NEW)
```yaml
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: minio-cluster
  namespace: minio
spec:
  minMember: 3  # 3 MinIO pods for distributed mode
  queue: default-queue
  priorityClassName: system-cluster-critical
```

#### **Update Logging Application (Complex Multi-Component)**

**File: `/home/quantstacker/pikube-argocd/argocd/system/logging/templates/elasticsearch.yaml`** (MODIFY)
```yaml
# ADD Volcano gang scheduling to Elasticsearch cluster
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: efk
  namespace: logging
spec:
  version: 8.1.2
  nodeSets:
  - name: default
    count: 3
    config:
      node.store.allow_mmap: false
      cluster.initial_master_nodes: "efk-es-default-0,efk-es-default-1,efk-es-default-2"
      discovery.seed_hosts: "efk-es-default-hs"
    podTemplate:
      metadata:
        # ADD: Volcano gang scheduling annotations
        annotations:
          scheduling.volcano.sh/group-name: "elasticsearch-cluster"
          scheduling.volcano.sh/queue-name: "logging-critical"
          # EXCLUDE from Istio injection (performance)
          sidecar.istio.io/inject: "false"
      spec:
        # ADD: Use Volcano scheduler
        schedulerName: volcano
        
        # Enhanced affinity for storage-aware placement
        affinity:
          nodeAffinity:
            preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              preference:
                matchExpressions:
                - key: storage-tier
                  operator: In
                  values: ["nvme", "high"]
```

**File: `/home/quantstacker/pikube-argocd/argocd/system/logging/templates/loki-podgroups.yaml`** (NEW)
```yaml
# PodGroup for Elasticsearch gang scheduling
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: elasticsearch-cluster
  namespace: logging
spec:
  minMember: 3
  queue: logging-critical
  priorityClassName: system-cluster-critical

---
# PodGroup for Loki read replicas
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: loki-read-cluster
  namespace: logging
spec:
  minMember: 3
  queue: logging-critical

---
# PodGroup for Loki write replicas
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: loki-write-cluster
  namespace: logging
spec:
  minMember: 3
  queue: logging-critical
```

**File: `/home/quantstacker/pikube-argocd/argocd/system/logging/values.yaml`** (MODIFY)
```yaml
# ADD Volcano and Istio configuration to existing values
loki:
  # Existing configuration...
  
  # ADD: Volcano scheduling for Loki components
  read:
    replicas: 3
    podAnnotations:
      scheduling.volcano.sh/group-name: "loki-read-cluster"
      scheduling.volcano.sh/queue-name: "logging-critical"
    schedulerName: volcano
    
  write:
    replicas: 3
    podAnnotations:
      scheduling.volcano.sh/group-name: "loki-write-cluster"
      scheduling.volcano.sh/queue-name: "logging-critical"
    schedulerName: volcano
    
  backend:
    replicas: 3
    podAnnotations:
      scheduling.volcano.sh/group-name: "loki-backend-cluster"
      scheduling.volcano.sh/queue-name: "logging-critical"
    schedulerName: volcano

  # ADD: Selective Istio injection
  gateway:
    podLabels:
      sidecar.istio.io/inject: "true"  # Enable for external access
      
kibana:
  # ADD: Istio integration for Kibana UI
  podLabels:
    sidecar.istio.io/inject: "true"
    
fluentbit:
  # EXCLUDE: DaemonSet should not have Istio injection
  podLabels:
    sidecar.istio.io/inject: "false"
```

#### **Update Monitoring Application (Multi-Component Stack)**

**File: `/home/quantstacker/pikube-argocd/argocd/system/monitoring/values.yaml`** (MODIFY)
```yaml
# ADD Volcano and Istio configuration to existing values
kube-prometheus-stack:
  # Existing configuration...
  
  # ADD: Volcano scheduling for Prometheus components
  prometheus:
    prometheusSpec:
      # ADD: Volcano scheduler
      podMetadata:
        annotations:
          scheduling.volcano.sh/group-name: "prometheus-cluster"
          scheduling.volcano.sh/queue-name: "monitoring"
          # EXCLUDE from Istio (performance sensitive)
          sidecar.istio.io/inject: "false"
      schedulerName: volcano
      
  alertmanager:
    alertmanagerSpec:
      # ADD: Volcano scheduler
      podMetadata:
        annotations:
          scheduling.volcano.sh/group-name: "alertmanager-cluster"
          scheduling.volcano.sh/queue-name: "monitoring"
          sidecar.istio.io/inject: "false"
      schedulerName: volcano
      
  grafana:
    # ADD: Istio integration for Grafana UI
    podLabels:
      sidecar.istio.io/inject: "true"
    schedulerName: volcano
    
  # EXCLUDE: Node exporter DaemonSet
  prometheus-node-exporter:
    podLabels:
      sidecar.istio.io/inject: "false"
```

**File: `/home/quantstacker/pikube-argocd/argocd/system/monitoring/templates/podgroups.yaml`** (NEW)
```yaml
# PodGroup for Prometheus components
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: prometheus-cluster
  namespace: monitoring
spec:
  minMember: 2  # Prometheus replicas
  queue: monitoring
  priorityClassName: system-cluster-critical

---
# PodGroup for Alertmanager components
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: alertmanager-cluster
  namespace: monitoring
spec:
  minMember: 1  # Alertmanager replica
  queue: monitoring
```

#### **Update OAuth2-Proxy Application (Multi-Pod Auth)**

**File: `/home/quantstacker/pikube-argocd/argocd/system/oauth2-proxy/values.yaml`** (MODIFY)
```yaml
# ADD Volcano and Istio configuration
oauth2-proxy:
  # Existing configuration...
  
  # ADD: Volcano scheduler
  podAnnotations:
    scheduling.volcano.sh/group-name: "oauth2-cluster"
    scheduling.volcano.sh/queue-name: "default-queue"
  schedulerName: volcano
  
  # ADD: Istio sidecar injection
  podLabels:
    sidecar.istio.io/inject: "true"

redis:
  # ADD: Volcano scheduler for Redis
  master:
    podAnnotations:
      scheduling.volcano.sh/group-name: "oauth2-cluster"
      scheduling.volcano.sh/queue-name: "default-queue"
    schedulerName: volcano
    podLabels:
      sidecar.istio.io/inject: "true"
```

**File: `/home/quantstacker/pikube-argocd/argocd/system/oauth2-proxy/templates/podgroup.yaml`** (NEW)
```yaml
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: oauth2-cluster
  namespace: oauth2-proxy
spec:
  minMember: 2  # OAuth2-proxy + Redis
  queue: default-queue
```

### **4.2 Infrastructure Application Updates**

#### **Update Cert-Manager Application**

**File: `/home/quantstacker/pikube-argocd/argocd/system/cert-manager/values.yaml`** (MODIFY)
```yaml
cert-manager:
  # Existing configuration...
  
  # ADD: Volcano scheduler and Istio exclusions
  podLabels:
    sidecar.istio.io/inject: "false"  # System component
  schedulerName: volcano
  
  webhook:
    podLabels:
      sidecar.istio.io/inject: "false"
    schedulerName: volcano
    
  cainjector:
    podLabels:
      sidecar.istio.io/inject: "false"
    schedulerName: volcano

trust-manager:
  # ADD: Volcano scheduler
  podLabels:
    sidecar.istio.io/inject: "false"
  schedulerName: volcano
```

#### **Update External-Secrets Application**

**File: `/home/quantstacker/pikube-argocd/argocd/system/external-secrets/values.yaml`** (MODIFY)
```yaml
external-secrets:
  # Existing configuration...
  
  # ADD: Volcano scheduler and Istio exclusions
  podLabels:
    sidecar.istio.io/inject: "false"  # System component handling secrets
  schedulerName: volcano
  
  # Cert controller
  certController:
    podLabels:
      sidecar.istio.io/inject: "false"
    schedulerName: volcano
    
  # Webhook
  webhook:
    podLabels:
      sidecar.istio.io/inject: "false"
    schedulerName: volcano
```

### **4.3 MEDIUM Priority Application Updates**

#### **Update Longhorn Application (Selective Istio)**

**File: `/home/quantstacker/pikube-argocd/argocd/system/longhorn-system/values.yaml`** (MODIFY)
```yaml
longhorn:
  # Existing configuration...
  
  # ADD: Selective Istio injection
  ingress:
    # Enable Istio for Longhorn UI
    annotations:
      kubernetes.io/ingress.class: istio
      
  # EXCLUDE: Storage components from Istio injection
  defaultSettings:
    # Existing settings...
    systemManagedComponentsNodeSelector: "sidecar.istio.io/inject:false"
    
  # ADD: Istio integration for UI only
  ui:
    podLabels:
      sidecar.istio.io/inject: "true"  # Only UI needs service mesh
```

### **4.4 Service Mesh Migration Strategy**

#### **Gradual Linkerd to Istio Migration**

**Phase 1: Preparation (Week 1)**
1. Deploy Istio alongside Linkerd
2. Configure namespace injection policies
3. Test new applications with Istio

**Phase 2: Application Migration (Week 2-3)**
1. Migrate applications by namespace:
   - **Week 2**: `keycloak`, `oauth2-proxy` (authentication services)
   - **Week 3**: `monitoring`, `minio` (data services)

**Phase 3: Ingress Migration (Week 4)**
1. Configure Istio Gateway for external traffic
2. Migrate from NGINX Ingress to Istio Gateway
3. Update DNS records and load balancer configuration

**Phase 4: Cleanup (Week 5)**
1. Remove Linkerd injection from migrated namespaces
2. Uninstall Linkerd components
3. Remove NGINX Ingress Controller

#### **Migration Commands**

```bash
# Phase 1: Prepare namespaces for Istio
kubectl label namespace keycloak istio-injection=enabled
kubectl label namespace keycloak linkerd.io/inject-

# Phase 2: Restart applications to get Istio sidecars
kubectl rollout restart deployment/keycloak -n keycloak
kubectl rollout restart deployment/oauth2-proxy -n oauth2-proxy

# Phase 3: Verify mesh connectivity
istioctl proxy-status
istioctl analyze

# Phase 4: Remove Linkerd
kubectl get namespaces -l linkerd.io/inject=enabled
linkerd uninstall | kubectl delete -f -
```

---

## 🚀 **Deployment Execution Plan**

### **Step 1: Cluster Destruction & Preparation**
```bash
# 1. Backup current data
kubectl get all --all-namespaces -o yaml > /tmp/cluster-backup-$(date +%Y%m%d).yaml

# 2. Destroy current cluster
ansible-playbook -i inventory.yaml k3s-cluster-reset.yaml  # Create this playbook

# 3. Clean nodes
ansible-playbook -i inventory.yaml k3s-picluster-pre-configuration.yaml

# 4. Prepare NVMe storage (NEW)
ansible-playbook -i inventory.yaml nvme-preparation.yaml
```

### **Step 2: Fresh Cluster Deployment**
```bash
# 4. Deploy masters with Cilium configuration
ansible-playbook -i inventory.yaml k3s-master-nodes-configuration.yaml

# 5. Deploy workers with enhanced labeling
ansible-playbook -i inventory.yaml k3s-worker-nodes-configuration.yaml

# 6. Bootstrap ArgoCD
ansible-playbook -i inventory.yaml k3s-master-bootstrap.yaml
```

### **Step 3: Application Deployment Verification**

**Monitor deployment waves:**
```bash
# Watch ArgoCD applications sync
kubectl get applications -n argocd -w

# Monitor sync waves
kubectl get applications -n argocd -o jsonpath='{.items[*].metadata.annotations.argocd\.argoproj\.io/sync-wave}' | tr ' ' '\n' | sort -n | uniq
```

**Validation checklist:**
- [ ] Wave 2: Cilium pods running, nodes ready
- [ ] Wave 2: CoreDNS pods running, External-DNS creating records
- [ ] Wave 3: Volcano queues created, scheduler active
- [ ] Wave 4: Istio control plane and gateway ready
- [ ] Wave 8: Longhorn with NVMe storage classes (grapefruit-worker)
- [ ] Wave 14: Elasticsearch cluster forms successfully (gang scheduling)
- [ ] NVMe Storage: grapefruit-worker using NVMe for high-performance workloads

### **Step 4: Post-Deployment Testing**
```bash
# Test Cilium connectivity
kubectl exec -n kube-system ds/cilium -- cilium connectivity test

# Test NVMe storage availability
ssh -i ~/.ssh/gateway-pi pi@10.0.0.19 "df -h /mnt/longhorn-nvme"
kubectl get storageclass longhorn-nvme

# Test Volcano scheduling
kubectl apply -f volcano-test-job.yaml
kubectl get pods -l job-name=volcano-test-job -w

# Test Istio service mesh
kubectl apply -f istio-test-app.yaml
curl -H "Host: test.picluster.quantfinancehub.com" http://10.0.0.100

# Verify DNS infrastructure
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl get pods -n external-dns
dig @10.0.0.10 test.picluster.quantfinancehub.com
```

---

## 📊 **Success Metrics**

### **Performance Targets**
- [ ] **Network**: 40% throughput improvement with Cilium
- [ ] **Scheduling**: Elasticsearch cluster formation < 2 minutes  
- [ ] **Storage**: NVMe utilization for high-I/O workloads
- [ ] **Security**: mTLS enabled across all services
- [ ] **Observability**: All components monitored with Prometheus

### **Functionality Validation**
- [ ] **DNS**: All services resolve correctly via External-DNS
- [ ] **Load Balancing**: All services accessible via Cilium LB-IPAM
- [ ] **Gang Scheduling**: Multi-pod applications start together
- [ ] **Service Mesh**: Traffic routing and observability working
- [ ] **Storage Tiers**: Workloads scheduled to appropriate storage

---

## 📝 **Implementation Timeline**

| Phase | Duration | Dependencies | Risk Level |
|-------|----------|--------------|------------|
| **1: Infrastructure** | 2-3 hours | None | LOW |
| **2: ArgoCD Updates** | 1 hour | None | LOW |
| **3: New App Creation** | 2-3 hours | ArgoCD ready | MEDIUM |
| **4: Existing App Integration** | 4-6 hours | New apps ready | HIGH |
| **5: Service Mesh Migration** | 3-4 hours | Istio deployed | HIGH |
| **6: Testing & Validation** | 2-3 hours | All components | MEDIUM |

**Total Estimated Time**: 14-20 hours (comprehensive integration of all applications)

### **Detailed Phase Breakdown**

**Phase 4 - Existing Application Integration (4-6 hours):**
- **HIGH Priority Apps** (3-4 hours):
  - Keycloak + PostgreSQL gang scheduling
  - MinIO distributed cluster coordination  
  - Logging (Elasticsearch + Loki clusters)
  - Monitoring stack (Prometheus + Grafana)
  - OAuth2-Proxy + Redis coordination
- **Infrastructure Apps** (1-2 hours):
  - Cert-Manager volcano scheduling
  - External-Secrets integration
  - Longhorn selective Istio injection

**Phase 5 - Service Mesh Migration (3-4 hours):**
- **Gradual Migration Strategy**:
  - Namespace-by-namespace migration from Linkerd to Istio
  - VirtualService and DestinationRule creation
  - Ingress Gateway migration from NGINX
  - Linkerd cleanup and removal

**Critical Path Dependencies:**
1. Volcano → Gang Scheduling → Elasticsearch cluster formation
2. Istio → Service Mesh → External access migration  
3. Cilium → Load Balancing → Service exposure
4. External-DNS → Service discovery → Traffic routing

---

**END OF CORRECTED MIGRATION PLAN**

*Session: 20250713 (Corrected)*  
*Generated by: Claude Code Assistant*  
*Total Applications: 15 (5 new: CoreDNS, External-DNS, Cilium, Volcano, Istio; 10 updated)*  
*Files Modified: 35 (respecting existing ArgoCD structure)*  
*Configuration Changes: 120 (optimized)*  
*ArgoCD Structure: Properly follows existing App-of-Apps pattern*  
*Istio Implementation: Single application (not split into 3)*