---
title: Minio S3 Object Storage Service
permalink: /docs/8-storage/2-s3-object-storage-service-minio/
description: How to deploy a Minio S3 object storage service in PiKube Kubernetes cluster.
last_modified_at: "22-12-2023"
---

<p align="center">
    <img alt="minio"
    src="../resources/storage//minio-bird-logo.jpg"
    width="25%"
    height="%">
    <!-- Second image -->
    <img alt="minio"
    src="../resources/storage//minio-logo.jpg"
    width="75%"
    height="%">
</p>

- [Minio installation](#minio-installation)
- [Configuring PiKubeS3Cluster Alias for Kubernetes](#configuring-pikubes3cluster-alias-for-kubernetes)

**`Minio`** will be implemented as a Kubernetes service, serving as an **`Object Store`** with an **`S3-compatible backend`** for various Kubernetes services like **`Loki`**, **`Tempo`**, and others.

The [**`official guide`**](https://min.io/docs/minio/kubernetes/upstream/index.html) for installing Minio on Kubernetes recommends using the Minio Operator to set up and manage a multi-tenant S3 cloud service.

However, this deployment will utilize the [**`Vanilla Minio Helm chart`**](https://github.com/minio/minio/tree/master/helm/minio) instead of the **`Minio Operator`**. This choice is due to the lack of a requirement for multi-tenant support. The Vanilla Minio Helm chart is also preferred because it automates the creation of buckets, policies, and users, a process not automated by the Minio Operator.

## Minio installation

- Register the Minio Helm chart repository to your Helm installation

```bash
helm repo add minio https://charts.min.io/
```

- Fetch the latest chart versions from the repository

```bash
helm repo update
```

- Establish a dedicated namespace for Minio within Kubernetes

```bash
kubectl create namespace minio
```

- Create a Minio Secret

Construct a Kubernetes secret **`minio-secret.yaml`**` containing credentials for Minio’s root user, as well as keys for other users (Loki, Tempo) which will be provisioned automatically during the Helm chart installation.

```yaml
cat <<EOF > kubectl apply -f
apiVersion: v1
kind: Secret
metadata:
  name: minio-secret
  namespace: minio
type: Opaque
data:
  rootUser: $(echo -n 'picluster' | base64)
  rootPassword: $(echo -n 'minio-secret1' | base64)
  lokiPassword: $(echo -n 'loki-secret1' | base64)
  tempoPassword: $(echo -n 'tempo-secret1' | base64)
EOF
```

To decode base64

```bash
echo '<encoded_picluster>' | base64 --decode
```

- Create a **`minio-values.yaml`** file, adjusting parameters as necessary

```yaml
existingSecret: minio-secret

drivesPerNode: 1
replicas: 2
pools: 1

affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/arch
              operator: In
              values:
                - arm64

persistence:
  enabled: true
  storageClass: "longhorn"
  accessMode: ReadWriteOnce
  size: 10Gi

resources:
  requests:
    memory: "1Gi"
  limits:
    memory: "2Gi"  # Optional: Set memory limits to prevent overconsumption

metrics:
  serviceMonitor:
    enabled: true
    includeNode: true

buckets:
  - name: k3s-loki
    policy: none
  - name: k3s-tempo
    policy: none

policies:
  - name: loki
    statements:
      - resources:
          - 'arn:aws:s3:::k3s-loki'
          - 'arn:aws:s3:::k3s-loki/*'
        actions:
          - "s3:DeleteObject"
          - "s3:GetObject"
          - "s3:ListBucket"
          - "s3:PutObject"
  - name: tempo
    statements:
      - resources:
          - 'arn:aws:s3:::k3s-tempo'
          - 'arn:aws:s3:::k3s-tempo/*'
        actions:
          - "s3:DeleteObject"
          - "s3:GetObject"
          - "s3:ListBucket"
          - "s3:PutObject"
          - "s3:GetObjectTagging"
          - "s3:PutObjectTagging"

users:
  - accessKey: loki
    existingSecret: minio-secret
    existingSecretKey: lokiPassword
    policy: loki
  - accessKey: tempo
    existingSecret: minio-secret
    existingSecretKey: tempoPassword
    policy: tempo

ingress:
  enabled: true
  ingressClassName: nginx
  hosts:
    - s3.picluster.quantfinancehub.com
  tls:
    - secretName: minio-tls
      hosts:
        - s3.picluster.quantfinancehub.com
  path: /
  annotations:
    nginx.ingress.kubernetes.io/service-upstream: "true"
    cert-manager.io/cluster-issuer: letsencrypt-issuer
    # Enable cert-manager to create automatically the SSL certificate and store in Secret
    cert-manager.io/common-name: s3.picluster.quantfinancehub.com

consoleIngress:
  enabled: true
  ingressClassName: nginx
  hosts:
    - minio.picluster.quantfinancehub.com
  tls:
    - secretName: minio-console-tls
      hosts:
        - minio.picluster.quantfinancehub.com
  path: /
  annotations:
    nginx.ingress.kubernetes.io/service-upstream: "true"
    cert-manager.io/cluster-issuer: letsencrypt-issuer
    # Enable cert-manager to create automatically the SSL certificate and store in Secret
    cert-manager.io/common-name: minio.picluster.quantfinancehub.com
```

📢 **This configuration establishes the following setup**:

➜ A Minio cluster consisting of 3 nodes (**`replicas`**), each equipped with a single 10GB drive (**`drivesPerNode`**) for storage (**`persistence`**).

➜ The root user's username and password are retrieved from the secret (**`existingSecret`**).

➜ Each node is allocated 1GB of memory (**`resources.requests.memory`**), a necessary reduction from the default 16GB, which is unsuitable for Raspberry Pi ad Orange Pi hardware.

➜ It enables the creation of a Prometheus ServiceMonitor object (**`metrics.serviceMonitor`**) for monitoring purposes.

➜ Minio pods are set to deploy exclusively on x86 architecture nodes (**`affinity`**) to avoid issues arising from mixed-architecture deployment. To get the cluster architecture use

```bash
kubectl get nodes -o jsonpath='{.items[*].status.nodeInfo.architecture}'
```

➜ Specific buckets (**`buckets`**), users (**`users`**), and access policies (**`policies`**) are configured for Loki and Tempo integrations.

➜ An ingress resource (**`ingress`**) is defined for the `S3 service API`, accessible at **`s3.picluster.quantfinancehub.com`**, with annotations to facilitate automatic TLS certificate generation by Cert-Manager.

➜ A separate ingress resource (**`ingressConsole`**) is configured for the Minio console, accessible at **`minio.picluster.quantfinancehub.com`**, also annotated for automatic TLS certificate handling by Cert-Manager.

- Install Minio using the Helm chart with **`minio-values.yaml`**

```bash
helm install minio minio/minio -f minio-values.yaml --namespace minio
```

- Check the status of the Minio pods to ensure they are running correctly

```bash
kubectl get pods -l app.kubernetes.io/name=minio -n minio
```

## Configuring PiKubeS3Cluster Alias for Kubernetes

In this configuration, `PiKubeS3Cluster` will serve as the alias for accessing the Minio instance deployed within the Kubernetes cluster. This alias ensures smooth integration with services like Loki and Tempo.

- To interact with the Kubernetes-specific Minio service hosted at `blueberry-master` node, set up an alias `PiKubeS3Cluster`

```bash
mc alias set PiKubeS3Cluster https://s3.picluster.quantfinancehub.com <root_user_minio_kubernetes> <root_password_minio_kubernetes>
```

Replace `<root_user_minio_kubernetes>` and `<root_password_minio_kubernetes>` with the credentials from the Minio secret configured earlier in `Secret`, namespace `minio`.

- Check that the alias was created successfully

```bash
mc alias list
```

- Test the alias by listing available buckets or creating a new bucket

```bash
mc ls PiKubeS3Cluster
```

Buckets `k3s-loki` and `k3s-tempo` have been already automatically been created leveraging minio helm manifest
