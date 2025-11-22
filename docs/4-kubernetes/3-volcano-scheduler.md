---
title: Volcano Scheduler - Advanced Job Scheduling for PiKube
permalink: /docs/4-kubernetes/3-volcano-scheduler
description: Step-by-step guide to install and configure Volcano scheduler for advanced job scheduling, gang scheduling, and resource management in the PiKube Kubernetes cluster with AI workload optimization.
last_modified_at: "10-07-2025"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="volcano-scheduler"
    src="../resources/kubernetes/volcano-logo.svg"
    width="60%"
    height="60%">
</p>

Volcano is a Kubernetes-native system for high-performance workload scheduling, particularly designed for batch jobs, machine learning workloads, and scenarios requiring gang scheduling. For the PiKube cluster with its heterogeneous ARM64 hardware, AI capabilities (30 TOPS NPU), and multi-tier storage, Volcano provides optimal resource allocation and workload placement.

This guide demonstrates how to deploy Volcano scheduler to enhance the PiKube cluster's scheduling capabilities, specifically addressing the logging infrastructure issues and preparing for AI/ML workloads.

## Why Volcano for PiKube?

### Current Scheduling Challenges

The PiKube cluster experiences several scheduling inefficiencies with the default K3s scheduler:

- **Elasticsearch cluster startup failures** - Pods cannot form quorum due to uncoordinated scheduling
- **Resource starvation** - Critical services competing for resources without guarantees  
- **Suboptimal placement** - No awareness of storage tiers, NPU capabilities, or network performance
- **No gang scheduling** - Multi-pod applications start individually, causing coordination issues

### Volcano Benefits for PiKube

- **🎯 Gang Scheduling** - Ensures all pods in a job start together (critical for Elasticsearch cluster)
- **🏷️ Queue Management** - Priority-based resource allocation with guaranteed resource pools
- **🔧 Hardware Awareness** - Intelligent placement based on NPU, storage tiers, and network speed
- **📊 Fair Share** - Balanced resource distribution across 16 namespaces and multiple workloads
- **🚀 AI/ML Optimization** - Efficient scheduling for distributed training and inference workloads

## Installation

### Step 1: Add Volcano Helm Repository

```bash
# Add the official Volcano Helm repository
helm repo add volcano-sh https://volcano-sh.github.io/helm-charts

# Update repository information
helm repo update

# Verify repository
helm repo list
```

### Step 3: Create Volcano Namespace

```bash
# Create dedicated namespace for Volcano components
kubectl create namespace volcano-system

# Verify namespace creation
kubectl get namespaces | grep volcano
```

### Step 4: Install Volcano with Custom Configuration

Create a custom values file optimized for PiKube's ARM64 architecture:

```bash
# Create custom configuration
cat <<EOF > volcano-values.yaml
# Volcano Configuration for PiKube ARM64 Cluster
image:
  # Use ARM64 compatible images
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
EOF
```

### Step 5: Deploy Volcano

```bash
# Install Volcano using custom configuration
helm install volcano volcano-sh/volcano \
  --namespace volcano-system \
  --values volcano-values.yaml \
  --version v1.8.2

# Verify installation
kubectl get pods -n volcano-system
```

Expected output:

```bash
NAME                                READY   STATUS    RESTARTS   AGE
volcano-controller-xxx              1/1     Running   0          2m
volcano-scheduler-xxx               1/1     Running   0          2m  
volcano-admission-xxx               1/1     Running   0          2m
```

## Configuration

### Step 1: Label Nodes for Hardware Awareness

PiKube already uses a consistent node labeling scheme based on the hardware inventory
(`pikube.io/*` labels). Volcano can reuse these labels directly instead of introducing
a separate scheme.

Key labels used today:

- `pikube.io/device-type`: `raspberry-pi-5`, `orange-pi-5`, `orange-pi-5-ultra`
- `pikube.io/cpu-cores`: number of CPU cores
- `pikube.io/memory-gb`: node memory in GiB
- `pikube.io/storage-gb`: total storage capacity
- `pikube.io/storage-type`: `sd-card` or `sd-card---nvme`
- `pikube.io/has-nvme`: `true` on NVMe nodes (lemon, clementine, grapefruit)

Verify labels:

```bash
kubectl get nodes --show-labels
```

### Current Label Baseline (Derived from inventory.yaml)

The following labels reflect the actual PiKube hardware inventory and should be
applied to nodes (either manually or via Ansible):

```bash
# Raspberry Pi 4 masters
kubectl label node blueberry-master  pikube.io/device-type=raspberry-pi-4b  \
                                     pikube.io/cpu-cores=4                 \
                                     pikube.io/memory-gb=8                 \
                                     pikube.io/storage-type=sd-card        \
                                     pikube.io/storage-gb=120 --overwrite

kubectl label node strawberry-master pikube.io/device-type=raspberry-pi-4b  \
                                     pikube.io/cpu-cores=4                 \
                                     pikube.io/memory-gb=4                 \
                                     pikube.io/storage-type=sd-card        \
                                     pikube.io/storage-gb=120 --overwrite

kubectl label node blackberry-master pikube.io/device-type=raspberry-pi-4b  \
                                     pikube.io/cpu-cores=4                 \
                                     pikube.io/memory-gb=4                 \
                                     pikube.io/storage-type=sd-card        \
                                     pikube.io/storage-gb=120 --overwrite

# Raspberry Pi 5 worker
kubectl label node cranberry-worker  pikube.io/device-type=raspberry-pi-5   \
                                     pikube.io/cpu-cores=4                 \
                                     pikube.io/memory-gb=8                 \
                                     pikube.io/storage-type=sd-card        \
                                     pikube.io/storage-gb=240 --overwrite

# Orange Pi 5 workers (SD only)
kubectl label node orange-worker     pikube.io/device-type=orange-pi-5      \
                                     pikube.io/cpu-cores=8                 \
                                     pikube.io/memory-gb=16                \
                                     pikube.io/storage-type=sd-card        \
                                     pikube.io/storage-gb=240 --overwrite

kubectl label node mandarine-worker  pikube.io/device-type=orange-pi-5      \
                                     pikube.io/cpu-cores=8                 \
                                     pikube.io/memory-gb=16                \
                                     pikube.io/storage-type=sd-card        \
                                     pikube.io/storage-gb=240 --overwrite

# Orange Pi 5 Ultra workers (SD + NVMe)
kubectl label node lemon-worker      pikube.io/device-type=orange-pi-5-ultra \
                                     pikube.io/cpu-cores=8                  \
                                     pikube.io/memory-gb=16                 \
                                     pikube.io/storage-type=sd-card---nvme  \
                                     pikube.io/storage-gb=1240              \
                                     pikube.io/has-nvme=true --overwrite

kubectl label node clementine-worker pikube.io/device-type=orange-pi-5-ultra \
                                     pikube.io/cpu-cores=8                  \
                                     pikube.io/memory-gb=16                 \
                                     pikube.io/storage-type=sd-card---nvme  \
                                     pikube.io/storage-gb=1240              \
                                     pikube.io/has-nvme=true --overwrite

kubectl label node grapefruit-worker pikube.io/device-type=orange-pi-5-ultra \
                                     pikube.io/cpu-cores=8                  \
                                     pikube.io/memory-gb=16                 \
                                     pikube.io/storage-type=sd-card---nvme  \
                                     pikube.io/storage-gb=1240              \
                                     pikube.io/has-nvme=true --overwrite
```

These labels are the foundation for the affinity and queue examples below (for example,
preferring `pikube.io/has-nvme=true` nodes for high‑I/O workloads or
`pikube.io/device-type=orange-pi-5-ultra` for AI jobs). In the future, Ansible
playbooks will apply these labels automatically from `inventory.yaml`.

### Step 2: Create Resource Queues

Define queues optimized for PiKube's workload patterns:

```bash
# Create logging infrastructure queue (high priority)
cat <<EOF | kubectl apply -f -
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: logging-critical
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
EOF

# Create AI/ML workload queue (ultra performance)
cat <<EOF | kubectl apply -f -
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: ai-workloads
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
EOF

# Create monitoring queue (medium priority)
cat <<EOF | kubectl apply -f -
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: monitoring
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
EOF

# Create default queue for standard workloads
cat <<EOF | kubectl apply -f -
apiVersion: scheduling.volcano.sh/v1beta1
kind: Queue
metadata:
  name: default-queue
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
EOF
```

### Step 3: Verify Queue Configuration

```bash
# List all queues (cluster-scoped)
kubectl get queue

# Check queue details
kubectl describe queue logging-critical
```

## Fix Logging Infrastructure Issues

### Step 1: Create Elasticsearch Gang Scheduling

Fix the failing Elasticsearch cluster using Volcano's gang scheduling:

```bash
# Create PodGroup for Elasticsearch cluster coordination
cat <<EOF | kubectl apply -f -
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: elasticsearch-cluster
  namespace: logging
spec:
  minMember: 3
  queue: logging-critical
  priorityClassName: system-cluster-critical
EOF
```

### Step 2: Update Elasticsearch Configuration

Modify the existing Elasticsearch StatefulSet to use Volcano scheduling:

```bash
# Patch Elasticsearch StatefulSet to use Volcano
kubectl patch statefulset efk-es-default -n logging --type='merge' -p='
{
  "spec": {
    "template": {
      "metadata": {
        "annotations": {
          "scheduling.volcano.sh/group-name": "elasticsearch-cluster",
          "scheduling.volcano.sh/queue-name": "logging-critical"
        }
      },
      "spec": {
        "schedulerName": "volcano",
        "affinity": {
          "nodeAffinity": {
            "preferredDuringSchedulingIgnoredDuringExecution": [
              {
                "weight": 100,
                "preference": {
                  "matchExpressions": [
                    {
                      "key": "pikube.io/has-nvme",
                      "operator": "In",
                      "values": ["true"]
                    }
                  ]
                }
              }
            ]
          },
          "podAntiAffinity": {
            "requiredDuringSchedulingIgnoredDuringExecution": [
              {
                "labelSelector": {
                  "matchLabels": {
                    "elasticsearch.k8s.elastic.co/cluster-name": "efk"
                  }
                },
                "topologyKey": "kubernetes.io/hostname"
              }
            ]
          }
        }
      }
    }
  }
}'
```

### Step 3: Restart Elasticsearch Cluster

```bash
# Scale down Elasticsearch cluster
kubectl scale statefulset efk-es-default -n logging --replicas=0

# Wait for pods to terminate
kubectl get pods -n logging | grep efk-es-default

# Scale up with new Volcano configuration
kubectl scale statefulset efk-es-default -n logging --replicas=3

# Monitor pod startup - should start together now
kubectl get pods -n logging -w | grep efk-es-default
```

### Step 4: Update Fluent Bit for Resource Guarantees

```bash
# Patch Fluent Bit DaemonSet for better resource allocation
kubectl patch daemonset logging-fluent-bit -n logging --type='merge' -p='
{
  "spec": {
    "template": {
      "metadata": {
        "annotations": {
          "scheduling.volcano.sh/queue-name": "monitoring"
        }
      },
      "spec": {
        "schedulerName": "volcano",
        "containers": [
          {
            "name": "fluent-bit",
            "resources": {
              "requests": {
                "cpu": "100m",
                "memory": "128Mi"
              },
              "limits": {
                "cpu": "500m", 
                "memory": "512Mi"
              }
            }
          }
        ]
      }
    }
  }
}'
```

## Testing and Validation

### Step 1: Verify Volcano Components

```bash
# Check Volcano system status
kubectl get all -n volcano-system

# Verify CRDs are installed
kubectl get crd | grep volcano

# Check scheduler is active
kubectl logs -n volcano-system deployment/volcano-scheduler
```

### Step 2: Test Queue Functionality

```bash
# Create a test job to verify queue scheduling
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: volcano-test-job
  namespace: default
spec:
  template:
    metadata:
      annotations:
        scheduling.volcano.sh/queue-name: "default-queue"
    spec:
      schedulerName: volcano
      restartPolicy: Never
      containers:
      - name: test-container
        image: busybox:latest
        command: ["sh", "-c", "echo 'Volcano scheduling test successful'; sleep 30"]
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
EOF

# Monitor job execution
kubectl get job volcano-test-job -w
kubectl logs job/volcano-test-job
```

### Step 3: Validate Elasticsearch Cluster Formation

```bash
# Check Elasticsearch pod status
kubectl get pods -n logging | grep efk-es-default

# Verify cluster formation
kubectl exec -n logging efk-es-default-0 -- curl -s localhost:9200/_cluster/health

# Expected output should show "status":"green" and "number_of_nodes":3
```

### Step 4: Monitor Resource Usage

```bash
# Check queue resource allocation
kubectl describe queue

# Monitor node resource distribution
kubectl top nodes

# Verify improved scheduling
kubectl get pods -o wide | grep -E "(efk-es|fluent-bit)"
```

## AI/ML Workload Example

### Create Sample AI Training Job

```bash
# Example distributed training job using gang scheduling
cat <<EOF | kubectl apply -f -
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: ai-training-job
  namespace: default
spec:
  minMember: 3
  queue: ai-workloads
---
apiVersion: batch/v1
kind: Job
metadata:
  name: distributed-training
  namespace: default
spec:
  parallelism: 3
  template:
    metadata:
      annotations:
        scheduling.volcano.sh/group-name: "ai-training-job"
        scheduling.volcano.sh/queue-name: "ai-workloads"
    spec:
      schedulerName: volcano
      restartPolicy: Never
      nodeSelector:
        ai-capability: "6-tops"
      containers:
      - name: training-worker
        image: tensorflow/tensorflow:latest-arm64
        command: ["python", "-c", "import tensorflow as tf; print(f'TensorFlow version: {tf.__version__}'); import time; time.sleep(300)"]
        resources:
          requests:
            cpu: "2"
            memory: "4Gi"
          limits:
            cpu: "4"
            memory: "8Gi"
EOF
```

## Monitoring and Troubleshooting

### Check Volcano Logs

```bash
# Volcano scheduler logs
kubectl logs -n volcano-system deployment/volcano-scheduler -f

# Volcano controller logs  
kubectl logs -n volcano-system deployment/volcano-controller -f

# Volcano webhook logs
kubectl logs -n volcano-system deployment/volcano-admission -f
```

### Common Issues and Solutions

**Pods stuck in Pending state:**

```bash
# Check queue capacity
kubectl describe queue <queue-name> -n volcano-system

# Verify node labels
kubectl get nodes --show-labels
```

**Gang scheduling not working:**

```bash
# Verify PodGroup configuration
kubectl describe podgroup <podgroup-name> -n <namespace>

# Check scheduler events
kubectl get events --sort-by='.metadata.creationTimestamp'
```

**Resource conflicts:**

```bash
# Check resource allocation
kubectl describe nodes

# Monitor queue utilization
kubectl get queues -n volcano-system -o wide
```

## Performance Optimization

### Enable Metrics Collection

```bash
# Create ServiceMonitor for Prometheus integration
cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: volcano-metrics
  namespace: volcano-system
spec:
  selector:
    matchLabels:
      app: volcano-scheduler
  endpoints:
  - port: http-metrics
    interval: 30s
    path: /metrics
EOF
```

> [!NOTE] 📊 Prometheus Operator Required  
> The `ServiceMonitor` resource is provided by the Prometheus Operator (kube-prometheus-stack).
> Make sure you have followed `docs/9-monitoring/7-monitoring-prometheus.md` to install
> kube-prometheus-stack **before** applying the `ServiceMonitor` manifest. If the CRDs are not
> installed yet, skip this step for now and add it after monitoring is in place.

### Configure Node Affinity Rules

For optimal performance on PiKube's heterogeneous hardware:

```bash
# Example: High-I/O workloads prefer NVMe storage
nodeAffinity:
  preferredDuringSchedulingIgnoredDuringExecution:
  - weight: 100
    preference:
      matchExpressions:
      - key: pikube.io/has-nvme
        operator: In
        values: ["true"]
  - weight: 80
    preference:
      matchExpressions:
      - key: pikube.io/device-type
        operator: In
        values: ["orange-pi-5-ultra"]
```

---

## Next Steps

With Volcano successfully deployed, the PiKube cluster now supports:

- **✅ Gang Scheduling** - Coordinated pod startup (fixes Elasticsearch issues)
- **✅ Resource Guarantees** - Predictable resource allocation
- **✅ Hardware Awareness** - Optimal placement on NPU and high-performance nodes
- **✅ Priority Queues** - Fair resource sharing across workloads
- **✅ AI/ML Ready** - Prepared for distributed training and inference workloads
