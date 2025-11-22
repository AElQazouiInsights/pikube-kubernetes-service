---
title: TLS Certificate Management with cert-manager
permalink: /docs/6-certificate-management/1-tls-certificates-cert-manager
description: Configure cert-manager for PiKube with Let’s Encrypt (Cloudflare DNS‑01) via External Secrets Operator, plus self‑signed fallback.
last_modified_at: "2025-11-09"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="cert-manager"
    src="../resources/certificate-management/cert-manager.svg"
    width="40%"
    height="%">
</p>

cert-manager automates issuing, renewing, and using TLS certificates in Kubernetes. In PiKube, the production default is Let’s Encrypt via the Cloudflare DNS‑01 challenge, with the Cloudflare API token sourced from Vault and synced into Kubernetes by External Secrets Operator (ESO). A self‑signed/CA path is kept for fully private labs.

## PiKube certificate strategy

- Default (production): ACME/Let’s Encrypt using Cloudflare DNS‑01 (token from Vault via ESO)
- Alternative (private/offline): Self‑signed + internal CA issued by cert-manager

### Install cert-manager (with CRDs)

For PiKube we install cert-manager with Helm and pass a small values file so we can keep all settings (including DNS‑01 recursion) in one place.

Example `cert-manager-values.yaml`:

```yaml
installCRDs: true

extraArgs:
  - --dns01-recursive-nameservers=1.1.1.1:53,8.8.8.8:53
  - --dns01-recursive-nameservers-only=true
```

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm upgrade --install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace \
  -f cert-manager-values.yaml \
  --wait

# Verify
kubectl -n cert-manager get deploy,po
kubectl get crd | grep cert-manager.io | wc -l
```

> Note
> PiKube uses NGINX Ingress (Traefik is disabled). Any references to Traefik certificates in older revisions are deprecated.

### Ensure Cloudflare token is available via ESO (Vault → Kubernetes)

ESO should sync the token from Vault path `secret/cert-manager/cloudflare` (field `dns_cloudflare_api_token`) into a Secret named `cloudflare-api-token-secret` with key `api-token` in the `cert-manager` namespace:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cloudflare-api-token-secret
  namespace: cert-manager
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: cloudflare-api-token-secret
    creationPolicy: Owner
  data:
  - secretKey: api-token
    remoteRef:
      key: secret/cert-manager/cloudflare
      property: dns_cloudflare_api_token
```

Verify Secret exists:

```bash
kubectl -n cert-manager get secret cloudflare-api-token-secret -o yaml | grep -E 'name:|api-token'
```

### Create ClusterIssuer for Let’s Encrypt (DNS‑01, Cloudflare)

Use staging first, then production. Replace `quantfinancehub.com` email accordingly.

```yaml
# clusterissuer-letsencrypt-staging.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    email: admin@quantfinancehub.com
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-staging-account-key
    solvers:
    - dns01:
        cloudflare:
          apiTokenSecretRef:
            name: cloudflare-api-token-secret
            key: api-token
```

```yaml
# clusterissuer-letsencrypt.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-issuer
spec:
  acme:
    email: admin@quantfinancehub.com
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-account-key
    solvers:
    - dns01:
        cloudflare:
          apiTokenSecretRef:
            name: cloudflare-api-token-secret
            key: api-token
```

Apply and verify readiness:

```bash
kubectl apply -f clusterissuer-letsencrypt-staging.yaml
kubectl apply -f clusterissuer-letsencrypt.yaml
kubectl get clusterissuer letsencrypt-issuer -o jsonpath='{.status.conditions[*].type} {.status.conditions[*].status} {.status.conditions[*].reason}'
```

> [!NOTE] 🧠 PiKube DNS‑01 and split‑horizon DNS  
> In PiKube, internal DNS (CoreDNS → Bind9) is authoritative for `picluster.quantfinancehub.com`, while the **public ACME TXT records** live in Cloudflare. By default, cert‑manager uses the cluster DNS (`10.43.0.10`), which only queries Bind9 and may not see `_acme-challenge.*` TXT records in Cloudflare, causing `DNS record not yet propagated` errors even when Cloudflare is correct.  
>  
> The `extraArgs` block in `cert-manager-values.yaml` above tells cert‑manager to perform DNS‑01 propagation checks using public recursive DNS instead:
>
> ```yaml
> extraArgs:
>   - --dns01-recursive-nameservers=1.1.1.1:53,8.8.8.8:53
>   - --dns01-recursive-nameservers-only=true
> ```
>
> This keeps in‑cluster service discovery using CoreDNS/Bind9, but makes **ACME DNS‑01 validation** use Cloudflare‑visible resolvers, which matches PiKube’s split‑horizon design.

### Self‑signed / internal CA (optional)

If you don’t have a public domain or want a private PKI, bootstrap a self‑signed root and a CA issuer:

`self-signed-clusterissuer.yaml`

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: self-signed-issuer
spec:
  selfSigned: {}  # Indicates that this issuer is self-signed
```

- Apply the Manifest

```bash
kubectl apply -f self-signed-clusterissuer.yaml
```

`selfsigned-ca-certificate.yaml` (root CA Certificate)

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: selfsigned-ca-certificate
  namespace: cert-manager
spec:
  isCA: true
  commonName: pi-cluster-selfsigned-ca
  secretName: selfsigned-ca-secret
  privateKey:
    algorithm: ECDSA
    size: 256
  issuerRef:
    name: self-signed-issuer
    kind: ClusterIssuer
    group: cert-manager.io
```

Apply the Manifest to create the root CA certificate

```bash
kubectl apply -f selfsigned-ca-certificate.yaml
```

`ca-clusterissuer.yaml` (CA issuer referencing the root)

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: ca-clusterissuer
  namespace: cert-manager
spec:
  ca:
    secretName: selfsigned-ca-secret
```

- Apply the Manifest to create the CA issuer

```bash
kubectl apply -f ca-clusterissuer.yaml
```

To test the setup, create a Test Certificate Manifest, **`test-certificate.yaml`**. This manifest defines a Certificate resource named test-certificate, which will instruct cert-manager to create a TLS certificate with the common name test.example.com, and store it in a Kubernetes Secret named test-certificate-secret

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: test-certificate
  namespace: default  # Or any other namespace you prefer
spec:
  commonName: "test.example.com"  # Replace with a domain of your choice
  secretName: test-certificate-secret
  duration: 24h  # Validity period of the certificate
  renewBefore: 12h
  issuerRef:
    name: picluster-ca-issuer  # Referencing your ClusterIssuer
    kind: ClusterIssuer
```

- Apply Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f test-certificate.yaml
```

- Monitor the Certificate Creation

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n default describe certificate test-certificate
```

- Check the Generated Secret. If the certificate is successfully issued, cert-manager will store the TLS certificate in the specified Secret (test-certificate-secret)

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n default get secret test-certificate-secret
```

- Verify Certificate Details

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n default get secret test-certificate-secret -o yaml
```

## Installing Trust Manager in Kubernetes (optional)

**`Trust Manager`** is an operator designed to distribute trust bundles across a Kubernetes cluster, working alongside cert-manager. It facilitates services in trusting X.509 certificates issued by cert-manager's Issuers, by distributing data (like CA certificates) from the trust namespace.

**Key Features of Trust Manager:**

- **`Cluster-Scope Bundle Resource`**

  Trust Manager uses a single cluster-scoped resource called Bundle. This resource represents a set of data (like a ConfigMap or Secret) from the trust namespace that should be distributed cluster-wide.

- **`Complements Cert-Manager`**

  It extends cert-manager's functionality by enabling the broader distribution of trust bundles (like root CAs) created by cert-manager.

**`Trust Manager`** can be installed using Helm in the **`cert-manager`** namespace:

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm upgrade --install trust-manager jetstack/trust-manager \
  --namespace cert-manager \
  --wait
```

Check the Trust Manager Pods

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n cert-manager get pods
```

## Requesting certificates and wiring Ingress (NGINX)

Example Certificate for a host served by NGINX Ingress (DNS‑01 validation, Secret consumed by the Ingress):

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: argocd-cert
  namespace: argocd
spec:
  dnsNames:
  - argocd.picluster.quantfinancehub.com
  secretName: argocd-tls
  issuerRef:
    name: letsencrypt-issuer
    kind: ClusterIssuer
```

Ingress referencing the TLS Secret (ingress-nginx):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd
  namespace: argocd
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"
spec:
  ingressClassName: nginx
  rules:
  - host: argocd.picluster.quantfinancehub.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: argocd-server
            port:
              number: 443
  tls:
  - hosts:
    - argocd.picluster.quantfinancehub.com
    secretName: argocd-tls
```

Verify status:

```bash
kubectl -n argocd get certificate argocd-cert -o wide
kubectl -n argocd describe challenge | sed -n '1,120p'
kubectl -n nginx get svc ingress-nginx-controller -o wide
```

> Tip
> Start with `letsencrypt-staging` to avoid rate limits; switch `issuerRef.name` to `letsencrypt-issuer` once it’s working.

## Renewal and health

cert-manager auto‑renews ACME certs well before expiry. Confirm controller/webhook Ready and watch events:

```bash
kubectl -n cert-manager get po
kubectl -n cert-manager logs deploy/cert-manager | tail -n 50
kubectl get certificate,order,challenge -A
```
