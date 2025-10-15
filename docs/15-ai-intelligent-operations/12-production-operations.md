---
title: "Chapter 12: Production Operations"
permalink: /15-ai-intelligent-operations/12-production-operations
description: "Operational runbooks, maintenance procedures, and best practices for running AI agents in production"
last_modified_at: 2025-10-15
---

# Chapter 12: Production Operations

## Overview

Running AI agents in production requires operational discipline. This chapter provides:
- Incident response workflows
- Runbooks for common issues
- Backup and restore procedures
- Cost optimization strategies
- Security best practices

## Incident Response Workflow

### When the Agent is Down

```bash
# 1. Check pod status
kubectl get pods -n ai-operations -l app=ai-agent

# 2. Check recent events
kubectl get events -n ai-operations --sort-by='.lastTimestamp' | tail -20

# 3. Check logs
kubectl logs -n ai-operations -l app=ai-agent --tail=100

# 4. Common issues:
# - ImagePullBackOff: Check image registry credentials
# - CrashLoopBackOff: Check logs for Python errors
# - OOMKilled: Increase memory limits
```

### When LLM API is Down

The agent should gracefully degrade:

```python
# Fallback strategy in agent code
try:
    response = await llm.call(prompt)
except OpenAIError:
    # Fall back to cached responses or simple heuristics
    response = await self.get_fallback_response(prompt)
```

### When Costs Spike

```bash
# Check daily costs
kubectl exec -n ai-operations deploy/ai-agent -- \
  python -c "from app.metrics import get_daily_cost; print(get_daily_cost())"

# Check who's making requests
SELECT user_id, COUNT(*), SUM(cost_usd)
FROM audit_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY user_id
ORDER BY SUM(cost_usd) DESC;

# Temporary mitigation: Lower rate limits
# Edit ConfigMap and restart pods
```

## Backup and Restore

### PostgreSQL Incident Database

```bash
# Backup
kubectl exec -n ai-operations postgres-0 -- \
  pg_dump -U aiagent aiagent_db | gzip > incident_db_backup_$(date +%Y%m%d).sql.gz

# Restore
gunzip < incident_db_backup_20240115.sql.gz | \
  kubectl exec -i -n ai-operations postgres-0 -- \
  psql -U aiagent aiagent_db
```

### Redis Cache (Optional)

```bash
# Redis cache is ephemeral, but you can backup if needed
kubectl exec -n ai-operations deploy/redis -- redis-cli SAVE
kubectl cp ai-operations/redis-pod:/data/dump.rdb ./redis_backup.rdb
```

## Scaling Considerations

### Horizontal Scaling

```yaml
# HorizontalPodAutoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ai-agent
  namespace: ai-operations
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ai-agent
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Connection Pooling

Ensure database connection pools scale with replicas:

```python
# In config
POSTGRES_POOL_SIZE = int(os.getenv("POSTGRES_POOL_SIZE", "10"))
POSTGRES_MAX_OVERFLOW = int(os.getenv("POSTGRES_MAX_OVERFLOW", "20"))

# Total connections = (POOL_SIZE + MAX_OVERFLOW) * num_replicas
# Example: (10 + 20) * 5 replicas = 150 max connections
# Ensure PostgreSQL max_connections > 150
```

## Cost Optimization

### 1. Aggressive Caching

```python
# Target 80%+ cache hit rate
# Monitor: agent_cache_requests_total{result="hit"} / agent_cache_requests_total

# Strategies:
# - Increase TTLs for static queries
# - Pre-warm cache with common queries
# - Use semantic caching (similar queries → same cache)
```

### 2. Prompt Optimization

```python
# Reduce token usage
# Before: 2000 tokens
prompt = f"""
You are an AI agent. Your role is to investigate Kubernetes incidents.
Available tools: {all_tools_with_descriptions}
...
"""

# After: 800 tokens
prompt = f"""
Investigate K8s incident. Tools: {tool_names_only}
User query: {query}
"""
```

### 3. Model Selection

```python
# Use cheaper models where appropriate
MODELS = {
    "complex_analysis": "gpt-4-turbo-preview",  # $0.01/1K input
    "simple_queries": "gpt-3.5-turbo",          # $0.0005/1K input (20x cheaper!)
    "embeddings": "text-embedding-ada-002",     # $0.0001/1K
}

# Classifier to route queries
def select_model(query: str) -> str:
    if needs_complex_reasoning(query):
        return MODELS["complex_analysis"]
    return MODELS["simple_queries"]
```

### 4. Batch Operations

```python
# Generate embeddings in batches (up to 100)
embeddings = await openai.embeddings.create(
    model="text-embedding-ada-002",
    input=batch_of_texts  # 100 texts at once
)
# Saves API calls and reduces latency
```

## Security Best Practices

### 1. API Key Rotation

```bash
# Rotate OpenAI API key every 90 days
# 1. Generate new key in OpenAI dashboard
# 2. Update Vault secret
vault kv put secret/ai-agent/openai api_key="sk-new-key..."

# 3. ExternalSecret operator will auto-update
# 4. Rolling restart of pods
kubectl rollout restart deployment/ai-agent -n ai-operations
```

### 2. Network Policies

```yaml
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
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8000
  egress:
    # Allow DNS
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
      ports:
        - protocol: UDP
          port: 53
    # Allow PostgreSQL
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    # Allow Redis
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
    # Allow external HTTPS (for LLM APIs)
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443
```

### 3. Pod Security Standards

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ai-agent
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: ai-agent
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop:
            - ALL
        readOnlyRootFilesystem: true
```

## Performance Tuning

### Database Indexing

```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Add indexes for common patterns
CREATE INDEX idx_incidents_namespace_created
ON incidents(namespace, created_at DESC);

-- Vacuum regularly
VACUUM ANALYZE incidents;
```

### Redis Optimization

```conf
# redis.conf tuning
maxmemory-policy allkeys-lru
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Enable RDB compression
rdbcompression yes

# Limit slow log
slowlog-log-slower-than 10000  # 10ms
slowlog-max-len 128
```

## Maintenance Procedures

### Weekly Tasks

- Review cost trends (should be stable or declining)
- Check cache hit rate (target: >70%)
- Review audit logs for anomalies
- Update dependencies (security patches)

### Monthly Tasks

- Analyze incident patterns (common root causes)
- Review and update guardrails (rate limits, budgets)
- Performance testing (load tests)
- Disaster recovery drill (backup restore test)

### Quarterly Tasks

- Security audit (API key rotation, RBAC review)
- Cost optimization review
- Capacity planning
- User feedback session

## Monitoring Checklist

Daily monitoring should track:

- [ ] Agent pods healthy (2/2 running)
- [ ] Cache hit rate > 70%
- [ ] Daily cost < $10
- [ ] P95 latency < 30s
- [ ] No errors in last hour
- [ ] PostgreSQL disk < 80%
- [ ] Redis memory < 80%

## Summary

✓ Incident response runbooks  
✓ Backup and restore procedures  
✓ Scaling strategies (horizontal + connection pooling)  
✓ Cost optimization (caching, prompts, model selection)  
✓ Security best practices (key rotation, network policies)  
✓ Performance tuning (database, Redis)  
✓ Maintenance schedules

**Congratulations!** You've completed the full AI Intelligent Operations guide. Your PiKube cluster now has a production-grade AI agent for investigating incidents, reducing MTTR, and improving operational efficiency.

## Next Steps

1. **Deploy to production**: Follow Chapter 9 deployment steps
2. **Monitor metrics**: Set up Grafana dashboards (Chapter 10)
3. **Run tests**: Validate with Chapter 11 test suite
4. **Iterate**: Collect feedback and improve prompts/tools

## Additional Resources

- [LangChain Documentation](https://python.langchain.com/)
- [OpenAI Best Practices](https://platform.openai.com/docs/guides/production-best-practices)
- [Kubernetes Production Checklist](https://learnk8s.io/production-best-practices)
- [ArgoCD User Guide](https://argo-cd.readthedocs.io/)

---

**End of AI Intelligent Operations Guide**
