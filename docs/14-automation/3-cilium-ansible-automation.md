---
title: Automating Cilium Deployment with Ansible
permalink: /docs/14-automation/3-cilium-ansible-automation/
description: Comprehensive guide to automating Cilium CNI deployment through Ansible playbooks, roles, and tasks for production-ready Kubernetes clusters.
last_modified_at: "2025-01-18"
---

# {{ $frontmatter.title }}

## Overview

This guide provides a detailed walkthrough of automating Cilium CNI deployment using Ansible. Building upon the manual installation process, this automation ensures consistent, repeatable, and production-ready deployments across your PiKube cluster.

> [!TIP]
> **🚀 Complete Bootstrap Automation Available**
> 
> For a **unified, production-ready approach** that deploys Cilium alongside CoreDNS, ArgoCD, and your complete platform stack, see our [**Complete Kubernetes Cluster Bootstrap Automation**](2-bootstrap-kubernetes-cluster.md).
> 
> The bootstrap approach offers:
> - ✅ **Integrated deployment** of all networking components
> - ✅ **GitOps-ready platform** from day one  
> - ✅ **Dependency management** with proper sequencing
> - ✅ **Single command deployment** for the entire cluster
>
> This document covers **Cilium-specific** automation details for advanced users who want to understand the individual component deployment process.

## Architecture Overview

The automation follows a hierarchical structure that separates concerns and promotes reusability:

```
📁 pikube-ansible/
├── 📋 Playbooks (High-level orchestration)
│   ├── k3s-cluster-setup.yaml
│   ├── k3s-cluster-bootstrap.yaml
│   └── k3s-cluster-reset.yaml
├── 🎯 Roles (Functional groupings)
│   └── kubernetes/
│       ├── prerequisites/
│       ├── master_nodes/
│       ├── worker_nodes/
│       ├── bootstrap/
│       └── reset/
├── 📝 Tasks (Atomic operations)
│   └── Within each role
├── 📦 Templates (Dynamic configurations)
│   └── Jinja2 templates
└── 🔧 Variables (Configuration data)
    ├── vars/
    └── defaults/
```

## Step-by-Step Implementation

### Step 1: K3s Setup with Cilium Prerequisites

The `k3s-cluster-setup.yaml` playbook prepares K3s with the correct configuration for Cilium.

#### 1.1 Playbook Structure

```yaml
# k3s-cluster-setup.yaml
---
- name: Configure prerequisites on all cluster nodes
  hosts: picluster
  become: true
  vars_files:
    - vars/vault.yaml
    - vars/pikube-cluster.yaml
  roles:
    - role: kubernetes/prerequisites

- name: Setup K3s master nodes
  hosts: k3s_master
  become: true
  serial: 1  # Sequential to avoid race conditions
  roles:
    - role: kubernetes/master_nodes

- name: Setup K3s worker nodes
  hosts: k3s_worker
  become: true
  roles:
    - role: kubernetes/worker_nodes
```

#### 1.2 Prerequisites Role

The prerequisites role ensures all nodes have required dependencies:

```yaml
# roles/kubernetes/prerequisites/tasks/main.yml
---
- name: Install required system packages
  package:
    name:
      - curl
      - jq
      - socat
      - conntrack
      - ipvsadm
    state: present
    update_cache: yes

- name: Disable swap for Kubernetes
  command: swapoff -a
  when: ansible_swaptotal_mb > 0

- name: Load required kernel modules
  modprobe:
    name: "{{ item }}"
    state: present
  loop:
    - br_netfilter
    - overlay
    - ip_vs
    - ip_vs_rr
    - ip_vs_wrr
    - ip_vs_sh

- name: Configure sysctl for Kubernetes
  sysctl:
    name: "{{ item.key }}"
    value: "{{ item.value }}"
    sysctl_set: yes
    state: present
    reload: yes
  loop:
    - { key: 'net.bridge.bridge-nf-call-iptables', value: '1' }
    - { key: 'net.bridge.bridge-nf-call-ip6tables', value: '1' }
    - { key: 'net.ipv4.ip_forward', value: '1' }
```

#### 1.3 Master Node Configuration

Critical: Disable components that Cilium will replace:

```yaml
# roles/kubernetes/master_nodes/tasks/main.yml
---
- name: Create K3s config directory
  file:
    path: /etc/rancher/k3s
    state: directory
    mode: '0755'

- name: Generate K3s server configuration
  template:
    src: k3s-server-config.yaml.j2
    dest: /etc/rancher/k3s/config.yaml
    mode: '0644'

- name: Install K3s server
  shell: |
    curl -sfL https://get.k3s.io | sh -s - server \
      --config=/etc/rancher/k3s/config.yaml
  args:
    creates: /usr/local/bin/k3s

- name: Wait for K3s to be ready
  wait_for:
    port: 6443
    delay: 10
    timeout: 300
```

Template for K3s configuration:

```yaml
# roles/kubernetes/master_nodes/templates/k3s-server-config.yaml.j2
# Cilium-specific K3s configuration
token-file: /etc/rancher/k3s/cluster-token
flannel-backend: none              # CRITICAL: Disable Flannel
disable-network-policy: true       # Let Cilium handle policies
disable-kube-proxy: true          # Cilium replaces kube-proxy
disable:
  - servicelb                     # Use Cilium LB-IPAM instead
  - traefik                       # Optional: Use different ingress
  - coredns                       # Deploy custom CoreDNS config
  - metrics-server                # Deploy via GitOps

# API server configuration
bind-address: 0.0.0.0
https-listen-port: 6443
advertise-address: {{ ansible_default_ipv4.address }}

# TLS configuration
tls-san:
  - "{{ infrastructure.k3s_api_vip }}"
  - "{{ ansible_hostname }}"
  - "{{ ansible_fqdn }}"

# Etcd configuration
etcd-expose-metrics: true

# Controller configuration
kube-controller-manager-arg:
  - bind-address=0.0.0.0
  - terminated-pod-gc-threshold=10

# Scheduler configuration
kube-scheduler-arg:
  - bind-address=0.0.0.0

# Kubelet configuration
kubelet-arg:
  - config=/etc/rancher/k3s/kubelet.config

# Node taints for masters
node-taint:
  - node-role.kubernetes.io/master=true:NoSchedule

write-kubeconfig-mode: "644"
```

### Step 2: Bootstrap Cilium and Core Components

The `k3s-cluster-bootstrap.yaml` playbook deploys Cilium and essential cluster components.

#### 2.1 Bootstrap Playbook

```yaml
# k3s-cluster-bootstrap.yaml
---
- name: Bootstrap Kubernetes cluster with Cilium CNI and GitOps
  hosts: gateway
  gather_facts: true
  vars_files:
    - vars/vault.yaml
    - vars/pikube-cluster.yaml
  roles:
    - role: kubernetes/bootstrap
      tags: ["bootstrap"]
  post_tasks:
    - name: Display bootstrap completion
      debug:
        msg: |
          Cluster bootstrap completed!
          Components installed via Helmfile:
          • Prometheus Operator CRDs ({{ bootstrap.prometheus_crds.version }})
          • Cilium CNI ({{ bootstrap.cilium.version }})
          • CoreDNS ({{ bootstrap.coredns.version }})
          • ArgoCD ({{ bootstrap.argocd.version }})
```

#### 2.2 Bootstrap Role Main Task

```yaml
# roles/kubernetes/bootstrap/tasks/main.yml
---
- name: Install system dependencies
  include_tasks: dependencies.yml
  tags: ["dependencies"]

- name: Create required namespaces
  include_tasks: namespaces.yml
  tags: ["namespaces"]

- name: Deploy components via Helmfile
  include_tasks: helmfile.yml
  tags: ["helmfile", "cilium"]

- name: Configure GitOps
  include_tasks: gitops.yml
  tags: ["gitops", "argocd"]

- name: Validate deployment
  include_tasks: validation.yml
  tags: ["validation"]

- name: Cleanup temporary files
  include_tasks: cleanup.yml
  tags: ["cleanup"]
```

#### 2.3 Dependencies Installation

```yaml
# roles/kubernetes/bootstrap/tasks/dependencies.yml
---
- name: Create Python virtual environment
  pip:
    name:
      - kubernetes
      - openshift
      - hvac
    virtualenv: "{{ bootstrap.python.virtualenv_path }}"
    virtualenv_python: python3
  delegate_to: gateway

- name: Install Helm if not present
  unarchive:
    src: "https://get.helm.sh/helm-v3.14.0-linux-amd64.tar.gz"
    dest: /tmp
    remote_src: yes
    creates: /usr/local/bin/helm
  delegate_to: gateway

- name: Install Helmfile
  get_url:
    url: "https://github.com/helmfile/helmfile/releases/download/v0.162.0/helmfile_0.162.0_linux_amd64.tar.gz"
    dest: /tmp/helmfile.tar.gz
    mode: '0644'
  delegate_to: gateway

- name: Extract Helmfile
  unarchive:
    src: /tmp/helmfile.tar.gz
    dest: /usr/local/bin
    remote_src: yes
    creates: /usr/local/bin/helmfile
  delegate_to: gateway

- name: Add Helm repositories
  kubernetes.core.helm_repository:
    name: "{{ item.name }}"
    repo_url: "{{ item.url }}"
  loop:
    - { name: cilium, url: "https://helm.cilium.io/" }
    - { name: prometheus-community, url: "https://prometheus-community.github.io/helm-charts" }
    - { name: coredns, url: "https://coredns.github.io/helm" }
    - { name: argo, url: "https://argoproj.github.io/argo-helm" }
  delegate_to: gateway
```

#### 2.4 Helmfile Deployment

```yaml
# roles/kubernetes/bootstrap/tasks/helmfile.yml
---
- name: Create Helmfile configuration
  template:
    src: helmfile.yaml.j2
    dest: /tmp/helmfile.yaml
    mode: '0644'
  delegate_to: gateway

- name: Create Cilium values file
  template:
    src: cilium-values.yaml.j2
    dest: /tmp/cilium-values.yaml
    mode: '0644'
  delegate_to: gateway

- name: Apply Helmfile
  shell: |
    cd /tmp
    helmfile -f helmfile.yaml apply --wait
  environment:
    KUBECONFIG: "{{ bootstrap.kubeconfig.path }}"
  delegate_to: gateway

- name: Wait for Cilium to be ready
  kubernetes.core.k8s_info:
    api_version: v1
    kind: Pod
    namespace: kube-system
    label_selectors:
      - "k8s-app=cilium"
    wait: true
    wait_condition:
      type: Ready
      status: "True"
    wait_timeout: 600
  vars:
    ansible_python_interpreter: "{{ bootstrap.python.interpreter }}"
  delegate_to: gateway
```

#### 2.5 Helmfile Template

```yaml
# roles/kubernetes/bootstrap/templates/helmfile.yaml.j2
repositories:
  - name: prometheus-community
    url: https://prometheus-community.github.io/helm-charts
  - name: cilium
    url: https://helm.cilium.io/
  - name: coredns
    url: https://coredns.github.io/helm
  - name: argo
    url: https://argoproj.github.io/argo-helm

releases:
  # Install CRDs first
  - name: prometheus-operator-crds
    namespace: kube-system
    chart: prometheus-community/prometheus-operator-crds
    version: {{ bootstrap.prometheus_crds.version }}
    wait: true

  # Cilium CNI with all features
  - name: cilium
    namespace: kube-system
    chart: cilium/cilium
    version: {{ bootstrap.cilium.version }}
    values:
      - /tmp/cilium-values.yaml
    needs:
      - kube-system/prometheus-operator-crds
    wait: true
    waitForJobs: true

  # CoreDNS for cluster DNS
  - name: coredns
    namespace: kube-system
    chart: coredns/coredns
    version: {{ bootstrap.coredns.version }}
    values:
      - replicaCount: {{ bootstrap.coredns.replicas }}
        service:
          clusterIP: {{ bootstrap.coredns.cluster_ip }}
    needs:
      - kube-system/cilium
    wait: true

  # ArgoCD for GitOps
  - name: argo-cd
    namespace: argocd
    chart: argo/argo-cd
    version: {{ bootstrap.argocd.version }}
    values:
      - server:
          extraArgs:
            - --insecure
        configs:
          params:
            server.insecure: true
    needs:
      - kube-system/cilium
      - kube-system/coredns
    wait: true
```

#### 2.6 Cilium Values Template

```yaml
# roles/kubernetes/bootstrap/templates/cilium-values.yaml.j2
# Operator configuration
operator:
  rollOutPods: {{ bootstrap.cilium.operator.rollout_pods }}
  replicas: {{ bootstrap.cilium.operator.replicas }}
  nodeSelector:
    node-role.kubernetes.io/master: "true"
  prometheus:
    enabled: true
    serviceMonitor:
      enabled: true

# Agent configuration
rollOutCiliumPods: true

# Kubernetes API configuration for K3s
k8sServiceHost: {{ bootstrap.cilium.k8s_service_host }}
k8sServicePort: {{ bootstrap.cilium.k8s_service_port }}

# Kube-proxy replacement
kubeProxyReplacement: {{ bootstrap.cilium.kube_proxy_replacement }}
kubeProxyReplacementHealthzBindAddr: {{ bootstrap.cilium.kube_proxy_healthz_bind_addr }}

# IP Address Management
ipam:
  operator:
    clusterPoolIPv4PodCIDRList: 
      - "{{ bootstrap.cilium.pod_cidr }}"

# Load Balancer functionality
l2announcements:
  enabled: {{ bootstrap.cilium.l2_announcements_enabled }}
externalIPs:
  enabled: {{ bootstrap.cilium.external_ips_enabled }}

# API rate limiting for L2 announcements
k8sClientRateLimit:
  qps: {{ bootstrap.cilium.api_rate_limit.qps }}
  burst: {{ bootstrap.cilium.api_rate_limit.burst }}

# Monitoring and metrics
prometheus:
  enabled: true
  serviceMonitor:
    enabled: true

# Hubble observability
hubble:
  enabled: true
  metrics:
    enabled:
      - dns:query
      - drop
      - tcp
      - flow
      - port-distribution
      - icmp
      - http
  relay:
    enabled: true
  ui:
    enabled: true
```

### Step 3: Validation and Health Checks

#### 3.1 Validation Tasks

```yaml
# roles/kubernetes/bootstrap/tasks/validation.yml
---
- name: Check node status
  kubernetes.core.k8s_info:
    api_version: v1
    kind: Node
  register: nodes
  vars:
    ansible_python_interpreter: "{{ bootstrap.python.interpreter }}"
  delegate_to: gateway

- name: Verify all nodes are ready
  assert:
    that:
      - item.status.conditions | selectattr('type', 'equalto', 'Ready') | selectattr('status', 'equalto', 'True') | list | length > 0
    fail_msg: "Node {{ item.metadata.name }} is not ready"
  loop: "{{ nodes.resources }}"

- name: Test Cilium connectivity
  shell: |
    kubectl -n kube-system exec ds/cilium -- cilium status --brief
  register: cilium_status
  delegate_to: gateway

- name: Display Cilium status
  debug:
    var: cilium_status.stdout_lines

- name: Verify CoreDNS resolution
  shell: |
    kubectl run -it --rm --restart=Never busybox --image=busybox:latest -- nslookup kubernetes.default
  register: dns_test
  delegate_to: gateway

- name: Check ArgoCD availability
  uri:
    url: "http://localhost:{{ bootstrap.argocd.local_port }}/healthz"
    status_code: 200
  retries: 5
  delay: 10
  delegate_to: gateway
```

### Step 4: GitOps Configuration

#### 4.1 ArgoCD Setup

```yaml
# roles/kubernetes/bootstrap/tasks/gitops.yml
---
- name: Wait for ArgoCD to be ready
  kubernetes.core.k8s_info:
    api_version: apps/v1
    kind: Deployment
    name: argocd-server
    namespace: "{{ bootstrap.argocd.namespace }}"
    wait: true
    wait_condition:
      type: Available
      status: "True"
    wait_timeout: 600
  vars:
    ansible_python_interpreter: "{{ bootstrap.python.interpreter }}"
  delegate_to: gateway

- name: Create repository secret
  kubernetes.core.k8s:
    state: present
    definition:
      apiVersion: v1
      kind: Secret
      metadata:
        name: "{{ bootstrap.argocd.repo_secret.name }}"
        namespace: "{{ bootstrap.argocd.namespace }}"
        labels:
          "{{ bootstrap.argocd.repo_secret.label }}": repository
      stringData:
        type: git
        url: "{{ gitops.repo }}"
        username: "{{ vault.git.username }}"
        password: "{{ vault.git.token }}"
  vars:
    ansible_python_interpreter: "{{ bootstrap.python.interpreter }}"
  delegate_to: gateway

- name: Deploy root application
  kubernetes.core.k8s:
    state: present
    definition:
      apiVersion: argoproj.io/v1alpha1
      kind: Application
      metadata:
        name: root
        namespace: "{{ bootstrap.argocd.namespace }}"
      spec:
        destination:
          namespace: "{{ bootstrap.argocd.namespace }}"
          server: https://kubernetes.default.svc
        project: default
        source:
          path: "{{ bootstrap.argocd.root_app.path }}"
          repoURL: "{{ gitops.repo }}"
          targetRevision: "{{ gitops.revision }}"
        syncPolicy:
          automated:
            prune: true
            selfHeal: true
  vars:
    ansible_python_interpreter: "{{ bootstrap.python.interpreter }}"
  delegate_to: gateway
```

### Step 5: Post-Deployment Configuration

#### 5.1 Cilium Load Balancer Configuration

```yaml
# Additional task for LB-IPAM configuration
- name: Configure Cilium IP pools
  kubernetes.core.k8s:
    state: present
    definition:
      apiVersion: cilium.io/v2alpha1
      kind: CiliumLoadBalancerIPPool
      metadata:
        name: pikube-pool
        namespace: kube-system
      spec:
        blocks:
          - start: "{{ cilium.lb_pool.start }}"
            stop: "{{ cilium.lb_pool.stop }}"
  vars:
    ansible_python_interpreter: "{{ bootstrap.python.interpreter }}"
  delegate_to: gateway

- name: Configure L2 announcement policy
  kubernetes.core.k8s:
    state: present
    definition:
      apiVersion: cilium.io/v2alpha1
      kind: CiliumL2AnnouncementPolicy
      metadata:
        name: default-l2-announcement
        namespace: kube-system
      spec:
        externalIPs: true
        loadBalancerIPs: true
  vars:
    ansible_python_interpreter: "{{ bootstrap.python.interpreter }}"
  delegate_to: gateway
```

## Error Handling and Recovery

### Rollback Strategy

```yaml
# roles/kubernetes/reset/tasks/main.yml
---
- name: Remove Cilium
  kubernetes.core.helm:
    name: cilium
    namespace: kube-system
    state: absent
    wait: true
  ignore_errors: yes

- name: Clean Cilium network interfaces
  shell: |
    ip link delete cilium_host 2>/dev/null || true
    ip link delete cilium_vxlan 2>/dev/null || true
  become: yes

- name: Remove iptables rules
  shell: |
    iptables-save | grep -v CILIUM | iptables-restore
    ip6tables-save | grep -v CILIUM | ip6tables-restore
  become: yes

- name: Clean CNI configuration
  file:
    path: /etc/cni/net.d
    state: absent
  become: yes
```

### Common Issues and Solutions

| Issue | Detection | Resolution |
|-------|-----------|------------|
| **Cilium pods crash** | `kubectl -n kube-system get pods -l k8s-app=cilium` | Check K3s config for conflicting components |
| **Nodes NotReady** | `kubectl get nodes` | Verify Cilium agent on each node |
| **DNS failures** | Pod logs show DNS timeouts | Check CoreDNS deployment and Cilium connectivity |
| **ArgoCD sync failures** | ArgoCD UI shows errors | Verify repository credentials and network access |

## Best Practices

### 1. Variable Management

```yaml
# vars/pikube-cluster.yaml
bootstrap:
  cilium:
    version: "1.17.5"  # Pin versions for reproducibility
    pod_cidr: "10.42.0.0/16"
    lb_pool:
      start: "10.0.0.100"
      stop: "10.0.0.200"
```

### 2. Idempotency

Always check for existing resources:

```yaml
- name: Check if Cilium is installed
  kubernetes.core.helm_info:
    name: cilium
    namespace: kube-system
  register: cilium_installed
  ignore_errors: yes

- name: Install Cilium
  when: cilium_installed is failed
  # ... installation tasks ...
```

### 3. Monitoring Integration

```yaml
- name: Create ServiceMonitor for Cilium
  kubernetes.core.k8s:
    definition:
      apiVersion: monitoring.coreos.com/v1
      kind: ServiceMonitor
      metadata:
        name: cilium-agent
        namespace: kube-system
      spec:
        selector:
          matchLabels:
            k8s-app: cilium
        endpoints:
          - port: metrics
            interval: 30s
            path: /metrics
```

## Testing the Automation

### Smoke Tests

```bash
# Run automation
ansible-playbook -i inventory.yaml k3s-cluster-setup.yaml
ansible-playbook -i inventory.yaml k3s-cluster-bootstrap.yaml

# Verify cluster
kubectl get nodes
kubectl -n kube-system get pods
kubectl -n kube-system exec ds/cilium -- cilium status

# Test connectivity
kubectl run test-pod --image=nginx --port=80
kubectl expose pod test-pod --type=LoadBalancer --port=80
kubectl get svc test-pod  # Should get IP from pool
```

### Integration Tests

```yaml
# molecule/default/verify.yml
---
- name: Verify Cilium deployment
  hosts: all
  tasks:
    - name: Check Cilium status
      shell: kubectl -n kube-system exec ds/cilium -- cilium status
      register: result
      
    - name: Assert Cilium is healthy
      assert:
        that:
          - "'Controller Status: OK' in result.stdout"
          - "'Cluster health: OK' in result.stdout"
```

## Conclusion

This automation transforms the manual Cilium installation into a production-ready, repeatable process. Key benefits:

- **Consistency**: Same deployment every time
- **Speed**: Minutes instead of hours
- **Reliability**: Built-in error handling
- **Auditability**: Complete tracking via Git
- **Scalability**: Works for 1 or 1000 nodes

The combination of Ansible automation and GitOps creates a powerful platform for managing Cilium and the entire Kubernetes networking stack.
