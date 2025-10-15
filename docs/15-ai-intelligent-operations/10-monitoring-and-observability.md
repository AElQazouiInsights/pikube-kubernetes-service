---
title: "Chapter 10: Monitoring and Observability"
permalink: /15-ai-intelligent-operations/10-monitoring-and-observability
description: "Implement comprehensive monitoring, metrics, and observability for your AI agent using Prometheus and Grafana"
last_modified_at: 2025-10-15
---

# Chapter 10: Monitoring and Observability

## Overview

Monitoring your AI agent is critical for:
- Tracking performance and costs
- Detecting anomalies early
- Optimizing cache hit rates
- Capacity planning

## Prometheus Metrics

```python
# app/metrics/agent_metrics.py
from prometheus_client import Counter, Histogram, Gauge, Summary

# Investigation metrics
investigations_total = Counter(
    'agent_investigations_total',
    'Total number of investigations',
    ['status', 'user_id']
)

investigation_duration_seconds = Histogram(
    'agent_investigation_duration_seconds',
    'Investigation duration',
    buckets=[1, 2, 5, 10, 30, 60, 120, 300]
)

# LLM metrics
llm_calls_total = Counter(
    'agent_llm_calls_total',
    'Total LLM API calls',
    ['model', 'status']
)

llm_tokens_used = Counter(
    'agent_llm_tokens_total',
    'Total tokens consumed',
    ['model', 'token_type']  # input/output
)

llm_cost_usd = Counter(
    'agent_llm_cost_usd_total',
    'Total LLM costs in USD'
)

# Cache metrics
cache_requests_total = Counter(
    'agent_cache_requests_total',
    'Cache requests',
    ['result']  # hit/miss
)

# Tool metrics
tool_calls_total = Counter(
    'agent_tool_calls_total',
    'Tool invocations',
    ['tool_name', 'status']
)

tool_duration_seconds = Histogram(
    'agent_tool_duration_seconds',
    'Tool execution time',
    ['tool_name'],
    buckets=[0.1, 0.5, 1, 2, 5, 10]
)
```

## Instrumenting the Agent with Metrics

Add metrics tracking to your FastAPI application:

```python
# app/api/main.py
from fastapi import FastAPI
from prometheus_client import make_asgi_app
from app.metrics.agent_metrics import (
    investigations_total,
    investigation_duration_seconds,
    llm_calls_total,
    llm_tokens_used,
    llm_cost_usd,
    cache_requests_total,
    tool_calls_total,
    tool_duration_seconds
)
import time

app = FastAPI(title="AI Agent API")

# Mount Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

@app.post("/investigate")
async def investigate(query: str, user_id: str):
    start_time = time.time()

    try:
        # Execute investigation
        result = await run_investigation(query, user_id)

        # Record success metrics
        investigations_total.labels(status="success", user_id=user_id).inc()
        duration = time.time() - start_time
        investigation_duration_seconds.observe(duration)

        return result

    except Exception as e:
        investigations_total.labels(status="error", user_id=user_id).inc()
        raise
```

**Tracking LLM calls:**

```python
# app/services/llm_service.py
from app.metrics.agent_metrics import llm_calls_total, llm_tokens_used, llm_cost_usd

class LLMService:
    async def call_openai(self, prompt: str, model: str = "gpt-4-turbo-preview"):
        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}]
            )

            # Track successful call
            llm_calls_total.labels(model=model, status="success").inc()

            # Track token usage
            usage = response.usage
            llm_tokens_used.labels(model=model, token_type="input").inc(usage.prompt_tokens)
            llm_tokens_used.labels(model=model, token_type="output").inc(usage.completion_tokens)

            # Calculate cost (see Chapter 8 pricing table)
            cost = self.calculate_cost(model, usage.prompt_tokens, usage.completion_tokens)
            llm_cost_usd.inc(cost)

            return response

        except Exception as e:
            llm_calls_total.labels(model=model, status="error").inc()
            raise
```

**Tracking cache performance:**

```python
# app/services/cache_service.py
from app.metrics.agent_metrics import cache_requests_total

class CacheService:
    async def get(self, key: str):
        value = await self.redis.get(key)

        if value:
            cache_requests_total.labels(result="hit").inc()
        else:
            cache_requests_total.labels(result="miss").inc()

        return value
```

**Tracking tool execution:**

```python
# app/tools/kubernetes_tools.py
from app.metrics.agent_metrics import tool_calls_total, tool_duration_seconds
import time

class KubernetesTool:
    async def execute(self, tool_name: str, *args):
        start_time = time.time()

        try:
            result = await self._run_tool(tool_name, *args)

            tool_calls_total.labels(tool_name=tool_name, status="success").inc()
            duration = time.time() - start_time
            tool_duration_seconds.labels(tool_name=tool_name).observe(duration)

            return result

        except Exception as e:
            tool_calls_total.labels(tool_name=tool_name, status="error").inc()
            raise
```

## Complete Grafana Dashboard JSON

Save this as `grafana/dashboards/ai-agent-dashboard.json`:

```json
{
  "dashboard": {
    "id": null,
    "uid": "ai-agent-dashboard",
    "title": "PiKube AI Agent - Intelligent Operations",
    "tags": ["ai", "agent", "kubernetes", "pikube"],
    "timezone": "browser",
    "schemaVersion": 38,
    "version": 1,
    "refresh": "30s",

    "panels": [
      {
        "id": 1,
        "title": "Investigation Rate (per minute)",
        "type": "graph",
        "gridPos": {"x": 0, "y": 0, "w": 6, "h": 8},
        "targets": [
          {
            "expr": "sum(rate(agent_investigations_total[5m])) * 60",
            "legendFormat": "All Investigations",
            "refId": "A"
          },
          {
            "expr": "sum(rate(agent_investigations_total{status=\"success\"}[5m])) * 60",
            "legendFormat": "Successful",
            "refId": "B"
          },
          {
            "expr": "sum(rate(agent_investigations_total{status=\"error\"}[5m])) * 60",
            "legendFormat": "Failed",
            "refId": "C"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "reqpm",
            "decimals": 2
          }
        }
      },

      {
        "id": 2,
        "title": "Investigation Success Rate",
        "type": "gauge",
        "gridPos": {"x": 6, "y": 0, "w": 6, "h": 8},
        "targets": [
          {
            "expr": "sum(rate(agent_investigations_total{status=\"success\"}[5m])) / sum(rate(agent_investigations_total[5m])) * 100",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "min": 0,
            "max": 100,
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": 0, "color": "red"},
                {"value": 90, "color": "yellow"},
                {"value": 95, "color": "green"}
              ]
            }
          }
        }
      },

      {
        "id": 3,
        "title": "Cache Hit Rate",
        "type": "stat",
        "gridPos": {"x": 12, "y": 0, "w": 6, "h": 8},
        "targets": [
          {
            "expr": "sum(rate(agent_cache_requests_total{result=\"hit\"}[5m])) / sum(rate(agent_cache_requests_total[5m])) * 100",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "decimals": 1,
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": 0, "color": "red"},
                {"value": 50, "color": "yellow"},
                {"value": 70, "color": "green"}
              ]
            }
          }
        }
      },

      {
        "id": 4,
        "title": "Active Investigations",
        "type": "stat",
        "gridPos": {"x": 18, "y": 0, "w": 6, "h": 8},
        "targets": [
          {
            "expr": "sum(agent_active_investigations)",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "decimals": 0
          }
        }
      },

      {
        "id": 5,
        "title": "Investigation Latency (P50, P95, P99)",
        "type": "graph",
        "gridPos": {"x": 0, "y": 8, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "histogram_quantile(0.50, sum(rate(agent_investigation_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "P50",
            "refId": "A"
          },
          {
            "expr": "histogram_quantile(0.95, sum(rate(agent_investigation_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "P95",
            "refId": "B"
          },
          {
            "expr": "histogram_quantile(0.99, sum(rate(agent_investigation_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "P99",
            "refId": "C"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "s",
            "decimals": 2
          }
        }
      },

      {
        "id": 6,
        "title": "LLM API Calls by Model",
        "type": "graph",
        "gridPos": {"x": 12, "y": 8, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "sum(rate(agent_llm_calls_total[5m])) by (model)",
            "legendFormat": "{{model}}",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "reqps",
            "decimals": 3
          }
        }
      },

      {
        "id": 7,
        "title": "LLM Token Usage (Input vs Output)",
        "type": "graph",
        "gridPos": {"x": 0, "y": 16, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "sum(rate(agent_llm_tokens_total{token_type=\"input\"}[5m])) * 60",
            "legendFormat": "Input Tokens/min",
            "refId": "A"
          },
          {
            "expr": "sum(rate(agent_llm_tokens_total{token_type=\"output\"}[5m])) * 60",
            "legendFormat": "Output Tokens/min",
            "refId": "B"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "decimals": 0
          }
        }
      },

      {
        "id": 8,
        "title": "LLM Cost (Hourly)",
        "type": "stat",
        "gridPos": {"x": 12, "y": 16, "w": 6, "h": 8},
        "targets": [
          {
            "expr": "increase(agent_llm_cost_usd_total[1h])",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "currencyUSD",
            "decimals": 4,
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": 0, "color": "green"},
                {"value": 5, "color": "yellow"},
                {"value": 10, "color": "red"}
              ]
            }
          }
        }
      },

      {
        "id": 9,
        "title": "LLM Cost (Daily)",
        "type": "stat",
        "gridPos": {"x": 18, "y": 16, "w": 6, "h": 8},
        "targets": [
          {
            "expr": "increase(agent_llm_cost_usd_total[24h])",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "currencyUSD",
            "decimals": 2,
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": 0, "color": "green"},
                {"value": 50, "color": "yellow"},
                {"value": 100, "color": "red"}
              ]
            }
          }
        }
      },

      {
        "id": 10,
        "title": "Tool Execution Rate by Tool",
        "type": "graph",
        "gridPos": {"x": 0, "y": 24, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "sum(rate(agent_tool_calls_total[5m])) by (tool_name)",
            "legendFormat": "{{tool_name}}",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "reqps",
            "decimals": 3
          }
        }
      },

      {
        "id": 11,
        "title": "Tool Execution Latency by Tool",
        "type": "graph",
        "gridPos": {"x": 12, "y": 24, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(agent_tool_duration_seconds_bucket[5m])) by (tool_name, le))",
            "legendFormat": "{{tool_name}} (P95)",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "s",
            "decimals": 3
          }
        }
      },

      {
        "id": 12,
        "title": "Memory Usage (Conversation History)",
        "type": "graph",
        "gridPos": {"x": 0, "y": 32, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "agent_memory_conversations_total",
            "legendFormat": "Total Conversations",
            "refId": "A"
          },
          {
            "expr": "agent_memory_messages_total",
            "legendFormat": "Total Messages",
            "refId": "B"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "decimals": 0
          }
        }
      },

      {
        "id": 13,
        "title": "Database Connection Pool",
        "type": "graph",
        "gridPos": {"x": 12, "y": 32, "w": 12, "h": 8},
        "targets": [
          {
            "expr": "agent_db_pool_connections_active",
            "legendFormat": "Active Connections",
            "refId": "A"
          },
          {
            "expr": "agent_db_pool_connections_idle",
            "legendFormat": "Idle Connections",
            "refId": "B"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "decimals": 0
          }
        }
      },

      {
        "id": 14,
        "title": "Pod CPU Usage",
        "type": "graph",
        "gridPos": {"x": 0, "y": 40, "w": 8, "h": 8},
        "targets": [
          {
            "expr": "sum(rate(container_cpu_usage_seconds_total{namespace=\"ai-operations\",pod=~\"ai-agent-.*\"}[5m])) by (pod) * 100",
            "legendFormat": "{{pod}}",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "decimals": 1,
            "max": 200
          }
        }
      },

      {
        "id": 15,
        "title": "Pod Memory Usage",
        "type": "graph",
        "gridPos": {"x": 8, "y": 40, "w": 8, "h": 8},
        "targets": [
          {
            "expr": "sum(container_memory_working_set_bytes{namespace=\"ai-operations\",pod=~\"ai-agent-.*\"}) by (pod) / 1024 / 1024 / 1024",
            "legendFormat": "{{pod}}",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "decgbytes",
            "decimals": 2
          }
        }
      },

      {
        "id": 16,
        "title": "Pod Restart Count",
        "type": "stat",
        "gridPos": {"x": 16, "y": 40, "w": 8, "h": 8},
        "targets": [
          {
            "expr": "sum(kube_pod_container_status_restarts_total{namespace=\"ai-operations\",pod=~\"ai-agent-.*\"})",
            "refId": "A"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "decimals": 0,
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": 0, "color": "green"},
                {"value": 1, "color": "yellow"},
                {"value": 5, "color": "red"}
              ]
            }
          }
        }
      }
    ],

    "templating": {
      "list": [
        {
          "name": "namespace",
          "type": "query",
          "query": "label_values(agent_investigations_total, namespace)",
          "current": {"value": "ai-operations"}
        }
      ]
    },

    "time": {
      "from": "now-6h",
      "to": "now"
    }
  }
}
```

## ServiceMonitor for Prometheus

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ai-agent
  namespace: ai-operations
spec:
  selector:
    matchLabels:
      app: ai-agent
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

## PrometheusRule for AlertManager

Create alert rules for critical conditions:

```yaml
# monitoring/prometheusrule-ai-agent.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: ai-agent-alerts
  namespace: ai-operations
  labels:
    app: ai-agent
    prometheus: kube-prometheus
spec:
  groups:
    - name: ai-agent.rules
      interval: 30s
      rules:
        # Investigation failure rate too high
        - alert: HighInvestigationFailureRate
          expr: |
            sum(rate(agent_investigations_total{status="error"}[5m]))
            / sum(rate(agent_investigations_total[5m])) * 100 > 10
          for: 5m
          labels:
            severity: warning
            component: ai-agent
          annotations:
            summary: "High investigation failure rate"
            description: "{{ $value | humanizePercentage }} of investigations are failing (threshold: 10%)"

        - alert: CriticalInvestigationFailureRate
          expr: |
            sum(rate(agent_investigations_total{status="error"}[5m]))
            / sum(rate(agent_investigations_total[5m])) * 100 > 25
          for: 2m
          labels:
            severity: critical
            component: ai-agent
          annotations:
            summary: "Critical investigation failure rate"
            description: "{{ $value | humanizePercentage }} of investigations are failing (threshold: 25%)"

        # Investigation latency too high
        - alert: HighInvestigationLatency
          expr: |
            histogram_quantile(0.95,
              sum(rate(agent_investigation_duration_seconds_bucket[5m])) by (le)
            ) > 60
          for: 5m
          labels:
            severity: warning
            component: ai-agent
          annotations:
            summary: "High investigation latency"
            description: "P95 investigation latency is {{ $value | humanizeDuration }} (threshold: 60s)"

        # LLM API errors
        - alert: LLMAPIErrors
          expr: |
            sum(rate(agent_llm_calls_total{status="error"}[5m])) > 0.1
          for: 5m
          labels:
            severity: warning
            component: ai-agent
          annotations:
            summary: "LLM API errors detected"
            description: "{{ $value | humanize }} LLM API errors per second"

        # Cost budget exceeded
        - alert: DailyLLMCostBudgetExceeded
          expr: increase(agent_llm_cost_usd_total[24h]) > 100
          for: 1h
          labels:
            severity: warning
            component: ai-agent
          annotations:
            summary: "Daily LLM cost budget exceeded"
            description: "Daily LLM cost is ${{ $value | humanize }} (budget: $100)"

        - alert: HourlyLLMCostSpike
          expr: increase(agent_llm_cost_usd_total[1h]) > 20
          for: 5m
          labels:
            severity: warning
            component: ai-agent
          annotations:
            summary: "Unusual LLM cost spike detected"
            description: "Spent ${{ $value | humanize }} in the last hour"

        # Cache hit rate too low
        - alert: LowCacheHitRate
          expr: |
            sum(rate(agent_cache_requests_total{result="hit"}[10m]))
            / sum(rate(agent_cache_requests_total[10m])) * 100 < 50
          for: 10m
          labels:
            severity: info
            component: ai-agent
          annotations:
            summary: "Low cache hit rate"
            description: "Cache hit rate is {{ $value | humanizePercentage }} (threshold: 50%)"

        # Pod restarts
        - alert: FrequentPodRestarts
          expr: |
            rate(kube_pod_container_status_restarts_total{
              namespace="ai-operations",
              pod=~"ai-agent-.*"
            }[15m]) * 3600 > 1
          for: 5m
          labels:
            severity: warning
            component: ai-agent
          annotations:
            summary: "Frequent pod restarts detected"
            description: "Pod {{ $labels.pod }} is restarting frequently"

        # Memory usage
        - alert: HighMemoryUsage
          expr: |
            sum(container_memory_working_set_bytes{
              namespace="ai-operations",
              pod=~"ai-agent-.*"
            }) / sum(container_spec_memory_limit_bytes{
              namespace="ai-operations",
              pod=~"ai-agent-.*"
            }) * 100 > 80
          for: 5m
          labels:
            severity: warning
            component: ai-agent
          annotations:
            summary: "High memory usage"
            description: "Memory usage is {{ $value | humanizePercentage }}"

        # Database connection pool exhaustion
        - alert: DatabaseConnectionPoolExhaustion
          expr: |
            agent_db_pool_connections_active
            / (agent_db_pool_connections_active + agent_db_pool_connections_idle) * 100 > 90
          for: 5m
          labels:
            severity: warning
            component: ai-agent
          annotations:
            summary: "Database connection pool near exhaustion"
            description: "{{ $value | humanizePercentage }} of connection pool in use"

        # Tool execution failures
        - alert: HighToolFailureRate
          expr: |
            sum(rate(agent_tool_calls_total{status="error"}[5m])) by (tool_name)
            / sum(rate(agent_tool_calls_total[5m])) by (tool_name) * 100 > 15
          for: 5m
          labels:
            severity: warning
            component: ai-agent
          annotations:
            summary: "High tool failure rate"
            description: "Tool {{ $labels.tool_name }} has {{ $value | humanizePercentage }} failure rate"
```

## Loki Integration for Log Aggregation

Configure Loki to collect logs from the AI agent:

```yaml
# monitoring/loki-datasource.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasources
  namespace: monitoring
data:
  loki.yaml: |
    apiVersion: 1
    datasources:
      - name: Loki
        type: loki
        access: proxy
        url: http://loki.monitoring.svc.cluster.local:3100
        isDefault: false
        editable: true
```

**Useful Loki queries for the AI agent:**

```logql
# All AI agent logs in the last hour
{namespace="ai-operations", app="ai-agent"}

# Error logs only
{namespace="ai-operations", app="ai-agent"} |= "ERROR"

# LLM API call logs
{namespace="ai-operations", app="ai-agent"} |= "llm_call"

# Investigation start and completion
{namespace="ai-operations", app="ai-agent"} |~ "investigation_(started|completed)"

# Tool execution traces
{namespace="ai-operations", app="ai-agent"} | json | tool_name != ""

# Cost tracking logs
{namespace="ai-operations", app="ai-agent"} | json | cost_usd > 0

# Rate of error logs (per minute)
rate({namespace="ai-operations", app="ai-agent"} |= "ERROR" [5m])

# Top 10 most common error messages
topk(10,
  sum by (error_message) (
    count_over_time({namespace="ai-operations", app="ai-agent"} | json | error_message != "" [1h])
  )
)

# Investigation duration from logs
avg_over_time(
  {namespace="ai-operations", app="ai-agent"}
  | json
  | investigation_duration_seconds != ""
  | unwrap investigation_duration_seconds [5m]
)

# Filter investigations by user_id
{namespace="ai-operations", app="ai-agent"} | json | user_id="user@example.com"
```

## Structured Logging in the Agent

Update your application to emit structured JSON logs:

```python
# app/utils/logging.py
import logging
import json
from datetime import datetime
from typing import Any, Dict

class StructuredLogger:
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)

    def _log(self, level: str, message: str, **kwargs):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": message,
            **kwargs
        }
        getattr(self.logger, level.lower())(json.dumps(log_entry))

    def info(self, message: str, **kwargs):
        self._log("INFO", message, **kwargs)

    def error(self, message: str, **kwargs):
        self._log("ERROR", message, **kwargs)

    def warning(self, message: str, **kwargs):
        self._log("WARNING", message, **kwargs)

# Usage in agent
logger = StructuredLogger("ai-agent")

logger.info(
    "Investigation started",
    investigation_id=investigation.id,
    user_id=user.id,
    query=query
)

logger.info(
    "LLM call completed",
    model="gpt-4-turbo-preview",
    tokens_input=usage.prompt_tokens,
    tokens_output=usage.completion_tokens,
    cost_usd=cost,
    duration_seconds=duration
)

logger.error(
    "Investigation failed",
    investigation_id=investigation.id,
    error_type=type(e).__name__,
    error_message=str(e)
)
```

## Deploying the Monitoring Stack

### Step 1: Create Grafana Dashboard ConfigMap

```bash
# Create ConfigMap from dashboard JSON
kubectl create configmap grafana-dashboard-ai-agent \
  --from-file=ai-agent-dashboard.json=grafana/dashboards/ai-agent-dashboard.json \
  -n monitoring \
  --dry-run=client -o yaml | kubectl apply -f -

# Label for auto-discovery by Grafana
kubectl label configmap grafana-dashboard-ai-agent \
  -n monitoring \
  grafana_dashboard="1"
```

### Step 2: Apply ServiceMonitor

```bash
kubectl apply -f monitoring/servicemonitor-ai-agent.yaml

# Verify ServiceMonitor created
kubectl get servicemonitor -n ai-operations ai-agent

# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus-k8s 9090:9090
# Open http://localhost:9090/targets and verify ai-agent target
```

### Step 3: Apply PrometheusRule

```bash
kubectl apply -f monitoring/prometheusrule-ai-agent.yaml

# Verify rules loaded
kubectl get prometheusrule -n ai-operations ai-agent-alerts

# Check in Prometheus UI
# Open http://localhost:9090/alerts
```

### Step 4: Configure AlertManager

```yaml
# monitoring/alertmanager-config.yaml
apiVersion: v1
kind: Secret
metadata:
  name: alertmanager-main
  namespace: monitoring
type: Opaque
stringData:
  alertmanager.yaml: |
    global:
      resolve_timeout: 5m
      slack_api_url: <SLACK_WEBHOOK_URL_FROM_VAULT>

    route:
      group_by: ['alertname', 'component']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'slack-notifications'

      routes:
        # Critical alerts go to PagerDuty
        - match:
            severity: critical
          receiver: 'pagerduty'

        # Warnings go to Slack
        - match:
            severity: warning
          receiver: 'slack-notifications'

        # Info alerts go to Slack (less frequently)
        - match:
            severity: info
          receiver: 'slack-notifications'
          repeat_interval: 24h

    receivers:
      - name: 'slack-notifications'
        slack_configs:
          - channel: '#ai-agent-alerts'
            title: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
            text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
            send_resolved: true

      - name: 'pagerduty'
        pagerduty_configs:
          - service_key: <PAGERDUTY_KEY_FROM_VAULT>
            description: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

Apply the configuration:

```bash
kubectl apply -f monitoring/alertmanager-config.yaml

# Verify AlertManager pods restart
kubectl get pods -n monitoring -l app.kubernetes.io/name=alertmanager

# Test alert routing
kubectl port-forward -n monitoring svc/alertmanager-main 9093:9093
# Open http://localhost:9093
```

## Accessing Grafana

```bash
# Port-forward to Grafana
kubectl port-forward -n monitoring svc/grafana 3000:80

# Get Grafana admin password
kubectl get secret -n monitoring grafana-admin-credentials \
  -o jsonpath='{.data.password}' | base64 -d

# Open http://localhost:3000
# Username: admin
# Password: <from above command>
```

**Import the AI Agent Dashboard:**

1. Navigate to Dashboards → Import
2. Upload `ai-agent-dashboard.json`
3. Select Prometheus datasource
4. Click Import

Or use the ConfigMap auto-discovery (if configured):

```yaml
# monitoring/grafana-dashboard-provider.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-provider
  namespace: monitoring
data:
  dashboards.yaml: |
    apiVersion: 1
    providers:
      - name: 'default'
        orgId: 1
        folder: 'AI Operations'
        type: file
        disableDeletion: false
        editable: true
        options:
          path: /etc/grafana/dashboards
```

## Testing the Observability Stack

### Generate Test Traffic

```bash
# Port-forward to AI agent
kubectl port-forward -n ai-operations svc/ai-agent 8000:80

# Send test investigation requests
for i in {1..100}; do
  curl -X POST http://localhost:8000/investigate \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"Check pod status in default namespace\", \"user_id\": \"test@example.com\"}"
  sleep 2
done
```

### Verify Metrics in Prometheus

```bash
# Port-forward to Prometheus
kubectl port-forward -n monitoring svc/prometheus-k8s 9090:9090

# Query metrics
curl 'http://localhost:9090/api/v1/query?query=agent_investigations_total'

# Expected response:
# {
#   "data": {
#     "result": [
#       {
#         "metric": {"status": "success", "user_id": "test@example.com"},
#         "value": [1697500000, "100"]
#       }
#     ]
#   }
# }
```

### Verify Logs in Loki

```bash
# Port-forward to Loki
kubectl port-forward -n monitoring svc/loki 3100:3100

# Query logs
curl -G 'http://localhost:3100/loki/api/v1/query' \
  --data-urlencode 'query={namespace="ai-operations", app="ai-agent"}' \
  --data-urlencode 'limit=10'
```

## Observability Best Practices

### Cardinality Management

Be careful with high-cardinality labels:

```python
# BAD: user_id as label (unbounded cardinality)
investigations_total.labels(user_id=user.email).inc()

# GOOD: Use fixed labels, log user_id
investigations_total.labels(status="success").inc()
logger.info("Investigation completed", user_id=user.email)
```

### Metric Naming Conventions

Follow Prometheus naming best practices:

- `agent_investigations_total` (counter) - use `_total` suffix
- `agent_investigation_duration_seconds` (histogram) - use base unit
- `agent_active_investigations` (gauge) - no suffix
- All metrics prefixed with `agent_` for namespace

### Dashboard Design Principles

1. **Top-level overview**: Show overall system health first
2. **RED metrics**: Rate, Errors, Duration for all services
3. **USE metrics**: Utilization, Saturation, Errors for resources
4. **Business metrics**: LLM cost, cache hit rate
5. **Drill-down capability**: Link panels to detailed views

### Alert Design Principles

1. **Actionable**: Every alert should require human action
2. **Symptomatic**: Alert on user-facing symptoms, not causes
3. **Tuned thresholds**: Based on historical data, not guesses
4. **Runbooks**: Include resolution steps in annotations

Example runbook link in alert:

```yaml
- alert: HighInvestigationFailureRate
  annotations:
    summary: "High investigation failure rate"
    description: "{{ $value | humanizePercentage }} of investigations failing"
    runbook_url: "https://wiki.company.com/runbooks/ai-agent-high-failure-rate"
```

## Monitoring Checklist

Before going to production:

- [ ] All application metrics instrumented
- [ ] Structured JSON logging implemented
- [ ] ServiceMonitor deployed and targets scraped
- [ ] Grafana dashboard imported and functional
- [ ] PrometheusRule deployed with appropriate thresholds
- [ ] AlertManager configured with correct receivers
- [ ] Alert routing tested (Slack, PagerDuty)
- [ ] Loki datasource configured in Grafana
- [ ] Runbooks created for all critical alerts
- [ ] On-call rotation configured
- [ ] Retention policies configured (metrics: 15d, logs: 7d)

## Troubleshooting Observability

### Metrics Not Appearing

**Symptom**: No data in Grafana dashboard

```bash
# Check ServiceMonitor exists
kubectl get servicemonitor -n ai-operations ai-agent

# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus-k8s 9090:9090
# Visit http://localhost:9090/targets
# Look for ai-agent target - should be "UP"

# If target is down, check service
kubectl get svc -n ai-operations ai-agent

# Check if /metrics endpoint works
kubectl port-forward -n ai-operations svc/ai-agent 8000:80
curl http://localhost:8000/metrics
```

### Alerts Not Firing

**Symptom**: Expected alerts not appearing

```bash
# Check PrometheusRule exists
kubectl get prometheusrule -n ai-operations ai-agent-alerts

# Verify rules loaded in Prometheus
kubectl port-forward -n monitoring svc/prometheus-k8s 9090:9090
# Visit http://localhost:9090/rules

# Test alert expression manually
# Visit http://localhost:9090/graph
# Enter: sum(rate(agent_investigations_total{status="error"}[5m])) / sum(rate(agent_investigations_total[5m])) * 100

# Check AlertManager
kubectl port-forward -n monitoring svc/alertmanager-main 9093:9093
# Visit http://localhost:9093
```

### Logs Not in Loki

**Symptom**: No logs appearing in Grafana Explore

```bash
# Check Loki pod running
kubectl get pods -n monitoring -l app=loki

# Check Promtail collecting logs
kubectl get pods -n monitoring -l app=promtail

# Check Promtail config
kubectl get configmap -n monitoring promtail -o yaml

# Test Loki query directly
kubectl port-forward -n monitoring svc/loki 3100:3100
curl -G 'http://localhost:3100/loki/api/v1/query' \
  --data-urlencode 'query={namespace="ai-operations"}'
```

## Summary

✓ Comprehensive Prometheus metrics for investigations, LLM calls, cache, tools, and resources
✓ Production-ready Grafana dashboard with 16 panels covering all key metrics
✓ AlertManager rules for cost tracking, performance, and reliability
✓ Loki integration for structured log aggregation and querying
✓ Structured JSON logging for better observability
✓ Complete deployment and testing procedures

**Next**: Chapter 11 - Testing and Validation

---
