---
title: Databases
permalink: /docs/12-microservices/1-databases
description: How to deploy databases in Kubernetes cluster. Leveraging cloud-native operators such as CloudNative-PostGreSQL or MongoDB
last_modified_at: "13-01-2025"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="cloud-native-db"
    src="../resources/microservices/cloud-native-db.svg"
    width="35%"
    height="%">
</p>

## CloudNative-PostGreSQL

[**`CloudNative-PG`**](https://cloudnative-pg.io/) is a Kubernetes operator designed to manage the complete lifecycle of a highly available PostgreSQL database cluster. It employs a primary/standby architecture with native streaming replication to ensure data redundancy and reliability.

**Key Features**:

- **Open Source**: Licensed under Apache License 2.0.
- **CNCF Sandbox**: Submitted for inclusion in the Cloud Native Computing Foundation (CNCF) Sandbox in April 2022.

> [!Note]
> For more detailed information, refer to [**`Recommended Architectures for PostgreSQL in Kubernetes`**](https://www.cncf.io/blog/2023/09/29/recommended-architectures-for-postgresql-in-kubernetes/).

### Core Capabilities

CloudNative-PG provides a declarative approach to deploying PostgreSQL databases, encompassing the following primary features:

- **Database Initialization**:
  - **Automatic Setup**: Supports the automatic initialization of databases. Detailed information can be found in the [**`CloudNative-PG Bootstrap Documentation`**](https://cloudnative-pg.io/documentation/1.23/bootstrap/).
  - **Data Import**: Facilitates automatic data import from external databases or backups.

- **High Availability (HA)**:
  - **Replication**: Implements data replication from a read-write (RW) instance to read-only (RO) replicas. More details are available in the [**`CloudNative-PG Replication Guide`**](https://cloudnative-pg.io/documentation/1.23/replication/).

- **Backup and Restore**:
  - **S3 Integration**: Supports backup and restoration from S3-compatible object storage solutions such as Minio or AWS S3. Refer to [**`CloudNative-PG Backup on Object Stores`**](https://cloudnative-pg.io/documentation/1.23/backup_barmanobjectstore/) for more information.
  - **Continuous Backup**: Orchestrates a continuous backup infrastructure using the [**`Barman Cloud`**](https://pgbarman.org/) tool.

- **Monitoring**:
  - **Metrics Exporter**: Provides a Prometheus metrics exporter for each PostgreSQL instance, accessible via HTTP on port `9187` under the `metrics` endpoint. Detailed monitoring instructions are available in the [**`CloudNative-PG Monitoring Documentation`**].

### Installing the CloudNative-PG Operator

CloudNative-PG offers multiple installation methods. This guide outlines the Helm-based installation process. For alternative methods, please consult the [**`CloudNative-PG Installation Guide`**](https://cloudnative-pg.io/documentation/1.23/installation_upgrade/).

- Add the CloudNative-PG Helm Repository:

```bash
helm repo add cnpg https://cloudnative-pg.github.io/charts
Update Helm Repositories:
```

```bash
helm repo update
```

- Create the `databases` Namespace:

```bash
kubectl create namespace databases
```

- Create a `cloudnative-pg-values.yaml` value file

```yaml
# Install operator CRDs
crds:
  create: true

monitoring:
  # Disable PodMonitoring by default.
  # It can be enabled per PostgreSQL Cluster resource.
  # Enabling requires Prometheus Operator CRDs.
  podMonitorEnabled: false
  # Create Grafana dashboard configmap for automatic loading by Grafana.
  grafanaDashboard:
    create: true
```

- Install the `CloudNative-PG Operator`

```bash
helm install cloudnative-pg cnpg/cloudnative-pg -f cloudnative-pg-values.yaml --namespace databases
```

- Verify the deployment

```bash
kubectl -n databases get pods
```

### Deploying a PostgreSQL Database

Use the CloudNative-PG operator to create a PostgreSQL Cluster Custom Resource Definition (CRD).

**Creating a Simple PostgreSQL Cluster**:

- Apply the following manifest to deploy a PostgreSQL cluster:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: mydatabase
  namespace: databases
spec:
  instances: 3
  imageName: ghcr.io/cloudnative-pg/postgresql:16.3-4
  storage:
    size: 1Gi
    storageClass: longhorn
  monitoring:
    enablePodMonitor: true
  bootstrap:
    initdb:
      database: mydatabase
      owner: myuser
```

**Details**:

- **Cluster Setup**: Deploys a 3-node PostgreSQL cluster using version `16.3-4`.
- **Database Initialization**: Creates a database named `mydatabase` with `myuser` as the owner.
- **Credentials**: Automatically generates a secret containing the necessary credentials to access the database.

**Auto-Generated Secrets**:

When bootstrapping without specifying a secret, CloudNative-PG generates the following secrets:

- **[cluster name]-app**: Unless an existing secret is provided via `.spec.bootstrap.initdb.secret.name`.
- **[cluster name]-superuser**: If `.spec.enableSuperuserAccess` is enabled and no different secret is specified using `.spec.superuserSecret`.

**Secret Contents**:

- `username`
- `password`
- `host` (read-write service hostname)
- `port`
- `dbname`
- `.pgpass` file. Refer to the [**`Password File documentation`**](https://www.postgresql.org/docs/current/libpq-pgpass.html)
- `uri`
- `jdbc-uri`

For more information, see Secrets for [**`Application Connectivity`**](https://cloudnative-pg.io/documentation/1.23/applications/#secrets).

**To decode the generated secret**:

```bash
kubectl get secret mydatabase-db-app -o json -n databases | jq '.data | map_values(@base64d)'
```

**Sample Output**:

```json
{
  "dbname": "mydatabase",
  "host": "mydatabase-db-rw",
  "jdbc-uri": "jdbc:postgresql://mydatabase-db-rw.databases:5432/mydatabase?password=Vq8d5Ojh9v4rLNCCRgeluEYOD4c8se4ioyaJOHiymT9zFFSNAWpy34TdTkVeoMaq&user=keycloak",
  "password": "Vq8d5Ojh9v4rLNCCRgeluEYOD4c8se4ioyaJOHiymT9zFFSNAWpy34TdTkVeoMaq",
  "pgpass": "mydatabase-db-rw:5432:mydatabase:myuser:Vq8d5Ojh9v4rLNCCRgeluEYOD4c8se4ioyaJOHiymT9zFFSNAWpy34TdTkVeoMaq\n",
  "port": "5432",
  "uri": "postgresql://myuser:Vq8d5Ojh9v4rLNCCRgeluEYOD4c8se4ioyaJOHiymT9zFFSNAWpy34TdTkVeoMaq@mydatabase-db-rw.databases:5432/keycloak",
  "user": "myuser",
  "username": "myuser"
}
```

**Specifying Custom Secrets**:

- To use custom secrets during database bootstrap, create a secret

```yaml
apiVersion: v1
kind: Secret
type: kubernetes.io/basic-auth
metadata:
  name: mydatabase-db-secret
  namespace: databases
  labels:
    cnpg.io/reload: "true"
stringData:
  username: "myuser"
  password: "supersecret"
```

> [!Note]
> The label `cnpg.io/reload: "true"` ensures that ConfigMaps and Secrets are automatically reloaded by cluster instances.

**Define the Cluster with the Custom Secret**:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: mydatabase
  namespace: databases
spec:
  instances: 3
  imageName: ghcr.io/cloudnative-pg/postgresql:16.3-4
  storage:
    size: 1Gi
    storageClass: longhorn
  monitoring:
    enablePodMonitor: true
  bootstrap:
    initdb:
      database: mydatabase
      owner: myuser
      secret:
        name: mydatabase-db-secret
```

### Accessing the Database

**Kubernetes Services for Database Access**:

Upon deployment, three Kubernetes services are automatically created to facilitate database access:

- `[cluster name]-rw`: Points to the primary (read-write) node.
- `[cluster name]-ro`: Routes to replica (read-only) nodes using round-robin.
- `[cluster name]-r`: Distributes connections to any node in the cluster using round-robin.

**Example**:

```bash
kubectl get svc -n databases
NAME                   TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)    AGE
mydatabase-db-r        ClusterIP   10.43.62.218   <none>        5432/TCP   33m
mydatabase-db-ro       ClusterIP   10.43.242.78   <none>        5432/TCP   33m
mydatabase-db-rw       ClusterIP   10.43.133.46   <none>        5432/TCP   33m
```

**Testing Remote Access**:

- To verify remote access to the PostgreSQL database, deploy a test pod

```bash
kubectl run -i --tty postgres --image=postgres --restart=Never -- sh
```

- Connect using `psql`

```bash
psql -U myuser -h mydatabase-db-rw.databases -d mydatabase
```

> [!Note]
> Retrieve the password from the generated database secret.

### Configuring Backups to an External Object Store

- To enable backups to an S3-compatible object store like Minio or AWS S3, setup the Object Store:
  - Create a bucket named `cloudnative-pg`.
  - Configure a user with read-write access.
  - For detailed setup instructions, refer to [**`S3 Backup Backend (Minio)`**](../3-external-services/1-s3-backup-backend-minio-setup.md).

- Create a Secret with Object Store Credentials:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cnpg-minio-secret
  namespace: databases
stringData:
  AWS_ACCESS_KEY_ID: "myuser"
  AWS_SECRET_ACCESS_KEY: "supersecret"
```

- Define the Cluster with Automated Backup:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: mydatabase
spec:
  instances: 3
  imageName: ghcr.io/cloudnative-pg/postgresql:16.3-4
  storage:
    size: 10Gi
    storageClass: longhorn
  monitoring:
    enablePodMonitor: true
  bootstrap:
    initdb:
      database: mydatabase
      owner: myuser
      secret:
        name: mydatabase-db-secret
  backup:
    barmanObjectStore:
      data:
        compression: bzip2
      wal:
        compression: bzip2
        maxParallel: 8
      destinationPath: s3://cloudnative-pg/backup
      endpointURL: https://s3.quantfinancehub.com:9091
      s3Credentials:
        accessKeyId:
          name: cnpg-minio-secret
          key: AWS_ACCESS_KEY_ID
        secretAccessKey:
          name: cnpg-minio-secret
          key: AWS_SECRET_ACCESS_KEY
    retentionPolicy: "30d"
```

## MongoDB Operator

### Installing the MongoDB Community Operator

The MongoDB Community Kubernetes Operator can be installed via multiple methods. This guide outlines the Helm-based installation process. For other methods, refer to the [**`MongoDB Community Operator Installation Guide`**](https://github.com/mongodb/mongodb-kubernetes-operator/blob/master/docs/install-upgrade.md#install-the-operator).

- Add the MongoDB Helm Repository:

```bash
helm repo add mongodb https://mongodb.github.io/helm-charts
```

- Update Helm repositories:

```bash
helm repo update
```

- Create the `mongodb` Namespace:

```bash
kubectl create namespace mongodb
```

- Install the MongoDB Operator:

```bash
helm install community-operator mongodb/community-operator --namespace mongodb --set operator.watchNamespace="*"
```

> [!TIP]
> Setting `operator.watchNamespace="*"` allows the operator to manage MongoDB databases across all namespaces.

- Verify the deployment

```bash
kubectl -n mongodb get pods
```

### Creating a MongoDB Database Cluster

- Create a Secret for the `Admin User` Password

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: admin-user
  namespace: mongodb
type: Opaque
stringData:
  password: s1cret0
```

- Create a `MongoDBCommunity` resource to declaratively define your MongoDB cluster:

```yaml
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: mongodb
  namespace: mongodb
spec:
  members: 3
  type: ReplicaSet
  version: "6.0.11"
  security:
    authentication:
      modes: ["SCRAM"]
  users:
    - name: admin
      db: admin
      passwordSecretRef:
        name: admin-user
      roles:
        - name: clusterAdmin
          db: admin
        - name: userAdminAnyDatabase
          db: admin
      scramCredentialsSecretName: my-scram
  additionalMongodConfig:
    storage.wiredTiger.engineConfig.journalCompressor: zlib
```

**Key Parameters**:

- **spec.members**: Number of replica set members.
- **spec.version**: MongoDB version to deploy.

### Connecting to MongoDB

**Kubernetes Services for MongoDB Access**:

The MongoDB operator creates a headless service named `<metadata.name>-svc`. This service allows DNS queries to resolve to all replica pod IPs. Each MongoDB replica pod can also be accessed individually via DNS using the format `<metadata.name>-<id>` (where `<id>` is the replica number, e.g., `0`, `1`, `2`).

**Access Credentials**:

The operator generates secrets containing connection strings and credentials following the naming convention: `<metadata.name>-<auth-db>-<username>`. For example, for a resource named `mongodb` with an admin user in the `admin` database, the secret would be `mongodb-admin-admin`.

**Retrieve Connection String**:

```bash
kubectl get secret mongodb-admin-admin -n mongodb \
  -o json | jq -r '.data | with_entries(.value |= @base64d)'
```

**Sample Output**:

```json
{
  "connectionString.standard": "mongodb://admin:s1cret0@mongodb-0.mongodb-svc.mongodb.svc.cluster.local:27017,mongodb-1.mongodb-svc.mongodb.svc.cluster.local:27017,mongodb-2.mongodb-svc.mongodb.svc.cluster.local:27017/admin?replicaSet=mongodb&ssl=true",
  "connectionString.standardSrv": "mongodb+srv://admin:s1cret0@mongodb-svc.mongodb.svc.cluster.local/admin?replicaSet=mongodb&ssl=true",
  "password": "s1cret0",
  "username": "admin"
}
```

**Using the Connection String in Applications**:

```bash
containers:
  - name: test-app
    env:
      - name: "CONNECTION_STRING"
        valueFrom:
          secretKeyRef:
            name: mongodb-admin-admin
            key: connectionString.standardSrv
```

**Testing Connectivity with `mongosh`**:

- Access a MongoDB pod

```bash
kubectl -n mongodb exec -it mongodb-0 -- /bin/bash
```

- Connect using `mongosh`:

```bash
mongosh "mongodb+srv://admin:s1cret0@mongodb-svc.mongodb.svc.cluster.local/admin?replicaSet=mongodb&ssl=true"
```

### Securing MongoDB Connections with TLS

To encrypt traffic between MongoDB replicas and client applications, TLS certificates can be configured using `cert-manager`.

- Generate a TLS Certificate with `cert-manager`:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: mongodb-certificate
  namespace: mongodb
spec:
  isCA: false
  duration: 2160h # 90 days
  renewBefore: 360h # 15 days
  dnsNames:
    - mongodb-0.mongodb-svc.mongodb.svc.cluster.local
    - mongodb-1.mongodb-svc.mongodb.svc.cluster.local
    - mongodb-2.mongodb-svc.mongodb.svc.cluster.local
  secretName: mongodb-cert
  privateKey:
    algorithm: RSA
    encoding: PKCS1
    size: 4096
  issuerRef:
    name: letsencrypt-issuer
    kind: ClusterIssuer
    group: cert-manager.io
```

- Update the MongoDB Cluster to use TLS:

```yaml
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: mongodb
  namespace: mongodb
spec:
  members: 3
  type: ReplicaSet
  version: "6.0.11"
  security:
    tls:
      enabled: true
      certificateKeySecretRef:
        name: mongodb-cert
      caCertificateSecretRef:
        name: mongodb-cert
    authentication:
      modes: ["SCRAM"]
  users:
    - name: admin
      db: admin
      passwordSecretRef:
        name: admin-user
      roles:
        - name: clusterAdmin
          db: admin
        - name: userAdminAnyDatabase
          db: admin
      scramCredentialsSecretName: my-scram
  additionalMongodConfig:
    storage.wiredTiger.engineConfig.journalCompressor: zlib
```

- Test TLS connectivity by accessing a MongoDB Pod

```bash
kubectl -n mongodb exec -it mongodb-0 -- /bin/bash
```

- Connect using mongosh with TLS

```bash
mongosh "<connection-string>" --tls --tlsCAFile /var/lib/tls/ca/*.pem --tlsCertificateKeyFile /var/lib/tls/server/*.pem
```

> [!TIP]
> Replace `<connection-string>` with the connection string obtained earlier.

> [!NOTE]
> TLS certificates are automatically mounted in MongoDB pods under the `/var/lib/tls/` directory.
