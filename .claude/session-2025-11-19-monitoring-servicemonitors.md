PiKube — Monitoring ServiceMonitors & Ingress Refinement Session (2025-11-19)

## Goals

- Stabilize kube-prometheus-stack exposure behind NGINX (Grafana, Prometheus, Alertmanager).
- Ensure Grafana dashboards work correctly behind subpaths and TLS.
- Activate Prometheus scraping for key platform services (Ingress NGINX, Longhorn, External-DNS, Volcano).
- Align `docs/9-monitoring/7-monitoring-prometheus.md` with the live cluster so users can copy-paste values/manifests.

---

## 1) Monitoring ingress refactor and Grafana/Prometheus alignment

Cluster changes:

- Updated `prometheus-monitoring-ingress.yaml` and applied it:
  - `ingress-grafana`, `ingress-prometheus`, `ingress-alertmanager` now use:
    - `path: /grafana`, `path: /prometheus`, `path: /alertmanager`.
    - `pathType: Prefix`, no regex and no `rewrite-target`.
    - `monitoring-tls` TLS secret issued by cert-manager.
  - Prometheus ingress keeps basic auth via `basic-auth-secret` (Vault + ESO pattern).

- Patched Prometheus and Alertmanager CRs:
  - `Prometheus kube-prometheus-stack-prometheus`:
    - `spec.externalUrl = https://monitoring.picluster.quantfinancehub.com/prometheus/`
    - `spec.routePrefix = /prometheus`
  - `Alertmanager kube-prometheus-stack-alertmanager`:
    - `spec.externalUrl = https://monitoring.picluster.quantfinancehub.com/alertmanager/`
    - `spec.routePrefix = /alertmanager`

- Patched Grafana deployment (`kube-prometheus-stack-grafana`):
  - Added env:
    - `GF_SERVER_ROOT_URL = https://monitoring.picluster.quantfinancehub.com/grafana/`
    - `GF_SERVER_SERVE_FROM_SUB_PATH = true`
  - Result: `https://monitoring.picluster.quantfinancehub.com/grafana/` works without redirect loops.

- Updated Grafana datasource ConfigMap:
  - `ConfigMap kube-prometheus-stack-grafana-datasource` in `monitoring`:
    - `Prometheus` URL:
      - `http://kube-prometheus-stack-prometheus.monitoring:9090/prometheus/`
    - `Alertmanager` URL:
      - `http://kube-prometheus-stack-alertmanager.monitoring:9093/alertmanager/`
  - Restarted Grafana so dashboards reload datasources.
  - Result: built-in Kubernetes dashboards now show data (no `404 page not found` in panels).

Doc changes:

- `docs/9-monitoring/7-monitoring-prometheus.md`:
  - Helm values snippet updated:
    - `prometheus.prometheusSpec.externalUrl` + `routePrefix` set to `/prometheus`.
    - `alertmanager.alertmanagerSpec.externalUrl` + `routePrefix` set to `/alertmanager`.
    - `grafana.grafana.ini.server.root_url` set to `https://monitoring.picluster.quantfinancehub.com/grafana/` with `serve_from_sub_path: true`.
  - Ingress manifest example now matches the applied YAML:
    - Clean prefixes (`/grafana`, `/prometheus`, `/alertmanager`), no regex rewrites.
  - New “Aligning Grafana datasources with Prometheus routePrefix” section:
    - Shows the exact `datasource.yaml` with `/prometheus/` and `/alertmanager/` suffixes.
    - Adds a generic WARNING: whenever routePrefix changes, update Grafana datasource URLs to match.

---

## 2) ServiceMonitor pattern and platform services

General pattern (documented in “Detailed Breakdown of ServiceMonitor Objects”):

1. Ensure the service exposes a metrics endpoint and has stable labels.
2. Ensure there is a Service targeting the metrics port.
3. Create a `ServiceMonitor` in `monitoring` with:
   - `metadata.labels.release: kube-prometheus-stack`.
   - `namespaceSelector.matchNames` pointing at the target namespace.
   - `selector.matchLabels` matching the Service labels.
   - `endpoints[*].port` and `path` matching the metrics port name and HTTP path.

### 2.1 Ingress NGINX ServiceMonitor

Cluster facts:
- Metrics Service: `ingress-nginx-controller-metrics` in namespace `nginx`.
  - Port: `name: metrics`, `port: 10254`.
  - Labels: `app.kubernetes.io/instance: ingress-nginx`, `app.kubernetes.io/name: ingress-nginx`, `app.kubernetes.io/component: controller`.
  - Metrics endpoint: `http://ingress-nginx-controller-metrics.nginx.svc.cluster.local:10254/metrics` → HTTP 200.

Manifests:

- Added `prometheus-nginx-servicemonitor.yaml` at repo root and applied:
  - `metadata: { name: nginx-ingress-monitoring, namespace: monitoring, labels: { release: kube-prometheus-stack } }`
  - `spec.jobLabel: app.kubernetes.io/name`.
  - `spec.selector.matchLabels` on the `ingress-nginx-controller-metrics` labels.
  - `spec.namespaceSelector.matchNames: [nginx]`.
  - `endpoints[0]: { port: metrics, path: /metrics, interval: 30s }`.

Doc alignment:

- `docs/9-monitoring/7-monitoring-prometheus.md` → “Monitoring Ingress NGINX”:
  - Updated ServiceMonitor example to exactly match `prometheus-nginx-servicemonitor.yaml`.

### 2.2 Longhorn ServiceMonitor

Cluster facts:
- Metrics Service: `longhorn-backend` in `longhorn-system`.
  - Port: `name: manager`, `port: 9500`.
  - Labels: `app: longhorn-manager`, `app.kubernetes.io/name: longhorn`.
  - Metrics endpoint: `http://longhorn-backend.longhorn-system.svc.cluster.local:9500/metrics` → HTTP 200.

Manifests:

- Added `prometheus-longhorn-servicemonitor.yaml` and applied:
  - `metadata: { name: longhorn-monitoring, namespace: monitoring, labels: { release: kube-prometheus-stack } }`
  - `spec.jobLabel: app`.
  - `selector.matchLabels.app: longhorn-manager`.
  - `namespaceSelector.matchNames: [longhorn-system]`.
  - `endpoints[0]: { port: manager, path: /metrics, interval: 30s }`.

Doc alignment:

- `docs/9-monitoring/7-monitoring-prometheus.md` → “Monitoring Longhorn”:
  - Fixed namespace in the `kubectl get svc` example (`longhorn-system`).
  - Corrected the manifest name to `prometheus-longhorn-servicemonitor.yaml`.
  - Updated the YAML to use `jobLabel: app`, `port: manager`, `selector.matchLabels.app: longhorn-manager`.

### 2.3 External-DNS ServiceMonitor

Cluster facts:
- Deployment: `external-dns` in namespace `external-dns`.
- Service: `external-dns` (ClusterIP) in `external-dns`:
  - Port: `name: http`, `port: 7979`.
  - Labels: `app.kubernetes.io/instance: external-dns`, `app.kubernetes.io/name: external-dns`.
  - Metrics endpoint: `http://external-dns.external-dns.svc.cluster.local:7979/metrics` → HTTP 200.

Manifests:

- Added `prometheus-external-dns-servicemonitor.yaml` and applied:
  - `metadata: { name: external-dns-monitoring, namespace: monitoring, labels: { release: kube-prometheus-stack } }`
  - `spec.jobLabel: app.kubernetes.io/name`.
  - `selector.matchLabels` on `app.kubernetes.io/instance: external-dns` and `app.kubernetes.io/name: external-dns`.
  - `namespaceSelector.matchNames: [external-dns]`.
  - `endpoints[0]: { port: http, path: /metrics, interval: 30s }`.

Doc alignment:

- `docs/5-networking/6-dns-coredns-and-external-dns-kubernetes.md` already documents enabling `serviceMonitor` in Helm values.
- `docs/9-monitoring/7-monitoring-prometheus.md` → new section “Monitoring External-DNS”:
  - Describes the External-DNS metrics endpoint.
  - Provides the `prometheus-external-dns-servicemonitor.yaml` example and apply command.

### 2.4 Volcano scheduler ServiceMonitor

Cluster facts:
- Service: `volcano-scheduler-service` in `volcano-system`:
  - Port: `name: metrics`, `port: 8080`.
  - Labels: `app: volcano-scheduler`.
  - Annotations include `prometheus.io/scrape: "true"`, but we standardize on ServiceMonitor for Prometheus Operator.
  - Metrics endpoint: `http://volcano-scheduler-service.volcano-system.svc.cluster.local:8080/metrics` → HTTP 200.

Manifests:

- Added `prometheus-volcano-servicemonitor.yaml` and applied:
  - `metadata: { name: volcano-scheduler-monitoring, namespace: monitoring, labels: { release: kube-prometheus-stack } }`
  - `spec.jobLabel: app`.
  - `selector.matchLabels.app: volcano-scheduler`.
  - `namespaceSelector.matchNames: [volcano-system]`.
  - `endpoints[0]: { port: metrics, path: /metrics, interval: 30s }`.

Doc alignment:

- `docs/9-monitoring/7-monitoring-prometheus.md` → new section “Monitoring Volcano Scheduler”:
  - Explains the metrics endpoint and service.
  - Provides the `prometheus-volcano-servicemonitor.yaml` example and apply command.
  - Complements the more detailed Volcano-specific doc in `docs/4-kubernetes/3-volcano-scheduler.md`.

---

## 3) Current monitoring state (end of 2025-11-19)

- kube-prometheus-stack:
  - Installed in `monitoring`, using Longhorn StorageClass.
  - Ingress via NGINX for `/grafana`, `/prometheus`, `/alertmanager` with TLS + basic auth on Prometheus.
  - Prometheus and Alertmanager route prefixes and external URLs aligned with Ingress paths.
  - Grafana configured to serve from `/grafana` subpath and uses correct root URL.
  - Grafana Prometheus/Alertmanager datasources include `/prometheus/` and `/alertmanager/` in URLs.

- ServiceMonitor coverage:
  - Core stack: Prometheus, Alertmanager, Grafana, kube-state-metrics, node exporter, etc.
  - Additional platform services:
    - Ingress NGINX (controller metrics).
    - Longhorn (manager metrics via longhorn-backend).
    - External-DNS (metrics at :7979/metrics).
    - Volcano scheduler (metrics at :8080/metrics).
  - Docs now provide copy-paste ServiceMonitor manifests for each.

---

## 4) Next steps (monitoring roadmap)

1. **MinIO metrics integration**
   - Follow “Monitoring Minio” section of `docs/9-monitoring/7-monitoring-prometheus.md`:
     - Generate MinIO Prometheus bearer token on `blueberry-master`.
     - Deploy `minio-metrics-service` + `Endpoints` in `kube-system`.
     - Apply `prometheus-minio-servicemonitor.yaml` (Secret + ServiceMonitor).
     - Add/verify Grafana MinIO dashboard ConfigMap.

2. **Elasticsearch and logging stack**
   - Use “Elasticsearch Monitoring” and `docs/9-monitoring/5-log-analytics-elasticsearch-kibana.md`:
     - Deploy `prometheus-elasticsearch-exporter`.
     - Apply `prometheus-elasticsearch-servicemonitor.yaml`.
     - Wire Grafana dashboards for Elasticsearch.

3. **K3s component monitoring refinement**
   - Decide final strategy for kube-apiserver, kube-controller-manager, kube-scheduler, kube-proxy, kubelet:
     - Either rely on kube-prometheus-stack defaults, or keep them disabled and apply the more PiKube-specific ServiceMonitors documented later in `docs/9-monitoring/7-monitoring-prometheus.md`.

4. **Service mesh and app-level metrics**
   - Once the platform-level metrics are stable:
     - Integrate Linkerd metrics using `ServiceMonitor`/`PodMonitor` as per `docs/12-microservices/2-service-mesh-linkerd.md`.
     - Start adding application-specific ServiceMonitors (finance app, databases, etc.) as described in the microservices docs.

