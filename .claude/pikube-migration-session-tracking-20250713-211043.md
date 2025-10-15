# PiKube Fresh Cluster Migration Plan
## Session: 20250713-211043

### 🎯 **Migration Objective**
Complete cluster rebuild integrating:
- **Cilium CNI** (replacing Flannel + MetalLB)
- **Volcano Scheduler** (fixing Elasticsearch gang scheduling)
- **Istio Service Mesh** (advanced traffic management)
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

#### **File: `/home/quantstacker/pikube-ansible/k3s-worker-nodes-configuration.yaml`**

**CHANGE 2**: Enhanced worker node labeling for Volcano hardware awareness
```yaml
# ADD AFTER LINE 136: Enhanced node labeling task
- name: Apply enhanced hardware labels for Volcano scheduling
  hosts: gateway
  gather_facts: false
  tags: enhanced-labels
  become: false
  become_user: pi
  
  tasks:
    - name: Label master nodes with hardware specifications
      ansible.builtin.command:
        cmd: >
          kubectl label node {{ item }}
            node-tier=control-plane
            hardware-type=raspberry-pi-4b
            storage-tier=standard
            network-speed=1g
            ai-capability=none
            --overwrite --kubeconfig=/home/pi/.kube/config.yaml
      loop:
        - blueberry-master
        - strawberry-master
        - blackberry-master
      run_once: true

    - name: Label high-performance AI workers (Orange Pi 5 Ultra)
      ansible.builtin.command:
        cmd: >
          kubectl label node {{ item.node }}
            node-tier=tier1-ultra
            hardware-type=orange-pi-5-ultra
            storage-tier={{ item.storage }}
            network-speed=2.5g
            ai-capability=6-tops
            --overwrite --kubeconfig=/home/pi/.kube/config.yaml
      loop:
        - { node: "grapefruit-worker", storage: "nvme" }
        - { node: "lemon-worker", storage: "high" }
        - { node: "clementine-worker", storage: "high" }
      run_once: true

    - name: Label standard AI workers (Orange Pi 5)
      ansible.builtin.command:
        cmd: >
          kubectl label node {{ item }}
            node-tier=tier2-standard
            hardware-type=orange-pi-5
            storage-tier=high
            network-speed=1g
            ai-capability=6-tops
            --overwrite --kubeconfig=/home/pi/.kube/config.yaml
      loop:
        - orange-worker
        - mandarine-worker
      run_once: true

    - name: Label basic worker (Raspberry Pi 5)
      ansible.builtin.command:
        cmd: >
          kubectl label node cranberry-worker
            node-tier=tier3-basic
            hardware-type=raspberry-pi-5
            storage-tier=high
            network-speed=1g
            ai-capability=none
            --overwrite --kubeconfig=/home/pi/.kube/config.yaml
      run_once: true
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

## 🌐 **Phase 2: Core Network Infrastructure**

### **2.1 Create Cilium ArgoCD Application**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/cilium/Chart.yaml`** (NEW)
```yaml
apiVersion: v2
name: cilium
description: Cilium CNI with LB-IPAM for PiKube
type: application
version: 0.1.0
appVersion: "1.14.5"
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/cilium/values.yaml`** (NEW)
```yaml
# Cilium Configuration for PiKube ARM64 Cluster
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
      relabelings:
        - action: replace
          sourceLabels:
            - __meta_kubernetes_pod_node_name
          targetLabel: node
          replacement: ${1}

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

# Source repository configuration
source:
  repoURL: https://helm.cilium.io/
  chart: cilium
  targetRevision: v1.14.5

# Destination configuration
destination:
  server: https://kubernetes.default.svc
  namespace: kube-system

# Sync policy
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=false
    - ApplyOutOfSyncOnly=true
  retry:
    limit: 5
    backoff:
      duration: 5s
      factor: 2
      maxDuration: 3m
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

### **2.2 Update CoreDNS Configuration**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/coredns/Chart.yaml`** (NEW)
```yaml
apiVersion: v2
name: coredns
description: Custom CoreDNS configuration for PiKube
type: application
version: 0.1.0
appVersion: "1.11.1"
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/coredns/values.yaml`** (NEW)
```yaml
# Custom CoreDNS Configuration for PiKube
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

# Source repository configuration
source:
  repoURL: https://coredns.github.io/helm
  chart: coredns
  targetRevision: 1.24.7

# Destination configuration
destination:
  server: https://kubernetes.default.svc
  namespace: kube-system

# Sync policy
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=false
```

### **2.3 Update External-DNS Configuration**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/external-dns/Chart.yaml`** (NEW)
```yaml
apiVersion: v2
name: external-dns
description: External-DNS with Bind9 RFC2136 provider for PiKube
type: application
version: 0.1.0
appVersion: "0.14.0"
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/external-dns/values.yaml`** (NEW)
```yaml
# External-DNS Configuration for PiKube
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

# Source repository configuration
source:
  repoURL: https://kubernetes-sigs.github.io/external-dns/
  chart: external-dns
  targetRevision: 1.14.3

# Destination configuration
destination:
  server: https://kubernetes.default.svc
  namespace: external-dns

# Sync policy
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=true
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/external-dns/templates/tsig-secret.yaml`** (NEW)
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: external-dns-bind9-secret
  namespace: external-dns
type: Opaque
data:
  # This will be populated by External Secrets or manually
  # Base64 encoded TSIG secret from /etc/bind/externaldns.key
  ddns-key: ""
```

---

## ⚙️ **Phase 3: Advanced Scheduling with Volcano**

### **3.1 Create Volcano ArgoCD Application**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/volcano/Chart.yaml`** (NEW)
```yaml
apiVersion: v2
name: volcano
description: Volcano scheduler for advanced job scheduling and gang scheduling
type: application
version: 0.1.0
appVersion: "v1.8.2"
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/volcano/values.yaml`** (NEW)
```yaml
# Volcano Configuration for PiKube ARM64 Cluster
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

# Source repository configuration
source:
  repoURL: https://volcano-sh.github.io/helm-charts
  chart: volcano
  targetRevision: v1.8.2

# Destination configuration
destination:
  server: https://kubernetes.default.svc
  namespace: volcano-system

# Sync policy
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=true
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/volcano/templates/volcano-queues.yaml`** (NEW)
```yaml
---
# High priority queue for logging infrastructure
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: logging-critical
  namespace: volcano-system
spec:
  weight: 100
  reclaimable: false
  guarantee:
    resource:
      cpu: "8"
      memory: "16Gi"
  capability:
    cpu: "16"
    memory: "32Gi"

---
# AI/ML workload queue (ultra performance)
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: ai-workloads
  namespace: volcano-system
spec:
  weight: 90
  reclaimable: true
  guarantee:
    resource:
      cpu: "24"      # Orange Pi 5 Ultra cluster
      memory: "48Gi"
  capability:
    cpu: "40"      # All AI-capable nodes
    memory: "80Gi"

---
# Monitoring queue (medium priority)
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: monitoring
  namespace: volcano-system
spec:
  weight: 80
  reclaimable: true
  guarantee:
    resource:
      cpu: "4"
      memory: "8Gi"
  capability:
    cpu: "8"
    memory: "16Gi"

---
# Default queue for standard workloads
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: default-queue
  namespace: volcano-system
spec:
  weight: 50
  reclaimable: true
  guarantee:
    resource:
      cpu: "2"
      memory: "4Gi"
  capability:
    cpu: "20"
    memory: "40Gi"
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/volcano/templates/servicemonitor.yaml`** (NEW)
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: volcano-metrics
  namespace: volcano-system
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: volcano-scheduler
  endpoints:
  - port: http-metrics
    interval: 30s
    path: /metrics
```

---

## 🕸️ **Phase 4: Istio Service Mesh Integration**

### **4.1 Create Istio Base Application**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istio-base/Chart.yaml`** (NEW)
```yaml
apiVersion: v2
name: istio-base
description: Istio base components and CRDs
type: application
version: 0.1.0
appVersion: "1.26.2"
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istio-base/values.yaml`** (NEW)
```yaml
# Istio Base Configuration
istio-base:
  # Default values for istio-base chart
  defaultRevision: ""

# Source repository configuration
source:
  repoURL: https://istio-release.storage.googleapis.com/charts
  chart: base
  targetRevision: 1.26.2

# Destination configuration
destination:
  server: https://kubernetes.default.svc
  namespace: istio-system

# Sync policy
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=true
```

### **4.2 Create Istiod Application**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istiod/Chart.yaml`** (NEW)
```yaml
apiVersion: v2
name: istiod
description: Istio control plane (Istiod)
type: application
version: 0.1.0
appVersion: "1.26.2"
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istiod/values.yaml`** (NEW)
```yaml
# Istiod Configuration for PiKube
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

# Source repository configuration
source:
  repoURL: https://istio-release.storage.googleapis.com/charts
  chart: istiod
  targetRevision: 1.26.2

# Destination configuration
destination:
  server: https://kubernetes.default.svc
  namespace: istio-system

# Sync policy
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=false
```

### **4.3 Create Istio Gateway Application**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istio-gateway/Chart.yaml`** (NEW)
```yaml
apiVersion: v2
name: istio-gateway
description: Istio ingress gateway
type: application
version: 0.1.0
appVersion: "1.26.2"
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istio-gateway/values.yaml`** (NEW)
```yaml
# Istio Gateway Configuration
istio-gateway:
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

# Source repository configuration
source:
  repoURL: https://istio-release.storage.googleapis.com/charts
  chart: gateway
  targetRevision: 1.26.2

# Destination configuration
destination:
  server: https://kubernetes.default.svc
  namespace: istio-system

# Sync policy
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=false
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/istio-gateway/templates/gateway.yaml`** (NEW)
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

## 📦 **Phase 5: Update Existing Applications**

### **5.1 Update Metal-LB Configuration**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/metal-lb/Chart.yaml`** (MODIFY)
```yaml
# REPLACE ENTIRE FILE - MetalLB is being replaced by Cilium LB-IPAM
# This application should be removed from the root app-set
```

**ACTION**: Remove MetalLB from ArgoCD applications entirely.

### **5.2 Update Longhorn for NVMe Integration**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/longhorn-system/values.yaml`** (MODIFY)
```yaml
# ADD TO EXISTING values.yaml - Enhanced storage configuration
longhorn:
  # Existing configuration...
  
  # NEW: NVMe Storage Class configuration
  storageClasses:
    - name: longhorn-nvme
      isDefault: false
      allowVolumeExpansion: true
      reclaimPolicy: Retain
      volumeBindingMode: Immediate
      parameters:
        numberOfReplicas: "1"  # Single replica for NVMe (performance)
        staleReplicaTimeout: "2880"
        fromBackup: ""
        fsType: "ext4"
        nodeSelector: "storage-tier=nvme"  # Only schedule on NVMe nodes
        diskSelector: "path=/mnt/longhorn-nvme/longhorn"  # Use prepared NVMe mount
        
    - name: longhorn-fast
      isDefault: false
      allowVolumeExpansion: true
      reclaimPolicy: Retain
      volumeBindingMode: Immediate
      parameters:
        numberOfReplicas: "2"  # Dual replica for high-performance storage
        staleReplicaTimeout: "2880"
        fromBackup: ""
        fsType: "ext4"
        nodeSelector: "storage-tier=high"
        
    - name: longhorn-standard
      isDefault: true
      allowVolumeExpansion: true
      reclaimPolicy: Retain
      volumeBindingMode: Immediate
      parameters:
        numberOfReplicas: "3"  # Triple replica for standard storage
        staleReplicaTimeout: "2880"
        fromBackup: ""
        fsType: "ext4"

  # NEW: Node affinity for storage tiers
  defaultSettings:
    # Prefer NVMe nodes for high-performance workloads
    storageOverProvisioningPercentage: 100
    storageMinimalAvailablePercentage: 25
    upgradeChecker: false
    defaultReplicaCount: 3
    defaultDataLocality: disabled
    replicaSoftAntiAffinity: false
    replicaAutoBalance: enabled
    storageNetwork: ""
    deletingConfirmationFlag: true
    engineReplicaTimeout: 8
    snapshotDataIntegrity: disabled
    snapshotDataIntegrityImmediateCheckAfterSnapshotCreation: false
    snapshotDataIntegrityCronjob: "0 0 * * *"
    removeSnapshotsData: true
    fastReplicaRebuildEnabled: false
    replicaFileSyncHttpClientTimeout: 30
    replicaReplenishmentWaitInterval: 600
    concurrentReplicaRebuildPerNodeLimit: 5
    concurrentVolumeBackupRestorePerNodeLimit: 5
    disableSchedulingOnCordonedNode: true
    replicaZoneSoftAntiAffinity: true
    nodeDownPodDeletionPolicy: delete-both-statefulset-and-deployment-pod
    allowNodeDrainWithLastHealthyReplica: false
    mkfsExt4Parameters: ""
    disableReplicaRebuild: false
    replicaReplenishmentWaitInterval: 600
    disableRevisionCounter: true
    systemManagedPodsImagePullPolicy: if-not-present
    allowVolumeCreationWithDegradedAvailability: true
    autoCleanupSystemGeneratedSnapshot: true
    concurrentAutomaticEngineUpgradePerNodeLimit: 3
    backingImageCleanupWaitInterval: 60
    backingImageRecoveryWaitInterval: 300
    guaranteedEngineCPU: 0.25
    guaranteedReplicaCPU: 0.25
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/longhorn-system/templates/storage-classes.yaml`** (NEW)
```yaml
# NVMe High-Performance Storage Class
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn-nvme
  annotations:
    storageclass.kubernetes.io/is-default-class: "false"
allowVolumeExpansion: true
provisioner: driver.longhorn.io
reclaimPolicy: Retain
volumeBindingMode: Immediate
parameters:
  numberOfReplicas: "1"
  staleReplicaTimeout: "2880"
  fromBackup: ""
  fsType: "ext4"
  nodeSelector: "storage-tier=nvme"

---
# High-Performance Storage Class
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn-fast
  annotations:
    storageclass.kubernetes.io/is-default-class: "false"
allowVolumeExpansion: true
provisioner: driver.longhorn.io
reclaimPolicy: Retain
volumeBindingMode: Immediate
parameters:
  numberOfReplicas: "2"
  staleReplicaTimeout: "2880"
  fromBackup: ""
  fsType: "ext4"
  nodeSelector: "storage-tier=high"

---
# Standard Storage Class (Default)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn-standard
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
allowVolumeExpansion: true
provisioner: driver.longhorn.io
reclaimPolicy: Retain
volumeBindingMode: Immediate
parameters:
  numberOfReplicas: "3"
  staleReplicaTimeout: "2880"
  fromBackup: ""
  fsType: "ext4"
```

### **5.3 Update Logging with Volcano Gang Scheduling**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/logging/templates/elasticsearch.yaml`** (MODIFY)
```yaml
# MODIFY EXISTING elasticsearch.yaml - Add Volcano scheduling
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
      spec:
        # ADD: Use Volcano scheduler
        schedulerName: volcano
        
        # ADD: Enhanced affinity for storage-aware placement
        affinity:
          nodeAffinity:
            preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              preference:
                matchExpressions:
                - key: storage-tier
                  operator: In
                  values: ["nvme", "high"]
            - weight: 80
              preference:
                matchExpressions:
                - key: node-tier
                  operator: In
                  values: ["tier1-ultra", "tier2-standard"]
          podAntiAffinity:
            requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  elasticsearch.k8s.elastic.co/cluster-name: "efk"
              topologyKey: kubernetes.io/hostname
        
        # Enhanced resource allocation
        containers:
        - name: elasticsearch
          resources:
            requests:
              memory: 2Gi
              cpu: 500m
            limits:
              memory: 4Gi
              cpu: 2000m
          env:
          - name: ES_JAVA_OPTS
            value: "-Xms1g -Xmx1g"
        
        # Use high-performance storage class
        volumeClaimTemplates:
        - metadata:
            name: elasticsearch-data
          spec:
            accessModes:
            - ReadWriteOnce
            storageClassName: longhorn-fast  # Use fast storage class
            resources:
              requests:
                storage: 10Gi
        
        automountServiceAccountToken: true
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/logging/templates/elasticsearch-podgroup.yaml`** (NEW)
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
```

### **5.4 Update Monitoring for Volcano Scheduler**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/monitoring/templates/prometheus-operator-patch.yaml`** (NEW)
```yaml
# Patch Prometheus Operator for Volcano compatibility
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-operator-volcano-patch
  namespace: monitoring
data:
  patch.yaml: |
    spec:
      template:
        metadata:
          annotations:
            scheduling.volcano.sh/queue-name: "monitoring"
        spec:
          schedulerName: volcano
```

### **5.5 Update Service Configurations for Cilium LB-IPAM**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/nginx/values.yaml`** (MODIFY)
```yaml
# MODIFY EXISTING nginx values.yaml
nginx:
  controller:
    service:
      type: LoadBalancer
      annotations:
        # REMOVE: MetalLB annotations
        # metallb.universe.tf/allow-shared-ip: "nginx"
        # metallb.universe.tf/address-pool: default
        
        # ADD: Cilium LB-IPAM annotations
        io.cilium/lb-ipam-ips: "10.0.0.101"
        external-dns.alpha.kubernetes.io/hostname: "nginx.picluster.quantfinancehub.com"
  
  # Rest of configuration remains the same...
```

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/monitoring/templates/grafana-service-patch.yaml`** (NEW)
```yaml
# Patch Grafana service for Cilium LB-IPAM
apiVersion: v1
kind: Service
metadata:
  name: kube-prometheus-stack-grafana
  namespace: monitoring
  annotations:
    # REMOVE MetalLB, ADD Cilium
    io.cilium/lb-ipam-ips: "10.0.0.102"
    external-dns.alpha.kubernetes.io/hostname: "grafana.picluster.quantfinancehub.com"
spec:
  type: LoadBalancer
  # ... rest of service spec
```

---

## 🎯 **Phase 6: ArgoCD Application Updates**

### **6.1 Update Bootstrap Root Values (Respecting Existing Structure)**

#### **File: `/home/quantstacker/pikube-argocd/argocd/bootstrap/root/values.yaml`** (MODIFY)
```yaml
# MODIFY existing app-set.yaml - Update sync waves and add new applications
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: cluster-applications
  namespace: argocd
spec:
  generators:
  - list:
      elements:
      # Wave 0: Core Infrastructure
      - name: namespaces
        path: system/namespaces
        wave: "0"
        
      # Wave 1: Network Foundation  
      - name: cilium
        path: system/cilium
        wave: "1"
        
      # Wave 2: DNS Infrastructure (NEW - Currently missing from ArgoCD)
      - name: coredns
        path: system/coredns
        wave: "2"
        
      - name: external-dns
        path: system/external-dns
        wave: "2"

      # Wave 3: Security & Certificates
      - name: cert-manager
        path: system/cert-manager
        wave: "3"
        
      - name: external-secrets
        path: system/external-secrets
        wave: "3"

      # Wave 4: Advanced Scheduling
      - name: volcano
        path: system/volcano
        wave: "4"

      # Wave 5: Service Mesh Base
      - name: istio-base
        path: system/istio-base
        wave: "5"
        
      - name: istiod
        path: system/istiod
        wave: "5"

      # Wave 6: Service Mesh Gateway
      - name: istio-gateway
        path: system/istio-gateway
        wave: "6"

      # Wave 7: Storage (with NVMe support)
      - name: longhorn-system
        path: system/longhorn-system
        wave: "7"

      # Wave 8: Ingress Controllers
      - name: nginx
        path: system/nginx
        wave: "8"

      # Wave 9: Monitoring Foundation
      - name: monitoring
        path: system/monitoring
        wave: "9"

      # Wave 10: Logging with Gang Scheduling
      - name: logging
        path: system/logging
        wave: "10"

      # Wave 11: Object Storage
      - name: minio
        path: system/minio
        wave: "11"

      # Wave 12: Authentication
      - name: keycloak
        path: system/keycloak
        wave: "12"
        
      - name: oauth2-proxy
        path: system/oauth2-proxy
        wave: "12"

      # Wave 13: Additional Services
      - name: debug-tools
        path: system/debug-tools
        wave: "13"

      # Wave 14: Secret Resources (Last)
      - name: secret-resources
        path: system/secret-resources
        wave: "14"

      # REMOVED: metal-lb (replaced by Cilium LB-IPAM)

  template:
    metadata:
      name: '{{name}}'
      annotations:
        argocd.argoproj.io/sync-wave: '{{wave}}'
    spec:
      project: default
      source:
        repoURL: https://gitlab.com/crypto-aggressor/pikube-argocd.git
        targetRevision: HEAD
        path: argocd/{{path}}
      destination:
        server: https://kubernetes.default.svc
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
          - ApplyOutOfSyncOnly=true
        retry:
          limit: 5
          backoff:
            duration: 5s
            factor: 2
            maxDuration: 3m
```

---

## 🔧 **Phase 7: Configuration Files Updates**

### **7.1 Update Ansible Inventory Variables**

#### **File: `/home/quantstacker/pikube-ansible/vars/pikube-cluster.yaml`** (MODIFY)
```yaml
# ADD to existing variables - Network infrastructure configuration
network:
  cni: cilium
  load_balancer: cilium-lb-ipam
  service_mesh: istio
  scheduler: volcano
  
  # IP Pool configuration for Cilium LB-IPAM
  lb_ip_pool:
    start: "10.0.0.100"
    end: "10.0.0.200"
  
  # Service IP assignments
  service_ips:
    istio_gateway: "10.0.0.100"
    nginx_ingress: "10.0.0.101"
    grafana: "10.0.0.102"
    minio: "10.0.0.103"
    # Add more as needed

# Hardware specifications for node labeling
hardware_specs:
  grapefruit-worker:
    storage_tier: nvme
    ai_capability: 6-tops
    network_speed: 2.5g
    node_tier: tier1-ultra
  lemon-worker:
    storage_tier: high
    ai_capability: 6-tops
    network_speed: 2.5g
    node_tier: tier1-ultra
  # ... (define for all nodes)

# Volcano queue configuration
volcano_queues:
  logging-critical:
    weight: 100
    cpu_guarantee: "8"
    memory_guarantee: "16Gi"
  ai-workloads:
    weight: 90
    cpu_guarantee: "24"
    memory_guarantee: "48Gi"
  monitoring:
    weight: 80
    cpu_guarantee: "4"
    memory_guarantee: "8Gi"
```

### **7.2 Update External Secrets Configuration**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/secret-resources/templates/external-dns-secret.yaml`** (NEW)
```yaml
# External Secret for External-DNS TSIG key
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: external-dns-bind9-secret
  namespace: external-dns
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-secret-store
    kind: ClusterSecretStore
  target:
    name: external-dns-bind9-secret
    creationPolicy: Owner
  data:
  - secretKey: ddns-key
    remoteRef:
      key: dns
      property: tsig_secret
```

---

## 📊 **Phase 8: Monitoring & Observability Enhancements**

### **8.1 Create Istio Monitoring Configuration**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/monitoring/templates/istio-servicemonitor.yaml`** (NEW)
```yaml
# ServiceMonitor for Istio control plane
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: istio-pilot
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: istiod
  namespaceSelector:
    matchNames:
    - istio-system
  endpoints:
  - port: http-monitoring
    interval: 15s
    path: /stats/prometheus

---
# ServiceMonitor for Istio proxies
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: istio-proxy
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchExpressions:
    - key: security.istio.io/tlsMode
      operator: Exists
  namespaceSelector:
    any: true
  podMetricsEndpoints:
  - port: http-envoy-prom
    interval: 15s
    path: /stats/prometheus
```

### **8.2 Create Volcano Monitoring Configuration**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/monitoring/templates/volcano-servicemonitor.yaml`** (NEW)
```yaml
# ServiceMonitor for Volcano scheduler
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: volcano-scheduler
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: volcano-scheduler
  namespaceSelector:
    matchNames:
    - volcano-system
  endpoints:
  - port: http-metrics
    interval: 30s
    path: /metrics

---
# ServiceMonitor for Volcano controller
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: volcano-controller
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: volcano-controller
  namespaceSelector:
    matchNames:
    - volcano-system
  endpoints:
  - port: http-metrics
    interval: 30s
    path: /metrics
```

### **8.3 Create Cilium Monitoring Configuration**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/monitoring/templates/cilium-servicemonitor.yaml`** (NEW)
```yaml
# ServiceMonitor for Cilium agents
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: cilium-agent
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      k8s-app: cilium
  namespaceSelector:
    matchNames:
    - kube-system
  endpoints:
  - port: prometheus
    interval: 30s
    path: /metrics

---
# ServiceMonitor for Cilium operator
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: cilium-operator
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      name: cilium-operator
  namespaceSelector:
    matchNames:
    - kube-system
  endpoints:
  - port: prometheus
    interval: 30s
    path: /metrics
```

---

## 🎯 **Phase 9: Testing & Validation Configuration**

### **9.1 Create Test Applications**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/debug-tools/templates/istio-test-app.yaml`** (NEW)
```yaml
# Test application for Istio service mesh validation
apiVersion: apps/v1
kind: Deployment
metadata:
  name: istio-test-app
  namespace: debug
  labels:
    app: istio-test
spec:
  replicas: 2
  selector:
    matchLabels:
      app: istio-test
  template:
    metadata:
      labels:
        app: istio-test
      annotations:
        sidecar.istio.io/inject: "true"
    spec:
      containers:
      - name: httpbin
        image: kennethreitz/httpbin:latest
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"

---
apiVersion: v1
kind: Service
metadata:
  name: istio-test-service
  namespace: debug
spec:
  ports:
  - port: 80
    targetPort: 80
  selector:
    app: istio-test

---
# Virtual Service for Istio Gateway
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: istio-test-vs
  namespace: debug
spec:
  hosts:
  - test.picluster.quantfinancehub.com
  gateways:
  - istio-system/pikube-gateway
  http:
  - route:
    - destination:
        host: istio-test-service
        port:
          number: 80
```

### **9.2 Create Volcano Test Job**

#### **File: `/home/quantstacker/pikube-argocd/argocd/system/debug-tools/templates/volcano-test-job.yaml`** (NEW)
```yaml
# Test job for Volcano gang scheduling validation
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: volcano-test-group
  namespace: debug
spec:
  minMember: 3
  queue: default-queue

---
apiVersion: batch/v1
kind: Job
metadata:
  name: volcano-test-job
  namespace: debug
spec:
  parallelism: 3
  template:
    metadata:
      annotations:
        scheduling.volcano.sh/group-name: "volcano-test-group"
        scheduling.volcano.sh/queue-name: "default-queue"
    spec:
      schedulerName: volcano
      restartPolicy: Never
      containers:
      - name: test-container
        image: busybox:latest
        command: 
        - sh
        - -c
        - |
          echo "Volcano gang scheduling test - Pod: $HOSTNAME"
          echo "Waiting for all pods to start together..."
          sleep 60
          echo "Test completed successfully"
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
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
- [ ] Wave 1: Cilium pods running, nodes ready
- [ ] Wave 2: CoreDNS pods running, External-DNS creating records
- [ ] Wave 4: Volcano queues created, scheduler active
- [ ] Wave 5-6: Istio control plane and gateway ready
- [ ] Wave 7: Longhorn with NVMe storage classes (grapefruit-worker)
- [ ] Wave 10: Elasticsearch cluster forms successfully (gang scheduling)
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

## 📋 **Risk Mitigation & Rollback Plan**

### **Pre-Migration Backup**
```bash
# Complete cluster backup
velero backup create pre-migration-full --include-namespaces="*"

# Configuration backup
kubectl get cm,secrets --all-namespaces -o yaml > config-backup.yaml

# Custom resources backup
kubectl get crd -o yaml > crd-backup.yaml
```

### **Rollback Procedures**

**If Cilium fails:**
```bash
# Rollback to Flannel
kubectl delete -f cilium-config.yaml
# Reinstall K3s with Flannel enabled
```

**If Volcano causes issues:**
```bash
# Remove Volcano scheduling from problematic apps
kubectl patch deployment <app> --type='merge' -p='{"spec":{"template":{"spec":{"schedulerName":"default-scheduler"}}}}'
```

**If Istio gateway fails:**
```bash
# Temporary NGINX exposure
kubectl patch svc nginx-ingress-controller --type='merge' -p='{"spec":{"type":"LoadBalancer"}}'
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
| **1-2: Infrastructure** | 2-3 hours | None | LOW |
| **3: Volcano** | 1 hour | Network ready | MEDIUM |
| **4: Istio** | 2 hours | Cilium + Volcano | MEDIUM |
| **5: App Updates** | 3-4 hours | Service mesh ready | HIGH |
| **6-7: Configuration** | 1-2 hours | Apps deployed | LOW |
| **8-9: Testing** | 2-3 hours | All components | LOW |

**Total Estimated Time**: 13-16 hours (includes NVMe preparation + DNS applications)

---

## 🎯 **Critical Success Factors**

1. **Sequential Deployment**: Respect sync wave order
2. **Resource Monitoring**: Watch node resources during deployment  
3. **Network Validation**: Test connectivity at each phase
4. **Storage Verification**: Ensure PVCs bind to correct storage classes
5. **Service Mesh Testing**: Validate traffic flow and observability

---

**END OF MIGRATION PLAN**

*Session: 20250713-211043*  
*Generated by: Claude Code Assistant*  
*Total Applications: 17 (5 new: CoreDNS, External-DNS, Cilium, Volcano, Istio; 12 updated)*  
*Files Modified: 49 (+ NVMe preparation playbook + DNS applications)*  
*Configuration Changes: 168*  
*Critical Missing Components: CoreDNS & External-DNS ArgoCD applications*  
*Hardware Preparation Required: NVMe formatting on grapefruit-worker*