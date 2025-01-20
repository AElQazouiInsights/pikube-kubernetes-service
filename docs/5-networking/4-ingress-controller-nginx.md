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

<!-- - [NGINX Installation](#nginx-installation)
  - [Understanding the **`nginx-values.yaml`** Configuration File](#understanding-the-nginx-valuesyaml-configuration-file)
    - [📢 LoadBalancer IP Configuration](#-loadbalancer-ip-configuration)
    - [📢 Enabling Prometheus Metrics](#-enabling-prometheus-metrics)
    - [📢 Activating NGINX Access Logging](#-activating-nginx-access-logging)
    - [📢 Enabling Ingress Snippet Annotations](#-enabling-ingress-snippet-annotations)
- [Setting Up the NGINX ingress](#setting-up-the-nginx-ingress)
  - [Enable HTTP to HTTPS Redirect](#enable-http-to-https-redirect)
  - [Configure HTTP Basic Authentication (Optional)](#configure-http-basic-authentication-optional) -->

For managing incoming HTTP/HTTPS traffic to services exposed in a K3S cluster, an Ingress Controller is needed. While K3S typically includes Traefik as its default Ingress Controller, NGINX can be used as an alternative. NGINX Ingress Controller serves as a reverse proxy and load balancer within Kubernetes.

**Important Consideration**:

To integrate NGINX Ingress Controller in a K3S setup, it's necessary to disable the default Traefik add-on during the K3S installation process. This allows for the manual installation of the NGINX Ingress Controller.

## NGINX Installation

- On **`gateway`**, add **`NGINX`**’s Helm Repository

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
```

- Update Helm Repositories by fetching the latest charts from the Traefik repository

```bash
helm repo update
```

- Create a dedicated Namespace for Traefik in the pi-cluster

```bash
sudo kubectl --kubeconfig=/home/pi/.kube/config.yaml create namespace nginx
```

- Create a file named **`nginx-values.yaml`** on **`gateway`** that sets specific LoadBalancer IP address for Ingress service

```yaml
# nginx-values.yaml

# Configuring the NGINX Ingress service
service:
  # Setting a specific LoadBalancer IP address
  spec:
    loadBalancerIP: 10.0.0.100

# Configuration for the NGINX controller
controller:
  # Enabling metrics collection for Prometheus
  metrics:
    enabled: true  # Set to true to enable Prometheus metrics on TCP port 10254

  # Customizing access logs
  config:
    # Changing the path where access logs are stored
    access-log-path: "/data/access.log"  # Logs will be stored in /data/access.log instead of stdout
    # Setting log format to JSON for better parsing
    log-format-escape-json: "true"  # Access logs will be in JSON format for easier processing

  # Adding extra volume mounts to the controller
  extraVolumeMounts:
    - name: data
      mountPath: /data  # Mounting the /data directory in the NGINX pod

  # Declaring extra volumes for the controller
  extraVolumes:
    - name: data
      emptyDir: {}  # Creating an empty directory at /data for log storage

  # Adding extra containers to the NGINX pod
  extraContainers:
    - name: stream-accesslog
      image: busybox  # Using the BusyBox image for the sidecar container
      args:
        - /bin/sh
        - -c
        - tail -n+1 -F /data/access.log  # Command to continuously stream the access log
      imagePullPolicy: Always  # Ensuring the latest BusyBox image is used
      resources: {}  # No specific resources allocated to the sidecar container
      terminationMessagePath: /dev/termination-log
      terminationMessagePolicy: File
      volumeMounts:
        - mountPath: /data
          name: data  # Mounting the same /data volume as in the main container

  # Enabling the use of configuration snippet annotations
  allowSnippetAnnotations: true  # Allows using nginx.ingress.kubernetes.io/configuration-snippet annotations

# Note: Adjust the configurations as per your environment requirements.
# The loadBalancerIP should be an available IP from your LoadBalancer pool.
# Enable only the features that are needed for your use case.
```

- Install **`NGINX`** by deploying NGINX in the **`nginx namespace`** using the configuration from the **`nginx-values.yaml`** file

```bash
helm --kubeconfig /home/pi/.kube/config.yaml install ingress-nginx ingress-nginx/ingress-nginx -f nginx-values.yaml --namespace nginx
```

- Confirm the Deployment

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n nginx get pods
```

📌 If NGINX manifests needs to be re-installed post manifest update use the below commannd.

```bash
helm --kubeconfig /home/pi/.kube/config.yaml upgrade ingress-nginx ingress-nginx/ingress-nginx -f nginx-values.yaml --namespace nginx
```

### Understanding the **`nginx-values.yaml`** Configuration File

#### 📢 LoadBalancer IP Configuration

This configuration assigns a static external IP address from your Metal LB pool to the NGINX Ingress service of type LoadBalancer. The IP 10.0.0.100 is used as an example; you should replace it with an IP address from your pool.

```yaml
# Configuring the NGINX Ingress service
service:
  # Setting a specific LoadBalancer IP address
  spec:
    loadBalancerIP: 10.0.0.100
```

#### 📢 Enabling Prometheus Metrics

This enables Prometheus metrics in the NGINX Ingress controller. It opens a metrics port (TCP port 10254 by default) to expose metrics data that Prometheus can scrape.

```yaml
# Configuration for the NGINX controller
controller:
  # Enabling metrics collection for Prometheus
  metrics:
    enabled: true  # Set to true to enable Prometheus metrics on TCP port 10254
```

#### 📢 Activating NGINX Access Logging

The access log configuration changes the default behavior of NGINX writing logs to **`stdout`**. Instead, logs are written to a specific file **`/data/access.log`**. This separation helps in managing logs more efficiently.

The logs are formatted in JSON, making it easier for log processing tools like Fluentbit to parse and extract fields.

An additional sidecar container, **`stream-accesslog`**, is defined to tail the **`access.log`** file, ensuring that access logs are outputted separately from other application logs.

```yaml
# Customizing access logs
  config:
    # Changing the path where access logs are stored
    access-log-path: "/data/access.log"  # Logs will be stored in /data/access.log instead of stdout
    # Setting log format to JSON for better parsing
    log-format-escape-json: "true"  # Access logs will be in JSON format for easier processing

  # Adding extra volume mounts to the controller
  extraVolumeMounts:
    - name: data
      mountPath: /data  # Mounting the /data directory in the NGINX pod

  # Declaring extra volumes for the controller
  extraVolumes:
    - name: data
      emptyDir: {}  # Creating an empty directory at /data for log storage

  # Adding extra containers to the NGINX pod
  extraContainers:
    - name: stream-accesslog
      image: busybox  # Using the BusyBox image for the sidecar container
      args:
        - /bin/sh
        - -c
        - tail -n+1 -F /data/access.log  # Command to continuously stream the access log
      imagePullPolicy: Always  # Ensuring the latest BusyBox image is used
      resources: {}  # No specific resources allocated to the sidecar container
      terminationMessagePath: /dev/termination-log
      terminationMessagePolicy: File
      volumeMounts:
        - mountPath: /data
          name: data  # Mounting the same /data volume as in the main container
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