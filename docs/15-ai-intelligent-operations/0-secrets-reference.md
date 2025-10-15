---
title: "Secrets Reference Guide"
permalink: /15-ai-intelligent-operations/0-secrets-reference
description: "Complete reference for managing secrets from Vault to Kubernetes to application environment variables"
last_modified_at: 2025-10-15
---

# Secrets Reference Guide

## Overview

This guide maps the complete chain from Vault secrets → ExternalSecrets → Kubernetes Secrets → Pod Environment Variables.

## Secrets Mapping Table

| Service | Vault Path | ExternalSecret Name | K8s Secret | Pod Env Var | Used In |
|---------|-----------|-------------------|-----------|-------------|---------|
| **OpenAI** | `secret/ai-agent/openai` | `openai-credentials` | `openai-api-key` | `OPENAI_API_KEY` | Agent Core (Chapter 5) |
| **PostgreSQL** | `secret/ai-agent/postgres` | `postgres-credentials` | `postgres-credentials` | `POSTGRES_PASSWORD` | Storage Layer (Chapter 4) |
| **Redis** | `secret/ai-agent/redis` | `redis-credentials` | `redis-credentials` | `REDIS_PASSWORD` | Cache Layer (Chapter 4) |
| **Anthropic** | `secret/ai-agent/anthropic` | `anthropic-credentials` | `anthropic-api-key` | `ANTHROPIC_API_KEY` | Fallback LLM (Chapter 5) |
| **Slack** | `secret/ai-agent/slack` | `slack-credentials` | `slack-webhook` | `SLACK_WEBHOOK_URL` | Notifications (Chapter 12) |
| **PagerDuty** | `secret/ai-agent/pagerduty` | `pagerduty-credentials` | `pagerduty-token` | `PAGERDUTY_TOKEN` | Incident Management |

## Vault Secret Creation

### OpenAI

```bash
vault kv put secret/ai-agent/openai \
  api_key="sk-your-openai-key-here" \
  model="gpt-4-turbo-preview" \
  max_tokens="4096"
```

### PostgreSQL

```bash
# Generate strong password
POSTGRES_PASSWORD=$(openssl rand -base64 32)

vault kv put secret/ai-agent/postgres \
  password="$POSTGRES_PASSWORD" \
  username="aiagent" \
  database="aiagent_db" \
  host="postgres.ai-operations.svc.cluster.local" \
  port="5432"
```

### Redis

```bash
# Generate strong password
REDIS_PASSWORD=$(openssl rand -base64 32)

vault kv put secret/ai-agent/redis \
  password="$REDIS_PASSWORD" \
  host="redis.ai-operations.svc.cluster.local" \
  port="6379"
```

### Anthropic (Fallback LLM)

```bash
vault kv put secret/ai-agent/anthropic \
  api_key="sk-ant-your-key-here" \
  model="claude-3-5-sonnet-20240620"
```

### Slack

```bash
vault kv put secret/ai-agent/slack \
  webhook_url="https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
  channel="#ai-agent-alerts"
```

### PagerDuty

```bash
vault kv put secret/ai-agent/pagerduty \
  integration_key="your-integration-key" \
  api_token="your-api-token"
```

## ExternalSecret Manifests

### OpenAI ExternalSecret

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: openai-credentials
  namespace: ai-operations
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  
  target:
    name: openai-api-key
    creationPolicy: Owner
  
  data:
    - secretKey: api-key
      remoteRef:
        key: secret/ai-agent/openai
        property: api_key
    
    - secretKey: model
      remoteRef:
        key: secret/ai-agent/openai
        property: model
```

### PostgreSQL ExternalSecret

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: postgres-credentials
  namespace: ai-operations
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  
  target:
    name: postgres-credentials
    creationPolicy: Owner
  
  data:
    - secretKey: password
      remoteRef:
        key: secret/ai-agent/postgres
        property: password
    
    - secretKey: username
      remoteRef:
        key: secret/ai-agent/postgres
        property: username
    
    - secretKey: database
      remoteRef:
        key: secret/ai-agent/postgres
        property: database
```

### Redis ExternalSecret

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: redis-credentials
  namespace: ai-operations
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  
  target:
    name: redis-credentials
    creationPolicy: Owner
  
  data:
    - secretKey: password
      remoteRef:
        key: secret/ai-agent/redis
        property: password
```

### Slack ExternalSecret

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: slack-credentials
  namespace: ai-operations
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  
  target:
    name: slack-webhook
    creationPolicy: Owner
  
  data:
    - secretKey: webhook-url
      remoteRef:
        key: secret/ai-agent/slack
        property: webhook_url
```

## Pod Environment Variable Configuration

In your Deployment manifest (`deployments/ai-agent/deployment.yaml`):

```yaml
env:
  # OpenAI Configuration
  - name: OPENAI_API_KEY
    valueFrom:
      secretKeyRef:
        name: openai-api-key
        key: api-key
  
  - name: OPENAI_MODEL
    valueFrom:
      secretKeyRef:
        name: openai-api-key
        key: model
  
  # PostgreSQL Configuration
  - name: POSTGRES_HOST
    value: "postgres.ai-operations.svc.cluster.local"
  
  - name: POSTGRES_DATABASE
    valueFrom:
      secretKeyRef:
        name: postgres-credentials
        key: database
  
  - name: POSTGRES_USER
    valueFrom:
      secretKeyRef:
        name: postgres-credentials
        key: username
  
  - name: POSTGRES_PASSWORD
    valueFrom:
      secretKeyRef:
        name: postgres-credentials
        key: password
  
  # Redis Configuration
  - name: REDIS_HOST
    value: "redis.ai-operations.svc.cluster.local"
  
  - name: REDIS_PASSWORD
    valueFrom:
      secretKeyRef:
        name: redis-credentials
        key: password
  
  # Anthropic (Optional Fallback)
  - name: ANTHROPIC_API_KEY
    valueFrom:
      secretKeyRef:
        name: anthropic-api-key
        key: api-key
        optional: true
  
  # Slack Notifications
  - name: SLACK_WEBHOOK_URL
    valueFrom:
      secretKeyRef:
        name: slack-webhook
        key: webhook-url
        optional: true
```

## Verification Commands

### Check Vault Secrets Exist

```bash
# List all AI agent secrets
vault kv list secret/ai-agent/

# Get specific secret (without values)
vault kv get -field=api_key secret/ai-agent/openai | head -c 10
# Output: sk-your-oa...
```

### Check ExternalSecrets Synced

```bash
# Check ExternalSecret status
kubectl get externalsecrets -n ai-operations

# Expected output:
# NAME                    STATUS   READY   AGE
# openai-credentials      Synced   True    5m
# postgres-credentials    Synced   True    5m
# redis-credentials       Synced   True    5m

# Describe for troubleshooting
kubectl describe externalsecret openai-credentials -n ai-operations
```

### Check Kubernetes Secrets Created

```bash
# List secrets
kubectl get secrets -n ai-operations | grep -E '(openai|postgres|redis)'

# Check secret contents (base64 encoded)
kubectl get secret openai-api-key -n ai-operations -o yaml

# Decode secret
kubectl get secret openai-api-key -n ai-operations -o jsonpath='{.data.api-key}' | base64 -d | head -c 10
```

### Test Secret Access from Pod

```bash
# Check environment variables in running pod
kubectl exec -n ai-operations deploy/ai-agent -- env | grep -E '(OPENAI|POSTGRES|REDIS)'

# Expected output:
# OPENAI_API_KEY=sk-...
# POSTGRES_HOST=postgres.ai-operations.svc.cluster.local
# POSTGRES_PASSWORD=...
# REDIS_HOST=redis.ai-operations.svc.cluster.local
```

### Test Application Configuration

```bash
# Port-forward and test health endpoint
kubectl port-forward -n ai-operations svc/ai-agent 8000:80

# In another terminal
curl http://localhost:8000/health

# Expected response:
# {
#   "status": "healthy",
#   "checks": {
#     "redis": "ok",
#     "postgres": "ok",
#     "openai": "ok"
#   }
# }
```

## Troubleshooting

### ExternalSecret Not Syncing

**Symptoms**: ExternalSecret shows `SecretSyncFailed`

**Check**:
```bash
kubectl describe externalsecret openai-credentials -n ai-operations

# Look for error messages like:
# - "secret not found in Vault"
# - "permission denied"
# - "invalid secret path"
```

**Solutions**:
1. Verify secret exists in Vault:
   ```bash
   vault kv get secret/ai-agent/openai
   ```

2. Check ClusterSecretStore configuration:
   ```bash
   kubectl describe clustersecretstore vault-backend
   ```

3. Verify Vault authentication:
   ```bash
   kubectl logs -n external-secrets-system deploy/external-secrets
   ```

### Pod Cannot Access Secret

**Symptoms**: Pod shows `CreateContainerConfigError`

**Check**:
```bash
kubectl describe pod -n ai-operations <pod-name>

# Look for:
# "Error: secret "openai-api-key" not found"
```

**Solutions**:
1. Verify secret exists:
   ```bash
   kubectl get secret openai-api-key -n ai-operations
   ```

2. Check secret key names match:
   ```bash
   kubectl get secret openai-api-key -n ai-operations -o jsonpath='{.data}' | jq 'keys'
   # Should include: "api-key"
   ```

3. Verify correct namespace:
   ```bash
   # Secret and Pod must be in same namespace
   kubectl get secret openai-api-key -n ai-operations
   kubectl get pod <pod-name> -n ai-operations
   ```

### Secret Value Empty or Wrong

**Symptoms**: Application logs show authentication errors

**Check**:
```bash
# Check if secret has data
kubectl get secret openai-api-key -n ai-operations -o jsonpath='{.data.api-key}' | base64 -d

# If empty or wrong, check Vault
vault kv get -field=api_key secret/ai-agent/openai
```

**Solutions**:
1. Update Vault secret:
   ```bash
   vault kv put secret/ai-agent/openai api_key="sk-correct-key"
   ```

2. Force ExternalSecret sync:
   ```bash
   kubectl annotate externalsecret openai-credentials -n ai-operations \
     force-sync=$(date +%s)
   ```

3. Restart pods to pick up new secret:
   ```bash
   kubectl rollout restart deployment/ai-agent -n ai-operations
   ```

## Secret Rotation Procedures

### Rotating OpenAI API Key

```bash
# 1. Generate new API key in OpenAI dashboard

# 2. Update Vault
vault kv patch secret/ai-agent/openai api_key="sk-new-key"

# 3. ExternalSecret will auto-sync within 1 hour
# Or force immediate sync:
kubectl annotate externalsecret openai-credentials -n ai-operations \
  force-sync=$(date +%s)

# 4. Rolling restart to pick up new key
kubectl rollout restart deployment/ai-agent -n ai-operations

# 5. Verify
kubectl exec -n ai-operations deploy/ai-agent -- env | grep OPENAI_API_KEY | head -c 20
```

### Rotating Database Password

```bash
# 1. Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# 2. Update PostgreSQL user
kubectl exec -n ai-operations postgres-0 -- psql -U postgres -c \
  "ALTER USER aiagent WITH PASSWORD '$NEW_PASSWORD';"

# 3. Update Vault
vault kv patch secret/ai-agent/postgres password="$NEW_PASSWORD"

# 4. Force sync and restart
kubectl annotate externalsecret postgres-credentials -n ai-operations \
  force-sync=$(date +%s)
kubectl rollout restart deployment/ai-agent -n ai-operations
```

## Security Best Practices

1. **Least Privilege**: Grant Vault policies minimum required access
2. **Regular Rotation**: Rotate secrets every 90 days
3. **Audit Logging**: Enable Vault audit logs
4. **Secret Scanning**: Use tools like gitleaks to prevent secret leaks
5. **Encryption at Rest**: Ensure Vault storage backend is encrypted

## Related Documentation

- Chapter 3: Prerequisites and Foundation (Initial Vault setup)
- Chapter 4: Storage Layer Setup (PostgreSQL and Redis secrets)
- Chapter 5: Agent Core Implementation (Application configuration)
- Chapter 9: Deployment and GitOps (Secret mounting in pods)

---

**Next**: Return to implementation chapters to configure your secrets
