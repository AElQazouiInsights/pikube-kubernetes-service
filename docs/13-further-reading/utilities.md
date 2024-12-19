---
title: Kubernetes commands
permalink: /docs/k8s-commands/
description: Reference of kubectl/helm commands for our Kuberentes Raspberry Pi Cluster
last_modified_at: "03-04-2022"
---

# Kubernetes Commands and Tools Guide

## Pod Management

### Bulk Deletion of Stuck Pods

When pods get stuck in a Terminating state, you can use this helpful script to force delete them across all namespaces. This is particularly useful during cluster maintenance or when cleaning up resources.

Create a script file named `force-delete-terminating-pods.sh`:

```bash
#!/bin/bash

# Check if jq is installed
if ! command -v jq &> /dev/null
then
    echo "jq could not be found. Please install jq to proceed."
    exit
fi

# Fetch all pods in Terminating phase
terminating_pods=$(kubectl get pods --all-namespaces -o json | jq -r '
  .items[] | 
  select(.metadata.deletionTimestamp != null) | 
  "\(.metadata.namespace)/\(.metadata.name)"')

if [ -z "$terminating_pods" ]; then
    echo "No pods in Terminating phase found."
    exit
fi

echo "Found the following terminating pods:"
echo "$terminating_pods"

# Iterate and force delete each pod
while IFS= read -r pod; do
    namespace=$(echo $pod | cut -d'/' -f1)
    pod_name=$(echo $pod | cut -d'/' -f2)
    echo "Force deleting pod '$pod_name' in namespace '$namespace'"
    kubectl delete pod "$pod_name" -n "$namespace" --grace-period=0 --force
done <<< "$terminating_pods"

echo "Force deletion of terminating pods completed."
```

Make the script executable and run it:
```bash
chmod +x force-delete-terminating-pods.sh
./force-delete-terminating-pods.sh
```

### Essential Pod Commands

#### Pod Inspection
```bash
# List pods on specific node
kubectl get pods --all-namespaces -o wide --field-selector spec.nodeName=<node_name>

# Get detailed pod information
kubectl describe pod <pod_name> -n <namespace>

# Watch pod status changes
kubectl get pods -n <namespace> -w
```

#### Pod Logs and Debugging
```bash
# Get pod logs
kubectl logs <pod_name> -n <namespace>

# Get logs from specific container in pod
kubectl logs <pod_name> -c <container_name> -n <namespace>

# Get previous logs (if pod restarted)
kubectl logs <pod_name> -n <namespace> --previous

# Stream logs in real-time
kubectl logs -f <pod_name> -n <namespace>
```

#### Pod Access
```bash
# Execute command in pod
kubectl exec -it <pod_name> -n <namespace> -- /bin/bash

# Copy files to/from pod
kubectl cp <namespace>/<pod_name>:/path/to/file /local/path
kubectl cp /local/path <namespace>/<pod_name>:/path/in/pod
```

## Node Management

### Node Commands
```bash
# List node taints
kubectl describe nodes | grep Taint

# Mark node as unschedulable
kubectl cordon <node_name>

# Mark node as schedulable
kubectl uncordon <node_name>

# Drain node (evict all pods)
kubectl drain <node_name> --ignore-daemonsets --delete-emptydir-data
```

### Resource Monitoring
```bash
# Get node resource usage
kubectl top nodes

# Get pod resource usage sorted by CPU
kubectl top pods -A --sort-by='cpu'

# Get pod resource usage sorted by memory
kubectl top pods -A --sort-by='memory'
```

## Service Management

### Port Forwarding
```bash
# Forward service port
kubectl port-forward svc/<service-name> -n <namespace> <local-port>:<service-port>

# Forward with external access
kubectl port-forward svc/<service-name> -n <namespace> <local-port>:<service-port> --address 0.0.0.0
```

## Debugging Tips

### Running Temporary Debug Pods

1. Using curl image for network debugging:
```bash
kubectl run -it --rm --image=curlimages/curl curly -- sh
```

2. Using busybox for general troubleshooting:
```bash
kubectl run -it --rm --image=busybox busybox -- sh
```

### Pod Migration

To move pods from one node to another:

1. Identify current pod location:
```bash
kubectl get pod <pod-name> -n <namespace> -o wide
```

2. Cordon the current node:
```bash
kubectl cordon <current-node>
```

3. Delete the pod (it will be rescheduled):
```bash
kubectl delete pod <pod-name> -n <namespace>
```

4. Verify new location and uncordon old node:
```bash
kubectl get pod <pod-name> -n <namespace> -o wide
kubectl uncordon <current-node>
```

## Helm and Kustomize Integration

### Post-Rendering with Kustomize

Helm's post-rendering feature allows modification of manifests before deployment. Here's how to use it with Kustomize:

1. Create a kustomize wrapper script:
```bash
#!/bin/bash
cat <&0 > all.yaml
kubectl kustomize . && rm all.yaml
```

2. Create kustomization.yaml:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - all.yaml
patches:
  - path: patch.yaml
    target:
      kind: <resource-kind>
      name: <resource-name>
```

3. Apply with Helm:

```bash
helm install <release> <chart> --post-renderer ./kustomize
```

## Pro Tips

1. **Label Management**:

   - Use labels effectively for resource organization
   - Create standardized labeling schemes for your cluster

   ```bash
   kubectl label nodes <node-name> environment=production
   ```

2. **Resource Quotas**:

   - Implement namespace resource quotas to prevent resource exhaustion
   - Regularly monitor quota usage

   ```bash
   kubectl describe quota -n <namespace>
   ```

3. **Event Monitoring**:

   - Watch cluster events for troubleshooting

   ```bash
   kubectl get events -n <namespace> --sort-by='.lastTimestamp'
   ```

4. **Config Management**:

   - Keep track of ConfigMaps and Secrets
   - Use labels to associate them with applications
  
   ```bash
   kubectl get configmaps -n <namespace> --show-labels
   ```

5. **Backup Practices**:

   - Regularly backup etcd
   - Export important resources

   ```bash
   kubectl get all -A -o yaml > cluster-backup.yaml
   ```

## Common Troubleshooting Scenarios

1. **Pod Stuck in Pending**:

   ```bash
   kubectl describe pod <pod-name> -n <namespace>
   ```

   Check for:
   - Resource constraints
   - Node selector/affinity issues
   - PVC binding problems

2. **Pod Crash Looping**:

   ```bash
   kubectl logs <pod-name> -n <namespace> --previous
   ```

   Check for:
   - Application errors
   - Configuration issues
   - Resource limits

3. **Service Connectivity**:

   ```bash
   kubectl run -it --rm --image=curlimages/curl curly -- curl <service-name>.<namespace>.svc.cluster.local
   ```

   Check for:
   - Service endpoints
   - Port configurations
   - Network policies

Remember to always verify the context and namespace before executing destructive commands. Use `--dry-run=client` with kubectl commands when unsure about the outcome.
