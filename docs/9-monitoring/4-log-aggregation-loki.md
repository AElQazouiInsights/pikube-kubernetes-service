---
title: Log Aggregation with Grafana Loki
permalink: /docs/9-monitoring/4-log-aggregation-loki
description: How to deploy Grafana Loki.
last_modified_at: "30-01-2024"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="loki"
    src="../resources/monitoring/loki-grafana.jpg"
    width="%"
    height="%">
</p>

The architecture of Loki is illustrated in the image below (source: [**`Grafana documentation`**](https://grafana.com/docs/loki/latest/get-started/components/)):

<p align="center">
    <img alt="loki"
    src="../resources/monitoring/loki-architecture-components.svg"
    width="%"
    height="%">
</p>

Loki's various components are encapsulated within a single binary (docker image), which facilitates three distinct deployment modes, allowing these components to be initiated in separate PODs.

- **Monolithic Mode**

    This mode runs all Loki components in a singular process (container).

- **Simple Scalable Mode**

    This mode implements High Availability (HA) for Loki by deploying replicas of write and read nodes (processes).

  - **`Write Nodes`**: Manage the write path. The Distributor and Ingestor components are tasked with storing logs and indexes in backend storage (Minio S3 storage).
  - **`Read Nodes`**: Handle the read path. The Ruler, Querier, and Frontend Querier components are in charge of responding to log queries.
  - **`Gateway Node`**: Acts as a load balancer (nginx based) in front of Loki, directing **`/loki/api/v1/push`** traffic to the write nodes and other requests to the read nodes. The traffic distribution is managed in a round robin manner.

- **Microservices Mode**

    This mode allows each Loki component to operate independently in separate processes (containers).

For additional information, refer to the Loki architecture documentation: [**`Loki components`**](https://grafana.com/docs/loki/latest/get-started/components/) and [**`deployment modes`**](https://grafana.com/docs/loki/latest/get-started/deployment-modes/).

The installation of Loki will utilize the Simple Scalable deployment mode with Minio as the S3 Object Storage Server backend.

## Setting up S3 Minio Server

The Minio Storage server is utilized for Loki's long-term data storage.

Grafana Loki requires storage for two data types: chunks and indexes, both of which are accommodated by the S3 server.

> 📌 **Note**
>
> *The Loki helm chart is capable of installing the Minio service as a subchart. However, this feature will be disabled, and the pre-existing Minio Storage Service in the cluster will be utilized as Loki's backend.*
>
> *The S3 bucket, policy, and user specific to Loki have already been configured as part of the Minio Storage Service installation.*
> *Refer to the documentation: [**`Minio S3 Object Storage Service`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/3.2-s3-object-storage-service-minio.md).*

## Creating Minio User and Bucket

> 📌 **Note**
>
> *As outlined in Loki's documentation, the following permissions are required when using S3 for object storage:*
>
> s3:ListBucket
> s3:PutObject
> s3:GetObject
> s3:DeleteObject (necessary if operating the Single Store (boltdb-shipper) compactor)
> Applicable to the resources: arn:aws:s3:::<bucket_name>, arn:aws:s3:::<bucket_name>/*

Assign the policy to user **loki** to ensure it has the necessary permissions for the **`k3s-loki`** bucket.

```bash
mc admin policy create <minio_alias> loki user_policy.json
```

<minio_alias> value is **`PiKubeS3Cluster`**, created in [**`Minio S3 Object Storage Service`**](../8-storage/2-s3-object-storage-service-minio.md)

The **`user_policy.json`** should contain the following AWS access policy definitions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
        "Effect": "Allow",
        "Action": [
            "s3:DeleteObject",
            "s3:GetObject",
            "s3:ListBucket",
            "s3:PutObject"
        ],
        "Resource": [
            "arn:aws:s3:::k3s-loki",
            "arn:aws:s3:::k3s-loki/*"
        ]
    }  
  ]
}
```

Refer to the [**`Loki Storage documentation`**](https://grafana.com/docs/loki/latest/operations/storage/) for more details.

- Validate the bucket and user setup

```bash
mc alias set PiKubeS3Cluster https://s3.picluster.quantfinancehub.com <admin_access_key> <admin_secret_key>
mc ls PiKubeS3Cluster/k3s-loki
```

## Loki Installation Using Helm Chart

There are two primary options for installing Loki with a Helm chart:

- **`Loki-Stack Helm Chart`**: Installs the entire PLG stack but won't be used in this scenario, as the focus is solely on deploying the Loki component. Grafana will be deployed as part of the kube-prometheus-stack, and Promtail is not required.

- **`Loki-Helm Chart v3.x`**: Suitable for both Monolithic and Simple Scalable deployment modes. This chart will be used to deploy Loki in a High Availability (HA) setup, specifically in the simple scalable deployment mode.

Installation Process:

- Adds the Grafana repository to Helm, allowing access to the Loki Helm chart.

```bash
helm repo add grafana https://grafana.github.io/helm-charts
```

- Fetches the latest charts from the Grafana repository to ensure the latest version of Loki is available.

```bash
helm repo update
```

- Create Namespace

```bash
kubectl create namespace logging
```

- Create **`loki-values.yaml`** file containing configuration settings for Loki, including storage backends, replica counts, and other options.

```yaml
# Setting simple scalable deployment mode
deploymentMode: SimpleScalable

loki:
  # Disable multi-tenant support
  auth_enabled: false

  # S3 backend storage configuration
  storage:
    bucketNames:
      chunks: <minio_loki_bucket>
      ruler: <minio_loki_bucket>
    type: s3
    s3:
      endpoint: <minio_endpoint>
      region: <minio_site_region>
      secretAccessKey: <minio_loki_key>
      accessKeyId: <minio_loki_user>
      s3ForcePathStyle: true
      insecure: false
      http_config:
        idle_conn_timeout: 90s
        response_header_timeout: 0s
        insecure_skip_verify: false
  # Storage Schema
  schemaConfig:
    configs:
    - from: 2024-04-01
      store: tsdb
      index:
        prefix: loki_index_
        period: 24h
      object_store: s3
      schema: v13

# Configuration for the write
write:
  # Number of replicas for the write
  replicas: 3
  persistence:
    # -- Size of persistent disk
    size: 10Gi
    # -- Storage class to be used.
    storageClass: longhorn

# Configuration for the read
read:
  # Number of replicas for the read
  replicas: 3
  persistence:
    # -- Size of persistent disk
    size: 10Gi
    # -- Storage class to be used.
    storageClass: longhorn

# Configuration for the backend
backend:
  # Number of replicas for the backend
  replicas: 3
  persistence:
    # -- Size of persistent disk
    size: 10Gi
    # -- Storage class to be used.
    storageClass: longhorn

# Configuration for the gateway
gateway:
  # -- Specifies whether the gateway should be enabled
  enabled: true
  # -- Number of replicas for the gateway
  replicas: 1

# Disable mino installation
minio:
  enabled: false

# Disable self-monitoring
monitoring:
  selfMonitoring:
    enabled: false
    grafanaAgent:
      installOperator: false
    lokiCanary:
        enabled: false

# Disable helm-test
test:
  enabled: false
```

> 📌 **Note**
>
> *In this configuration:*
>
> - *Replace <Your_MinIO_Secret_Access_Key> and <Your_MinIO_Access_Key_ID> with the actual MinIO credentials.*
> - *The **`s3.picluster.quantfinancehub.com:9091`** should be replaced with the actual endpoint of your MinIO instance.*
> - *The **`k3s-loki`** in bucketNames should be the name of the MinIO bucket designated for Loki storage.*
> - *The **`http_config`** and **`insecure`** flags are configured as per your requirements (SSL/TLS settings).*
> - *The **`write`**, **`read`**, and **`gateway`** sections configure the number of replicas and storage for each Loki component.*
> - *The **`minio.enabled: false`** setting is used to indicate that MinIO should not be installed as part of the Loki chart (assuming MinIO set up has already been performed).*
> - *Monitoring and helm-test features are disabled as per your provided configuration.*

- Deploy Loki in the **`logging`** Namespace

```bash
helm install loki grafana/loki -f loki-values.yaml --namespace logging
```

- Verify the Loki Pods' Status

```bash
kubectl get pods -l app.kubernetes.io/name=loki -n logging
```

## GitOps Deployment Using ArgoCD for Loki

For deployments incorporating GitOps principles, such as with ArgoCD, an alternative to embedding MinIO credentials directly in the Helm chart is to utilize an external secret. This method takes advantage of Loki's ability to incorporate environment variables within its configuration file.

**Creating a Necessary Secret**:

The following Kubernetes secret need to be created. This secret will contain the encoded credentials for MinIO access:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: loki-minio-secret
  namespace: logging
type: Opaque
data:
  MINIO_ACCESS_KEY_ID: <Encode MinIO Loki User>
  MINIO_SECRET_ACCESS_KEY: <Encode MinIO Loki Key>
```

Note: Replace **`<Encode MinIO Loki User>`** and **`<Encode MinIO Loki Key>`** with the base64 encoded values of your MinIO credentials.

**Providing Helm Values**:

The Helm values should be configured as follows to integrate the secret into Loki's deployment:

```yaml
loki:
  # Multi-tenant support is disabled
  auth_enabled: false

  # Configuring S3 backend storage
  storage:
    bucketNames:
      chunks: k3s-loki
      ruler: k3s-loki
    type: s3
    s3:
      endpoint: s3.picluster.quantfinancehub.com:9091
      region: eu-west-1
      secretAccessKey: ${MINIO_SECRET_ACCESS_KEY}
      accessKeyId: ${MINIO_ACCESS_KEY_ID}
      s3ForcePathStyle: true
      insecure: false
      http_config:
        idle_conn_timeout: 90s
        response_header_timeout: 0s
        insecure_skip_verify: false

  # Write component configuration
  write:
    replicas: 2
    persistence:
      size: 10Gi
      storageClass: longhorn
    extraArgs:
      - '-config.expand-env=true'
    extraEnv:
      - name: MINIO_ACCESS_KEY_ID
        valueFrom:
          secretKeyRef:
            name: loki-minio-secret
            key: MINIO_ACCESS_KEY_ID
      - name: MINIO_SECRET_ACCESS_KEY
        valueFrom:
          secretKeyRef:
            name: loki-minio-secret
            key: MINIO_SECRET_ACCESS_KEY

  # Read component configuration
  read:
    replicas: 2
    persistence:
      size: 10Gi
      storageClass: longhorn
    extraArgs:
      - '-config.expand-env=true'
    extraEnv:
      - name: MINIO_ACCESS_KEY_ID
        valueFrom:
          secretKeyRef:
            name: loki-minio-secret
            key: MINIO_ACCESS_KEY_ID
      - name: MINIO_SECRET_ACCESS_KEY
        valueFrom:
          secretKeyRef:
            name: loki-minio-secret
            key: MINIO_SECRET_ACCESS_KEY

  # Gateway configuration
  gateway:
    enabled: true
    replicas: 1

  # MinIO installation is disabled
  minio:
    enabled: false

  # Self-monitoring is disabled
  monitoring:
    selfMonitoring:
      enabled: false
      grafanaAgent:
        installOperator: false
    lokiCanary:
        enabled: false

  # Helm test is disabled
  test:
    enabled: false
```

## Configuring Grafana with Loki as a Data Source

To automatically integrate Loki as a data source in Grafana, especially when deploying the kube-prometheus-stack, the following additional configuration in the Helm chart can be included:

```yaml
grafana:
  additionalDataSources:
    - name: Loki
      type: loki
      url: http://loki-gateway.logging.svc.cluster.local
```
