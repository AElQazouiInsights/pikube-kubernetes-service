# PiKube Session – 2025-11-21 – Bitnami Deprecation Decision

## Context

- Recent attempts to deploy **Keycloak** via the **Bitnami Helm chart** failed with `ErrImagePull` for images like:
  - `docker.io/bitnami/keycloak:26.3.3-debian-12-r0`
  - `docker.io/bitnami/keycloak:26.2.4-debian-12-r0`
- Root cause: Bitnami has moved most of its images (including `bitnami/keycloak`, `bitnami/minio`, etc.) behind a **paid “Secure Images”** subscription. Those tags are no longer available from the public Docker Hub in a homelab context.
- This explains past instability / failures seen with Bitnami-based MinIO as well.

## Decision

**Project-wide rule:**

- **All Bitnami-based dependencies are to be considered deprecated/unsupported for PiKube.**
- This applies to:
  - Bitnami container images (`docker.io/bitnami/*`)
  - Bitnami Helm charts that depend on those images (Keycloak, MinIO, etc.)
- Going forward:
  - Prefer **official upstream images** (e.g. `quay.io/keycloak/keycloak`, `quay.io/minio/minio`) and/or
  - Community Helm charts / operators that use upstream images, not Bitnami.

## Keycloak Plan

- **Do not use** `bitnami/keycloak` chart anymore, even pinned.
- Adopt the **Keycloak Operator + upstream image** path as described in external docs:
  - Install CRDs/operator from `keycloak/keycloak-k8s-resources` for the current Keycloak version.
  - Use **CloudNativePG** for the Keycloak Postgres database.
  - Import `picluster` realm from `pikube-argocd/gitops/platform/security/keycloak/picluster-realm.json` via `KeycloakRealmImport` or equivalent.
  - Expose Keycloak via NGINX Ingress at `sso.picluster.quantfinancehub.com`.
- Any existing Bitnami-specific config (e.g. `keycloak-values.yaml` using Bitnami) is now **legacy** and should be replaced by the operator-based approach when SSO work is completed.

## MinIO Plan

- Treat any legacy usage of **Bitnami MinIO charts/images** as deprecated.
- Current direction is already aligned with this decision:
  - External MinIO on `blueberry-master` is a bare-metal install using the official MinIO binary.
  - In-cluster **MinIO HA Tenant** uses the **MinIO Operator** and upstream MinIO images (not Bitnami), on top of Longhorn NVMe storage.
- GitOps/Helm references to Bitnami MinIO (if any remain in `pikube-argocd`) should be removed or migrated to the MinIO Operator pattern.

## OAuth2-Proxy & SSO

- OAuth2-Proxy is being wired against **Keycloak OIDC** using:
  - `oidc_issuer_url="https://sso.picluster.quantfinancehub.com/realms/picluster"`
  - Redis-based session storage (chart’s built-in redis subchart) rather than Bitnami Redis.
- OAuth2-Proxy configuration in `github/pikube-kubernetes-service/oauth2-proxy-values.yaml` is now aligned with:
  - Redis session backend (via chart’s `redis.enabled=true` and `sessionStorage.type=redis`).
  - NGINX Ingress at `oauth2-proxy.picluster.quantfinancehub.com`.
- OAuth2-Proxy currently fails only because Keycloak is not yet available; once the new operator-based Keycloak is up, the OIDC discovery error should disappear.

## Documentation Actions (Future Work)

- **Docs to update away from Bitnami:**
  - `docs/7-single-sign-on/1-sso-with-keycloak-and-oauth2-proxy.md`  
    - Remove Bitnami-specific Keycloak install instructions; replace with Keycloak Operator + upstream Keycloak image flow.
  - Any storage/MinIO docs that reference Bitnami charts/images should be refactored to:
    - Bare-metal MinIO external service.
    - MinIO Operator + Tenant for in-cluster HA object storage.
- GitOps repo (`pikube-argocd`) should, over time, drop `bitnami/*` chart dependencies in favour of upstream or operator-based solutions.

---

## Implementation Status – 2025-11-21 Evening

### Keycloak (Operator + CloudNativePG)

- **Operator:** `quay.io/keycloak/keycloak-operator:26.4.5` running in `keycloak` namespace with CRDs `keycloaks.k8s.keycloak.org` and `keycloakrealmimports.k8s.keycloak.org`.
- **Database:** CloudNativePG cluster `keycloak-db` in `keycloak`:
  - `instances: 3`, `imageName: ghcr.io/cloudnative-pg/postgresql:16.3-4`, `storageClass: longhorn`, backups to `s3://k3s-barman/keycloak-db` on MinIO.
  - Credentials stored in Vault at `secret/postgres/keycloak` and projected via `ExternalSecret keycloak-db-credentials` into `keycloak-db-secret`.
- **Admin user:** Vault path `secret/keycloak/admin` now canonical:
  - Fields: `username`, `password` (and `admin-password` kept for compatibility).
  - Synced into `keycloak-admin-secret` via `ExternalSecret keycloak-admin-credentials`.
- **Keycloak CR:** `keycloak.yaml` applied as `Keycloak/picluster-keycloak`:
  - `hostname.hostname: sso.picluster.quantfinancehub.com`.
  - `http.httpEnabled: true`, `httpPort: 8080` (TLS at NGINX).
  - `db.*` wired to `keycloak-db-rw.keycloak.svc.cluster.local` with secrets from `keycloak-db-secret`.
  - `bootstrapAdmin.user.secret: keycloak-admin-secret`.

### Realm Import

- `KeycloakRealmImport/picluster-realm` created in `keycloak` with `spec.realm` loaded from:
  - `/home/quantstacker/pikube-argocd/gitops/platform/security/keycloak/picluster-realm.json`.
- Import job completed successfully:
  - Realm `picluster` present with clients for:
    - OAuth2-Proxy (`${PROXY_OAUTH_CLIENT_ID}`),
    - Grafana (`${GRAFANA_OAUTH_CLIENT_ID}`),
    - ArgoCD (`${ARGOCD_OAUTH_CLIENT_ID}`),
  - Realm roles and the admin user (`${PI_ADMIN_USERNAME}` / `${PI_ADMIN_PASSWORD}` placeholders).

### Keycloak Ingress, DNS and TLS

- Operator-created Ingress `picluster-keycloak-ingress` patched to integrate with cluster ingress stack:
  - `ingressClassName: nginx`.
  - `cert-manager.io/cluster-issuer: letsencrypt-issuer`.
  - `cert-manager.io/common-name: sso.picluster.quantfinancehub.com`.
  - `external-dns.alpha.kubernetes.io/hostname: sso.picluster.quantfinancehub.com`.
  - TLS secret: `sso.picluster.quantfinancehub.com-tls`.
- OIDC discovery is now working from outside:
  - `https://sso.picluster.quantfinancehub.com/realms/picluster/.well-known/openid-configuration` → HTTP 200.
  - Issuer currently advertised as `http://sso.picluster.quantfinancehub.com/realms/picluster` (Keycloak internal hostname), so oauth2-proxy is configured with that issuer URL.

### OAuth2-Proxy Deployment

- Helm release `oauth2-proxy` installed in namespace `oauth2-proxy` using `oauth2-proxy-values.yaml`:
  - Provider: `keycloak-oidc`.
  - `redirect_url`: `https://oauth2-proxy.picluster.quantfinancehub.com/oauth2/callback`.
  - `oidc_issuer_url`: `http://sso.picluster.quantfinancehub.com/realms/picluster` (matches Keycloak’s advertised issuer).
  - Cookie + client secrets stored in `oauth2-proxy-secret` (created locally, not in Git).
  - Session storage: Redis (`sessionStorage.type=redis`, built-in Redis HA statefulset).
- Ingress `oauth2-proxy`:
  - Host `oauth2-proxy.picluster.quantfinancehub.com`.
  - TLS via `oauth2-proxy-tls`.
  - Annotations: cert-manager + ExternalDNS + NGINX `proxy-buffer-size`.

### Longhorn UI Behind SSO (End-to-End)

- Existing `longhorn-ingress` (namespace `longhorn-system`) was using basic auth with:
  - `nginx.ingress.kubernetes.io/auth-secret: basic-auth-secret`.
  - `nginx.ingress.kubernetes.io/auth-type: basic`.
- Ingress now wired through oauth2-proxy for SSO:
  - Removed basic-auth annotations.
  - Added:
    - `nginx.ingress.kubernetes.io/auth-signin: https://oauth2-proxy.picluster.quantfinancehub.com/oauth2/start?rd=https://$host$request_uri`
    - `nginx.ingress.kubernetes.io/auth-url: http://oauth2-proxy.oauth2-proxy.svc.cluster.local/oauth2/auth`
    - `nginx.ingress.kubernetes.io/auth-response-headers: Authorization`
    - `nginx.ingress.kubernetes.io/proxy-buffer-size: "16k"`.
- Verified HTTP redirect chain:
  1. `https://longhorn.picluster.quantfinancehub.com/` → 302 to `https://oauth2-proxy.picluster.quantfinancehub.com/oauth2/start?...`.
  2. oauth2-proxy → 302 to `http://sso.picluster.quantfinancehub.com/realms/picluster/protocol/openid-connect/auth?...` (which 308-redirects to HTTPS).
  3. User lands on the Keycloak login page for realm `picluster`.
- Result: Longhorn UI access is now protected by **Keycloak + OAuth2-Proxy** instead of static basic auth.

### Documentation Updates Completed

- `docs/7-single-sign-on/1-sso-with-keycloak-and-oauth2-proxy.md`:
  - Rewritten around Keycloak Operator + CloudNativePG (no Bitnami).
  - References `docs/12-microservices/1-databases.md` for the generic CloudNativePG pattern.
  - Shows ESO + Vault patterns for `keycloak-admin-secret` and `keycloak-db-secret`.
  - Updated oauth2-proxy example to match the live values (Redis, issuer URL, ExternalDNS annotations).
  - Ingress examples now reflect:
    - Operator-managed `picluster-keycloak-ingress`.
    - SSO wiring for arbitrary UIs (Longhorn used as concrete example).
- `docs/12-microservices/1-databases.md`:
  - Minor correction in the sample secret JSON to use `mydatabase` / `myuser` consistently instead of leftover `keycloak` references.

---

## Next Steps (Keycloak & SSO)

1. **Harden Keycloak hostname/issuer configuration**
   - Align Keycloak’s advertised issuer with `https://sso.picluster.quantfinancehub.com/realms/picluster` and switch oauth2-proxy back to an HTTPS `oidc_issuer_url`.
   - Confirm all OIDC discovery and token validation still function as expected after this change.

2. **Roll SSO in front of other UIs**
   - Apply the same oauth2-proxy external auth pattern to:
     - Grafana (`monitoring.picluster.quantfinancehub.com/grafana`).
     - Prometheus / Alertmanager endpoints.
     - ArgoCD (`argocd.picluster.quantfinancehub.com`).
   - Update corresponding docs in `docs/9-monitoring` and `docs/11-gitops` to reference the unified SSO front door.

3. **GitOps alignment**
   - Introduce the operator-based Keycloak + CloudNativePG + oauth2-proxy setup into the fresh GitOps repo (rather than the legacy `pikube-argocd` structure).
   - Ensure realm JSON (`picluster-realm.json`) and client secrets are handled via Vault + ESO instead of static manifests.

4. **Clean-up legacy paths**
   - Gradually remove Bitnami-specific artefacts (`keycloak-values.yaml`, old basic-auth‑only Ingress usage) once the new SSO path is fully validated for all UIs.
