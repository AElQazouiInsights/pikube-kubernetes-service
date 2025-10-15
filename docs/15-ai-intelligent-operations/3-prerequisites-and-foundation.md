---
title: "Prerequisites and Foundation Setup"
permalink: /15-ai-intelligent-operations/3-prerequisites-and-foundation
description: "Prepare your PiKube cluster for AI agent deployment. Verify requirements, create namespace with RBAC, configure External Secrets integration with Vault, and set up API keys securely."
last_modified_at: 2025-10-15
---

# {{ $frontmatter.title }}

## Overview

This chapter marks the beginning of hands-on implementation. You'll prepare your PiKube cluster for AI agent deployment by verifying requirements, setting up proper security boundaries, and configuring external dependencies.

By the end of this chapter, you'll have:

- ✅ Verified cluster readiness (K3s, observability stack, storage)
- ✅ Created `ai-operations` namespace with proper RBAC
- ✅ Configured External Secrets integration with Vault
- ✅ Stored API keys securely (OpenAI, Anthropic, Slack)
- ✅ Set up initial ConfigMaps for guardrails
- ✅ Prepared development environment (optional)

> [!IMPORTANT]
> **Prerequisites Check**
>
> Before proceeding, ensure you have:
> - PiKube cluster running K3s v1.28+ with 3 masters, 6 workers
> - Prometheus, Loki, Elasticsearch deployed and accessible
> - ArgoCD operational for GitOps deployment
> - HashiCorp Vault deployed on gateway (10.0.0.1:8200)
> - External Secrets Operator installed
> - Longhorn storage class available
> - kubectl access from gateway node

---

## Step 1: Cluster Readiness Verification

Let's verify your cluster meets all requirements before proceeding.

### Verify K3s Cluster Status

```bash
# Check all nodes are ready
kubectl get nodes -o wide

# Expected output:
# NAME                 STATUS   ROLES                  AGE   VERSION
# blueberry-master     Ready    control-plane,master   45d   v1.28.3+k3s1
# strawberry-master    Ready    control-plane,master   45d   v1.28.3+k3s1
# blackberry-master    Ready    control-plane,master   45d   v1.28.3+k3s1
# cranberry-worker     Ready    worker                 45d   v1.28.3+k3s1
# orange-worker        Ready    worker                 45d   v1.28.3+k3s1
# mandarine-worker     Ready    worker                 45d   v1.28.3+k3s1
# lemon-worker         Ready    worker                 45d   v1.28.3+k3s1
# clementine-worker    Ready    worker                 45d   v1.28.3+k3s1
# grapefruit-worker    Ready    worker                 45d   v1.28.3+k3s1

# Check cluster info
kubectl cluster-info

# Check system pods
kubectl get pods -n kube-system
```

### Verify Observability Stack

#### Prometheus

```bash
# Check Prometheus is running
kubectl get pods -n monitoring -l app=prometheus

# Test Prometheus API
kubectl port-forward -n monitoring svc/prometheus 9090:9090 &
curl http://localhost:9090/api/v1/query?query=up

# Expected: {"status":"success", "data": ...}
```

#### Loki

```bash
# Check Loki is running
kubectl get pods -n monitoring -l app=loki

# Test Loki API
kubectl port-forward -n monitoring svc/loki 3100:3100 &
curl http://localhost:3100/ready

# Expected: ready
```

#### Elasticsearch

```bash
# Check Elasticsearch is running
kubectl get pods -n logging -l app=elasticsearch

# Test Elasticsearch API
kubectl port-forward -n logging svc/elasticsearch 9200:9200 &
curl http://localhost:9200/_cluster/health

# Expected: {"cluster_name":"pikube", "status":"green" or "yellow"}
```

> [!NOTE]
> **Yellow status is acceptable**
>
> Elasticsearch showing "yellow" status typically means some replica shards are unassigned, which is normal for small clusters. As long as primary shards are allocated, the agent will function correctly.

### Verify Storage

```bash
# Check Longhorn is deployed
kubectl get pods -n longhorn-system

# Check storage classes
kubectl get storageclass

# Expected output should include:
# NAME                   PROVISIONER          RECLAIMPOLICY   VOLUMEBINDINGMODE
# longhorn (default)     driver.longhorn.io   Delete          Immediate

# Verify available storage on grapefruit-worker
kubectl get nodes grapefruit-worker -o json | \
  jq '.status.allocatable.storage, .status.capacity.storage'
```

### Verify External Secrets Operator

```bash
# Check External Secrets Operator
kubectl get pods -n external-secrets-system

# Check ClusterSecretStore for Vault
kubectl get clustersecretstore

# Expected output should include 'vault-backend'
```

### Verify Vault Connectivity

```bash
# From gateway or any cluster node
curl https://gateway.picluster.quantfinancehub.com:8200/v1/sys/health

# Expected: {"initialized":true,"sealed":false,"standby":false}
```

**Troubleshooting:** If Vault is not accessible:

```bash
# Check Vault status on gateway
ssh pi@gateway.picluster.quantfinancehub.com
sudo systemctl status vault

# Check firewall allows port 8200
sudo nft list ruleset | grep 8200
```

### Readiness Checklist

Before proceeding, confirm all items:

- [ ] All 9 nodes are in `Ready` status
- [ ] Prometheus API responds to queries
- [ ] Loki API responds to health check
- [ ] Elasticsearch cluster status is green or yellow
- [ ] Longhorn storage class exists and is default
- [ ] External Secrets Operator pods are running
- [ ] Vault is accessible from cluster
- [ ] At least 100GB storage available on grapefruit-worker

---

## Step 2: Create Namespace and RBAC

Now let's create the `ai-operations` namespace with proper security boundaries.

### Create Namespace

Create the namespace with Linkerd injection enabled:

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ai-operations
  annotations:
    linkerd.io/inject: enabled  # Enable service mesh
  labels:
    name: ai-operations
    environment: production
    managed-by: argocd
```

Apply the namespace:

```bash
kubectl apply -f namespace.yaml

# Verify
kubectl get namespace ai-operations -o yaml
```

### Create ServiceAccount

The agent needs a ServiceAccount to interact with Kubernetes API:

```yaml
# serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ai-agent-sa
  namespace: ai-operations
  labels:
    app: ai-agent
```

```bash
kubectl apply -f serviceaccount.yaml
```

### Create ClusterRole (Read-Only)

Define permissions the agent needs (read-only for safety):

```yaml
# clusterrole.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ai-agent-reader
  labels:
    app: ai-agent
rules:
  # Pod operations (read-only)
  - apiGroups: [""]
    resources:
      - pods
      - pods/log
      - pods/status
    verbs: ["get", "list", "watch"]

  # Service operations (read-only)
  - apiGroups: [""]
    resources:
      - services
      - endpoints
    verbs: ["get", "list", "watch"]

  # Node operations (read-only)
  - apiGroups: [""]
    resources:
      - nodes
      - nodes/status
    verbs: ["get", "list", "watch"]

  # Event operations (read-only for incident context)
  - apiGroups: [""]
    resources:
      - events
    verbs: ["get", "list", "watch"]

  # Deployment operations (read-only)
  - apiGroups: ["apps"]
    resources:
      - deployments
      - replicasets
      - statefulsets
      - daemonsets
    verbs: ["get", "list", "watch"]

  # ConfigMap and Secret reading (for configuration)
  - apiGroups: [""]
    resources:
      - configmaps
    verbs: ["get", "list"]

  # NO WRITE PERMISSIONS FOR SAFETY
  # Write operations require explicit approval workflow
```

```bash
kubectl apply -f clusterrole.yaml
```

> [!WARNING]
> **Security Principle: Least Privilege**
>
> The agent has NO permissions to:
> - Delete pods, services, or deployments
> - Execute commands in pods (`exec`)
> - Scale deployments
> - Modify configurations
> - Read secrets (except via External Secrets)
>
> This prevents a compromised or malfunctioning agent from causing cluster damage.

### Create ClusterRoleBinding

Bind the role to the ServiceAccount:

```yaml
# clusterrolebinding.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ai-agent-reader-binding
  labels:
    app: ai-agent
subjects:
  - kind: ServiceAccount
    name: ai-agent-sa
    namespace: ai-operations
roleRef:
  kind: ClusterRole
  name: ai-agent-reader
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply -f clusterrolebinding.yaml
```

### Verify RBAC Setup

```bash
# Test if ServiceAccount can list pods
kubectl auth can-i list pods \
  --as=system:serviceaccount:ai-operations:ai-agent-sa

# Expected: yes

# Test if ServiceAccount can delete pods (should be denied)
kubectl auth can-i delete pods \
  --as=system:serviceaccount:ai-operations:ai-agent-sa

# Expected: no

# List all permissions
kubectl auth can-i --list \
  --as=system:serviceaccount:ai-operations:ai-agent-sa
```

---

## Step 3: Configure Vault Secrets

Store API keys securely in HashiCorp Vault, then use External Secrets Operator to sync them to Kubernetes.

### Store Secrets in Vault

SSH into the gateway where Vault is running:

```bash
ssh pi@gateway.picluster.quantfinancehub.com
```

Store OpenAI API key:

```bash
# Replace with your actual OpenAI API key
export OPENAI_API_KEY="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

vault kv put secret/ai-agent/openai \
  api_key="$OPENAI_API_KEY" \
  model="gpt-4-turbo-preview" \
  max_tokens="4096"

# Verify
vault kv get secret/ai-agent/openai
```

Store Anthropic API key (backup LLM):

```bash
# Replace with your actual Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

vault kv put secret/ai-agent/anthropic \
  api_key="$ANTHROPIC_API_KEY" \
  model="claude-3-5-sonnet-20250110" \
  max_tokens="4096"

# Verify
vault kv get secret/ai-agent/anthropic
```

Store Slack webhook URL:

```bash
# Replace with your actual Slack webhook URL
export SLACK_WEBHOOK="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"

vault kv put secret/ai-agent/slack \
  webhook_url="$SLACK_WEBHOOK" \
  channel="#incidents" \
  username="PiKube AI Agent"

# Verify
vault kv get secret/ai-agent/slack
```

Store PagerDuty integration key (optional):

```bash
# If you use PagerDuty
export PAGERDUTY_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

vault kv put secret/ai-agent/pagerduty \
  integration_key="$PAGERDUTY_KEY"

# Verify
vault kv get secret/ai-agent/pagerduty
```

> [!TIP]
> **Getting API Keys**
>
> - **OpenAI**: https://platform.openai.com/api-keys
> - **Anthropic**: https://console.anthropic.com/settings/keys
> - **Slack**: https://api.slack.com/messaging/webhooks
> - **PagerDuty**: https://support.pagerduty.com/docs/services-and-integrations

### Verify Vault Policy

Ensure the Kubernetes auth role has access to these secrets:

```bash
# Check existing policy
vault policy read kubernetes-policy

# Should include:
# path "secret/data/ai-agent/*" {
#   capabilities = ["read"]
# }

# If not, create/update the policy:
vault policy write kubernetes-policy - <<EOF
# Allow reading ai-agent secrets
path "secret/data/ai-agent/*" {
  capabilities = ["read"]
}
EOF
```

### Create ExternalSecret Resources

Now configure External Secrets Operator to sync these secrets to Kubernetes.

**OpenAI Secret:**

```yaml
# externalsecret-openai.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: openai-credentials
  namespace: ai-operations
  labels:
    app: ai-agent
spec:
  refreshInterval: 1h  # Refresh every hour
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: openai-api-key
    creationPolicy: Owner
    template:
      engineVersion: v2
      data:
        api-key: "{{ .apikey }}"
        model: "{{ .model }}"
        max-tokens: "{{ .maxtokens }}"
  data:
    - secretKey: apikey
      remoteRef:
        key: secret/ai-agent/openai
        property: api_key
    - secretKey: model
      remoteRef:
        key: secret/ai-agent/openai
        property: model
    - secretKey: maxtokens
      remoteRef:
        key: secret/ai-agent/openai
        property: max_tokens
```

**Anthropic Secret:**

```yaml
# externalsecret-anthropic.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: anthropic-credentials
  namespace: ai-operations
  labels:
    app: ai-agent
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: anthropic-api-key
    creationPolicy: Owner
    template:
      engineVersion: v2
      data:
        api-key: "{{ .apikey }}"
        model: "{{ .model }}"
        max-tokens: "{{ .maxtokens }}"
  data:
    - secretKey: apikey
      remoteRef:
        key: secret/ai-agent/anthropic
        property: api_key
    - secretKey: model
      remoteRef:
        key: secret/ai-agent/anthropic
        property: model
    - secretKey: maxtokens
      remoteRef:
        key: secret/ai-agent/anthropic
        property: max_tokens
```

**Slack Secret:**

```yaml
# externalsecret-slack.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: slack-credentials
  namespace: ai-operations
  labels:
    app: ai-agent
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: slack-webhook
    creationPolicy: Owner
    template:
      engineVersion: v2
      data:
        webhook-url: "{{ .webhookurl }}"
        channel: "{{ .channel }}"
        username: "{{ .username }}"
  data:
    - secretKey: webhookurl
      remoteRef:
        key: secret/ai-agent/slack
        property: webhook_url
    - secretKey: channel
      remoteRef:
        key: secret/ai-agent/slack
        property: channel
    - secretKey: username
      remoteRef:
        key: secret/ai-agent/slack
        property: username
```

Apply all ExternalSecrets:

```bash
kubectl apply -f externalsecret-openai.yaml
kubectl apply -f externalsecret-anthropic.yaml
kubectl apply -f externalsecret-slack.yaml
```

### Verify Secret Synchronization

```bash
# Check ExternalSecret status
kubectl get externalsecrets -n ai-operations

# Expected output:
# NAME                     STORE           REFRESH INTERVAL   STATUS
# openai-credentials       vault-backend   1h                 SecretSynced
# anthropic-credentials    vault-backend   1h                 SecretSynced
# slack-credentials        vault-backend   1h                 SecretSynced

# Verify secrets were created
kubectl get secrets -n ai-operations

# Should include:
# openai-api-key
# anthropic-api-key
# slack-webhook

# Check secret content (base64 encoded)
kubectl get secret openai-api-key -n ai-operations -o yaml

# Decode to verify (DO NOT COMMIT THIS OUTPUT)
kubectl get secret openai-api-key -n ai-operations \
  -o jsonpath='{.data.api-key}' | base64 -d
```

> [!WARNING]
> **Secret Verification Security**
>
> When decoding secrets to verify, ensure you're on a secure terminal and clear your shell history afterward:
> ```bash
> history -c  # Clear bash history
> ```

---

## Step 4: Create Initial ConfigMaps

ConfigMaps store non-sensitive configuration like guardrail settings, endpoint URLs, and feature flags.

### Guardrails Configuration

```yaml
# configmap-guardrails.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-guardrails-config
  namespace: ai-operations
  labels:
    app: ai-agent
data:
  # Rate Limits
  rate_limits.yaml: |
    openai_api:
      calls_per_minute: 20
      calls_per_hour: 500
      calls_per_day: 5000

    prometheus:
      queries_per_minute: 10
      max_time_range: "24h"

    loki:
      queries_per_minute: 10
      max_logs_per_query: 10000

    slack:
      messages_per_10min: 5
      duplicate_window: 600

  # Cost Controls
  cost_controls.yaml: |
    daily_budget_usd: 10.00
    alert_at_threshold: 0.80
    auto_shutoff_at: 0.95

    estimated_costs:
      openai_gpt4_input: 0.01
      openai_gpt4_output: 0.03
      openai_embedding: 0.0001
      anthropic_claude: 0.008

  # Action Restrictions
  action_restrictions.yaml: |
    forbidden:
      - delete_pod
      - delete_service
      - scale_to_zero

    approval_required:
      - restart_pod
      - scale_deployment
      - rollback_deployment

    allowed:
      - query_logs
      - query_metrics
      - get_status
      - send_alert

  # Output Validation
  output_validation.yaml: |
    no_secrets: true
    min_confidence: 0.70
    max_output_length: 4000
    required_fields:
      - severity
      - evidence
      - recommendations
```

### Service Endpoints Configuration

```yaml
# configmap-endpoints.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-endpoints-config
  namespace: ai-operations
  labels:
    app: ai-agent
data:
  prometheus_url: "http://prometheus.monitoring.svc.cluster.local:9090"
  loki_url: "http://loki.monitoring.svc.cluster.local:3100"
  elasticsearch_url: "http://elasticsearch.logging.svc.cluster.local:9200"
  grafana_url: "http://grafana.monitoring.svc.cluster.local:3000"
  argocd_url: "http://argocd-server.argocd.svc.cluster.local:80"
  longhorn_url: "http://longhorn-frontend.longhorn-system.svc.cluster.local:80"
```

### Agent Behavior Configuration

```yaml
# configmap-agent-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-behavior-config
  namespace: ai-operations
  labels:
    app: ai-agent
data:
  # Monitoring Settings
  monitoring.yaml: |
    check_interval_seconds: 300  # 5 minutes
    anomaly_detection_enabled: true
    baseline_learning_enabled: true

  # LLM Settings
  llm.yaml: |
    primary_provider: openai
    fallback_provider: anthropic
    cache_enabled: true
    cache_ttl_seconds: 3600
    max_retries: 3
    timeout_seconds: 30

  # Memory Settings
  memory.yaml: |
    short_term_ttl_hours: 24
    long_term_retention_days: 365
    similarity_threshold: 0.75

  # Alerting Settings
  alerting.yaml: |
    severity_levels:
      - critical
      - high
      - medium
      - low
    auto_alert_severities:
      - critical
      - high
    require_approval_severities: []
```

Apply all ConfigMaps:

```bash
kubectl apply -f configmap-guardrails.yaml
kubectl apply -f configmap-endpoints.yaml
kubectl apply -f configmap-agent-config.yaml

# Verify
kubectl get configmaps -n ai-operations
```

---

## Step 5: Network Policy (Optional but Recommended)

Restrict network access for the agent namespace using Kubernetes NetworkPolicy.

```yaml
# networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ai-agent-network-policy
  namespace: ai-operations
spec:
  podSelector:
    matchLabels:
      app: ai-agent
  policyTypes:
    - Ingress
    - Egress

  # Ingress: Only allow from Linkerd control plane
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              linkerd.io/control-plane-ns: linkerd
      ports:
        - protocol: TCP
          port: 8000  # FastAPI port
        - protocol: TCP
          port: 9090  # Prometheus metrics port

  # Egress: Allow only necessary destinations
  egress:
    # Allow DNS
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
      ports:
        - protocol: UDP
          port: 53

    # Allow Prometheus
    - to:
        - namespaceSelector:
            matchLabels:
              name: monitoring
      ports:
        - protocol: TCP
          port: 9090

    # Allow Loki
    - to:
        - namespaceSelector:
            matchLabels:
              name: monitoring
      ports:
        - protocol: TCP
          port: 3100

    # Allow Elasticsearch
    - to:
        - namespaceSelector:
            matchLabels:
              name: logging
      ports:
        - protocol: TCP
          port: 9200

    # Allow Kubernetes API
    - to:
        - namespaceSelector:
            matchLabels:
              name: default
      ports:
        - protocol: TCP
          port: 443

    # Allow HTTPS to external APIs (OpenAI, Anthropic)
    # NOTE: This form requires a CNI that enforces NetworkPolicy egress with ipBlocks.
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - protocol: TCP
          port: 443

    # Allow PostgreSQL within namespace
    - to:
        - podSelector:
            matchLabels:
              app: postgresql
      ports:
        - protocol: TCP
          port: 5432

    # Allow Redis within namespace
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379

    # Allow ChromaDB within namespace
    - to:
        - podSelector:
            matchLabels:
              app: chromadb
      ports:
        - protocol: TCP
          port: 8000
```

Apply NetworkPolicy:

```bash
kubectl apply -f networkpolicy.yaml

# Verify
kubectl get networkpolicy -n ai-operations
```

> [!NOTE]
> **NetworkPolicy Requirements**
>
> NetworkPolicy requires a CNI plugin that supports it. K3s uses Flannel by default, which does NOT support NetworkPolicy. If you need strict network isolation, consider switching to Calico or Cilium.
>
> For PiKube, this NetworkPolicy serves as documentation of intended network boundaries even if not enforced.

### CNI Compatibility Matrix

| CNI Plugin | NetworkPolicy Support | Observability Features | ARM64 Support | Recommended For |
|------------|----------------------|----------------------|---------------|----------------|
| **Flannel** (K3s default) | ❌ No | Basic | ✅ Yes | Simple setups, learning |
| **Calico** | ✅ Full | IP-in-IP, BGP | ✅ Yes | Production, security-focused |
| **Cilium** | ✅ Full | eBPF, Hubble | ✅ Yes | Advanced observability, performance |
| **Weave** | ✅ Full | Encryption | ✅ Yes | Multi-cloud, encryption |
| **Linkerd** (Service Mesh) | 🟡 Partial* | mTLS, Tap | ✅ Yes | Service mesh, not CNI |

*Linkerd provides service mesh policies (ServiceProfile, Server, AuthorizationPolicy) but not Kubernetes NetworkPolicy enforcement.

**PiKube CNI Recommendations:**

1. **Current Setup (Flannel)**:
   - ✅ Simple and reliable
   - ✅ Low resource overhead
   - ❌ No NetworkPolicy enforcement
   - **Use when**: Learning, development, non-critical workloads

2. **Upgrade to Cilium**:
   - ✅ Full NetworkPolicy support
   - ✅ eBPF for performance
   - ✅ Hubble for network observability
   - ✅ Native ARM64 support
   - **Use when**: Production, need network policies, advanced observability

3. **Upgrade to Calico**:
   - ✅ Full NetworkPolicy support
   - ✅ BGP for advanced routing
   - ✅ Well-documented for Kubernetes
   - **Use when**: Production, need network policies, familiar with Calico

**Migration Path (if upgrading from Flannel)**:

```bash
# 1. Backup current cluster state
kubectl get all --all-namespaces -o yaml > cluster-backup.yaml

# 2. Install Cilium (example)
helm repo add cilium https://helm.cilium.io/
helm install cilium cilium/cilium --namespace kube-system \
  --set k3s.enabled=true \
  --set k3s.flannel.enabled=true \
  --set ipam.mode=kubernetes

# 3. Verify pods restart with new CNI
kubectl rollout status daemonset/cilium -n kube-system

# 4. Test NetworkPolicy enforcement
kubectl apply -f networkpolicy.yaml
# Test that blocked connections fail
```

> [!WARNING]
> **CNI Migration Risks**
>
> Changing CNI plugins requires careful planning:
> - All pods will restart (brief downtime)
> - Network routes may change
> - Existing NetworkPolicies won't work until new CNI is active
> - Test in staging environment first!

---

## Step 6: Pre-flight Verification

Before moving to the next chapter, let's verify everything is ready.

### Verification Script

Create a verification script:

```bash
#!/bin/bash
# verify-prerequisites.sh

echo "=== PiKube AI Agent Prerequisites Verification ==="
echo

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

check_pass() {
  echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  exit 1
}

# Check namespace
echo "Checking namespace..."
kubectl get namespace ai-operations &>/dev/null && \
  check_pass "Namespace ai-operations exists" || \
  check_fail "Namespace ai-operations not found"

# Check ServiceAccount
echo "Checking RBAC..."
kubectl get serviceaccount ai-agent-sa -n ai-operations &>/dev/null && \
  check_pass "ServiceAccount ai-agent-sa exists" || \
  check_fail "ServiceAccount not found"

# Check ClusterRole
kubectl get clusterrole ai-agent-reader &>/dev/null && \
  check_pass "ClusterRole ai-agent-reader exists" || \
  check_fail "ClusterRole not found"

# Check ExternalSecrets
echo "Checking secrets..."
SECRETS=(openai-credentials anthropic-credentials slack-credentials)
for secret in "${SECRETS[@]}"; do
  STATUS=$(kubectl get externalsecret "$secret" -n ai-operations \
    -o jsonpath='{.status.conditions[0].type}' 2>/dev/null)
  if [ "$STATUS" == "SecretSynced" ]; then
    check_pass "ExternalSecret $secret synced"
  else
    check_fail "ExternalSecret $secret not synced (status: $STATUS)"
  fi
done

# Check ConfigMaps
echo "Checking configuration..."
CONFIGMAPS=(agent-guardrails-config agent-endpoints-config agent-behavior-config)
for cm in "${CONFIGMAPS[@]}"; do
  kubectl get configmap "$cm" -n ai-operations &>/dev/null && \
    check_pass "ConfigMap $cm exists" || \
    check_fail "ConfigMap $cm not found"
done

# Check Observability Stack
echo "Checking observability stack..."
kubectl get pods -n monitoring -l app=prometheus | grep Running &>/dev/null && \
  check_pass "Prometheus is running" || \
  check_fail "Prometheus not running"

kubectl get pods -n monitoring -l app=loki | grep Running &>/dev/null && \
  check_pass "Loki is running" || \
  check_fail "Loki not running"

kubectl get pods -n logging -l app=elasticsearch | grep Running &>/dev/null && \
  check_pass "Elasticsearch is running" || \
  check_fail "Elasticsearch not running"

# Check Storage
echo "Checking storage..."
kubectl get storageclass longhorn &>/dev/null && \
  check_pass "Longhorn storage class exists" || \
  check_fail "Longhorn storage class not found"

echo
echo "=== All prerequisites verified successfully! ==="
echo "Ready to proceed to Chapter 4: Storage Layer Setup"
```

Make it executable and run:

```bash
chmod +x verify-prerequisites.sh
./verify-prerequisites.sh
```

---

## What You've Accomplished

Congratulations! Your PiKube cluster is now prepared for AI agent deployment:

- ✅ **Verified cluster readiness**: All nodes, observability stack, storage operational
- ✅ **Created secure namespace**: `ai-operations` with Linkerd injection
- ✅ **Configured RBAC**: Read-only ServiceAccount with least-privilege permissions
- ✅ **Stored API keys in Vault**: OpenAI, Anthropic, Slack credentials secured
- ✅ **Synced secrets to Kubernetes**: External Secrets Operator operational
- ✅ **Created configuration**: Guardrails, endpoints, behavior settings
- ✅ **Established network boundaries**: NetworkPolicy (documentation even if not enforced)

---

## What's Next

In **Chapter 4: Storage Layer Setup**, you'll deploy the memory layer:

- Deploy PostgreSQL 15 with pgvector extension
- Configure Redis for session caching
- Set up ChromaDB for vector search
- Create database schemas for incidents and baselines
- Configure persistent storage on grapefruit-worker NVMe
- Verify all storage components

Let's build the agent's memory!

---

*Last updated: 2025-01-14*
*Part of the PiKube Kubernetes Service Documentation*
