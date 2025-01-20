---
title: Service Mesh with Linkerd
permalink: /documentation/12-microservices/2-service-mesh-linkerd/
description: Service-mesh architecture using Linkerd to enhance observability, manage traffic, and bolster security in PiKube Kubernetes Service.
last_modified_at: "26-02-2024"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="service-mesh-with-linkerd"
    src="../resources/networking/linkerd-logo.svg"
    width="100%"
    height="%">
</p>

<!-- - [Introduction to Service Mesh](#introduction-to-service-mesh)
- [Selecting Linkerd over Istio](#selecting-linkerd-over-istio)
- [Overview of Linkerd's Architecture](#overview-of-linkerds-architecture)
- [Automated mTLS and Integration with Cert-Manager](#automated-mtls-and-integration-with-cert-manager)
- [Installing Linkerd with Automated TLS Credential Rotation](#installing-linkerd-with-automated-tls-credential-rotation)
- [Configuring HashiCorp Vault with a Custom Configuration and Systemd Service](#configuring-hashicorp-vault-with-a-custom-configuration-and-systemd-service)
  - [Initial Setup: Cert-Manager Configuration](#initial-setup-cert-manager-configuration)
  - [Deploying Linkerd with Helm](#deploying-linkerd-with-helm)
    - [Alternative Installation via GitOps (ArgoCD)](#alternative-installation-via-gitops-argocd)
  - [Integrating the Linkerd Viz Extension](#integrating-the-linkerd-viz-extension)
  - [Installing the Linkerd Jaeger Extension for Distributed Tracing](#installing-the-linkerd-jaeger-extension-for-distributed-tracing)
- [Integrating Services with Linkerd](#integrating-services-with-linkerd)
  - [Handling Kubernetes Jobs with Linkerd](#handling-kubernetes-jobs-with-linkerd)
- [Integrating Cluster Services with Linkerd](#integrating-cluster-services-with-linkerd)
  - [Incorporating Longhorn into the Service Mesh](#incorporating-longhorn-into-the-service-mesh)
  - [Configuring the Prometheus Stack with Linkerd](#configuring-the-prometheus-stack-with-linkerd)
  - [Integrating Linkerd Service Mesh with EFK](#integrating-linkerd-service-mesh-with-efk)
  - [Linkerd Integration with Velero](#linkerd-integration-with-velero)
- [Setting Up Ingress with Linkerd](#setting-up-ingress-with-linkerd)
  - [Integrating Traefik with Linkerd](#integrating-traefik-with-linkerd)
  - [Integrating NGINX Ingress with Linkerd](#integrating-nginx-ingress-with-linkerd) -->

## Introduction to Service Mesh

Exploring the advantages of service mesh architecture, this section highlights the integration of observability, traffic management, and security enhancements within cluster communications.

The choice for implementing this architecture falls on [**`Linkerd`**](https://linkerd.io/), deployed within PiKube Kubernetes Service, due to its comprehensive features and compatibility.

## Selecting Linkerd over Istio

- **ARM Compatibility**

Unlike [**`Istio`**](https://istio.io/), the most recognized service mesh framework which lacks support for ARM64 architecture, [**`Linkerd`**](https://linkerd.io/), a project that has graduated from the Cloud Native Computing Foundation (CNCF), has extended its support to ARM64 architectures starting from its 2.9 release, as highlighted in the [**`Linkerd 2.9 release announcement`**](https://linkerd.io/2020/11/09/announcing-linkerd-2.9/).

- **Efficiency and Minimal Resource Usage**

Linkerd differentiates itself by utilizing a bespoke communication proxy. This sidecar container, deployed alongside any pod, is designed specifically for Kubernetes communications, intercepting all inbound and outbound traffic. This approach, compared to the more generic Envoy proxy used by other service mesh frameworks like Istio and Consul, allows Linkerd's proxy to be more streamlined, lightweight, and secure, tailored exclusively for Kubernetes environments.

The resulting ultra-light proxy boasts a reduced memory and CPU footprint, offering superior performance that is particularly advantageous for devices with limited computing resources, such as Raspberry Pis. For a detailed comparison of performance and resource usage, refer to the latest [**`Istio vs Linkerd benchmarking`**](https://linkerd.io/2021/11/29/linkerd-vs-istio-benchmarks-2021/).

## Overview of Linkerd's Architecture

The Linkerd service mesh architecture is structured into three main components: the **`control plane`**, **`data plane`**, and **`observability plane`**, illustrated in the diagram below:

TODO pikube-linkerd-architecture.drawio

- **`Control Plane:`** Manages the automatic injection of data plane components into pods (**`proxy-injector`**), generates and authorizes certificates for  mutual Transport Layer Security (mTLS) communication (**`identity`**), and oversees traffic flow control services (**`destination`**).

- **`Data Plane:`** Comprises transparent proxies running as sidecar containers within pods. These proxies automatically manage the interception of pod's TCP traffic, implementing transparent encryption (mTLS), Layer-7 load balancing, routing, retries, telemetry, and more.

- **`Observability Plane:`** Integrates Linkerd with the cluster's observability framework.

  - Metrics from Linkerd's control and data plane components are made available for Prometheus scraping, while logs can be integrated into Loki for aggregation.
  
  - The user-plane component (**`linkerd-proxy`**) can be configured to emit traces to the cluster's tracing backend, Grafana Tempo, requiring the installation of the Linkerd-jaeger extension.
  
  - The **`Linkerd-viz`** component enhances observability with a web dashboard for the service mesh and pre-configured Grafana dashboards.

## Automated mTLS and Integration with Cert-Manager

Linkerd simplifies security by automatically enabling **`mutual Transport Layer Security`** (mTLS) for all TCP traffic between meshed pods, ensuring encrypted and authenticated communication by default.

Within the control plane, Linkerd houses a certificate authority (CA) known as **`identity`**, which issues TLS certificates to each data plane proxy. These certificates, which expire after 24 hours, facilitate the encryption and authentication of TCP traffic among proxies and are automatically renewed.

For the control plane, Linkerd maintains essential credentials: a **`trust anchor`**, and an **`issuer certificate and key`**. While the TLS certificates for data plane proxies are rotated every 24 hours by Linkerd, the issuer's credentials and key do not undergo automatic rotation. Here, cert-manager plays a crucial role, generating and rotating the issuer's certificate and key, and establishing the **`trust anchor`** (root CA) necessary for signing the **`identity`** TLS certificate and validating other TLS certificates issued to **`linkerd-proxy`** processes.

## Installing Linkerd with Automated TLS Credential Rotation

This guide outlines the process for setting up Linkerd with automatic rotation of control-plane TLS credentials, diverging slightly from the approach recommended in the [**`official Linkerd documentation`**](https://linkerd.io/2.12/tasks/automatically-rotating-control-plane-tls-credentials/) by leveraging an existing root CA and CA ClusterIssuer from Cert-manager installation for the cluster.

## Configuring HashiCorp Vault with a Custom Configuration and Systemd Service

### Initial Setup: Cert-Manager Configuration

First, ensure Cert-manager is set up to function as an in-cluster Certificate Authority (CA), capable of reissuing Linkerd’s issuer certificate and private key regularly.

Cert-manager's CA root certificate (trust-anchor) and CA Cluster issuer should already be in place from the [**`Cert-Manager setup process`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/2.5-tls-certificates-cert-manager.md), which will facilitate the generation of Linkerd's certificate acting as an intermediate CA for mTLS certificate issuance.

### Deploying Linkerd with Helm

>📢 Note
>
> *To prepare for Helm-based Installation, note that starting with release 2.12, Linkerd's installation process via Helm has been updated, necessitating the deployment of two new charts:*
>
> - **`linkerd-crd`**
> - **`linkerd-control-plane`**

- Add the Linkerd Helm Repository

```bash
helm repo add linkerd https://helm.linkerd.io/stable
```

- Update Helm Repository

```bash
helm repo update
```

- For the namespace creation, it's essential to manually create the namespace with specific labels and annotations for the control plane to function correctly, using **`linkerd-namespace.yaml`**

```yaml
kind: Namespace
apiVersion: v1
metadata:
  name: linkerd
  annotations:
    linkerd.io/inject: disabled
  labels:
    linkerd.io/is-control-plane: "true"
    config.linkerd.io/admission-webhooks: disabled
    linkerd.io/control-plane-ns: linkerd
```

- Apply the manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f linkerd-namespace.yaml
```

- Configure **`Linkerd Identity Issuer Certificate`** by creating **`linkerd-identity-issuer.yaml`** detailing the certificate specifications, using the **`ca-issuer`** for signing

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: linkerd-identity-issuer
  namespace: linkerd
spec:
  secretName: linkerd-identity-issuer
  duration: 48h
  renewBefore: 25h
  issuerRef:
    name: picluster-ca-issuer
    kind: ClusterIssuer
    group: cert-manager.io
  commonName: identity.linkerd.cluster.local
  dnsNames:
  - identity.linkerd.cluster.local
  isCA: true
  privateKey:
    algorithm: ECDSA
  usages:
  - cert sign
  - crl sign
  - server auth
  - client auth
```

- Apply the Certificate Configuration

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f linkerd-identity-issuer.yaml
```

- Retrieve the CA Certificate by extracting the trust-anchor certificate for use in the Linkerd installation

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get secret linkerd-identity-issuer -o jsonpath="{.data.ca\.crt}" -n linkerd | base64 -d > ca.crt
```

- Install Linkerd CRDs

```bash
helm --kubeconfig=/home/pi/.kube/config.yaml install linkerd-crds linkerd/linkerd-crds -n linkerd
```

- Deploy Linkerd Control Plane

```bash
helm --kubeconfig=/home/pi/.kube/config.yaml install linkerd-control-plane \
--set-file identityTrustAnchorsPEM=ca.crt \
--set identity.issuer.scheme=kubernetes.io/tls \
--set installNamespace=false \
linkerd/linkerd-control-plane \
-n linkerd
```

- Verify Deployment Success

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get pod -n linkerd
```

- Inspect Linkerd Control Plane ConfigMap and ensure the **`ca.crt`** is correctly incorporated in the configmap

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get configmap linkerd-config -o yaml -n linkerd
```

#### Alternative Installation via GitOps (ArgoCD)

For GitOps deployments, such as with ArgoCD, it's advisable to manage the CA certificate through an external ConfigMap, **`linkerd-identity-trust-roots`**, instead of embedding it directly in the Helm chart values. If using an external ConfigMap, set **`identity.externalCA=true`** during installation.

The [**`Trust Manager`**](https://cert-manager.io/docs/trust/trust-manager/), part of the Cert-Manager ecosystem, can automate this process, creating the necessary ConfigMap with the CA certificate. Detailed guidance is available in the [**`Linkerd GitHub discussion #7345`**](https://github.com/linkerd/linkerd2/issues/7345#issuecomment-979207861) and the [**`TLS certification management documentation`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/2.5-tls-certificates-cert-manager.md).

- Replace the below step

> - Retrieve the CA Certificate by extracting the trust-anchor certificate for use in the Linkerd installation
>
> ```bash
> kubectl --kubeconfig=/home/pi/.kube/config.yaml get secret linkerd-identity-issuer -o jsonpath="{.data.ca\.crt}" -n linkerd | base64 -d > ca.crt
>```

with this alternative step to set up a **`Trust-Manager Bundle`** resource to share **`ca.crt`** stored in **`root-secret`** within a configMap (**`argocd-linkerd-identity-trust-roots.yaml`**) in linkerd namespace.

```yaml
apiVersion: trust.cert-manager.io/v1alpha1
kind: Bundle
metadata:
  name: linkerd-identity-trust-roots
spec:
  sources:
  - secret:
      name: "root-secret"
      key: "ca.crt"
  target:
    configMap:
      key: "ca-bundle.crt"
    namespaceSelector:
      matchLabels:
        kubernetes.io/metadata.name: linkerd
```

- Apply the manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f argocd-linkerd-identity-trust-roots.yaml
```

- Also replace the below step

> - Deploy Linkerd Control Plane
>
> ```bash
> helm --kubeconfig=/home/pi/.kube/config.yaml install linkerd-control-plane \
> --set-file identityTrustAnchorsPEM=ca.crt \
> --set identity.issuer.scheme=kubernetes.io/tls \
> --set installNamespace=false \
> linkerd/linkerd-control-plane \
> -n linkerd
> ```

- With a Linkerd control plane is deployed with the **`identity.externalCA=true`** setting, indicating that an external CA is used for identity issuance

```bash
helm --kubeconfig=/home/pi/.kube/config.yaml install linkerd-control-plane \
--set identity.externalCA=true \
--set identity.issuer.scheme=kubernetes.io/tls \
--set installNamespace=false \
linkerd/linkerd-control-plane \
-n linkerd
```

### Integrating the Linkerd Viz Extension

The Linkerd Viz extension enriches the Linkerd service mesh with comprehensive metrics, a graphical dashboard, and Grafana integration for in-depth analysis. This add-on deploys several key components into the **`linkerd-viz`** namespace, including:

- A dedicated instance of Prometheus.
- The **`metrics-api`**, **`tap`**, **`tap-injector`**, and **`web`** services.

Given an existing monitoring setup detailed in the [**`Prometheus integration guide`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/4.1-monitoring-prometheus.md), this guide will adjust the Viz extension to utilize an already deployed Prometheus and Grafana instance, aligning with the [**`Linkerd guide on integrating an external Prometheus`**](https://linkerd.io/2.12/tasks/external-prometheus/).

The web interface for Linkerd Viz, accessible through an Ingress resource, requires specific configurations to function correctly, especially considering DNS rebinding protections and the absence of the Grafana component in releases starting from 2.12.

- Initially, create the **`linkerd-viz`** namespace with essential annotations and labels to ensure proper service mesh integration and configuration using **`linkerd-viz-namespace.yaml`**

```yaml
kind: Namespace
apiVersion: v1
metadata:
  name: linkerd-viz
  annotations:
    linkerd.io/inject: enabled
    config.linkerd.io/proxy-await: "enabled"
  labels:
    linkerd.io/extension: viz
```

- Apply the manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f linkerd-viz-namespace.yaml
```

```yaml
kind: Namespace
apiVersion: v1
metadata:
  name: linkerd-viz
  annotations:
    linkerd.io/inject: enabled
    config.linkerd.io/proxy-await: "enabled"
  labels:
    linkerd.io/extension: viz
```

- Adjust the linkerd Viz Helm values to accommodate the existing Prometheus setup and disable the DNS rebinding protection if necessary with **`linkerd-viz-values.yaml`**

```yaml
# Skip namespace creation
# When set to false, Helm will not create the namespace for the Linkerd Viz installation.
# This is useful if you want to manage namespace creation separately or if the namespace already exists.
installNamespace: false

# Prometheus configuration
prometheus:
  # Disable the Prometheus installation that comes with the Linkerd Viz extension.
  # This is useful if you already have a Prometheus instance in your cluster and wish to use that for collecting metrics.
  enabled: false

# Specify the URL of an external Prometheus instance.
# This setting is necessary when you've disabled the bundled Prometheus as it directs the Linkerd Viz components to the correct Prometheus instance for fetching metrics.
# The example URL points to a Prometheus instance deployed in the "monitoring" namespace, accessible within the cluster.
prometheusUrl: http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090

# Grafana configuration
grafana:
  # Specify the URL of an external Grafana instance.
  # When using an existing Grafana setup, this URL allows Linkerd Viz to integrate with it for visualizing metrics.
  # The example URL points to a Grafana service deployed in the "monitoring" namespace.
  url: http://kube-prometheus-stack-grafana.monitoring.svc.cluster.local

# Disabling DNS rebinding protection (specific to installations using Traefik as ingress)
# The dashboard configuration allows specifying host enforcement policies for accessing the Linkerd dashboard through an ingress.
# Uncommenting the below lines and setting `enforcedHostRegexp` to ".*" disables DNS rebinding protection.
# This can be necessary in specific scenarios where DNS rebinding checks prevent accessing the dashboard through Traefik.
# dahsboard:
#   enforcedHostRegexp: ".*"
```

- Deploy the Linkerd Viz extension using the prepared values file

```bash
helm --kubeconfig=/home/pi/.kube/config.yaml linkerd-viz -n linkerd-viz -f linkerd-viz-values.yaml
```

- Define an Ingress rule in **`linkerd-viz-ingress.yaml`**, to provide access to the Linkerd Viz dashboard, including configurations for DNS rebinding protection and HTTP basic authentication. NGINX as Ingress controller will is defined as per the [**`Linkerd documentation`**](https://linkerd.io/2.13/tasks/exposing-dashboard/#nginx) and exposes linkerd-viz at **`linkerd.picluster.quantfinancehub.com`**

```yaml
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: linkerd-viz-ingress
  namespace: linkerd-viz
  annotations:
    # Enable basic authentication for the ingress. This requires users to authenticate using credentials stored in a Kubernetes secret.
    nginx.ingress.kubernetes.io/auth-type: basic
    # The name of the Kubernetes secret that contains the authentication credentials. The secret should be defined in the same namespace as the Nginx ingress controller.
    nginx.ingress.kubernetes.io/auth-secret: nginx/basic-auth-secret
    # Instructs the Nginx ingress controller to treat the backend service as an upstream entity. This ensures that the original client's IP address is preserved.
    nginx.ingress.kubernetes.io/service-upstream: "true"
    # Sets the virtual host in the upstream request to the Linkerd Viz service. This is necessary for DNS rebind protection and to ensure requests are properly routed within the cluster.
    nginx.ingress.kubernetes.io/upstream-vhost: $service_name.$namespace.svc.cluster.local:8084
    # Additional Nginx configuration to ensure compatibility with Linkerd Viz's security mechanisms. This includes setting the Origin header to an empty string and hiding specific headers.
    nginx.ingress.kubernetes.io/configuration-snippet: |
      proxy_set_header Origin "";
      proxy_hide_header l5d-remote-ip;
      proxy_hide_header l5d-server-id;
    # Annotations for cert-manager to automatically issue and manage an SSL certificate for the Ingress, storing it in a Kubernetes secret.
    cert-manager.io/cluster-issuer: picluster-ca-issuer
    # The common name to be used for the generated SSL certificate, typically matching the domain name.
    cert-manager.io/common-name: linkerd.picluster.quantfinancehub.com
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - linkerd.picluster.quantfinancehub.com
      # The name of the Kubernetes secret where the SSL certificate will be stored.
      secretName: linkerd-viz-tls
  rules:
    - host: linkerd.picluster.quantfinancehub.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 8084  
```

- Apply the manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f linkerd-viz-ingress.yaml
```

- Configure Prometheus to scrape metrics from Linkerd by applying a tailored PodMonitor configuration defined in **`linkerd-prometheus.yaml`**

```yaml
---
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  labels:
    app: linkerd # Identifies the app as Linkerd for labeling and filtering purposes.
    release: kube-prometheus-stack # Associates this monitor with a specific Prometheus operator release.
  name: linkerd-controller # Name of the PodMonitor for the Linkerd controller component.
  namespace: monitoring # Namespace where the PodMonitor resource will be created.
spec:
  namespaceSelector:
    matchNames:
      - linkerd-viz # Targets the linkerd-viz namespace for monitoring.
      - linkerd # Also targets the linkerd namespace.
  selector:
    matchLabels: {} # An empty selector that matches all pods within the specified namespaces.
  podMetricsEndpoints:
    - relabelings:
      - sourceLabels:
          - __meta_kubernetes_pod_container_port_name
        action: keep
        regex: admin-http # Only keeps metrics from containers exposing an 'admin-http' port, common for Linkerd components.
      - sourceLabels:
          - __meta_kubernetes_pod_container_name
        action: replace
        targetLabel: component # Renames the container name label to 'component' for clarity.
      - sourceLabels:
          - __address__
        action: replace
        targetLabel: job
        replacement: linkerd-controller # Sets the job label to 'linkerd-controller', identifying the source of the metrics.

---
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  labels:
    app: linkerd
    release: kube-prometheus-stack
  name: linkerd-service-mirror # Specific monitor for the Linkerd service mirror component.
  namespace: monitoring
spec:
  namespaceSelector:
    any: true # Indicates that this monitor targets pods across all namespaces.
  selector:
    matchLabels: {} # Matches all pods, similar to the previous monitor.
  podMetricsEndpoints:
    - relabelings:
      - sourceLabels:
          - __meta_kubernetes_pod_label_linkerd_io_control_plane_component
          - __meta_kubernetes_pod_container_port_name
        action: keep
        regex: linkerd-service-mirror;admin-http$ # Specifically targets the 'linkerd-service-mirror' component exposing 'admin-http'.
      - sourceLabels:
          - __meta_kubernetes_pod_container_name
        action: replace
        targetLabel: component
      - source_labels:
          - __address__
        action: replace
        targetLabel: job
        replacement: linkerd-service-mirror # Identifies the source of metrics as the Linkerd service mirror.

---
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  labels:
    app: linkerd
    release: kube-prometheus-stack
  name: linkerd-proxy # Monitor for the Linkerd proxy sidecars.
  namespace: monitoring
spec:
  namespaceSelector:
    any: true # Targets all namespaces, as Linkerd proxies are deployed alongside applications in various namespaces.
  selector:
    matchLabels: {} # Matches all pods, aiming to discover all Linkerd proxies.
  podMetricsEndpoints:
    - relabelings:
      - sourceLabels:
          - __meta_kubernetes_pod_container_name
          - __meta_kubernetes_pod_container_port_name
          - __meta_kubernetes_pod_label_linkerd_io_control_plane_ns
        action: keep
        regex: ^linkerd-proxy;linkerd-admin;linkerd$ # Filters for the Linkerd proxy containers specifically.
      - sourceLabels: [__meta_kubernetes_namespace]
        action: replace
        targetLabel: namespace # Sets the namespace label for better identification.
      - sourceLabels: [__meta_kubernetes_pod_name]
        action: replace
        targetLabel: pod # Sets the pod label.
      - sourceLabels: [__meta_kubernetes_pod_label_linkerd_io_proxy_job]
        action: replace
        targetLabel: k8s_job # Optional labeling for job identification, can be customized or removed based on needs.
      - action: labeldrop
        regex: __meta_kubernetes_pod_label_linkerd_io_proxy_job # Drops temporary labels to clean up.
      - action: labelmap
        regex: __meta_kubernetes_pod_label_linkerd_io_proxy_(.+) # Maps Linkerd proxy labels for Prometheus.
      - action: labeldrop
        regex: __meta_kubernetes_pod_label_linkerd_io_proxy_(.+)
      - action: labelmap
        regex: __meta_kubernetes_pod_label_linkerd_io_(.+)
      - action: labelmap
        regex: __meta_kubernetes_pod_label_(.+)
        replacement: __tmp_pod_label_$1 # Temporary label mapping for further processing.
      - action: labelmap
        regex: __tmp_pod_label_linkerd_io_(.+)
        replacement:  __tmp_pod_label_$1
      - action: labeldrop
        regex: __tmp_pod_label_linkerd_io_(.+)
      - action: labelmap
        regex: __tmp_pod_label_(.+)
      - sourceLabels:
          - __address__
        action: replace
        targetLabel: job
        replacement: linkerd-proxy # Finalizes the job label as 'linkerd-proxy' for the metrics collected from Linkerd proxies.
```

- Apply the manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f linkerd-prometheus.yaml
```

>📢 Note
>
> *The configuration outlined above adapts the [**`Prometheus scrape settings specified in the Linkerd documentation`**](https://linkerd.io/2.12/tasks/external-prometheus/#prometheus-scrape-configuration) for use with the Prometheus Operator framework, utilizing **`ServiceMonitor`** and **`PodMonitor`** Custom Resource Definitions (CRDs).*
>
> *Two key modifications have been applied to the original setup:*
>
> - ***Job Label Adjustment**: The Prometheus Operator automatically generates job names and labels following the pattern **`<namespace>/<podMonitor/serviceMonitor_name>`**. To align with the Grafana dashboard's expectations, we've introduced an additional relabeling rule. This rule strips the namespace portion from the job label to ensure compatibility with Grafana's filtering logic.*
>
> - ***Scrape Interval and Timeout Settings**: Originally set to 10 seconds in the Linkerd documentation, these settings have been omitted to fall back on Prometheus's default values of 30 seconds. This change aims to lessen the resource usage on memory and CPU by decreasing the frequency of scrape operations.*

- For Grafana Dashboard Integration, import Linkerd's Grafana dashboards from the [**`official repository`**](https://github.com/linkerd/linkerd2/tree/main/grafana/dashboards) and follow the [**`guide for automatic dashboard provisioning`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/4.1-monitoring-prometheus.md).

### Installing the Linkerd Jaeger Extension for Distributed Tracing

The [**`Linkerd Jaeger extension`**](https://linkerd.io/2.12/tasks/distributed-tracing/) equips Linkerd with the capability to generate span traces from its proxies, enhancing observability through distributed tracing.

By default, the Linkerd Jaeger extension installs several components:

- **Jaeger**: Serves as the backend for trace data.
- [**OpenTelemetry Collector**](https://opentelemetry.io/docs/collector/): Gathers and routes traces to the Jaeger backend.
- **Jaeger Injector**: Modifies Linkerd proxies to generate span traces.

TODO-add url for the below linked once documentation done

Within the context of the [**`PiKube Kubernetes Service`**](../9-monitoring/2-observability-framework.md) Observability Platform, Tempo is preferred over Jaeger for trace data management, detailed in the [**`Tempo Installation Guide`**](../9-monitoring/8-distributed-tracing-tempo.md). Given that Tempo incorporates an OpenTelemetry collector within its distributor component, the standard Jaeger and OpenTelemetry Collector installations are unnecessary, leaving only the Jaeger Injector to be deployed.

>📢 Note
>
> *Ensure Tempo is integrated with Linkerd prior to proceeding with the Linkerd Jaeger extension setup outlined below.*

- To start Jaeger configuration and installation, create **`linkerd-jaeger-values.yaml`** configuration file with the following content to exclude Jaeger and the OpenTelemetry Collector while directing the Jaeger Injector towards Tempo's distributor for trace collection

```yaml
collector:
  enabled: false
jaeger:
  enabled: false
webhook:
  collectorSvcAddr: tempo-distributor.tracing:55678
  collectorSvcAccount: tempo
```

where **`webhook.collectorSvcAddr:`** specifies the endpoint for the OpenCensus receiver at the Tempo distributor and **`webhook.collectorSvcAccount:`** defines the service account associated with Tempo.

- Deploy the Linkerd Jaeger extension, focusing solely on the Jaeger Injector component

```bash
helm --kubeconfig=/home/pi/.kube/config.yaml install linkerd-jaeger -n linkerd-jaeger --create-namespace linkerd/linkerd-jaeger -f linkerd-jaeger-values.yaml
```

## Integrating Services with Linkerd

Integrating services with Linkerd can be accomplished through two primary methods, allowing for the automatic injection of the linkerd-proxy into your Kubernetes resources:

**Direct Integration:**

- **Per Resource Annotation:** Directly annotate individual Kubernetes resources (Deployments, DaemonSets, StatefulSets) with **`linkerd.io/inject: enabled`** to enable proxy injection.

To automate annotation injection, use the **`linkerd CLI`** as follows, replacing **`NAMESPACE`** with the wanted  namespace:

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get -n NAMESPACE deploy/daemonset/statefulset -o yaml | linkerd inject - | kubectl apply -f -
```

This command processes all specified resources in the namespace, enabling automatic proxy injection.

Alternatively, resources can be manually annotated using kubectl patch:

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml patch deployment/daemonset/statefulset <name> -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"linkerd.io/inject\":\"enabled\"}}}}}"
```

After executing either method, the resources are updated to include the **`linkerd-proxy`**.

**Namespace-Level Integration:**

- **Namespace Annotation:** Annotating a namespace with **`linkerd.io/inject: enabled`** ensures that all new pods within the namespace are automatically injected with the **`linkerd-proxy`**.

This can be done using:

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml annotate ns <namespace_name> linkerd.io/inject=enabled
```

Or through the namespace's manifest

```yaml
kind: Namespace
apiVersion: v1
metadata:
  name: test
  annotations:
    linkerd.io/inject: enabled
```

### Handling Kubernetes Jobs with Linkerd

When a namespace is annotated with **`linkerd.io/inject: enabled`**, [**`Kubernetes Jobs`**](https://kubernetes.io/docs/concepts/workloads/controllers/job/) within that namespace may not terminate as expected. This is because the **`linkerd-proxy`** injected into the Job's pods remains active. This can particularly affect Helm chart installations that deploy Jobs or the execution of scheduled CronJobs.

To address this, consider the following strategies:

- **Exclude Jobs from Mesh:** Specifically disable proxy injection for Job resources by annotating the Job's template:

```yaml
jobTemplate:
  spec:
    template:
      metadata:
        annotations:
          linkerd.io/inject: disabled
```

- **Automated Proxy Shutdown:** Utilize [**`linkerd-await`**](https://github.com/linkerd/linkerd-await) to manage the lifecycle of the **`linkerd-proxy`** in conjunction with the Job. **`linkerd-await`** ensures the proxy is only shut down after the main Job command completes, maintaining the expected lifecycle of Job resources.

```bash
linkerd-await --shutdown -- <job_command>
```

For more detailed implementations and considerations, refer to the strategies outlined in the [**`ITNEXT blog post`**](https://itnext.io/three-ways-to-use-linkerd-with-kubernetes-jobs-c12ccc6d4c7c), which discusses handling Kubernetes Jobs within meshed environments.

## Integrating Cluster Services with Linkerd

### Incorporating Longhorn into the Service Mesh

Integrating services into a service mesh like Linkerd typically involves two approaches: explicitly annotating individual resources or implicitly annotating an entire namespace. However, when it comes to Longhorn, a cloud-native distributed storage platform for Kubernetes, certain considerations must be made due to its architecture and the nature of its components.

Longhorn operates by creating a variety of Kubernetes workloads, including daemonsets, deployments, and jobs. The challenge arises because not all of these components can be easily annotated through Longhorn's Helm chart customization options. Specifically, while the **`longhorn-manager`** DaemonSet can be customized through the Helm chart, other components managed by it, such as instance managers and jobs, cannot. This limitation is highlighted in an existing feature request within the Longhorn project (see Longhorn [**`issue #3286`**](https://github.com/longhorn/longhorn/issues/3286)).

**Considerations for Longhorn's Data Plane:**

To ensure optimal performance of Longhorn's data plane, it is recommended to avoid meshing certain components, specifically **`longhorn-engine`** and **`longhorn-replica`**. Meshing these components with Linkerd could potentially impact read/write operations due to the overhead introduced by mutual TLS (mTLS) encryption.

Therefore, the focus is primarily on meshing Longhorn's control plane components, such as the **`longhorn-manager`** (including its CSI plugin) and the UI component (**`longhorn-ui`**), while keeping the data plane components out of the mesh.

**Challenges with Namespace-Level Annotations:**

Applying a namespace-level annotation for automatic mesh injection or explicitly annotating only the **`longhorn-manager`** daemon set can lead to deployment issues. One notable challenge is that the **`longhorn-manager`** does not accept connections from localhost, which conflicts with how Linkerd's proxy handles traffic routing. This issue stems from Linkerd's iptables forwarding rules, which cause all incoming traffic to appear as if it's originating from localhost. As a workaround, containers meshed with Linkerd need to listen on "0.0.0.0" to accept traffic from any IP address, including localhost.

**Workarounds and Solutions:**

To mesh **`longhorn-manager`** successfully, the following steps can be taken after Longhorn is fully deployed:

- Modify the **`POD_IP`** environment variable to "0.0.0.0" in the `**`longhorn-manager`**` DaemonSet, allowing the container to listen for connections from localhost

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml set env daemonset/longhorn-manager -n longhorn-system POD_IP=0.0.0.0
```

- Explicitly annotate the **`longhorn-manager`** DaemonSet to inject the Linkerd proxy

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml patch daemonset longhorn-manager -n longhorn-system --patch "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"linkerd.io/inject\":\"enabled\"}}}}}"
```

- Similarly, annotate the **`longhorn-ui`** deployment for Linkerd proxy injection

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml patch deployment longhorn-ui -n longhorn-system --patch "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"linkerd.io/inject\":\"enabled\"}}}}}"
```

<a id="configuring-the-prometheus-stack-with-linkerd"></a>

### Configuring the Prometheus Stack with Linkerd

Integrating Prometheus Stack services with the Linkerd service mesh involves strategic considerations to ensure compatibility and optimal functioning. This section outlines the necessary steps and considerations for successfully deploying the **`kube-prometheus-stack`** with Linkerd.

**Initial Namespace Annotation**:

Before installing the kube-prometheus-stack chart, it's advisable to enable Linkerd injection at the namespace level. This approach simplifies the mesh integration process for multiple components within the namespace.

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml annotate ns monitoring linkerd.io/inject=enabled
```

**Handling the Prometheus Operator Deployment Issue:**

Deploying the kube-prometheus-stack with an annotated namespace for Linkerd injection can lead to a known issue where the Prometheus Operator does not proceed as expected. Specifically, the job pod **`pod/kube-prometheus-stack-admission-create-<randomAlphanumericString>`** may remain in a **`NotReady`** state indefinitely. This occurs because the Linkerd proxy remains active even after the job container has completed, preventing the job pod from successfully concluding.

This problem is documented in a [**`discussion regarding the Prometheus Operator and Linkerd`**](https://github.com/prometheus-community/helm-charts/issues/479).

**Solution: Disabling Linkerd Injection for Specific Jobs:**

To circumvent this issue, Linkerd injection for the jobs created by the Prometheus Operator must be explicitly disabled. This can be accomplished by modifying the **`prometheus-values.yaml`** file used during the helm chart deployment, as shown below:

```yaml
prometheusOperator:
  admissionWebhooks:
    patch:
      podAnnotations:
        linkerd.io/inject: disabled
  # The existing prometheusOperator configuration continues below...
  serviceMonitor:
    relabelings:
      - sourceLabels: [__address__]
        action: replace
        targetLabel: job
        replacement: prometheus-operator
  kubeletService:
    enabled: false
# The rest of the configuration follows...
```

- Apply the manifest

```bash
helm --kubeconfig /home/pi/.kube/config.yaml upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack -f prometeus-values.yaml --namespace monitoring
```

Integrating this adjustment ensures that the Prometheus Operator jobs proceed without hindrance, facilitating a smooth deployment process for the **`kube-prometheus-stack`** within a Linkerd-enabled namespace.

>📢 Note
>
> ***Consideration for node-exporter DaemonSet:***
>
> *It's important to note that the **`node-exporter`** DaemonSet, included within the kube-prometheus-stack, does not receive the Linkerd proxy injection. This is because its pods are configured to use the host's network namespace (**`spec.hostNetwork=true`**), and Linkerd's injection mechanism is automatically disabled for such configurations.*
>
> Attempting manual injection will result in an error, highlighting this limitation:
>
> ```bash
> kubectl --kubeconfig /home/pi/.kube/config.yamlget daemonset -n monitoring -o yaml | linkerd inject -
>
> Error transforming resources:
> failed to inject daemonset/kube-prometheus-stack-prometheus-node-exporter: hostNetwork is enabled
> ```

### Integrating Linkerd Service Mesh with EFK

To incorporate Linkerd service mesh into the EFK (Elasticsearch, Fluentd, and Kibana) services, one effective strategy is to utilize implicit namespace-level annotations before deploying critical components. This preparation step ensures that the service mesh is applied uniformly across the services, enhancing their operation within the mesh.

Before the installation of the ECK Operator and the setup of Elasticsearch and Kibana services, as well as prior to the deployment of the Fluentd chart, it's recommended to annotate the target namespace with Linkerd injection enabled. This is also advised as a prerequisite adjustment in the EFK installation guidelines.

```bash
helm --kubeconfig /home/pi/.kube/config.yaml annotate ns logging linkerd.io/inject=enabled
```

For Elasticsearch and Kibana deployments via the ECK operator, it's crucial to enable the **`automountServiceAccountToken`** parameter. Without this setting, Linkerd's proxy injection might not occur, potentially impacting the service mesh's functionality.

Include the following snippet in the configuration, **`elasticsearch-values.yaml`**, for both Elasticsearch and Kibana resources to ensure proper service mesh injection:

```yaml
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: efk
  namespace: logging
spec:
  version: 8.1.2
  nodeSets:
    - name: default
      count: 1  # Single-node Elasticsearch cluster
      config:
        node.store.allow_mmap: false  # Disable memory mapping
      podTemplate:
        spec:
          automountServiceAccountToken: true  # Ensures Linkerd proxy injection
# The rest of the configuration follows...
```

For comprehensive insights into integrating ECK operator-managed Elastic stack components with Linkerd, refer to the [**`ECK and Linkerd integration guide`**](https://www.elastic.co/guide/en/cloud-on-k8s/current/k8s-service-mesh-linkerd.html).

>📢 Note
>
> *The automatic TLS configuration previously enabled for Elasticsearch has been deactivated. This change permits Linkerd to capture more detailed metrics on connections, addressing specific issues.*

### Linkerd Integration with Velero

Applying Linkerd service mesh enhancements to Velero operations involves a straightforward annotation process for both the **`Velero`** deployment and the **`Restic`** daemonset. These annotations ensure that Velero components are mesh-aware, optimizing their performance and monitoring within the service mesh environment.

When installing Velero using its Helm chart, automatically apply the necessary annotations by incorporating them into the **`velero-values.yaml`** file. This approach ensures that the Linkerd proxy is injected into the Velero pods, aligning with the service mesh's security and observability features.

```yaml
# AWS backend and CSI plugins configuration
initContainers:
  - name: velero-plugin-for-aws
    image: velero/velero-plugin-for-aws:v1.8.0
    imagePullPolicy: IfNotPresent
    volumeMounts:
      - mountPath: /target
        name: plugins
  - name: velero-plugin-for-csi
    image: velero/velero-plugin-for-csi:v0.6.0
    imagePullPolicy: IfNotPresent
    volumeMounts:
      - mountPath: /target
        name: plugins

# Minio storage configuration
configuration:
  backupStorageLocation:
    provider: aws
    bucket: <velero_bucket>
    caCert: <ca.pem_base64>  # Example: cat CA.pem | base64 | tr -d "\n"
    config:
      region: eu-west-1
      s3ForcePathStyle: true
      s3Url: https://minio.example.com:9091
      insecureSkipTLSVerify: true
  features: EnableCSI  # Enable CSI snapshot support

credentials:
  secretContents:
    cloud: |
      [default]
      aws_access_key_id: <minio_velero_user>  # Not encoded
      aws_secret_access_key: <minio_velero_pass>  # Not encoded

# Disable VolumeSnapshotLocation CRD as it is not needed for CSI integration
snapshotsEnabled: false

# Pod annotations to ensure automountServiceAccountToken is enabled
podAnnotations:
  linkerd.io/inject: enabled

podTemplate:
  spec:
    # Additional configuration for Velero to ensure compatibility with Linkerd
    automountServiceAccountToken: true
```

This configuration ensures that Velero services are seamlessly integrated with Linkerd, benefiting from the mesh's advanced networking, security, and observability capabilities.

## Setting Up Ingress with Linkerd

Linkerd, while not shipping with its own Ingress Controller, is designed to work seamlessly with existing Ingress Controllers. Integrating an Ingress Controller with Linkerd involves two primary steps:

- Adjusting the Ingress Controller's configuration to be compatible with Linkerd.
- Enabling Linkerd's proxy injection on Ingress Controller pods to equip them with Linkerd's capabilities.

Linkerd is compatible with any Ingress Controller. To leverage Linkerd's advanced features like route-based metrics and traffic splitting, it's crucial that Ingress Controllers forward traffic to the IP/port of Kubernetes Services, not directly to Pods. Many Ingress Controllers, including Traefik and NGINX, default to their own load balancing, bypassing the Service layer.

To utilize Linkerd's load balancing for HTTP traffic, the Ingress Controller's default load balancing must be bypassed.

For comprehensive instructions, refer to [**`Linkerd's "Ingress Traffic" documentation`**](https://linkerd.io/2.13/tasks/using-ingress/).

### Integrating Traefik with Linkerd

To mesh Traefik with Linkerd:

- **Enabling Ingress Mode on Traefik:** Mesh Traefik with **`ingress mode`** by using the **`linkerd.io/inject: ingress`** annotation. This directs traffic routing to Linkerd's proxy in ingress mode

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get deployment traefik -o yaml -n kube-system | linkerd inject --ingress - | kubectl apply -f -
```

> ⚠️ Important Consideration
>
> *In ingress mode, Linkerd's proxy handles only HTTP traffic. Traefik will no longer manage HTTPS traffic, which means TLS termination must be configured to occur at Traefik for external traffic, with internal service communication happening over HTTP. This setup relies on Linkerd to secure internal traffic.*

- To maintain Traefik's functionality (given it must access the Kubernetes API over HTTPS), exclude outbound port 443 from Linkerd's proxy

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get deployment traefik -o yaml -n kube-system | linkerd inject --ingress --skip-outbound-ports 443 - | kubectl apply -f -
```

- Alternatively, configure Traefik's Helm chart to include the necessary annotations for ingress mode and skipping port 443

```yaml
deployment:
  additionalContainers:
    - name: stream-accesslog
      image: busybox
      args:
        - "/bin/sh"
        - "-c"
        - "tail -n+1 -F /data/access.log"
      imagePullPolicy: Always
      resources: {}
      terminationMessagePath: /dev/termination-log
      terminationMessagePolicy: File
      volumeMounts:
        - mountPath: /data
          name: data
  podAnnotations:
    linkerd.io/inject: ingress
    config.linkerd.io/skip-outbound-ports: "443"
```

- Upgrade Traefik if needed

```bash
helm --kubeconfig /home/pi/.kube/config.yaml upgrade traefik traefik/traefik -f traefik-values.yaml --namespace traefik
```

For more details on this configuration, see [**`Linkerd discussion #7387`**](https://github.com/linkerd/linkerd2/discussions/7387) and the official documentation for [**`configuring Traefik`**](https://docs.k3s.io/helm#customizing-packaged-components-with-helmchartconfig).

- **Replacing Traefik’s Load Balancing with Linkerd's**: Configure Traefik to insert the **`l5d-dst-override`** header, directing traffic to the Service IP/port

  - **Middleware Configuration**: Create a Middleware manifest, **`traefik-linkerd-ingress.yaml`**, to add the **`l5d-dst-override`** header

  ```yaml
  apiVersion: traefik.containo.us/v1alpha1
  kind: Middleware
  metadata:
    name: l5d-header-middleware
    namespace: traefik
  spec:
    headers:
      customRequestHeaders:
        l5d-dst-override: "my-service.traefik.svc.cluster.local:80"  # my-service is a placeholder, ensure the service name is correctly specified
  ```

  - **Ingress Configuration**: Apply the Middleware to the Traefik Ingress resources in **`traefik-ingress.yaml`** through annotations

  ```yaml
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    name: traefik-ingress
    namespace: traefik
    annotations:
      traefik.ingress.kubernetes.io/router.middlewares: traefik-basic-auth@kubernetescrd,traefik-l5d-header-middleware@kubernetescrd
  spec:
    # Traefik Ingress spec here
  ```

  - Update the Traefik Ingress resources

  ```bash
  kubectl --kubeconfig /home/pi/.kube/config.yaml apply -f traefik-ingress.yaml
  ```

  - Verify the application of middleware

  ```bash
  kubectl --kubeconfig /home/pi/.kube/config.yaml describe ingress my-ingress -n traefik
  ```

>📢 Note
>
> *Since Traefik terminates TLS, traffic from outside the cluster is considered opaque TCP streams by Linkerd, offering limited metrics. However, internal HTTP or gRPC traffic benefits from full metrics and mTLS support provided by Linkerd.*

### Integrating NGINX Ingress with Linkerd

The process of incorporating NGINX Ingress with Linkerd is straightforward and does not necessitate specific annotations for ingress mode. This guide outlines the necessary steps to ensure NGINX Ingress works seamlessly with Linkerd.

**Annotating NGINX Ingress for Linkerd Integration:**

To enable Linkerd integration, the NGINX Ingress controller needs to be meshed using the **`linkerd.io/inject: enabled`** annotation. This approach is more straightforward compared to meshing Traefik, as it doesn't require any special ingress mode annotations.

When deploying NGINX Ingress using its Helm chart, it's important to avoid annotating the entire namespace with **`linkerd.io/inject: enabled`**. This precaution is due to the Helm chart creating various Kubernetes resources, including short-lived pods, that should not be meshed. Instead, the annotation should be applied directly to the Deployment resource.

The following **`nginx-values.yaml`** configuration should be used with the ingress-nginx Helm chart to ensure the NGINX Ingress controller is meshed properly

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

  # Annotating the NGINX controller pod for Linkerd injection
  podAnnotations:
    linkerd.io/inject: enabled

# Note: Adjust the configurations as per your environment requirements.
# The loadBalancerIP should be an available IP from your LoadBalancer pool.
# Enable only the features that are needed for your use case.
```

**Configuring NGINX Ingress for Linkerd's Routing and Load Balancing:**

To utilize Linkerd's routing and load balancing features, ingress resources, **`nginx-ingress.yaml`**, must be annotated with **`nginx.ingress.kubernetes.io/service-upstream: "true"`**. By default, the NGINX Ingress Controller configures upstreams in NGINX using a list of all pod IP addresses and ports. The specified annotation changes this behavior to use the service's Cluster IP and port as a single upstream, enhancing compatibility with Linkerd's traffic management capabilities.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nginx-ingress  # Name of the Ingress resource
  namespace: nginx  # Namespace where the Ingress is deployed
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: "/"  # Rewrite target path
    cert-manager.io/cluster-issuer: "letsencrypt-issuer"  # Specify the cluster issuer for TLS certificates
    nginx.ingress.kubernetes.io/service-upstream: "true"  # Use a single upstream in NGINX
spec:
  ingressClassName: nginx  # Specify the Ingress class
  tls:
  - hosts:
    - picluster.quantfinancehub.com  # Specify the domain for the TLS certificate
    secretName: picluster-tls  # Name of the secret containing the TLS certificate
  rules:
  - host: picluster.quantfinancehub.com  # Hostname to route traffic for
    http:
      paths:
      - path: "/"  # Path to route traffic to
        pathType: Prefix  # Type of path matching
        backend:
          service:
            name: nginx-dashboard  # Name of the service to route traffic to
            port:
              number: 8080  # Port of the service to route traffic to
```

- Update the NGINX Ingress resources

```bash
kubectl --kubeconfig /home/pi/.kube/config.yaml apply -f nginx-ingress.yaml
```

- Verify the application of middleware

```bash
kubectl --kubeconfig /home/pi/.kube/config.yaml get ingress nginx-ingress -n nginx -o yaml
```
