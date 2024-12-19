---
title: TLS Certificate Management with Cert-Manager in Kubernetes
permalink: /docs/6-certificate-management/1-tls-certificates-cert-manager
description: How to deploy a centralized TLS certificates management solution based on Cert-Manager in PiKube Kubernetes cluster.
last_modified_at: "14-11-2023"
---

<p align="center">
    <img alt="cert-manager"
    src="../resources/certificate-management/cert-manager.svg"
    width="40%"
    height="%">
</p>

**`Cert-Manager`** is a powerful tool in Kubernetes for automating the management of **`TLS certificates`**. It facilitates the process of obtaining, renewing, and utilizing certificates by introducing certificates and certificate issuers as Kubernetes resource types. Here's an overview of how to use **`Cert-Manager`** effectively:

**Features of Cert-Manager:**

- **`Automates Certificate Management`**

  Handles tasks like issuing certificate requests, renewals, etc.

- **`Supports Various Issuers`**
  
  Can issue certificates from multiple sources, including self-signed certificates and external CAs like Let’s Encrypt.

- **`Automatic Renewal`**

  Ensures certificates are valid and up-to-date, renewing them before expiry.

- **`Updates Kubernetes Secrets`**

  Maintains the Kubernetes Secrets that store key pairs used by Ingress resources for securing incoming traffic.

## Configuring Cert-Manager for TLS Certificate Issuance in Kubernetes

**`Cert-Manager`** in Kubernetes automates the process of managing TLS certificates, supporting various types of issuers to generate signed TLS certificates. Here's an overview of configuring and using different issuers in **`Cert-Manager`**:

### Self-Signed Issuer

- Used for creating self-signed certificates.
- Ideal for bootstrapping a root certificate for a custom Public Key Infrastructure (PKI).

### CA Issuer

- Represents a Certificate Authority within the cluster.
- Its certificate and private key are stored as a Kubernetes Secret.
- Useful for internal PKI setups for mTLS and infrastructure component security.

### ACME Issuer (e.g., Let's Encrypt)

- For obtaining validated TLS certificates from an ACME CA such as Let's Encrypt.
- Suitable for externally exposed services requiring trusted certificates.

### Install Cert-Manager Custom Resource Definitions (CRDs)

Ensure **`Cert-Manager`** and its CRDs are installed in the pi-cluster. CRDs define custom resources like Certificate for **`Cert-Manager`**.

**`Cert-Manager`** can be installed with CRDs using Helm or kubectl. Here's how to do it with Helm:

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager  --namespace cert-manager  --create-namespace  --set installCRDs=true  --kubeconfig /home/pi/.kube/config.yaml
```

- Verify the Installation by checking the Cert-Manager Pods

```bash
kubectl --kubeconfig /home/pi/.kube/config.yaml get pods --namespace cert-manager
```

- Check the CRDs

```bash
kubectl --kubeconfig /home/pi/.kube/config.yaml get crd | grep cert-manager.io
```

Once Cert-Manager and its CRDs installation is confirmed, reapply **`traefik-certificate.yaml`** if needed

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f traefik-certificate.yaml
```

After reapplying, check to ensure that the Certificate resource is successfully created

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n traefik get certificate
```

### Self-Signed Issuer Configuration (Custom CA)

To set up a **`Public Key Infrastructure`** (PKI) using **`Cert-Manager`** in the pi-cluster, a **`custom Certificate Authority`** (CA) will be created and used to auto-sign certificates. This involves creating a **`self-signed ClusterIssuer`** for the **`root CA`** certificate and then **`bootstrapping CA issuers`** with this root certificate.

Here’s how to do it step-by-step:

- Create a **`self-signed ClusterIssuer`**

ClusterIssuer Manifest, **`self-signed-clusterissuer.yaml`**, defines a ClusterIssuer that can issue self-signed certificates

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
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f self-signed-clusterissuer.yaml
```

- Bootstrap CA Issuers for the private PKI and create a CA issuer in **`Cert-Manager`** that references this root certificate.

Certificate Manifest for Root CA, **`selfsigned-ca-certificate.yaml`**, to create a Certificate resource that will be used as a root CA

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
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f selfsigned-ca-certificate.yaml
```

- ClusterIssuer Manifest for CA Issuer, **`ca-clusterissuer.yaml`**, defines a ClusterIssuer that uses the root CA certificate

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
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f ca-clusterissuer.yaml
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

## Installing Trust Manager in Kubernetes

**`Trust Manager`** is an operator designed to distribute trust bundles across a Kubernetes cluster, working alongside cert-manager. It facilitates services in trusting X.509 certificates issued by cert-manager's Issuers, by distributing data (like CA certificates) from the trust namespace.

**Key Features of Trust Manager:**

- **`Cluster-Scope Bundle Resource`**

  Trust Manager uses a single cluster-scoped resource called Bundle. This resource represents a set of data (like a ConfigMap or Secret) from the trust namespace that should be distributed cluster-wide.

- **`Complements Cert-Manager`**

  It extends cert-manager's functionality by enabling the broader distribution of trust bundles (like root CAs) created by cert-manager.

**`Trust Manager`** can be installed using Helm in **`cert-manager`** namespace

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install trust-manager jetstack/cert-manager --namespace cert-manager --kubeconfig /home/pi/.kube/config.yaml
```

Check the Trust Manager Pods

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n cert-manager get pods
```

## Configuring Let's Encrypt Certificates with Cert-Manager in Kubernetes

**`Let's Encrypt`** provides publicly validated TLS certificates for free, eliminating the need for self-signed certificates. Cert-Manager automates the process of requesting, renewing, and using these certificates in Kubernetes.

**Understanding Let's Encrypt with Cert-Manager:**

- Issue a certificate request to Let’s Encrypt for a domain you own.
- Let’s Encrypt verifies domain ownership via ACME DNS or HTTP validation.
- On successful verification, Let’s Encrypt issues the certificates.
- Cert-manager automatically renews these certificates.

**DNS Validation with Let’s Encrypt:**

- Preferred for scenarios where services aren’t exposed to the public internet.
- Involves creating a DNS TXT record for domain verification.
- Cert-manager handles DNS record creation and validation.

### Configuring Cert-Manager with Cloudflare for Let's Encrypt

- Create a Kubernetes secret with Cloudflare API token **`cloudflare-api-token-secret.yaml`**. Replace **`your-cloudflare-api-token`** and **`your-cloudflare-email`** with the actual Cloudflare API token findable in [**`API Token Dashboard`**](https://dash.cloudflare.com/profile/api-tokens) and **`Cloudflare`** mail address used.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cloudflare-api-token-secret
  namespace: cert-manager
type: Opaque
stringData:
  api-token: <your-cloudflare-api-token>
  email: <your-cloudflare-email>
```

- Apply Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f cloudflare-api-token-secret.yaml
```

- Check if the secret has been created successfully

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n cert-manager get secret cloudflare-api-token-secret
```

- Define a ClusterIssuer resource with **`Cloudflare`** for **`Let's Encrypt`** in **`cert-manager-letsencrypt-clusterissuer-cloudflare.yaml`**

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-issuer
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: <your-lets-encrypt-email>
    privateKeySecretRef:
      name: letsencrypt-private-key
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token-secret
              key: api-token
```

- Apply Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f cert-manager-letsencrypt-clusterissuer-cloudflare.yaml
```

- Check its creation and readiness

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml describe clusterissuer letsencrypt-issuer
```
