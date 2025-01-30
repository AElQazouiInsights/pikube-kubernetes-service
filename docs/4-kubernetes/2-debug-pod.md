---
title: PiKube Debug Pod - A Swiss-army-knife Container
description: Create and use a Swiss-army-knife debug pod in your PiKube cluster
last_modified_at: "21-10-2024"
---

# {{ $frontmatter.title }}

This guide explains how to build and deploy a **Debug Pod** in PiKube Kubernetes Service, a Swiss-army-knife container image containing various troubleshooting and debugging tools. By launching this pod, you can easily diagnose and resolve issues across the PiKube.

## Create the Dockerfile

Below is a sample `Dockerfile` that uses **Ubuntu 22.04** as the base image and installs commonly used debugging tools (networking, file editors, Python, etc.). If you want to add or remove tools, adjust as needed.

```dockerfile
# Dockerfile for PiKube Debug Pod
FROM ubuntu:22.04

USER root

# Update + Install key debug utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl wget net-tools iproute2 iputils-ping traceroute telnet netcat \
    dnsutils tcpdump nmap vim less grep git jq openssl strace htop \
    python3 python3-pip python3-venv ca-certificates apt-transport-https \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Optionally install Python packages for debugging
RUN pip3 install --no-cache-dir \
    requests PyYAML psycopg2-binary numpy pandas

# Keep container alive for an interactive shell
CMD ["sleep", "infinity"]
```

**Explanation of Key Tools**:

- **Networking**: `curl`, `wget`, `ping`, `netcat`, `nmap`, `dnsutils`
- **System**: `vim`, `less`, `htop`, `strace`, `git`
- **Python**: `python3`, `pip3`, plus optional modules (`requests`, `psycopg2`, etc.)
- **sleep infinity** ensures the container remains running so you can `kubectl exec -it` into it.

## Build and Push the Image

Below is how to build the Docker image locally, then push it to a Docker registry so PiKube  can pull it.

- Log in to your registry (e.g., Docker Hub) locally:

```bash
docker login
```

-Build the image, replacing `<docker-username>` with your Docker username:

```bash
docker build -t <docker-username>/debug:latest .
```

- Push to Docker Hub (or any other registry you prefer, such as GitHub Container Registry):

```bash
docker push <docker-username>/debug:latest
```

- Confirm the image is visible in your registry:

```bash
docker pull <docker-username>/debug:latest
```

You can also use GitHub’s ghcr.io if you’d rather store the image there. The procedure is similar, except you must log in to GitHub Container Registry using a **personal access token** and push to `ghcr.io/<your-repo>/pikube-debug:latest`.

## Deploy the Debug Pod in PiKube

Once your image is uploaded, you can create a **Kubernetes Pod manifest** referencing that image. Below `pikube-debug.yaml`, deploying it to a dedicated `debug` namespace.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: debug
---
apiVersion: v1
kind: Pod
metadata:
  name: pikube-debug
  namespace: debug
spec:
  containers:
  - name: debug-toolbox
    image: <docker-username>/debug:latest
    imagePullPolicy: Always
    command: ["sleep", "infinity"]
    resources:
      requests:
        cpu: "100m"
        memory: "256Mi"
      limits:
        cpu: "500m"
        memory: "512Mi"
```

- Create the namespace and pod:

```bash
kubectl apply -f pikube-debug.yaml
```

- Check pos status:

```bash
kubectl get pods -n debug
```

You should see `pikube-debug` in a `Running` or `ContainerCreating` state. Once it’s Running, you can attach an interactive shell.

## Usage and Common Debug Scenarios

### Attach an Interactive Shell

Enter the debug container and run commands:

```bash
kubectl exec -it pikube-debug -n debug -- bash
```

Inside, you have all the installed tools:

- **curl/wget/ping**: Test connectivity to services
- **dnsutils**: `dig`, `nslookup`
- **tcpdump**: Sniff network traffic
- **python3**: Run quick scripts with `requests`, `psycopg2`, etc.
- **vim**: Quickly edit or examine files

### Basic Network Checks

- Check DNS:

```bash
dig myservice.mynamespace.svc.cluster.local
```

- Check service connectivity:

```bash
curl http://myservice.mynamespace
nc -vz myservice.mynamespace 8080
```

- Ping external sites:

```bash
ping google.com
```

### Python Testing Example

```bash
kubectl exec -it pikube-debug -n debug -- bash
python3
>>> import requests
>>> r = requests.get("http://myservice.mynamespace:8080/health")
>>> r.status_code
200
```

### Running `tcpdump` or `htop`

- tcpdump:

```bash
tcpdump -i eth0 port 80
```

- htop:

```bash
htop
```

## Cleanup or Alternate Usage

- If you no longer need the debug environment:

```bash
kubectl delete pod pikube-debug -n debug
kubectl delete namespace debug
```

- Instead of defining a YAML, create a one-off ephemeral pod: 

```bash
kubectl run pikube-debug -it --rm \
  --image=<docker-username>/debug:latest \
  --restart=Never -- bash
```
