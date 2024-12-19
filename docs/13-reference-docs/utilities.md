# Tools for PiKube Kubernetes Service Management

## Bulk Deletion Across All Namespaces

To automate the process of force deleting all pods stuck in the Terminating phase across all namespaces, you can use the following script.

- Create a new script file named `force-delete-terminating-pods.sh`

```bash
nano force-delete-terminating-pods.sh
```

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

- Make scripts executable

```bash
chmod +x force-delete-terminating-pods.sh
```

- Run

```bash
./force-delete-terminating-pods.sh
```
