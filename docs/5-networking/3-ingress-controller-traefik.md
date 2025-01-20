---
title: Ingress Controller Using Traefik in K3S
permalink: /docs/5-networking/4-ingress-controller-traefik/
description: How to configure Ingress Contoller based on Traefik in PiKube Kubernetes Service.
last_modified_at: "17-12-2023"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="traefik-proxy"
    src="../resources/networking/traefik-logo.jpg"
    width="%"
    height="%">
</p>

<!-- - [Traefik Installation](#traefik-installation)
  - [Understanding the **`traefik-values.yaml`** Configuration File](#understanding-the-traefik-valuesyaml-configuration-file)
    - [📢 Helm Chart Configuration: Enabling Prometheus Metrics](#-helm-chart-configuration-enabling-prometheus-metrics)
    - [📢 Allocating a Static IP from the LoadBalancer Pool for Ingress Services](#-allocating-a-static-ip-from-the-loadbalancer-pool-for-ingress-services)
    - [📢 Activating Traefik Access Logging](#-activating-traefik-access-logging)
    - [📢 Facilitating Cross-Namespace References in Traefik's IngressRoute Resources](#-facilitating-cross-namespace-references-in-traefiks-ingressroute-resources)
    - [📢 Activating the Published Service Feature in Traefik](#-activating-the-published-service-feature-in-traefik)
- [Redeploy Traefik](#redeploy-traefik)
- [Setting Up the Traefik Metrics Service for Prometheus Monitoring](#setting-up-the-traefik-metrics-service-for-prometheus-monitoring)
- [Enabling Access to the Traefik Dashboard in Kubernetes](#enabling-access-to-the-traefik-dashboard-in-kubernetes)
  - [Creating the Traefik Dashboard Service](#creating-the-traefik-dashboard-service)
  - [Creating TLS Certificate for Traefik](#creating-tls-certificate-for-traefik)
  - [Creating HTTPS Ingress for Dashboard Access](#creating-https-ingress-for-dashboard-access)
  - [HTTP to HTTPS Redirection Ingress](#http-to-https-redirection-ingress) -->

For handling all incoming HTTP/HTTPS traffic to exposed services in K3S, an **`Ingress Controller`** is essential. [**`Traefik`**](https://doc.traefik.io/traefik/), a Kubernetes-compliant Ingress Controller, typically comes pre-installed with K3S. As a modern HTTP reverse proxy and load balancer, **`Traefik`** facilitates the deployment and management of microservices, streamlining networking complexities associated with application deployment and operation.

**Customization and Manual Installation:**

- **`Disabling Default Traefik Add-on`**
  
  During K3S installation, the default Traefik add-on is disabled to allow manual installation refer to [**`Master Nodes Set Up`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/2.4-k3s-installation.md#3-setting-up-master-nodes). This approach offers more control over Traefik’s version and initial setup.

- **`Post-Installation Customization`**
  
  While K3S allows customization of the Traefik chart after installation, certain parameters, like the namespace, are fixed. Traefik is installed in the kube-system namespace by default.

**Advantages of a Dedicated Namespace:**

- **`Clarity and Organization`**
  
  Deploying Traefik in a specific namespace, such as traefik, rather than the default kube-system namespace, contributes to a cleaner and more organized Kubernetes configuration. This dedicated namespace approach neatly segregates resources necessary for Traefik, enhancing manageability and clarity within the Kubernetes environment.

## Traefik Installation

- On **`gateway`**, add **`Traefik`**’s Helm Repository

```bash
helm repo add traefik https://helm.traefik.io/traefik
```

- Update Helm Repositories by fetching the latest charts from the Traefik repository

```bash
helm repo update
```

- Create a dedicated Namespace for Traefik in the pi-cluster

```bash
sudo kubectl --kubeconfig=/home/pi/.kube/config.yaml create namespace traefik
```

- Create a file named **`traefik-values.yaml`** on **`gateway`**. This file configures **`Traefik`** with **`Prometheus metrics`**, **`access logs`**, and **`other settings`**

```yaml
# traefik-values.yaml: Configuration for Traefik with Prometheus metrics and access logs

# Access log settings
logs:
  access:
    enabled: true  # Enable access logging
    format: json   # Set log format to JSON

# Additional arguments for Traefik configuration
additionalArguments:
  - "--metrics.prometheus=true"                      # Enable Prometheus metrics
  - "--accesslog"                                    # Enable access logging
  - "--accesslog.format=json"                        # Set access log format to JSON
  - "--accesslog.filepath=/data/access.log"          # Specify file path for access logs
  - "--api.dashboard=true"                           # Enable the Traefik Dashboard
  - "--api.insecure=true"                            # Optional: Expose the dashboard without TLS for testing

# Deployment configuration
deployment:
  # Define additional containers within the Traefik pod
  additionalContainers:
    - name: stream-accesslog                         # Name of the sidecar container
      image: busybox                                 # Image used for the sidecar (busybox)
      args:
        - "/bin/sh"                                  # Shell to execute the following command
        - "-c"
        - "tail -n+1 -F /data/access.log"            # Command to tail the access logs
      imagePullPolicy: Always                        # Image pull policy
      resources: {}                                  # Resource requests and limits (empty for default)
      terminationMessagePath: /dev/termination-log   # Path for termination log
      terminationMessagePolicy: File                 # Policy for termination message
      volumeMounts:
        - mountPath: /data                           # Mount path for data
          name: data                                 # Volume name

# Service configuration
service:
  spec:
    loadBalancerIP: 10.0.0.111                       # Set external IP for the load balancer

# Provider configuration
providers:
  kubernetesCRD:
    enabled: true                                    # Enable Kubernetes CRD
    allowCrossNamespace: true                        # Allow cross-namespace references
  kubernetesIngress:
    publishedService:ll
      enabled: true                                  # Enable publishing of services
```

- Install **`Traefik`** by deploying Traefik in the **`traefik namespace`** using the configuration from the **`traefik-values.yaml`** file

```bash
helm --kubeconfig /home/pi/.kube/config.yaml -f traefik-values.yaml install traefik traefik/traefik --namespace traefik
```

- Confirm the Deployment

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n traefik get pods
```

### Understanding the **`traefik-values.yaml`** Configuration File

#### 📢 Helm Chart Configuration: Enabling Prometheus Metrics

The default Helm installation doesn't automatically activate Traefik’s metrics for Prometheus. To enable these metrics, the Helm chart needs to be supplied with specific configurations:

```yaml
# Additional arguments for Traefik configuration
additionalArguments:
  - "--metrics.prometheus=true"    # Enable Prometheus metrics
```

This setting instructs the Traefik pod to expose its metrics on TCP port 9100.

#### 📢 Allocating a Static IP from the LoadBalancer Pool for Ingress Services

To allocate a fixed IP address from the Metal LB pool to the Ingress service, it's necessary to modify the Traefik service, which is of type LoadBalancer and created through the Helm Chart. By default, this service doesn't come with a specified static external IP address. To set a static IP address from the Metal LB pool, include the following parameters in the Helm chart:

```yaml
# Service configuration
service:
  spec:
    loadBalancerIP: 10.0.0.111     # Set external IP for the load balancer
```

Incorporating this setting assigns the IP address 10.0.0.111 to the Traefik proxy. Consequently, this IP becomes the designated address for all services exposed by the cluster.

#### 📢 Activating Traefik Access Logging

Traefik's access logs provide comprehensive details about each request it processes. By default, these logs are disabled. When activated (using the **`--accesslog parameter`**), Traefik typically writes these logs to **`stdout`**, which can result in access logs being interspersed with Traefik's application logs.

To segregate these logs, modify the default access log configuration to direct them to a specific file, /data/access.log (using **`--accesslog.filepath`**). This change can be complemented by adding a sidecar container to the Traefik deployment, designed to monitor (**`tail`**) the **`access.log`** file. This container will output the access.log to stdout, separating it from other log types.

Additionally, change the default access log format to JSON (**`--accesslog.format=json`**). This format is beneficial for parsing by tools like Fluentbit, as it allows for automatic decoding of the JSON payload, extracting all fields from the log. Refer to [**`Fluentbit's Kubernetes Filter MergeLog`**](https://docs.fluentbit.io/manual/pipeline/filters/kubernetes) configuration option for more details.

Here are the necessary Traefik Helm chart values to implement these changes:

```yaml
# Additional arguments for Traefik configuration
additionalArguments:
  - "--accesslog"                  # Enable access logging
  - "--accesslog.format=json"      # Set access log format to JSON
  - "--accesslog.filepath=/data/access.log" # Specify file path for access logs

# Deployment configuration
deployment:
  # Define additional containers within the Traefik pod
  additionalContainers:
    - name: stream-accesslog        # Name of the sidecar container
      image: busybox                # Image used for the sidecar (busybox)
      args:
        - "/bin/sh"                 # Shell to execute the following command
        - "-c"
        - "tail -n+1 -F /data/access.log"  # Command to tail the access logs
      imagePullPolicy: Always       # Image pull policy
      resources: {}                 # Resource requests and limits (empty for default)
      terminationMessagePath: /dev/termination-log   # Path for termination log
      terminationMessagePolicy: File  # Policy for termination message
      volumeMounts:
        - mountPath: /data          # Mount path for data
          name: data                # Volume name
```

This configuration not only enables Traefik to write access logs to **`/data/access.log`** in JSON format but also introduces a sidecar container named **`stream-access-log`** to continuously monitor the log file

#### 📢 Facilitating Cross-Namespace References in Traefik's IngressRoute Resources

Traefik's **`custom resource definition`** (CRD), **`IngressRoute`**, offers an alternative to Kubernetes' **`standard Ingress resources. It enables more complex routing configurations that are not achievable with the **`standard Ingress and Traefik annotations.

By default, both **`IngressRoute`** and **`Ingress`** resources are restricted to referencing Traefik resources, like **`Middleware`**, within the same namespace. To expand this functionality and permit these resources to reference other resources across different namespaces, the [**`allowCrossNamespace`**](https://doc.traefik.io/traefik/providers/kubernetes-crd/#allowcrossnamespace) parameter in the Traefik Helm chart must be set to true.

To implement this cross-namespace referencing, include the following settings in the Helm chart configuration:

```yaml
# Provider configuration
providers:
  kubernetesCRD:
    enabled: true                  # Enable Kubernetes CRD
    allowCrossNamespace: true      # Allow cross-namespace references
```

#### 📢 Activating the Published Service Feature in Traefik

By default, Traefik doesn't update the **`status.loadBalancer`** field in Ingress resources when used with an external load balancer like Metal LB (as noted in [**`Traefik issue #3377`**](https://github.com/traefik/traefik/issues/3377)). This behavior impacts systems like Argo CD, which rely on this field to determine the health status of Ingress objects. Without these updates, applications can appear stuck due to the lack of health status in the Ingress resource.

To address this, Traefik should be configured to enable the [**`published service`**](https://doc.traefik.io/traefik/providers/kubernetes-ingress/#publishedservice) feature. This setting ensures that the load balancer status from Traefik’s service, which includes the external IPs assigned by Metal-LB, is copied to the Ingress resources.

For more context, refer to [**`Argo CD issue #968`**](https://github.com/argoproj/argo-cd/issues/968).

To enable this feature, the following configuration should be added to your Traefik Helm chart:

```yaml
# Provider configuration
providers:
  kubernetesIngress:
    publishedService:
      enabled: true                # Enable publishing of services
```

## Redeploy Traefik

If the **`traefik-values.yaml`** manifest is updated, a redeployment is needed

- **Delete the Existing Traefik Deployment (if needed)**

If Traefik is already deployed and need to apply significant changes, it might be necessary to delete the current deployment before redeploying

```bash
helm --kubeconfig /home/pi/.kube/config.yaml uninstall traefik --namespace traefik
```

- **Redeploy Traefik**

Use Helm to redeploy Traefik with the updated configuration file

```bash
helm --kubeconfig /home/pi/.kube/config.yaml uninstall traefik --namespace traefik
```

- **Verify the Deployment**

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n traefik get pods
```

- **Monitor for Any Issues**

Keep an eye on the pods' status and logs to ensure everything is functioning as expected

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n traefik logs [pod-name]
```

## Setting Up the Traefik Metrics Service for Prometheus Monitoring

For enabling Prometheus metrics in a Kubernetes environment, a specific service is required. This can be done manually by creating a Kubernetes Service or, in the case of the latest Traefik Helm chart versions, it can be automatically configured. Below are the steps for both methods:

📌 Manual Creation of Traefik Metrics Service

- First, prepare a manifest file named **`traefik-metrics-service.yaml`** with the following content

```yaml
# Define the API version and kind of resource
apiVersion: v1
kind: Service

# Metadata for the service
metadata:
  name: traefik-metrics                # Name of the service
  namespace: traefik                   # Namespace where the service will be deployed
  labels:                              # Labels for identifying and organizing the resource
    app.kubernetes.io/instance: traefik
    app.kubernetes.io/name: traefik
    app.kubernetes.io/component: traefik-metrics

# Specification of the service
spec:
  type: ClusterIP                      # Type of service, ClusterIP means internal to cluster
  ports:                               # Port configuration
    - name: metrics                    # Name for the port, for identification
      port: 9100                       # The port number through which the service is exposed
      targetPort: metrics              # The target port on the pods where traffic is sent
      protocol: TCP                    # Network protocol used (TCP)
  selector:                            # Selector to target the pods this service will route to
    app.kubernetes.io/instance: traefik-traefik
    app.kubernetes.io/name: traefik
```

- Use kubectl to apply this manifest file to your cluste

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-metrics-service.yaml
```

- Verify the Metrics Endpoint

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n traefik get ep traefik-metrics
# On gateway terminal, activate port-forwarding
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n traefik port-forward svc/traefik-metrics 9100:9100
# test metrics endpoint in local host
curl -v http://<Cluster-IP-of-Traefik-Metrics-Service>:9100/metrics
curl -v http://127.0.0.1:9100/metrics
```

Replace **`Cluster-IP-of-Traefik-Metrics-Service`** with the actual IP address of the metrics service

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n traefik get svc
```

📌 Automated Creation with Helm Chart (Version 20.6.0+)

If using a recent version of the Traefik Helm chart, enabling Prometheus metrics service is simpler. Include the following configuration in your **`traefik-values.yaml`** file:

```yaml
# Enable Prometheus metric service
metrics:
  prometheus:
    service:
      enabled: true
```

- Update Traefik deployment to apply the new metrics configuration

```bash
helm --kubeconfig /home/pi/.kube/config.yaml upgrade traefik traefik/traefik -f traefik-values.yaml --namespace traefik
```

- Confirm the Service is Created

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n traefik get svc | grep metrics
curl http://<Cluster-IP-of-Traefik-Metrics-Service>:9100/metrics

kubectl --kubeconfig=/home/pi/.kube/config.yaml port-forward svc/traefik-metrics 9100:9100 -n traefik
curl http://localhost:9100/metrics
```

## Enabling Access to the Traefik Dashboard in Kubernetes

To access the Traefik UI Dashboard in a Kubernetes cluster, it needs to create a Kubernetes service and define Ingress rules.

### Creating the Traefik Dashboard Service

- Create **`traefik-dashboard-service.yaml`** Manifest File that defines a Kubernetes Service to expose the Traefik Dashboard

```yaml
apiVersion: v1
kind: Service
metadata:
  name: traefik-dashboard
  namespace: traefik
  labels:
    app.kubernetes.io/instance: traefik
    app.kubernetes.io/name: traefik
    app.kubernetes.io/component: traefik-dashboard
spec:
  type: ClusterIP                     # Internal service type
  ports:
    - name: traefik
      port: 9000                      # External port
      targetPort: traefik             # Port on the pod
      protocol: TCP
  selector:
    app.kubernetes.io/instance: traefik
    app.kubernetes.io/name: traefik
```

- Apply the Service Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-dashboard-service.yaml
```

### Creating TLS Certificate for Traefik

- Create **`traefik-certificate.yaml`** Manifest File. This requests a certificate from **`cert-manager`**

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: traefik-certificate
  namespace: traefik
spec:
  secretName: traefik-tls
  issuerRef:
    name: ca-clusterissuer
    kind: ClusterIssuer
  commonName: traefik.picluster.quantfinancehub.com
  dnsNames:
    - traefik.picluster.quantfinancehub.com
  privateKey:
    algorithm: ECDSA
```

- Apply the Service Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-certificate.yaml
```

### Creating HTTPS Ingress for Dashboard Access

- Create **`traefik-ingress.yaml`** Manifest File that creates an HTTPS Ingress for accessing the Traefik Dashboard through a secure entry point

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: traefik-ingress
  namespace: traefik
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.middlewares: traefik-basic-auth@kubernetescrd
    cert-manager.io/cluster-issuer: picluster-ca-issuer # Make sure cluster-issuer is matching the one in cert-manager kubectl --kubeconfig=/home/pi/.kube/config.yaml get clusterissuers -n cert-manager
    cert-manager.io/common-name: traefik.picluster.quantfinancehub.com
spec:
  tls:
    - hosts:
        - traefik.picluster.quantfinancehub.com
      secretName: traefik-tls
  rules:
    - host: traefik.picluster.quantfinancehub.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: traefik-dashboard
                port:
                  number: 9000
```

- Apply the Service Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-ingress.yaml
```

- Create a Traefik Middleware Custom Resource, **`traefik-basic-auth-middleware.yaml`**,  to use this secret for basic authentication

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: basic-auth
  namespace: traefik
spec:
  basicAuth:
    secret: basic-auth-secret
    removeHeader: true
```

📢 ***`removeHeader`** option to true removes the authorization header before forwarding the request to backend service.*

*In some cases, like linkerd-viz, where basic auth midleware is used. Integration with Grafana fails if this option is not set to true. Grafana does not try to authenticate the user by other means if basic auth headers are present and returns a 401 unauthorized error.*

- Generate Username and Password Pair Base64 Encode. It will be used in the **`traefik-basic-auth-secret.yaml`**

```bash
htpasswd -nb picluster secret1 | base64
```

- Create **`traefik-basic-auth-secret.yaml`**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: basic-auth-secret
  namespace: traefik
data:
  users: |2
    cGljbHVzdGVyOiRhcHIxJEdYU3J2WXhpJHFTRXNpQzU1cldPaVE3bE5JSWpCUTAKCg==
```

- Apply the Service Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-basic-auth-secret.yaml
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-basic-auth-middleware.yaml
```

### HTTP to HTTPS Redirection Ingress

- Create **`traefik-http-to-https-redirect.yaml`** Manifest File that redirect http traffic of traefik-ingress to https

```yaml
---
kind: Ingress
apiVersion: networking.k8s.io/v1
metadata:
  name: traefik-redirect
  namespace: traefik
  annotations:
    # Use redirect Middleware configured
    traefik.ingress.kubernetes.io/router.middlewares: traefik-redirect@kubernetescrd
    # HTTP as entrypoint
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  rules:
    - host: traefik.picluster.quantfinancehub.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: traefik-dashboard
                port:
                  number: 9000
```

- Apply the Service Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-http-to-https-redirect.yaml
```

- Define the Middleware Resource **`traefik-redirect.yaml`**

```yaml
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: redirect
  namespace: traefik
spec:
  redirectScheme:
    scheme: https
    permanent: true
```

- Apply the Service Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-redirect.yaml
```

<!-- - Create **`traefik-ingressroute.yaml`** Manifest File

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-dashboard
  namespace: traefik
spec:
  entryPoints:
    - websecure
  routes:
  - match: Host(`traefik.picluster.homelab.com`) && (PathPrefix(`/dashboard`) || PathPrefix(`/api`))
    kind: Rule
    services:
    - name: api@internal
      kind: TraefikService
  tls:
    secretName: traefik-secret
```

- Apply the Service Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-ingressroute.yaml
``` -->

After applying these manifests, you can access the Traefik Dashboard through the configured domain (https://traefik.picluster.quantfinancehub.com). This setup provides secure and authenticated access to the dashboard, leveraging cert-manager for certificate management and Traefik’s advanced routing capabilities.

Check ClusterIssuer:

bash
Copy code
kubectl --kubeconfig=/home/pi/.kube/config.yaml get clusterissuer letsencrypt-clusterissuer-cloudflare -o yaml
Check Certificates:

bash
Copy code
kubectl --kubeconfig=/home/pi/.kube/config.yaml get certificates -n [namespace] -o yaml
Replace [namespace] with the namespace where your certificates are deployed (e.g., cert-manager, traefik, etc.).

Check Ingress Resources:

bash
Copy code
kubectl --kubeconfig=/home/pi/.kube/config.yaml get ingress -n [namespace] -o yaml
Replace [namespace] with the namespace where your Ingress resources are deployed (e.g., traefik).

Check Services:

bash
Copy code
kubectl --kubeconfig=/home/pi/.kube/config.yaml get services -n [namespace] -o yaml
Check MetalLB Configuration (if applicable):

bash
Copy code
kubectl --kubeconfig=/home/pi/.kube/config.yaml get IPAddressPool -n metal-lb -o yaml
kubectl --kubeconfig=/home/pi/.kube/config.yaml get L2Advertisement -n metal-lb -o yaml
Check Pods' Status in relevant namespaces:

bash
Copy code
kubectl --kubeconfig=/home/pi/.kube/config.yaml get pods -n [namespace]
Repeat this command for each relevant namespace (cert-manager, traefik, metal-lb, etc.) to ensure all pods are running correctly.

Check for Events or Errors:
If any resource is not behaving as expected, you can inspect it further. For example, to check events related to a specific resource:

bash
Copy code
kubectl --kubeconfig=/home/pi/.kube/config.yaml describe [resource-type] 



ssh -i ~/.ssh/gateway-pi -v pi@orange-worker.picluster.homelab.com

curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" -H "Authorization: Bearer -EDFUXl002W7rRjJgOpPS68DiY1tQANSLmaG0KvN" -H "Content-Type:application/json"

kubectl create secret generic cloudflare-api-token-secret \
--from-literal=api-token=-EDFUXl002W7rRjJgOpPS68DiY1tQANSLmaG0KvN \
--namespace cert-manager \
--kubeconfig=/home/pi/.kube/config.yaml