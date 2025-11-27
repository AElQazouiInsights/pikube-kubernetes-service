# PiKube Session – 2025-11-26 – Longhorn SSO & Keycloak Sync

## Goals

- Harden Keycloak HTTPS issuer and align oauth2-proxy with it.
- Make Longhorn UI SSO (Keycloak + OAuth2-Proxy) work end-to-end.
- Fix `keycloak-db` CNPG cluster health (all instances Ready).
- Install Loki (logs) in line with docs and wire Grafana to it.
- Capture future GitOps work to keep Keycloak clients and K8s secrets in sync and to extract working configs into IaC + GitOps.

## Work Done

### 1. Keycloak issuer + oauth2-proxy

- Patched `Keycloak/picluster-keycloak` spec:
  - `spec.hostname.hostname: https://sso.picluster.quantfinancehub.com`.
- Verified OIDC discovery document now reports:
  - `issuer: "https://sso.picluster.quantfinancehub.com/realms/picluster"`.
- Updated `ConfigMap oauth2-proxy` in `oauth2-proxy` namespace:
  - `oidc_issuer_url="https://sso.picluster.quantfinancehub.com/realms/picluster"`.
- Restarted `Deployment/oauth2-proxy` and confirmed clean startup + OIDC discovery.

### 2. CloudNativePG keycloak-db backups → MinIO

- On gateway (Vault):
  - Created `secret/minio/keycloak-db` with fields:
    - `user="keycloak-db"`.
    - `key="<random-32-byte-password>"` (stored only in Vault and MinIO).
- On blueberry-master (MinIO):
  - Confirmed `mc` at `/usr/local/bin/mc`.
  - Set alias: `mc alias set PiKubeS3Vault https://s3.quantfinancehub.com:9091 minioadmin supers1cret0`.
  - Created MinIO user: `mc admin user add PiKubeS3Vault keycloak-db <same-password>`.
- In cluster (`keycloak` namespace):
  - Applied `ExternalSecret keycloak-minio-credentials` → `keycloak-minio-secret` with keys:
    - `AWS_ACCESS_KEY_ID = keycloak-db`.
    - `AWS_SECRET_ACCESS_KEY = <random-password>`.
- Updated MinIO policies (blueberry):
  - Ensured bucket `k3s-barman` exists.
  - Created `/etc/minio/policy/keycloak-db_policy.json` with RW on:
    - `arn:aws:s3:::k3s-barman`.
    - `arn:aws:s3:::k3s-barman/*`.
  - Ran:
    - `mc admin policy create PiKubeS3Vault keycloak-db /etc/minio/policy/keycloak-db_policy.json`.
    - `mc admin policy attach PiKubeS3Vault keycloak-db --user keycloak-db`.
- Verified using the same password as CNPG:
  - Created alias `keycloak-db-user` with `keycloak-db` credentials.
  - `mc ls keycloak-db-user/k3s-barman` succeeded (no 403).
- Restarted old primary pod `keycloak-db-1`:
  - Logs showed WAL replay, then:
    - `consistent recovery state reached`.
    - `database system is ready to accept read-only connections`.
  - After a short delay:
    - `keycloak-db-1` became `1/1 Running`.
    - `Cluster keycloak-db` reports:
      - `INSTANCES: 3`, `READY: 3`, `STATUS: Cluster in healthy state`.

### 3. Longhorn UI SSO – behaviour + docs

- Confirmed `longhorn-ingress` in `longhorn-system` is wired through oauth2-proxy:
  - `auth-signin` and `auth-url` annotations match the SSO doc.
- Root cause for "Client not found":
  - Keycloak realm `picluster` had **no client** with `clientId="oauth2-proxy"`.
  - oauth2-proxy used `client-id=oauth2-proxy` → Keycloak returned "Client not found".
- Fixed via Keycloak Admin API:
  - Used `keycloak-admin-secret` to obtain admin token (`admin-cli` on `master` realm).
  - Created `clientId="oauth2-proxy"` in realm `picluster` with:
    - Redirect URI `https://oauth2-proxy.picluster.quantfinancehub.com/oauth2/callback`.
    - Web origin `https://oauth2-proxy.picluster.quantfinancehub.com`.
    - `standardFlowEnabled=true`, `directAccessGrantsEnabled=false`.
    - Attributes including `pkce.code.challenge.method=S256`.
  - Retrieved its generated secret via `/admin/realms/picluster/clients/{id}/client-secret`.
  - Patched `Secret oauth2-proxy-secret` in `oauth2-proxy` namespace so:
    - `client-id="oauth2-proxy"` (base64).
    - `client-secret` matches Keycloak’s current secret.
  - Restarted `Deployment/oauth2-proxy` and confirmed healthy rollout.
- Updated Longhorn doc `docs/8-storage/1-distributed-block-storage-longhorn.md`:
  - Restored basic-auth as **Step 3** (bootstrap flow) using:
    - `nginx.ingress.kubernetes.io/auth-type: basic`.
    - `nginx.ingress.kubernetes.io/auth-secret: basic-auth-secret`.
  - Reintroduced basic-auth `ExternalSecret` example for `basic-auth-secret` from Vault (`secret/ingress/basic_auth`).
  - Added **Step 4** for migrating to SSO (Keycloak + OAuth2-Proxy), showing:
    - Required Keycloak `oauth2-proxy` client shape in realm `picluster`.
    - SSO annotations that match the live `longhorn-ingress`.

## GitOps Alignment – Future Work

### 1. Align picluster-realm.json with live oauth2-proxy client

- `pikube-argocd/gitops/platform/security/keycloak/picluster-realm.json` already contains a templated "Proxy OAuth 2.0" client:
  - `clientId: "${PROXY_OAUTH_CLIENT_ID}"`.
  - Redirects/WebOrigins targeting `oauth2-proxy.picluster.quantfinancehub.com`.
- Live Keycloak client (exported from cluster) has:
  - `clientId: "oauth2-proxy"`.
  - `protocol: "openid-connect"`, `publicClient: false`.
  - `standardFlowEnabled: true`, `directAccessGrantsEnabled: false`.
  - `redirectUris` + `webOrigins` as above.
  - Attributes:
    - `"pkce.code.challenge.method": "S256"`.
    - `"backchannel.logout.session.required": "true"`, etc.
  - Optional client scopes: `["offline_access"]`.
- **Action (GitOps step):**
  - Update the "Proxy OAuth 2.0" client in `picluster-realm.json` to:
    - Use `clientId: "oauth2-proxy"`.
    - `secret: "${PROXY_OAUTH_CLIENT_SECRET}"`.
    - Include the same attributes and flags as the live client.

### 2. Helper script: sync Keycloak client secret → Kubernetes Secret

Once we move fully to GitOps for security components:

- **Goal:** keep the `oauth2-proxy` Keycloak client and the `oauth2-proxy-secret` Kubernetes Secret in lockstep so SSO never breaks due to secret drift.

- **Plan for helper script in GitOps repo:**
  - Implement a small script (e.g. Python or Bash) in the GitOps tooling that:
    1. Reads the desired client secret value from:
       - GitOps-managed secret (e.g. SOPS-encrypted values file or Vault path used for `${PROXY_OAUTH_CLIENT_SECRET}`), or
       - Directly from Keycloak via Admin API (less ideal for pure GitOps).
    2. Ensures `picluster-realm.json`’s `"secret"` for the `oauth2-proxy` client matches that value.
    3. Ensures the Kubernetes `Secret/oauth2-proxy-secret` data:
       - `client-id: "oauth2-proxy"` (base64).
       - `client-secret: <base64(secret)>`.
  - Integrate this script into:
    - A GitOps pipeline step (pre‑apply) or
    - A periodic reconciliation job, once the dedicated GitOps repo is in place.

> This session: **recorded decision** to build this helper script when we get to the dedicated GitOps repo build-out, so Keycloak’s `oauth2-proxy` client and `oauth2-proxy-secret` remain consistent without manual UI edits.

### 3. Future SSO Work – MinIO, Loki, Tempo

- **MinIO (console at `minio.picluster.quantfinancehub.com`)**
  - Current state:
    - Ingress `minio-console-ingress` now wired through OAuth2‑Proxy/Keycloak at the edge (same pattern as Longhorn).
    - MinIO still prompts for its own credentials (`root` / `supers1cret0`) – i.e. SSO is layered in front, but MinIO itself is not using OIDC yet.
  - Future plan:
    1. Define a dedicated Keycloak client for MinIO (realm `picluster`) with appropriate redirect URIs and roles.
    2. Configure MinIO Tenant / console to use Keycloak OIDC directly (MINIO_IDENTITY_OPENID_* env vars or Tenant spec fields).
    3. Once validated, optionally drop the internal MinIO username/password login in favour of pure SSO for console access.
    4. Update `docs/3-external-services/1-s3-backup-backend-minio-setup.md` with a two-step story:
       - Step 1: basic-auth or root user only.
       - Step 2: pure SSO via Keycloak OIDC (no second login).

- **Loki & Tempo**
  - Goal:
    - Validate that Loki and Tempo are configured according to their docs (including MinIO credentials via ExternalSecrets).
    - Wire their UIs (Grafana paths, Tempo queries) through the same SSO front door pattern if/where applicable.
  - Plan (once current SSO pieces are stable):
    1. **Loki (DONE in this session):**
       - Reused `secret/minio/loki` in Vault for Loki’s MinIO credentials.
       - Created `namespace/logging`.
       - Added `ExternalSecret loki-minio-credentials` in `logging` → `Secret loki-minio-secret` (`MINIO_ACCESS_KEY_ID=loki`, `MINIO_SECRET_ACCESS_KEY=supers1cret0`).
       - Created `loki-values.yaml` using:
         - `deploymentMode: SimpleScalable`.
         - S3 backend: `endpoint: s3.picluster.quantfinancehub.com:9091`, bucket `k3s-loki`, credentials via env from `loki-minio-secret`.
         - Write/read/backend replicas on Longhorn storage.
         - `minio.enabled: false`, self-monitoring/test disabled.
       - Installed Loki with:
         - `helm install loki grafana/loki -f loki-values.yaml -n logging`.
       - Verified pods in `logging`:
         - `loki-backend`, `loki-write`, `loki-read`, `loki-gateway`, caches and canaries are Running (some pods on cranberry-worker may still be warming up, but core Loki is healthy).
       - Hooked Grafana to Loki:
         - Updated `ConfigMap kube-prometheus-stack-grafana-datasource` in `monitoring` to add:
           - `datasources[].name: "Loki"`, `type: loki`, `url: http://loki-gateway.logging.svc.cluster.local`.
         - Restarted `Deployment kube-prometheus-stack-grafana` so the new datasource is loaded.
       - Result: Grafana now has a `Loki` datasource pointing at `loki-gateway.logging.svc.cluster.local`, matching the pattern in `docs/9-monitoring/4-log-aggregation-loki.md`.
    2. **Next (Tempo):**
       - Validate Tempo doc (`docs/9-monitoring/8-distributed-tracing-tempo.md`) against the cluster and MinIO state.
       - Install Tempo in a similar fashion (MinIO credentials via Vault + ExternalSecrets, S3 backend configured, hook Grafana Tempo datasource).
    3. **GitOps extraction:**
       - Once Loki and Tempo are stable, extract:
         - `loki-values.yaml`, `tempo-values.yaml`.
         - ExternalSecrets and S3 policies.
       - Move them into the new GitOps repo as Helm/Kustomize apps, keeping the structure aligned with the docs (e.g. `apps/09-monitoring/loki`, `apps/09-monitoring/tempo`).
