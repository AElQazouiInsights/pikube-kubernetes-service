---
title: GitOps with ArgoCD
permalink: /docs/11-argocd/1-gitops-with-argocd
description: Implementing GitOps principles for Pi cluster management using ArgoCD.
last_modified_at: "07-02-2024"
---

<p align="center">
    <img alt="prometheus"
    src="../resources/gitops/argocd.svg"
    width="40%"
    height="%">
</p>

[**`ArgoCD`**](https://argo-cd.readthedocs.io/en/stable/) is a declarative GitOps tool designed for the continuous delivery of applications within Kubernetes environments.

It facilitates integration with various Git repositories and can be used alongside CI tools, such as [**`Jenkins`**](https://www.jenkins.io/) or [**`GitHub Actions`**](https://docs.github.com/en/actions), to establish a comprehensive CI/CD pipeline. This pipeline automates the process of building and deploying applications to Kubernetes.

<p align="center">
    <img alt="prometheus"
    src="../resources/gitops/pikube-cluster-cicd-gitops-architecture.drawio.svg"
    width="%"
    height="%">
</p>

Utilizing the GitOps model, **`ArgoCD`** treats Git repositories as the authoritative source for defining the desired state of applications, represented through Kubernetes manifests. These manifests can be defined in multiple formats, including:

- Kustomize applications
- Helm charts
- Directories containing YAML/JSON manifests

**`ArgoCD`** ensures the automated deployment of applications to their designated environments based on the configurations stored in a Git repository. Deployments can be synchronized with branch updates, tag changes, or fixed to a specific manifest version identified by a Git commit.

In the PiKube Cluster, **`ArgoCD`** will play a crucial role in the automatic deployment of various applications, streamlining operations within the Kubernetes cluster.

## ArgoCD Installation

### Helm Chart Installation

ArgoCD can be efficiently installed via Helm charts, following these steps:

- Add the ArgoCD Helm repository

```bash
helm repo add argo https://argoproj.github.io/argo-helm
```

- Update the repository to fetch the latest charts

```bash
helm repo update
```

- Create a dedicated namespace for ArgoCD

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml create namespace argocd
```

Prepare the **`argocd-values.yaml`** file with configurations

```yaml
configs:
  params:
    server.insecure: true  # Server runs without TLS; NGINX ingress handles TLS
  cm:
    statusbadge.enabled: 'true'  # Enable status badge
    resource.customizations.health.argoproj.io_Application: |  # Health check for Application resources
      hs = {}
      hs.status = "Progressing"
      hs.message = ""
      if obj.status ~= nil then
        if obj.status.health ~= nil then
          hs.status = obj.status.health.status
          if obj.status.health.message ~= nil then
            hs.message = obj.status.health.message
          end
        end
      end
      return hs
    kustomize.buildOptions: --enable-helm  # Helm chart rendering with Kustomize
server:
  ingress:
    enabled: true
    ingressClassName: nginx
    hosts:
      - argocd.picluster.quantfinancehub.com
    tls:
      - secretName: argocd-tls
        hosts:
          - argocd.picluster.quantfinancehub.com
    paths:
      - /
    annotations:
      nginx.ingress.kubernetes.io/service-upstream: "true"
      cert-manager.io/cluster-issuer: letsencrypt-issuer
      cert-manager.io/common-name: argocd.picluster.quantfinancehub.com
```

- Install ArgoCD with the Helm chart

```bash
helm --kubeconfig=/home/pi/.kube/config.yaml install argocd argo/argo-cd --namespace argocd -f argocd-values.yaml
```

- Retrieve the ArgoCD admin password

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' -n argocd | base64 -d
```

- Set up Port Forwarding for ArgoCD server access

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml port-forward svc/argocd-server -n argocd 8080:80 --address 0.0.0.0
```

- Access the ArgoCD UI with the **`admin`** credentials

```bash
http://<server-port-forwarding>:8080
```

### Configuring ArgoCD Ingress

With NGINX acting as the ingress controller for TLS termination, ArgoCD's API server can safely run without HTTPS. This approach is already configured in the provided argocd-values.yaml.

For further details on ArgoCD's Ingress setup, refer to the [**`Argo-CD Ingress configuration documentation`**](https://argo-cd.readthedocs.io/en/stable/operator-manual/ingress/).

## Managing Resource Synchronization in ArgoCD

To ensure optimal operation within your Kubernetes environment, it's crucial to tailor ArgoCD's resource synchronization behavior, especially for resources that ArgoCD does not originate. Automatic synchronization and pruning, while beneficial for many scenarios, may inadvertently affect certain Kubernetes resources, leading to undesired outcomes.

### Issue with Automatic Synchronization

An example of such unintended effects is observed with VolumeSnapshot and VolumeSnapshotContent resources, which are typically generated by backup processes. Automatic synchronization policies in ArgoCD can prune these resources, potentially disrupting the backup procedure. This issue is documented in issue #273, highlighting the challenges of auto-pruning resources crucial for operations like backups.

### Solution: Excluding Specific Resources

To address this, ArgoCD offers a configuration to exclude certain resources from the synchronization process, thereby preventing the automatic pruning of vital resources like VolumeSnapshot and VolumeSnapshotContent. This configuration ensures that ArgoCD does not interfere with the lifecycle of resources generated by other processes, such as backups.

#### Configuring ArgoCD to Exclude Resources

To implement this solution, specific configurations need to be added to the ArgoCD helm chart. These settings instruct ArgoCD to ignore the specified resources during its synchronization operations.

```yaml
configs:
  cm:
    # Resource exclusion configuration
    # Prevents ArgoCD from synchronizing specific resources
    resource.exclusions: |
      - apiGroups:
        - snapshot.storage.k8s.io
        kinds:
        - VolumeSnapshot
        - VolumeSnapshotContent
        clusters:
        - "*"
```

This configuration effectively excludes VolumeSnapshot and VolumeSnapshotContent resources from ArgoCD's synchronization process, aligning with best practices for resource management. For more detailed instructions on resource exclusion, refer to the [**`ArgoCD documentation on resource exclusion/inclusion`**](https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/#resource-exclusioninclusion).

## Managing ArgoCD Applications for the PiKube Cluster

ArgoCD provides versatile ways to manage and deploy applications within a Kubernetes cluster, utilizing its UI or specific Custom Resource Definitions (CRDs) like Application or ApplicationSet. For the Pi Cluster, various types of applications will be deployed, each requiring a distinct configuration approach.

### Directory Applications

Directory applications deploy manifest files (.yml, .yaml, and .json) from a specific directory within a Git repository. These can be configured declaratively using the Application CRD.

**Example Application Manifest:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: test-app
spec:
  destination:
    namespace: <target-namespace>
    server: https://kubernetes.default.svc
  project: default
  source:
    directory:
      recurse: true  # Enables Recursive Resource Detection
    path: test-app
    repoURL: https://github.com/<user>/<repo>.git
    targetRevision: HEAD
  syncPolicy:
    automated:
      prune: true  # Enables resource pruning
      selfHeal: true  # Enables self-healing
```

**Key Configuration Details:**

- **`destination.namespace`** specifies the namespace where the application will be deployed.
- **`destination.server`** indicates the cluster for deployment; https://kubernetes.default.svc refers to the local cluster.
- **`source.repoURL`** is the URL of the Git repository containing the application.
- **`source.path`** is the directory within the Git repository.
- **`source.targetRevision`** tracks a specific Git tag, branch, or commit.
- **`syncPolicy.automated`** includes options for automatic synchronization, pruning of obsolete resources, and self-healing.

### Helm Chart Applications

Helm chart applications can also be deployed in a declarative manner using ArgoCD’s Application CRD.

Example Helm Application Manifest:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cert-manager
  namespace: argocd
spec:
  project: default
  source:
    chart: cert-manager
    repoURL: https://charts.jetstack.io
    targetRevision: v1.10.0
    helm:
      releaseName: cert-manager
      parameters:
        - name: installCRDs
          value: "true"
  destination:
    server: "https://kubernetes.default.svc"
    namespace: cert-manager
```

**Configuration Highlights:**

- **`chart`** specifies the Helm chart to deploy.
- **`repoURL`** is the URL of the Helm repository.
- **`releaseName`** identifies the chart version to deploy.
- **`parameters`** allow overriding default chart values.

### Kustomize Applications

[**`Kustomize`**](https://kustomize.io/) offers a method to customize Kubernetes manifests directly, supported natively by ArgoCD. It reads a **`kustomization.yaml`** file to manage the deployment of YAML files or charts through Kustomize.

**Kustomize in Directory Applications:**

A directory application can be enhanced with Kustomize by including a kustomization.yaml file in the directory. This approach allows ArgoCD to deploy and manage the application using Kustomize configurations.

## Utilizing Helm Umbrella Charts in ArgoCD

### Overview

In scenarios where ArgoCD needs to deploy Helm charts from third-party repositories, the limitation that a Helm values file must reside in the same Git repository as the Helm chart presents a challenge. Directly incorporating a large number of parameters within the Application definition for complex charts is impractical. To address this, the Helm Umbrella Chart pattern offers a streamlined solution.

### Helm Umbrella Chart Pattern

A Helm Umbrella Chart acts as a "meta" or wrapper chart that aggregates other Helm charts as dependencies ([**`subcharts`**](https://helm.sh/docs/chart_template_guide/subcharts_and_globals/)). This approach involves creating an essentially empty Helm chart that contains only a chart definition file (**`Chart.yaml`**) and a corresponding **`values.yaml`** file. These files define the subcharts and their configuration values.

**Example Chart Definition (Chart.yaml):**

```yaml
apiVersion: v2
name: certmanager
version: 0.0.0
dependencies:
  - name: cert-manager
    version: v1.10.0
    repository: https://charts.jetstack.io
```

**Example Values Configuration (values.yaml):**

```yaml
cert-manager:
  installCRDs: true
```

This structure allows for the declarative deployment of directory-type applications in ArgoCD, referencing the Umbrella Chart.

### Deploying an Umbrella Chart Application

**Example Application Manifest:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: umbrella-chart-app
spec:
  destination:
    namespace: <target-namespace>
    server: https://kubernetes.default.svc
  project: default
  source:
    path: <repo-path>
    repoURL: https://github.com/<user>/<repo>.git
    targetRevision: HEAD
  helm:
    # Additional Helm options here
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

ArgoCD utilizes the **`helm template`** command, rather than **`helm install`**, to render charts and applies the output using **`kubectl`**. This approach ensures compatibility with ArgoCD's declarative model and GitOps workflows.

**Rendering and Applying Helm Templates:**

```bash
helm template \
        --dependency-update \
        --namespace <target-namespace> \
        <app-name> <repo-path> \
        | kubectl apply -n <target-namespace> -f -
```

**Customizing Helm Deployment:**

Additional options for Helm can be specified using **`.spec.helm`** parameters in the Application resource, such as **`helm.valueFiles`** for custom values files and **`helm.skipCRDs`** to skip CRD installation.

> 📌 **Note**
>
> *While the empty chart pattern is predominant in using umbrella charts, additional configurations, such as a **`template`** directory for extra manifest files, are incorporated as necessary to tailor the deployment process. This flexibility has been instrumental in deploying Kubernetes services within the Pi Cluster using both packaged Helm applications and Kustomize configurations.*

## Bootstrapping PiKube Cluster Using the App of Apps Pattern

The [**`App of Apps pattern`**](https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/) offers a structured approach for initializing and managing clusters in Argo CD. This design pattern involves creating a root Argo CD Application that contains other Argo CD Applications, effectively orchestrating a hierarchy of applications for systematic deployment.

### Understanding the App of Apps Design

This methodology simplifies the deployment process by organizing applications into a manageable structure where a single root application triggers the deployment of subordinate applications. Each application is defined by its own set of Application manifest files, allowing for granular control and management.

### Deployment Order with Syncwaves and Synchooks

Argo CD utilizes [**`Syncwaves and Synchooks`**](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/) to manage the sequence of application deployments within an App of Apps configuration. These tools enable administrators to specify the deployment order through annotations (argocd.argoproj.io/sync-wave) on the application manifests. Syncwaves are denoted by integer values, where lower numbers indicate higher priority for deployment. Applications within the same sync-wave are deployed concurrently and must reach a healthy state before Argo CD proceeds to the next wave.

### Ensuring Application Health

The health status of each component application is crucial for the overall health of the root application. [**`Argo CD performs health checks`**](https://argo-cd.readthedocs.io/en/stable/operator-manual/health/) on a variety of standard Kubernetes resources, aggregating these into the application's health status. Only when all included resources, such as Deployments, Services, and PersistentVolumeClaims, are deemed healthy, will the entire application be considered healthy.

Custom health checks can be added to supplement the built-in checks, providing additional layers of validation for the application's resources. This is particularly important for the App of Apps pattern, where the health status of nested applications influences the deployment process.

### Custom Health Checks for Application CRDs

From [**`Argo CD release 1.8 onwards`**](https://argo-cd.readthedocs.io/en/stable/operator-manual/health/#argocd-app), the health check for the Application CRD is not included by default and must be explicitly defined in the Argo CD configuration. Below is an example of how to add a custom health check for Application resources

```yaml
resource.customizations.health.argoproj.io_Application: |
  hs = {}
  hs.status = "Progressing"
  hs.message = ""
  if obj.status ~= nil then
    if obj.status.health ~= nil then
      hs.status = obj.status.health.status
      if obj.status.health.message ~= nil then
        hs.message = obj.status.health.message
      end
    end
  end
  return hs
```

This configuration snippet ensures that the health of Application resources, crucial for the App of Apps pattern, is properly evaluated and factored into the overall application health assessment.

## Establishing a Root Application with Helm in ArgoCD

The Root Application serves as the cornerstone for cluster initialization, leveraging Helm templating to automate the creation and configuration of ArgoCD Application resources and essential initial resources.

### Directory Structure within the Git Repository

A structured directory within the Git repository facilitates organized resource management

```bash
root
├── Chart.yaml
├── templates
│   ├── app-set.yaml
│   ├── namespaces.yaml
│   └── other-manifests.yaml
└── values.yaml
```

### Configuration Files Overview

**Chart.yaml Setup:**

Defines the Helm chart for the bootstrap process.

```yaml
apiVersion: v2
name: bootstrap
version: 0.0.0
```

**values.yaml Configuration:**

Specifies the GitOps repository details, revision, and the applications to be deployed in sync waves.

```yaml
gitops:
  repo: https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster
  revision: production

apps:
  - name: crds
    namespace: default
    path: argocd/bootstrap/crds
    syncWave: 0
  - name: external-secrets
    namespace: external-secrets
    path: argocd/system/external-secrets
    syncWave: 1
  - name: metallb
    namespace: metallb
    path: argocd/system/metallb
    syncWave: 2
    ...
```

### Application Set Template

This template, **`app-set.yaml`**, dynamically generates an ArgoCD application for each entry under the apps dictionary in the **`values.yaml`** file, specifying application details such as name, deployment namespace, sync wave, and path in the repository.

```yaml
{{- range $index, $app := .Values.apps }}
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: {{ $app.name }}
  namespace: {{ $.Release.Namespace }}
  annotations:
    argocd.argoproj.io/sync-wave: '{{ default 0 $app.syncWave }}'
spec:
  destination:
    namespace: {{ $app.namespace }}
    server: https://kubernetes.default.svc
  project: default
  source:
    path: {{ $app.path }}
    repoURL: {{ $.Values.gitops.repo }}
    targetRevision: {{ $.Values.gitops.revision }}
  {{- if $app.helm }}
  helm:
    {{ toYaml $app.helm | indent 6 }}
  {{- end }}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    retry:
      limit: 10
      backoff:
        duration: 1m
        maxDuration: 16m
        factor: 2
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
      - ApplyOutOfSyncOnly=true
{{- end }}
```

### Namespace Creation

This template, **`namespaces.yaml`**, manages the creation of namespaces, potentially including annotations for service mesh integration like Linkerd.

### Additional Manifests

Additional Kubernetes manifest files ,**`other-manifests.yaml`**, required for cluster bootstrap can be included here.

> 📌 **Note**
> *The root application created for the PiKube Cluster demonstrates a comprehensive approach to using the App of Apps pattern with Helm for Kubernetes cluster management. This pattern not only simplifies application deployment but also ensures a scalable and maintainable cluster infrastructure setup.*
>
> *The full configuration for the PiKube Cluster's root application is available at /argocd/bootstrap/root, showcasing a practical implementation of these concepts.*

## Establishing Secure GitOps with ArgoCD: Deploying the Root Application

Deploying the root application within ArgoCD marks a crucial phase in configuring the Kubernetes environment, emphasizing the adoption of GitOps methodologies. Leveraging SSH for repository access not only fortifies the security of the Git repository interactions but also facilitates ArgoCD's seamless repository synchronization.

### Preparing for ArgoCD SSH Authentication

Before setting up ArgoCD to use SSH for Git repository access, it's necessary to ensure the GitHub SSH private key is available on the gateway machine where ArgoCD is running. This step is crucial for enabling secure repository synchronization via SSH.

**Transferring the GitHub SSH Private Key:**

If GitHub SSH private key is currently on a *`Windows laptop`* and needs to be transferred to the **`gateway`**, use the Secure Copy Protocol (SCP) with an intermediary SSH key for the gateway access. Ensure that the SSH service is running and accessible on **`gateway`**.

```bash
scp -i ~/.ssh/gateway-pi ~/.ssh/github pi@192.168.8.10:~/.ssh/github
```

### Preparing SSH Authentication for ArgoCD

Secure access to the Git repository is essential for ArgoCD to perform its operations. This security measure is achieved through SSH authentication, necessitating the creation of a Kubernetes secret that encompasses the SSH private key.

**Procedure to Create an SSH Key Secret:**

- **`SSH Key Setup`**: Generate an SSH key pair if you haven't already and ensure the public key is linked to your GitHub account.

- **`Secret Creation`**: Formulate a Kubernetes secret within the argocd namespace incorporating the SSH private key.

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml create secret generic argocd-ssh-secret --from-file=sshPrivateKey=/home/pi/.ssh/github -n argocd
```

This operation results in a secret, **`argocd-ssh-secret`**, which ArgoCD will utilize for secure repository access.

### Deploying the Root Application

The deployment of the root application in ArgoCD is achieved through a declarative approach by applying a specific manifest file. This root application orchestrates the initialization and management of other applications within the cluster, leveraging the power of GitOps for streamlined operations.

**Manifest File for Root Application Deployment:**

The following *`argocd-root-application.yaml`* snippet outlines the necessary configuration for deploying the root application. This manifest defines the application's metadata, its source location within a Git repository, and its synchronization policy aimed at automating deployment while ensuring robust management of resources.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  destination:
    namespace: argocd
    server: https://kubernetes.default.svc
  project: default
  source:
    path: argocd/bootstrap/root
    repoURL: git@github.com:Crypto-Aggressor/PiKube-Kubernetes-Cluster.git
    targetRevision: production
  syncPolicy:
    automated:
      prune: true  # Enables deletion of resources that are no longer in the repository.
      selfHeal: true  # Automatically repairs deviations from the desired state.
    retry:
      limit: 10  # Maximum number of sync attempts.
      backoff:
        duration: 1m  # Initial delay between retries.
        maxDuration: 16m  # Maximum delay between retries.
        factor: 2  # Factor by which the delay increases.
    syncOptions:
      - CreateNamespace=true  # Allows ArgoCD to create the namespace if it does not exist.
```

Apply the configuration

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f argocd-root-application.yaml
```

## CRDs Application Deployment Strategy

Deploying a dedicated application for Custom Resource Definitions (CRDs) in the initial sync wave establishes a foundational layer within the cluster. This strategy ensures that subsequent applications reliant on these CRDs can be deployed successfully, regardless of whether their corresponding controller services are already in place.

**Purpose of a CRDs Application*:*
A CRDs application serves as a prerequisite, setting up necessary CRDs ahead of other components. This is particularly beneficial for resources like the Prometheus Operator CRDs, enabling the deployment of Prometheus monitoring objects (ServiceMonitor, PodMonitor, etc.) for applications that are set up before the kube-prometheus-stack application. By doing so, it ensures a smoother deployment process and operational consistency across cluster services.

**Implementation Example:**

For a practical implementation of this strategy, consider the setup within the repository path /argocd/bootstrap/crds. This location typically contains the manifest files for the CRDs application, structured to be deployed in the first sync wave of the cluster bootstrap process.
