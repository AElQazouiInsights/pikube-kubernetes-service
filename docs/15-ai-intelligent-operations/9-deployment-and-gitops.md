---
title: "Deployment and GitOps"
permalink: /15-ai-intelligent-operations/9-deployment-and-gitops
description: "Deploy the AI agent to Kubernetes using GitOps principles with ArgoCD for automated, declarative infrastructure management"
last_modified_at: 2025-10-15
---

# Chapter 9: Deployment and GitOps

## Overview

This chapter deploys your AI agent to Kubernetes using GitOps (ArgoCD). You'll learn:

- Creating production-ready Kubernetes manifests
- Configuring resource limits and health checks
- Setting up ArgoCD for automated deployments
- Managing secrets securely with Vault
- Implementing rollout strategies

## Kubernetes Deployment Manifest

```yaml
# deployments/ai-agent/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-agent
  namespace: ai-operations
  labels:
    app: ai-agent
    version: v1.0.0
spec:
  replicas: 2  # For high availability
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # Zero downtime
  
  selector:
    matchLabels:
      app: ai-agent
  
  template:
    metadata:
      labels:
        app: ai-agent
        version: v1.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8000"
        prometheus.io/path: "/metrics"
    
    spec:
      serviceAccountName: ai-agent-sa
      
      # Deploy to grapefruit-worker (has NVMe)
      nodeSelector:
        kubernetes.io/hostname: grapefruit-worker
      
      # Security context
      securityContext:
        fsGroup: 1000
        runAsNonRoot: true
        runAsUser: 1000
      
      containers:
        - name: ai-agent
          image: your-registry.com/ai-agent:v1.0.0
          imagePullPolicy: Always
          
          ports:
            - containerPort: 8000
              name: http
              protocol: TCP
          
          env:
            # OpenAI Configuration
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: openai-api-key
                  key: api-key
            
            - name: OPENAI_MODEL
              value: "gpt-4-turbo-preview"
            
            # PostgreSQL Configuration
            - name: POSTGRES_HOST
              value: "postgres.ai-operations.svc.cluster.local"
            
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: password
            
            # Redis Configuration
            - name: REDIS_HOST
              value: "redis.ai-operations.svc.cluster.local"
            
            # Agent Configuration
            - name: LOG_LEVEL
              value: "INFO"
            
            - name: AGENT_MAX_ITERATIONS
              value: "10"
          
          # Resource limits (critical!)
          resources:
            requests:
              cpu: 1000m      # 1 CPU
              memory: 2Gi
            limits:
              cpu: 2000m      # Max 2 CPUs
              memory: 4Gi
          
          # Health checks
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 2
          
          # Startup probe (for slow starts)
          startupProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 0
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 30  # 150 seconds max startup
          
          # Volume mounts
          volumeMounts:
            - name: cache
              mountPath: /tmp/cache
      
      volumes:
        - name: cache
          emptyDir:
            sizeLimit: 1Gi
---
# Service
apiVersion: v1
kind: Service
metadata:
  name: ai-agent
  namespace: ai-operations
  labels:
    app: ai-agent
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 8000
      protocol: TCP
      name: http
  selector:
    app: ai-agent
---
# Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ai-agent
  namespace: ai-operations
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/auth-url: "http://oauth2-proxy.oauth2-proxy.svc.cluster.local/oauth2/auth"
    nginx.ingress.kubernetes.io/auth-signin: "https://oauth2-proxy.picluster.quantfinancehub.com/oauth2/start?rd=https://$host$request_uri"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - ai-agent.picluster.quantfinancehub.com
      secretName: ai-agent-tls
  rules:
    - host: ai-agent.picluster.quantfinancehub.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ai-agent
                port:
                  number: 80
```

## RBAC Configuration

Create the ServiceAccount and ClusterRole for the AI agent to interact with Kubernetes APIs:

```yaml
# deployments/ai-agent/rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ai-agent-sa
  namespace: ai-operations
  labels:
    app: ai-agent
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ai-agent-reader
  labels:
    app: ai-agent
rules:
  # Read pods, deployments, services
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps", "events"]
    verbs: ["get", "list", "watch"]

  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "daemonsets", "replicasets"]
    verbs: ["get", "list", "watch"]

  # Read logs
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get", "list"]

  # Read metrics (if metrics-server installed)
  - apiGroups: ["metrics.k8s.io"]
    resources: ["pods", "nodes"]
    verbs: ["get", "list"]

  # Read node information
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ai-agent-reader-binding
  labels:
    app: ai-agent
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ai-agent-reader
subjects:
  - kind: ServiceAccount
    name: ai-agent-sa
    namespace: ai-operations
```

**RBAC Security Notes:**
- **Read-only access**: Agent can observe but not modify cluster state
- **Scope**: ClusterRole allows reading across all namespaces (needed for cluster-wide monitoring)
- **Principle of least privilege**: Only grants minimum permissions needed for observability

## ConfigMap for Application Configuration

```yaml
# deployments/ai-agent/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ai-agent-config
  namespace: ai-operations
  labels:
    app: ai-agent
data:
  # Agent behavior configuration
  agent.yaml: |
    agent:
      max_iterations: 10
      timeout_seconds: 300
      retry_attempts: 3

    llm:
      model: "gpt-4-turbo-preview"
      temperature: 0.1
      max_tokens: 4096

    kubernetes:
      namespace_scope: "all"
      log_tail_lines: 100

    memory:
      conversation_ttl_hours: 24
      max_context_messages: 20

    safety:
      require_approval: true
      allowed_namespaces:
        - "default"
        - "ai-operations"
        - "monitoring"
      blocked_namespaces:
        - "kube-system"
        - "vault"
        - "external-secrets-system"

  # Logging configuration
  logging.yaml: |
    version: 1
    formatters:
      default:
        format: '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
      json:
        class: pythonjsonlogger.jsonlogger.JsonFormatter
        format: '%(asctime)s %(name)s %(levelname)s %(message)s'

    handlers:
      console:
        class: logging.StreamHandler
        formatter: json
        stream: ext://sys.stdout

    root:
      level: INFO
      handlers: [console]

    loggers:
      uvicorn:
        level: INFO
      langchain:
        level: WARNING
```

## PodDisruptionBudget for High Availability

```yaml
# deployments/ai-agent/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ai-agent-pdb
  namespace: ai-operations
  labels:
    app: ai-agent
spec:
  minAvailable: 1  # Always keep at least 1 pod running
  selector:
    matchLabels:
      app: ai-agent
```

## Kustomize Structure

Organize manifests using Kustomize for environment-specific configurations:

### Base Kustomization

```yaml
# deployments/ai-agent/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: ai-operations

resources:
  - deployment.yaml
  - service.yaml
  - ingress.yaml
  - rbac.yaml
  - configmap.yaml
  - pdb.yaml

commonLabels:
  app: ai-agent
  managed-by: kustomize

images:
  - name: your-registry.com/ai-agent
    newTag: v1.0.0
```

### Production Overlay

```yaml
# deployments/ai-agent/overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: ai-operations

bases:
  - ../../base

replicas:
  - name: ai-agent
    count: 3  # Scale to 3 replicas in production

patchesStrategicMerge:
  - deployment-patch.yaml
  - ingress-patch.yaml

configMapGenerator:
  - name: ai-agent-config
    behavior: merge
    files:
      - configs/agent-prod.yaml
```

**Production deployment patch:**

```yaml
# deployments/ai-agent/overlays/production/deployment-patch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-agent
spec:
  template:
    spec:
      containers:
        - name: ai-agent
          resources:
            requests:
              cpu: 2000m      # Higher CPU in production
              memory: 4Gi
            limits:
              cpu: 4000m
              memory: 8Gi

          env:
            - name: LOG_LEVEL
              value: "WARNING"  # Less verbose in prod

            - name: ENVIRONMENT
              value: "production"
```

### Staging Overlay

```yaml
# deployments/ai-agent/overlays/staging/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: ai-operations-staging

bases:
  - ../../base

nameSuffix: -staging

replicas:
  - name: ai-agent
    count: 2

images:
  - name: your-registry.com/ai-agent
    newTag: staging-latest
```

## ArgoCD Application Configuration

Create the ArgoCD Application manifest to enable GitOps:

```yaml
# argocd/ai-agent-application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ai-agent
  namespace: argocd
  labels:
    app: ai-agent
  finalizers:
    - resources-finalizer.argocd.argoproj.io  # Cascade delete
spec:
  project: default

  source:
    repoURL: https://github.com/AElQazouiInsights/pikube-kubernetes-service
    targetRevision: main
    path: deployments/ai-agent/overlays/production

  destination:
    server: https://kubernetes.default.svc
    namespace: ai-operations

  syncPolicy:
    automated:
      prune: true      # Delete resources removed from Git
      selfHeal: true   # Auto-sync if cluster state drifts
      allowEmpty: false

    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true

    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m

  # Health assessment
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas  # Ignore HPA changes

  # Notifications
  revisionHistoryLimit: 10
```

**ArgoCD Application for Staging:**

```yaml
# argocd/ai-agent-staging-application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ai-agent-staging
  namespace: argocd
  labels:
    app: ai-agent
    environment: staging
spec:
  project: default

  source:
    repoURL: https://github.com/AElQazouiInsights/pikube-kubernetes-service
    targetRevision: develop
    path: deployments/ai-agent/overlays/staging

  destination:
    server: https://kubernetes.default.svc
    namespace: ai-operations-staging

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## Deploying with ArgoCD

### Step 1: Apply the ArgoCD Application

```bash
# Deploy production application
kubectl apply -f argocd/ai-agent-application.yaml

# Verify application created
kubectl get application -n argocd ai-agent

# Expected output:
# NAME       SYNC STATUS   HEALTH STATUS
# ai-agent   Synced        Healthy
```

### Step 2: Monitor Deployment Progress

```bash
# Watch sync status
argocd app get ai-agent --refresh

# View sync history
argocd app history ai-agent

# View application logs
argocd app logs ai-agent --follow
```

### Step 3: Verify Deployment

```bash
# Check all resources created
kubectl get all -n ai-operations -l app=ai-agent

# Expected output:
# NAME                            READY   STATUS    RESTARTS   AGE
# pod/ai-agent-6f4b8c9d7-abc12    1/1     Running   0          2m
# pod/ai-agent-6f4b8c9d7-def34    1/1     Running   0          2m
# pod/ai-agent-6f4b8c9d7-ghi56    1/1     Running   0          2m
#
# NAME               TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
# service/ai-agent   ClusterIP   10.43.123.45    <none>        80/TCP    2m
#
# NAME                       READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/ai-agent   3/3     3            3           2m

# Check ingress
kubectl get ingress -n ai-operations ai-agent

# Test health endpoint
kubectl port-forward -n ai-operations svc/ai-agent 8000:80
curl http://localhost:8000/health
```

## GitOps Workflow

### Making Changes via Git

```bash
# 1. Clone repository
git clone https://github.com/quantstacker/pikube-kubernetes-service.git
cd pikube-kubernetes-service

# 2. Create feature branch
git checkout -b feature/increase-ai-agent-replicas

# 3. Edit deployment
vim deployments/ai-agent/overlays/production/kustomization.yaml
# Change replicas: count: 5

# 4. Commit and push
git add deployments/ai-agent/overlays/production/kustomization.yaml
git commit -m "Scale AI agent to 5 replicas for increased load"
git push origin feature/increase-ai-agent-replicas

# 5. Create pull request (GitHub UI)

# 6. After PR approval and merge, ArgoCD auto-syncs within 3 minutes
# Or manually sync:
argocd app sync ai-agent
```

### Viewing Sync Diff

```bash
# See what will change before syncing
argocd app diff ai-agent

# Preview changes
argocd app manifests ai-agent

# Sync with specific revision
argocd app sync ai-agent --revision main
```

## Rollback Procedures

### Rollback via ArgoCD

```bash
# View deployment history
argocd app history ai-agent

# Output:
# ID  DATE                           REVISION
# 10  2025-10-15 14:32:15 +0000 UTC  main (abc1234)
# 9   2025-10-15 13:15:42 +0000 UTC  main (def5678)

# Rollback to previous revision
argocd app rollback ai-agent 9

# Verify rollback
kubectl get pods -n ai-operations -l app=ai-agent
```

### Rollback via Kubectl (Emergency)

```bash
# View rollout history
kubectl rollout history deployment/ai-agent -n ai-operations

# Rollback to previous version
kubectl rollout undo deployment/ai-agent -n ai-operations

# Rollback to specific revision
kubectl rollout undo deployment/ai-agent -n ai-operations --to-revision=3

# Monitor rollback
kubectl rollout status deployment/ai-agent -n ai-operations
```

### Pause ArgoCD Auto-Sync (During Incident)

```bash
# Disable auto-sync temporarily
argocd app set ai-agent --sync-policy none

# Make manual fixes
kubectl edit deployment ai-agent -n ai-operations

# Re-enable auto-sync after incident resolved
argocd app set ai-agent --sync-policy automated --auto-prune --self-heal
```

## Blue-Green Deployment Strategy

For zero-downtime updates with instant rollback capability:

```yaml
# deployments/ai-agent/blue-green/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: ai-agent
  namespace: ai-operations
spec:
  selector:
    app: ai-agent
    version: blue  # Switch to 'green' for cutover
  ports:
    - port: 80
      targetPort: 8000
---
# Blue deployment (current)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-agent-blue
  namespace: ai-operations
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-agent
      version: blue
  template:
    metadata:
      labels:
        app: ai-agent
        version: blue
    spec:
      containers:
        - name: ai-agent
          image: your-registry.com/ai-agent:v1.0.0
          # ... rest of container spec
---
# Green deployment (new version)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-agent-green
  namespace: ai-operations
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-agent
      version: green
  template:
    metadata:
      labels:
        app: ai-agent
        version: green
    spec:
      containers:
        - name: ai-agent
          image: your-registry.com/ai-agent:v1.1.0
          # ... rest of container spec
```

**Blue-Green cutover procedure:**

```bash
# 1. Deploy green version
kubectl apply -f deployments/ai-agent/blue-green/deployment-green.yaml

# 2. Wait for green pods to be ready
kubectl wait --for=condition=ready pod -l version=green -n ai-operations --timeout=300s

# 3. Test green deployment
kubectl port-forward -n ai-operations svc/ai-agent-green 8001:80
curl http://localhost:8001/health

# 4. Switch traffic to green
kubectl patch service ai-agent -n ai-operations -p '{"spec":{"selector":{"version":"green"}}}'

# 5. Monitor for issues
kubectl logs -n ai-operations -l version=green --tail=100 -f

# 6. If all good, scale down blue
kubectl scale deployment ai-agent-blue -n ai-operations --replicas=0

# 7. If issues, instant rollback
kubectl patch service ai-agent -n ai-operations -p '{"spec":{"selector":{"version":"blue"}}}'
```

## Canary Deployment Strategy

Gradually roll out new version to subset of users:

```yaml
# Using Argo Rollouts for canary
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: ai-agent
  namespace: ai-operations
spec:
  replicas: 5
  strategy:
    canary:
      steps:
        - setWeight: 20    # 20% traffic to canary
        - pause: {duration: 5m}
        - setWeight: 40
        - pause: {duration: 5m}
        - setWeight: 60
        - pause: {duration: 5m}
        - setWeight: 80
        - pause: {duration: 5m}

      # Automatic rollback if metrics fail
      analysis:
        templates:
          - templateName: success-rate
        startingStep: 2
        args:
          - name: service-name
            value: ai-agent

  selector:
    matchLabels:
      app: ai-agent

  template:
    metadata:
      labels:
        app: ai-agent
    spec:
      # ... pod spec same as Deployment
```

## Monitoring Deployments

### Deployment Metrics

```bash
# Watch deployment progress
kubectl rollout status deployment/ai-agent -n ai-operations

# Check replica status
kubectl get deployment ai-agent -n ai-operations -o wide

# View deployment events
kubectl describe deployment ai-agent -n ai-operations | grep Events -A 20

# Check pod distribution across nodes
kubectl get pods -n ai-operations -l app=ai-agent -o wide
```

### ArgoCD Health Checks

ArgoCD automatically monitors these health indicators:

- **Deployment**: All replicas available
- **Pods**: All pods running and passing readiness checks
- **Services**: Endpoints exist
- **Ingress**: Rules configured correctly

```bash
# View detailed health status
argocd app get ai-agent --show-operation

# Check resource health
kubectl get application ai-agent -n argocd -o jsonpath='{.status.health}'
```

## Troubleshooting Deployments

### ArgoCD Sync Failures

**Symptom**: Application shows `OutOfSync` or `Unknown` status

```bash
# Check sync status
argocd app get ai-agent

# View detailed error
kubectl describe application ai-agent -n argocd

# Common issues:
# 1. Invalid YAML syntax
argocd app manifests ai-agent  # Check for errors

# 2. Missing secrets
kubectl get externalsecrets -n ai-operations  # Ensure all synced

# 3. RBAC permissions
kubectl auth can-i create deployment --as=system:serviceaccount:argocd:argocd-application-controller -n ai-operations
```

### Pod Startup Failures

**Symptom**: Pods stuck in `CrashLoopBackOff` or `ImagePullBackOff`

```bash
# Check pod status
kubectl describe pod -n ai-operations <pod-name>

# View logs
kubectl logs -n ai-operations <pod-name> --previous

# Common fixes:
# 1. Image pull issues
kubectl get secret -n ai-operations  # Check image pull secrets exist

# 2. Missing environment variables
kubectl exec -n ai-operations <pod-name> -- env | grep -E '(OPENAI|POSTGRES|REDIS)'

# 3. ConfigMap/Secret missing
kubectl get configmap,secret -n ai-operations
```

### Rollout Stuck

**Symptom**: `kubectl rollout status` shows waiting indefinitely

```bash
# Check rollout status
kubectl rollout status deployment/ai-agent -n ai-operations --timeout=10s

# Identify issue
kubectl get pods -n ai-operations -l app=ai-agent

# Common causes:
# 1. Insufficient resources
kubectl describe nodes | grep -A 5 "Allocated resources"

# 2. PodDisruptionBudget blocking
kubectl get pdb -n ai-operations

# 3. Failed readiness probe
kubectl logs -n ai-operations <pending-pod> --tail=50
```

## Security Considerations

### Image Security

```yaml
# Add image pull policy and scanning
spec:
  template:
    spec:
      containers:
        - name: ai-agent
          image: your-registry.com/ai-agent:v1.0.0@sha256:abc123...  # Use digest
          imagePullPolicy: Always

          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1000
            capabilities:
              drop:
                - ALL
```

### Network Policies (if using Calico/Cilium)

```yaml
# deployments/ai-agent/networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ai-agent-netpol
  namespace: ai-operations
spec:
  podSelector:
    matchLabels:
      app: ai-agent

  policyTypes:
    - Ingress
    - Egress

  ingress:
    # Allow from ingress controller
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8000

  egress:
    # Allow to PostgreSQL
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432

    # Allow to Redis
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379

    # Allow to Kubernetes API
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              component: apiserver
      ports:
        - protocol: TCP
          port: 443

    # Allow to OpenAI API (external)
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443
```

## Complete Deployment Checklist

Before deploying to production:

- [ ] All secrets created in Vault
- [ ] ExternalSecrets synced successfully
- [ ] PostgreSQL and Redis deployed and healthy
- [ ] RBAC configured (ServiceAccount, ClusterRole, ClusterRoleBinding)
- [ ] Resource limits tuned for workload
- [ ] Health probes configured correctly
- [ ] PodDisruptionBudget created (minAvailable: 1)
- [ ] HorizontalPodAutoscaler configured (if needed)
- [ ] Ingress with TLS certificate
- [ ] OAuth2-Proxy authentication configured
- [ ] Prometheus ServiceMonitor created (Chapter 10)
- [ ] Grafana dashboard imported (Chapter 10)
- [ ] AlertManager rules configured (Chapter 10)
- [ ] ArgoCD Application manifest applied
- [ ] Backup procedures tested (Chapter 12)
- [ ] Rollback procedure documented and tested

## Next Steps

With your AI agent deployed via GitOps:

1. **Chapter 10**: Set up comprehensive monitoring with Prometheus, Grafana, and Loki
2. **Chapter 11**: Implement testing and validation strategies
3. **Chapter 12**: Configure production operations (backups, scaling, incident response)
