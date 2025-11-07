---
title: Ingress Controller Using NGINX in K3S
permalink: /docs/5-networking/4-ingress-controller-nginx
description: How to configure Ingress Contoller based on NGINX in PiKube Kubernetes cluster.
last_modified_at: "17-12-2023"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="nginx"
    src="../resources/networking/nginx-logo.svg"
    width="70%"
    height="%">
</p>

For managing incoming HTTP/HTTPS traffic to services exposed in a K3S cluster, an Ingress Controller is needed. While K3S typically includes Traefik as its default Ingress Controller, NGINX can be used as an alternative. NGINX Ingress Controller serves as a reverse proxy and load balancer within Kubernetes.

> [!IMPORTANT]
>
> To integrate NGINX Ingress Controller in a K3S setup, it's necessary to disable the default Traefik add-on during the K3S installation process. This allows for the manual installation of the NGINX Ingress Controller.

## NGINX Installation

- On **`gateway`**, add **`NGINX`**’s Helm Repository

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
```

- Update Helm repositories to fetch the latest charts from the ingress-nginx repository

```bash
helm repo update
```

- Create a dedicated namespace for NGINX in the cluster

```bash
kubectl create namespace nginx
```

- Create a file named **`nginx-values.yaml`** on **`gateway`** that sets specific LoadBalancer IP address for Ingress service

```yaml
# nginx-values.yaml

controller:
  service:
    type: LoadBalancer
    loadBalancerIP: 10.0.0.100

  # Enabling metrics collection for Prometheus
  metrics:
    enabled: true  # Exposes metrics on TCP port 10254

  # Customizing access logs
  config:
    access-log-path: "/data/access.log"
    log-format-escape-json: "true"

  # Sidecar access log streamer
  extraVolumeMounts:
    - name: data
      mountPath: /data
  extraVolumes:
    - name: data
      emptyDir: {}
  extraContainers:
    - name: stream-accesslog
      image: busybox
      args: ["/bin/sh","-c","tail -n+1 -F /data/access.log"]
      imagePullPolicy: Always
      volumeMounts:
        - mountPath: /data
          name: data

  # Allow advanced per-ingress configuration snippets
  allowSnippetAnnotations: true

# Note: Ensure 10.0.0.100 is free within your MetalLB pool.
```

- Install **`NGINX`** by deploying NGINX in the **`nginx namespace`** using the configuration from the **`nginx-values.yaml`** file

```bash
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx -n nginx -f nginx-values.yaml --wait --timeout 5m
```

- Confirm the Deployment

```bash
kubectl -n nginx get pods
kubectl -n nginx get svc ingress-nginx-controller -o wide
```

📌 If NGINX manifests needs to be re-installed post manifest update use the below commannd.

```bash
helm --kubeconfig /home/pi/.kube/config.yaml upgrade ingress-nginx ingress-nginx/ingress-nginx -f nginx-values.yaml --namespace nginx
```

### Understanding the **`nginx-values.yaml`** Configuration File

#### 📢 LoadBalancer IP Configuration

This configuration assigns a static external IP address from your Metal LB pool to the NGINX Ingress service of type LoadBalancer. The IP 10.0.0.100 is used as an example; you should replace it with an IP address from your pool.

```yaml
controller:
  service:
    type: LoadBalancer
    loadBalancerIP: 10.0.0.100
```

#### 📢 Enabling Prometheus Metrics

This enables Prometheus metrics in the NGINX Ingress controller. It opens a metrics port (TCP port 10254 by default) to expose metrics data that Prometheus can scrape.

```yaml
controller:
  metrics:
    enabled: true
```

#### 📢 Activating NGINX Access Logging

The access log configuration changes the default behavior of NGINX writing logs to **`stdout`**. Instead, logs are written to a specific file **`/data/access.log`**. This separation helps in managing logs more efficiently.

The logs are formatted in JSON, making it easier for log processing tools like Fluentbit to parse and extract fields.

An additional sidecar container, **`stream-accesslog`**, is defined to tail the **`access.log`** file, ensuring that access logs are outputted separately from other application logs.

```yaml
controller:
  config:
    access-log-path: "/data/access.log"
    log-format-escape-json: "true"
  extraVolumeMounts:
    - name: data
      mountPath: /data
  extraVolumes:
    - name: data
      emptyDir: {}
  extraContainers:
    - name: stream-accesslog
      image: busybox
      args: ["/bin/sh","-c","tail -n+1 -F /data/access.log"]
      imagePullPolicy: Always
      volumeMounts:
        - mountPath: /data
          name: data
```

#### 📢 Enabling Ingress Snippet Annotations

This configuration allows the use of **`nginx.ingress.kubernetes.io/configuration-snippet`** annotations in Ingress resources. It's particularly useful for advanced configurations that require custom NGINX directives.

```yaml
controller:
  # Enabling the use of configuration snippet annotations
  allowSnippetAnnotations: true  # Allows using nginx.ingress.kubernetes.io/configuration-snippet annotations
```

## Setting Up the NGINX ingress

Deploy NGINX ingress manifest

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nginx-ingress
  namespace: nginx
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: letsencrypt-issuer
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - picluster.quantfinancehub.com
    secretName: picluster-tls
  rules:
  - host: picluster.quantfinancehub.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: nginx-dashboard
            port:
              number: 8080
```

### Enable HTTP to HTTPS Redirect

This is handled by NGINX Ingress by default when TLS is enabled on the Ingress. If needed, this can be disabled using annotations.

### Configure HTTP Basic Authentication (Optional)

If needed, a basic HTTP authentication can be created at Kubernetes Secret level with encoded user-password pairs and reference it in your Ingress annotations. This step has already been described under Traefik documentation

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: basic-auth-secret
  namespace: your-service-namespace
data:
  auth: |2
    <base64 encoded username:password pair>
```

Then update the NGINX ingress

```yaml
nginx.ingress.kubernetes.io/auth-type: basic
nginx.ingress.kubernetes.io/auth-secret: basic-auth-secret
nginx.ingress.kubernetes.io/auth-realm: 'Authentication Required'
```

- Apply the manifest

- Ensure that Ingress is correctly configured and the TLS certificate is properly issued by Cert-manager

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n nginx get ingress picluster-ingress
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n cert-manager get certificates
```
