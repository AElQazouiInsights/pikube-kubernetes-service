---
title: Hasura Finance Application
permalink: /docs/12-microservices/5-finance-app-hasura
description: An end-to-end example deploying Hasura, CloudNative PG, and a yfinance-based CronJob for financial data ingestion.
last_modified_at: "21-01-2025"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="kafka"
    src="../resources/microservices/hasura.svg"
    width="50%"
    height="%">
</p>

## Overview

We’ll build a **financial analytics** platform in a **PiKube Kubernetes Services**:

- **Database**: CloudNative PG (three-node Postgres cluster).
- **Hasura**: A GraphQL engine exposing the Postgres data with automatic CRUD, filters, and relationships.
- **Data Ingestion**: A `CronJob` that uses python `yfinance` modules to pull daily stock data (e.g., from Yahoo Finance) and store it in a `prices` table.

**Result**: By the end, you can open the Hasura console in a web browser, run GraphQL queries to see real-time (using Kafka) or daily financial data, and potentially build a front-end or automated analytics solution on top of this.

## Prerequisites

- **PiKube Kubernetes Service** setup.
- **Storage** ([Longhorn](../8-storage/1-distributed-block-storage-longhorn.md) for PV/PVC).
- [Nginx Ingress](../5-networking/4-ingress-controller-nginx.md) (or another Ingress Controller .e.g [Traefik](../5-networking/3-ingress-controller-traefik.md)) for external traffic.
- [Cert-Manager](../6-certificate-management/1-tls-certificates-cert-manager.md) (for TLS).
- **DNS** record if you want a domain like `hasura.picluster.mydomain.com`.

## CloudNative PG Setup

### Install the CloudNative PG Operator

As mention in [Databases](../12-microservices/1-databases.md) section, let CloudNative PG manage PostgreSQL clusters within your cluster.

```bash
helm repo add cnpg https://cloudnative-pg.github.io/charts
helm repo update

# Create a dedicated namespace for the operator
kubectl create namespace databases

# Minimal values file
cat <<EOF > cloudnative-pg-values.yaml
crds:
  create: true

monitoring:
  podMonitorEnabled: false
  grafanaDashboard:
    create: true
EOF

helm install cloudnative-pg cnpg/cloudnative-pg \
  -n databases \
  -f cloudnative-pg-values.yaml

# Verify
kubectl -n databases get pods
```

### Deploy a PostgreSQL Cluster

- **Create a namespace** for the actual database cluster `quantedge`:

```bash
kubectl create namespace quantedge
```

- Create a secret to store DB credentials:

```yaml
# quantedge-db-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: quantedge-db-secret
  namespace: quantedge
  labels:
    cnpg.io/reload: "true"
type: kubernetes.io/basic-auth
stringData:
  username: "quantedge"
  password: "QuantEdge2025!"
```

```bash
kubectl apply -f quantedge-db-secret.yaml
```

- Define the Postgres Cluster:

```yaml
# quantedge-db-cluster.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: quantedge-db
  namespace: quantedge
spec:
  instances: 3
  imageName: ghcr.io/cloudnative-pg/postgresql:16.3-4
  storage:
    size: 2Gi
    storageClass: longhorn

  bootstrap:
    initdb:
      database: quantedge
      owner: quantedge
      secret:
        name: quantedge-db-secret
```

```bash
kubectl apply -f quantedge-db-cluster.yaml
kubectl -n quantedge get pods -w
```

> [!NOTE]
> Three pods appear. A read/write service at `quantedge-db-rw.quantedge`, read-only at `quantedge-db-ro`, etc.

- Test

```bash
kubectl run -it --rm psqltest \
  --image=postgres:16 \
  -n quantedge --restart=Never -- \
  psql -U quantedge -h quantedge-db-rw.quantedge -d quantedge
# password = QuantEdge2025!
```

## Hasura Installation and Configuration

### Create Hasura Namespace and Secrets

```bash
kubectl create namespace hasura
```

- **Optionally**, store environment in a secret:

```yaml
# hasura-env-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: hasura-env-secret
  namespace: hasura
type: Opaque
stringData:
  HASURA_GRAPHQL_ADMIN_SECRET: "QuantEdgeHasuraAdmin2025!"
  HASURA_GRAPHQL_DATABASE_URL: "postgresql://quantedge:QuantEdge2025!@quantedge-db-rw.quantedge:5432/quantedge"
  HASURA_GRAPHQL_ENABLE_CONSOLE: "true"
  HASURA_GRAPHQL_DEV_MODE: "true"
```

### Hasura Deployment, Service, and Ingress

- We’ll define them in a single `hasura-all.yaml`:

```yaml
---
apiVersion: v1
kind: Namespace
metadata:
  name: hasura
---
apiVersion: v1
kind: Secret
metadata:
  name: hasura-env-secret
  namespace: hasura
type: Opaque
stringData:
  HASURA_GRAPHQL_ADMIN_SECRET: "QuantEdgeHasuraAdmin2025!"
  HASURA_GRAPHQL_DATABASE_URL: "postgresql://quantedge:QuantEdge2025!@quantedge-db-rw.quantedge:5432/quantedge"
  HASURA_GRAPHQL_ENABLE_CONSOLE: "true"
  HASURA_GRAPHQL_DEV_MODE: "true"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hasura
  namespace: hasura
  labels:
    app: hasura
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hasura
  template:
    metadata:
      labels:
        app: hasura
    spec:
      containers:
      - name: hasura
        image: hasura/graphql-engine:v2.43.0
        ports:
          - containerPort: 8080
            name: http
        envFrom:
          - secretRef:
              name: hasura-env-secret

        readinessProbe:
          httpGet:
            path: /healthz
            port: http
          initialDelaySeconds: 15
          periodSeconds: 10
          timeoutSeconds: 1
        livenessProbe:
          httpGet:
            path: /healthz
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 1

---
apiVersion: v1
kind: Service
metadata:
  name: hasura
  namespace: hasura
  labels:
    app: hasura
spec:
  selector:
    app: hasura
  ports:
    - name: http
      port: 80
      targetPort: 8080
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hasura
  namespace: hasura
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-issuer"
spec:
  rules:
    - host: hasura.picluster.quantfinancehub.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: hasura
                port:
                  number: 80
  tls:
    - secretName: hasura-tls
      hosts:
        - hasura.picluster.quantfinancehub.com
```

- Apply it:

```bash
kubectl apply -f hasura-all.yaml
```

### Verify and Access Hasura

- **Check**: `kubectl get pods -n hasura`. The Hasura pod should be Running.
- **Ingress**:
  - `kubectl get ingress -n hasura`.
  - Should have `hasura.picluster.quantfinancehub.com` → an IP from `Nginx/MetalLB`.
- **Open**: `https://hasura.picluster.quantfinancehub.com/console`.
  - **Admin Secret** = `QuantEdgeHasuraAdmin2025!` (or from your secret).
  - Root path (`/`) may yield {"error":"resource does not exist"}, but `/console` is your admin UI.

## Data Ingestion with yfinance

### Create `prices` Table in Postgres

From a `psql` pod or via `Hasura` UI:

```bash
kubectl run -it --rm psqltest \
  --image=postgres:16 \
  -n quantedge --restart=Never -- \
  psql -U quantedge -h quantedge-db-rw.quantedge -d quantedge
```

```sql
CREATE TABLE prices (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  date DATE NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC,
  volume BIGINT,
  inserted_at TIMESTAMP DEFAULT now()
);
```

### CronJob to Fetch Market Data and Insert into `prices`

- Below is a CronJob, `market-data-cronjob.yaml`, that, **every day at 2 AM**, installs `yfinance` and `psycopg2-binary`, then downloads `TSLA` (Tesla stock) data from Yahoo Finance to insert into `prices`.

```yaml
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: market-data-cronjob
  namespace: quantedge
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: QuantEdge
              image: python:3.10-slim
              command: ["/bin/sh","-c"]
              args:
                - |
                  apt-get update && \
                  apt-get install -y \
                    gcc libpq-dev python3-pip && \
                  pip3 install --no-cache-dir \
                    psycopg2-binary yfinance && \
                  python -u -c "
                  import os
                  import psycopg2
                  import datetime
                  import yfinance as yf

                  DB_URL = os.getenv('DB_URL')
                  symbol = 'TSLA'

                  data = yf.download(symbol, period='1d')
                  row = data.tail(1)

                  open_ = float(row['Open'].values[0])
                  high_ = float(row['High'].values[0])
                  low_ = float(row['Low'].values[0])
                  close_ = float(row['Close'].values[0])
                  volume_ = int(row['Volume'].values[0])

                  conn = psycopg2.connect(DB_URL)
                  cur = conn.cursor()
                  cur.execute(
                    'INSERT INTO prices(symbol, date, open, high, low, close, volume) '
                    'VALUES (%s, %s, %s, %s, %s, %s, %s)',
                    (
                      symbol,
                      datetime.date.today().isoformat(),
                      open_,
                      high_,
                      low_,
                      close_,
                      volume_
                    )
                  )
                  conn.commit()
                  cur.close()
                  conn.close()
                  "
              env:
                - name: DB_URL
                  value: "postgresql://quantedge:QuantEdge2025!@quantedge-db-rw.quantedge:5432/quantedge"
```

- Apply:

```bash
kubectl apply -f market-data-cronjob.yaml
```

### Verify Ingestion

- Manual Trigger:

```bash
kubectl create job --from=cronjob/market-data-cronjob market-data-manual -n quantedge
kubectl logs job/market-data-manual -n quantedge
```

- **Check Data**:
  - **Hasura**:
    - Track the `prices` table if it’s not already visible:
      - Go to the `Data` tab.
      - Find `public.prices` under `Untracked Tables/Views`.
      - Click `Track`.
    - Then run a `GraphQL` query in the `API/GraphiQL` tab:

      ```graphql
      query checkPrices {
      prices(order_by: { date: desc }, limit: 5) {
          symbol
          date
          open
          high
          low
          close
          volume
      }
      }
      ```

    - View the results:

      ```graphql
      {
      "data": {
          "prices": [
          {
              "symbol": "TSLA",
              "date": "2025-01-21",
              "open": 432.80999755859375,
              "high": 432.9845886230469,
              "low": 406.30999755859375,
              "close": 424.07000732421875,
              "volume": 85533549,
              "updated_at": "2025-01-21T21:49:20.57114"
          },
          {
              "symbol": "TSLA",
              "date": "2025-01-20",
              "open": 120.2,
              "high": 125.5,
              "low": 119.8,
              "close": 124.3,
              "volume": 5000000,
              "updated_at": "2025-01-20T22:57:37.842864"
          }
          ]
      }
      }
      ```

  - **psql**:
    - Run a temporary psql pod and run the query:

        ```bash
        kubectl run -it --rm psqltest \
        --image=postgres:16 \
        --restart=Never \
        -n quantedge -- \
        psql -U quantedge -h quantedge-db-rw.quantedge -d quantedge \
        -c "SELECT * FROM prices ORDER BY date DESC LIMIT 5;"
        ```
