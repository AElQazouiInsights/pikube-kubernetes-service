---
title: "AI Agent Architecture and Design for PiKube"
permalink: /15-ai-intelligent-operations/2-architecture-and-design
description: "Complete architectural design for a production-grade AI agent system integrated with PiKube. Learn the hybrid edge+cloud architecture, component breakdown, integration points, and deployment strategy."
last_modified_at: 2025-10-15
---

# {{ $frontmatter.title }}

## Overview

In Chapter 1, you learned **what** AI agents are and **why** they're valuable for PiKube. This chapter shows you **how** to architect a production-grade AI agent system that integrates seamlessly with your existing infrastructure.

We'll design a **hybrid architecture** that balances the power of cloud-based LLMs with the privacy and control of on-cluster processing. This approach is specifically optimized for ARM hardware constraints while maintaining enterprise-grade reliability.

### What You'll Learn

By the end of this chapter, you'll understand:

- ✅ **Why hybrid edge+cloud** is the best architecture for ARM clusters
- ✅ **Complete system architecture** with all components and data flows
- ✅ **Technology stack decisions** and trade-offs (LangChain vs custom, OpenAI vs Anthropic vs local)
- ✅ **Integration points** with Prometheus, Loki, Elasticsearch, ArgoCD, Vault, Linkerd
- ✅ **Node placement strategy** leveraging grapefruit-worker's NVMe storage
- ✅ **Cost analysis** and optimization strategies ($150-300/month target)
- ✅ **Deployment architecture** using ArgoCD and Helm

---

## Design Principles

Before diving into the architecture, let's establish the guiding principles that shape every design decision:

### 1. **Production-Grade Reliability**

```yaml
Target Uptime: 99.5% (43 minutes downtime/month)
MTBF (Mean Time Between Failures): > 720 hours (30 days)
MTTR (Mean Time To Recover): < 5 minutes
```

**How we achieve this:**
- Stateless agent orchestrator (can restart without data loss)
- Persistent storage for memory and incidents (PostgreSQL on Longhorn)
- Health checks and automatic restart (Kubernetes probes)
- Circuit breakers for external API failures
- Graceful degradation (use cache when APIs unavailable)

### 2. **Cost Optimization**

```yaml
Monthly Budget Target: $150-300 USD
Primary Expense: OpenAI/Anthropic API calls
Cost Per Incident Analysis: < $0.50
ROI Target: 5-10x (engineer time saved vs API costs)
```

**How we achieve this:**
- Aggressive caching of LLM responses (70%+ cache hit ratio)
- Rate limiting to prevent runaway costs
- Smart sampling (don't analyze every log line)
- Prompt optimization (shorter = cheaper)
- Daily budget limits with automatic shutoff

### 3. **Security-First Approach**

```yaml
Data Privacy: Sensitive data stays in-cluster
API Keys: Stored in HashiCorp Vault, never in Git
Network Isolation: Agent namespace with NetworkPolicy
RBAC: Read-only cluster access (no pod exec/delete)
Audit Logging: All agent actions logged
```

**How we achieve this:**
- Data anonymization before sending to LLM
- External Secrets Operator for Vault integration
- Minimal ServiceAccount permissions
- Secret scanning in CI/CD
- No PII, credentials, or secrets to external APIs

### 4. **ARM Architecture Optimization**

```yaml
Challenge: ARM64 can't run large LLMs efficiently
Solution: Hybrid edge+cloud architecture
On-Cluster: Data collection, tool execution, caching, storage
In-Cloud: LLM reasoning (OpenAI/Anthropic APIs)
Future: Local inference for simple tasks (Ollama + Llama)
```

**Why this matters:**
- Running GPT-4 equivalent locally requires 80GB+ RAM and GPU
- Your largest node (orange-worker) has 16GB RAM
- Inference on ARM CPU is 10-100x slower than x86 GPU
- Cloud APIs cost less than running local LLMs at scale

---

## Hybrid Architecture Overview

Our architecture splits responsibilities between **on-cluster processing** (privacy, control, speed) and **cloud LLM reasoning** (intelligence, language understanding).

```mermaid
flowchart TB
    subgraph HOME["🏠 Home Network (192.168.0.0/24)"]
        LAPTOP["💻 Your Laptop"]
    end

    subgraph CLUSTER["🚀 PiKube Cluster (10.0.0.0/24)"]
        subgraph OBSERVABILITY["📊 Existing Observability Stack"]
            PROM["Prometheus<br/>:9090"]
            LOKI["Loki<br/>:3100"]
            ES["Elasticsearch<br/>:9200"]
            GRAFANA["Grafana<br/>:3000"]
        end

        subgraph AGENT_NS["🤖 AI Agent Namespace (ai-operations)"]
            subgraph CORE["Agent Core"]
                ORCH["Agent Orchestrator<br/>FastAPI + LangChain<br/>ReAct Pattern"]
                TOOLS["Tool Registry<br/>10+ Tools"]
                GUARD["Guardrails Layer<br/>Rate Limits + Validation"]
            end

            subgraph MEMORY["Memory Layer"]
                REDIS["Redis<br/>Session Cache<br/>10GB PVC"]
                POSTGRES["PostgreSQL + pgvector<br/>Incident Database<br/>50GB PVC"]
                CHROMA["ChromaDB<br/>Vector Search<br/>20GB PVC"]
            end
        end

        subgraph K8S["⚙️ Kubernetes Services"]
            ARGOCD["ArgoCD<br/>GitOps"]
            VAULT_ESO["External Secrets<br/>+ Vault"]
            LINKERD["Linkerd<br/>Service Mesh"]
        end
    end

    subgraph CLOUD["☁️ Cloud Services"]
        OPENAI["OpenAI API<br/>GPT-4 Turbo"]
        ANTHROPIC["Anthropic API<br/>Claude 3.5"]
    end

    subgraph NOTIFICATIONS["📢 Notifications"]
        SLACK["Slack<br/>#incidents"]
        PAGERDUTY["PagerDuty<br/>On-Call"]
    end

    %% Data Collection Flow
    PROM --> ORCH
    LOKI --> ORCH
    ES --> ORCH

    %% Agent Core Flow
    ORCH <--> TOOLS
    ORCH <--> GUARD
    GUARD -.validates.-> TOOLS

    %% Memory Flow
    ORCH <--> REDIS
    ORCH <--> POSTGRES
    ORCH <--> CHROMA

    %% LLM Flow
    ORCH --> OPENAI
    ORCH --> ANTHROPIC
    OPENAI -.response.-> ORCH
    ANTHROPIC -.response.-> ORCH

    %% Integration Flow
    VAULT_ESO -.secrets.-> ORCH
    ARGOCD -.deploys.-> AGENT_NS
    LINKERD -.encrypts.-> ORCH

    %% Notification Flow
    ORCH --> SLACK
    ORCH --> PAGERDUTY

    %% Monitoring Flow
    ORCH -.metrics.-> PROM
    ORCH -.logs.-> LOKI
    GRAFANA -.queries.-> PROM

    %% User Access
    LAPTOP --> GRAFANA
    LAPTOP --> SLACK

    classDef observability fill:#4ECDC4,stroke:#45B7B8,stroke-width:2px,color:#fff
    classDef agent fill:#667eea,stroke:#764ba2,stroke-width:3px,color:#fff
    classDef memory fill:#96CEB4,stroke:#6C5CE7,stroke-width:2px,color:#000
    classDef cloud fill:#45B7D1,stroke:#3742FA,stroke-width:2px,color:#fff
    classDef k8s fill:#FF6B6B,stroke:#E55353,stroke-width:2px,color:#fff

    class PROM,LOKI,ES,GRAFANA observability
    class ORCH,TOOLS,GUARD agent
    class REDIS,POSTGRES,CHROMA memory
    class OPENAI,ANTHROPIC cloud
    class ARGOCD,VAULT_ESO,LINKERD k8s
```

### Data Flow Explanation

**1. Continuous Monitoring (Every 5 minutes)**
```
Prometheus/Loki/ES → Agent Orchestrator
↓
Detect anomaly (error rate spike)
↓
Trigger investigation
```

**2. Investigation Phase**
```
Agent Orchestrator decides tools needed
↓
Execute tools in parallel:
  - query_prometheus() → Get metrics
  - query_loki() → Get logs
  - get_pod_status() → Check K8s
↓
Store context in Redis (short-term memory)
```

**3. Reasoning Phase**
```
Send anonymized data to OpenAI/Anthropic
↓
LLM analyzes: "Root cause is X because Y"
↓
Cache response in Redis (avoid re-analysis)
```

**4. Decision Phase**
```
Search past incidents in PostgreSQL + ChromaDB
↓
Find similar: "This matches incident #1205"
↓
Validate with guardrails (confidence > 70%?)
↓
Generate alert with recommendations
```

**5. Action Phase**
```
Send Slack alert with evidence
↓
Store incident in PostgreSQL for future learning
↓
Update embeddings in ChromaDB
↓
Log all actions to Loki for audit
```

---

## Component Deep Dive

Let's examine each component in detail.

### 1. Agent Orchestrator (The Brain)

**Technology Stack:**
```yaml
Language: Python 3.11+
Framework: LangChain 0.1.x
Web Framework: FastAPI 0.109+
Pattern: ReAct (Reasoning + Acting loop)
Deployment: Kubernetes Deployment (1 replica)
```

**Why LangChain?**

LangChain provides:
- ✅ Built-in ReAct agent implementation
- ✅ Tool abstraction and execution framework
- ✅ Memory management utilities
- ✅ Prompt templates and optimization
- ✅ Support for multiple LLM providers
- ✅ Active community and good documentation

**Alternative considered: Custom implementation**
- ✅ Pros: Full control, optimized for ARM, minimal dependencies
- ❌ Cons: 3-4 weeks additional development time, reinventing wheel
- 🎯 **Decision: Use LangChain** (80/20 rule - 20% effort, 80% value)

**Core Responsibilities:**

```python
# Pseudo-code for agent orchestrator main loop

class AIAgentOrchestrator:
    def __init__(self):
        self.llm = OpenAI(model="gpt-4-turbo")  # Primary LLM
        self.tools = load_tools()  # 10+ tools
        self.memory = MemoryManager(redis, postgres)
        self.guardrails = GuardrailsLayer()

    async def run_investigation(self, trigger):
        """Main ReAct loop for incident investigation"""

        # Initialize session
        session = self.memory.create_session(trigger)

        # ReAct loop
        max_iterations = 10
        for i in range(max_iterations):
            # THOUGHT: What should I do next?
            thought = await self.llm.think(
                context=session.context,
                observations=session.observations
            )

            # ACTION: Execute chosen tool
            if thought.needs_tool:
                tool_result = await self.execute_tool(
                    tool_name=thought.tool_name,
                    tool_params=thought.tool_params
                )

                # Validate with guardrails
                if not self.guardrails.validate(tool_result):
                    continue

                # Store observation
                session.add_observation(tool_result)

            # DECISION: Are we done?
            if thought.is_conclusive:
                break

        # Generate final report
        report = await self.generate_report(session)

        # Send alerts
        await self.send_alerts(report)

        # Store for learning
        await self.memory.store_incident(report)

        return report
```

**Resource Requirements:**

```yaml
Pod Specification:
  Resources:
    Requests:
      CPU: 1 core
      Memory: 2Gi
    Limits:
      CPU: 2 cores
      Memory: 4Gi

  Node Selector:
    kubernetes.io/hostname: grapefruit-worker

  Reason: NVMe storage for fast cache access
```

> [!TIP]
> **Performance Optimization**
>
> The agent orchestrator is CPU-bound during LLM API calls (JSON parsing, prompt building). We place it on grapefruit-worker because:
> - NVMe storage for ultra-fast Redis cache reads
> - 16GB RAM allows comfortable 4GB allocation
> - Orange Pi 5 has better CPU than Raspberry Pi nodes

---

### 2. Tool Registry

**Purpose:** Abstraction layer for all agent actions

**Tool Definition Structure:**

```python
# Base tool interface
from langchain.tools import BaseTool
from typing import Optional, Type
from pydantic import BaseModel, Field

class QueryPrometheusInput(BaseModel):
    """Input schema for Prometheus query tool"""
    query: str = Field(description="PromQL query to execute")
    time_range: str = Field(default="5m", description="Time range (e.g., 5m, 1h, 24h)")

class QueryPrometheusTool(BaseTool):
    name = "query_prometheus"
    description = """
    Query Prometheus metrics to get time-series data.
    Use this for: CPU usage, memory pressure, error rates, request latency
    Example query: 'rate(http_requests_total[5m])'
    """
    args_schema: Type[BaseModel] = QueryPrometheusInput

    def _run(self, query: str, time_range: str = "5m") -> dict:
        """Execute the Prometheus query"""
        endpoint = "http://prometheus.monitoring.svc.cluster.local:9090"
        # Implementation...
        return {
            "status": "success",
            "data": results,
            "query": query,
            "timestamp": datetime.utcnow()
        }

    async def _arun(self, *args, **kwargs):
        """Async version"""
        return self._run(*args, **kwargs)
```

**Complete Tool List:**

| Tool Name | Purpose | Data Source | Example Use |
|-----------|---------|-------------|-------------|
| `query_prometheus` | Get metrics | Prometheus:9090 | Error rates, CPU, memory |
| `query_loki` | Search logs | Loki:3100 | Error messages, stack traces |
| `query_elasticsearch` | Advanced log search | Elasticsearch:9200 | Full-text search, aggregations |
| `get_pod_status` | Check pod health | Kubernetes API | Pod restarts, status, age |
| `get_node_metrics` | Node resource usage | Kubelet metrics | Node pressure, disk usage |
| `check_deployments` | Recent deployments | ArgoCD API | Deployment timeline |
| `check_longhorn_volumes` | Storage health | Longhorn API | Volume degradation |
| `search_past_incidents` | Find similar issues | PostgreSQL+pgvector | Historical patterns |
| `create_incident` | Store new incident | PostgreSQL | Learning database |
| `send_slack_alert` | Notify team | Slack API | Incident alerts |
| `create_pagerduty_incident` | Page on-call | PagerDuty API | Critical incidents |
| `get_service_metrics` | Service-level metrics | Prometheus | SLI/SLO tracking |

**Tool Execution Flow:**

```mermaid
sequenceDiagram
    participant Agent
    participant Guard as Guardrails
    participant Tool
    participant External as External System

    Agent->>Guard: Request tool execution
    Guard->>Guard: Check rate limits
    Guard->>Guard: Validate parameters

    alt Within Limits
        Guard->>Tool: Execute
        Tool->>External: API call
        External-->>Tool: Response
        Tool->>Tool: Transform data
        Tool-->>Agent: Structured result
        Agent->>Guard: Log execution
    else Rate Limit Exceeded
        Guard-->>Agent: Error: Rate limit
        Agent->>Agent: Use cached data
    end
```

> [!WARNING]
> **Tool Security**
>
> Tools have direct access to cluster resources. Always:
> - Use read-only operations by default
> - Require explicit approval for write operations
> - Validate all inputs (prevent injection attacks)
> - Set timeouts (prevent hanging)
> - Log all executions for audit

---

### 3. Memory Layer

Memory enables the agent to learn and maintain context. We use three storage systems, each optimized for different use cases.

#### Redis (Short-Term Session Cache)

**Purpose:** Store current investigation context

```yaml
Deployment: Redis 7.x (single instance)
Storage: 10GB PersistentVolumeClaim (Longhorn)
Node: grapefruit-worker (NVMe for speed)
TTL: 24 hours (auto-expire old sessions)
```

**What's Stored:**

```python
# Redis data structure
session:{session_id} = {
    "trigger": "High API error rate",
    "start_time": "2025-01-14T23:23:00Z",
    "logs_analyzed": [
        {"source": "loki", "service": "payment", "count": 247},
        {"source": "elasticsearch", "service": "api", "count": 89}
    ],
    "metrics_retrieved": [
        {"metric": "error_rate", "value": 0.23, "threshold": 0.05},
        {"metric": "db_pool_usage", "value": 0.95, "threshold": 0.80}
    ],
    "hypotheses": [
        {"theory": "DB connection leak", "confidence": 0.85},
        {"theory": "DDoS attack", "confidence": 0.15}
    ],
    "tools_executed": [
        {"tool": "query_prometheus", "time": 1.2, "success": True},
        {"tool": "query_loki", "time": 3.4, "success": True}
    ],
    "llm_responses": [
        {"prompt": "...", "response": "...", "cached": False}
    ]
}
```

**Cache Strategy:**

```python
# LRU cache for LLM responses
cache_key = f"llm:{hash(prompt)}"
ttl = 3600  # 1 hour

# Before calling LLM
cached = redis.get(cache_key)
if cached:
    return json.loads(cached)

# After LLM call
redis.setex(cache_key, ttl, json.dumps(response))
```

> [!TIP]
> **Cache Hit Ratio Target: 70%+**
>
> Similar incidents often trigger identical LLM queries. With good caching, you can reduce API costs by 70% while maintaining fast response times.

#### PostgreSQL + pgvector (Long-Term Incident Database)

**Purpose:** Store historical incidents with vector embeddings for similarity search

```yaml
Deployment: PostgreSQL 15 + pgvector extension
Storage: 50GB PersistentVolumeClaim (Longhorn)
Node: grapefruit-worker or lemon-worker (high I/O)
Backup: Velero + Restic to external Minio
```

**Schema Design:**

```sql
-- Incidents table
CREATE TABLE incidents (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    severity VARCHAR(20) NOT NULL,  -- critical, high, medium, low
    service_name VARCHAR(100) NOT NULL,

    -- Text descriptions
    symptoms_text TEXT NOT NULL,
    root_cause_text TEXT,
    resolution_text TEXT,

    -- Vector embedding for similarity search (OpenAI ada-002: 1536 dimensions)
    embedding vector(1536),

    -- Metadata
    mttr_seconds INTEGER,  -- Mean time to resolution
    false_positive BOOLEAN DEFAULT FALSE,
    confidence_score FLOAT,

    -- Indexes
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity index (IVFFlat for fast approximate search)
CREATE INDEX idx_incidents_embedding ON incidents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Standard indexes
CREATE INDEX idx_incidents_timestamp ON incidents(timestamp DESC);
CREATE INDEX idx_incidents_service ON incidents(service_name);
CREATE INDEX idx_incidents_severity ON incidents(severity);

-- Normal behavior baselines
CREATE TABLE baselines (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,

    -- Statistical measures
    avg_value FLOAT NOT NULL,
    stddev FLOAT NOT NULL,
    p50 FLOAT,
    p95 FLOAT,
    p99 FLOAT,
    min_value FLOAT,
    max_value FLOAT,

    -- Time-based patterns
    hourly_pattern JSONB,  -- Array of 24 hourly averages
    daily_pattern JSONB,   -- Array of 7 daily averages

    -- Metadata
    sample_size INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(service_name, metric_name)
);

-- Learned patterns (recurring issues)
CREATE TABLE learned_patterns (
    id SERIAL PRIMARY KEY,
    pattern_name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Pattern signature
    trigger_conditions JSONB,
    symptom_indicators JSONB,

    -- Remediation
    recommended_actions TEXT[],

    -- Statistics
    occurrence_count INTEGER DEFAULT 1,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    avg_mttr_seconds INTEGER
);
```

**Similarity Search Example:**

```python
async def search_similar_incidents(symptoms: str, threshold: float = 0.75) -> list:
    """Find past incidents similar to current symptoms"""

    # Generate embedding for current symptoms
    embedding = await openai.embeddings.create(
        input=symptoms,
        model="text-embedding-ada-002"
    )
    vector = embedding.data[0].embedding

    # Search with cosine similarity
    query = """
        SELECT
            id,
            service_name,
            symptoms_text,
            root_cause_text,
            resolution_text,
            mttr_seconds,
            1 - (embedding <=> %s::vector) AS similarity
        FROM incidents
        WHERE 1 - (embedding <=> %s::vector) > %s
        ORDER BY similarity DESC
        LIMIT 5
    """

    results = await db.fetch(query, vector, vector, threshold)
    return results
```

> [!NOTE]
> **Why pgvector over ChromaDB for incidents?**
>
> PostgreSQL with pgvector offers:
> - Transactional integrity (ACID compliance)
> - Complex queries combining vector and structured data
> - Mature backup/restore tools (pg_dump, Velero)
> - Better for mission-critical data
>
> We still use ChromaDB for auxiliary vector search (see below).

#### ChromaDB (Auxiliary Vector Store)

**Purpose:** Fast, lightweight vector search for non-critical data

```yaml
Deployment: ChromaDB 0.4.x (single instance)
Storage: 20GB PersistentVolumeClaim (Longhorn)
Node: orange-worker or mandarine-worker (moderate I/O)
Use Case: Log snippet embeddings, documentation search
```

**When to Use ChromaDB vs PostgreSQL:**

| Use Case | Storage | Reason |
|----------|---------|--------|
| Historical incidents | PostgreSQL | Critical, needs ACID |
| Log snippet embeddings | ChromaDB | Fast, non-critical |
| Baseline metrics | PostgreSQL | Structured queries |
| Documentation search | ChromaDB | Simple vector search |
| Pattern signatures | PostgreSQL | Complex relationships |

**ChromaDB Collection Setup:**

```python
import chromadb

# Initialize client
client = chromadb.HttpClient(
    host="chromadb.ai-operations.svc.cluster.local",
    port=8000
)

# Create collection for log snippets
log_collection = client.create_collection(
    name="log_snippets",
    metadata={"description": "Embedded log snippets for fast search"}
)

# Add log snippet with embedding
log_collection.add(
    embeddings=[embedding_vector],
    documents=["ERROR: Database connection timeout after 30s"],
    metadatas=[{
        "service": "payment-service",
        "timestamp": "2025-01-14T23:23:00Z",
        "severity": "error"
    }],
    ids=["log_12345"]
)

# Query similar logs
results = log_collection.query(
    query_embeddings=[current_error_embedding],
    n_results=5
)
```

---

### 4. Guardrails Layer

Guardrails prevent the agent from causing harm or excessive costs.

**Implementation:**

```python
class GuardrailsLayer:
    def __init__(self, config):
        self.rate_limiter = RateLimiter(config)
        self.alert_throttler = AlertThrottler(config)
        self.action_validator = ActionValidator(config)
        self.output_validator = OutputValidator(config)
        self.cost_tracker = CostTracker(config)

    async def validate_tool_execution(self, tool_name, params):
        """Check if tool execution is allowed"""

        # Check rate limits
        if not await self.rate_limiter.check(tool_name):
            raise RateLimitExceededError(
                f"{tool_name} rate limit exceeded"
            )

        # Check if action is forbidden
        if tool_name in self.action_validator.forbidden:
            raise ForbiddenActionError(
                f"{tool_name} is not allowed"
            )

        # Check if requires approval
        if tool_name in self.action_validator.approval_required:
            return await self.request_approval(tool_name, params)

        return True

    async def validate_output(self, output):
        """Validate LLM response before sending"""

        # Check for credentials in output
        if self.output_validator.contains_secrets(output):
            raise SecurityError("Output contains secrets")

        # Check confidence threshold
        if output.confidence < self.config.min_confidence:
            output.flag_for_review = True

        # Check for malformed output
        if not self.output_validator.validate_structure(output):
            raise ValidationError("Invalid output structure")

        return True
```

**Rate Limit Configuration:**

```yaml
# guardrails-config.yaml
rate_limits:
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
    duplicate_window: 600  # seconds

cost_controls:
  daily_budget_usd: 10.00
  alert_at_threshold: 0.80
  auto_shutoff_at: 0.95

  estimated_costs:
    openai_gpt4_input: 0.01  # per 1K tokens
    openai_gpt4_output: 0.03
    openai_embedding: 0.0001
    anthropic_claude: 0.008

action_restrictions:
  forbidden:
    - delete_pod
    - delete_service
    - scale_to_zero
    - modify_production_config

  approval_required:
    - restart_pod
    - scale_deployment
    - rollback_deployment

  allowed:
    - query_logs
    - query_metrics
    - get_status
    - send_alert

output_validation:
  no_secrets: true
  min_confidence: 0.70
  max_output_length: 4000
  required_fields:
    - severity
    - evidence
    - recommendations
```

> [!IMPORTANT]
> **Circuit Breaker Pattern**
>
> If guardrails block >50% of actions in 10 minutes, automatically disable the agent and alert humans. This prevents malfunctioning agents from causing cascading failures.

---

## Integration with PiKube Services

The agent integrates with your existing infrastructure rather than replacing it.

### Integration Point 1: Observability Stack

**Prometheus Integration:**

```yaml
# ServiceMonitor for agent metrics
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ai-agent-metrics
  namespace: ai-operations
spec:
  selector:
    matchLabels:
      app: ai-agent
  endpoints:
    - port: http
      interval: 30s
      path: /metrics
```

**Agent Metrics Exposed:**

```python
# Prometheus metrics in agent
from prometheus_client import Counter, Histogram, Gauge

# API usage
llm_api_calls_total = Counter(
    'agent_llm_api_calls_total',
    'Total LLM API calls',
    ['provider', 'model', 'status']
)

llm_api_latency_seconds = Histogram(
    'agent_llm_api_latency_seconds',
    'LLM API latency in seconds',
    ['provider', 'model']
)

# Tool execution
tool_executions_total = Counter(
    'agent_tool_executions_total',
    'Total tool executions',
    ['tool_name', 'status']
)

# Incidents
incidents_detected_total = Counter(
    'agent_incidents_detected_total',
    'Total incidents detected',
    ['severity', 'service']
)

# Guardrails
guardrail_blocks_total = Counter(
    'agent_guardrail_blocks_total',
    'Total actions blocked by guardrails',
    ['reason']
)

# Costs
cost_usd_total = Counter(
    'agent_cost_usd_total',
    'Total cost in USD',
    ['provider']
)

# Cache
cache_hits_total = Counter(
    'agent_cache_hits_total',
    'Total cache hits'
)

cache_hit_ratio = Gauge(
    'agent_cache_hit_ratio',
    'Cache hit ratio (0.0 to 1.0)'
)
```

### Integration Point 2: ArgoCD (GitOps Deployment)

**Application Structure:**

```
pikube-kubernetes-service/
└── argocd/
    └── apps/
        └── ai-agent/
            ├── Chart.yaml           # Helm umbrella chart
            ├── values.yaml          # Configuration values
            ├── templates/
            │   ├── namespace.yaml
            │   ├── postgres-statefulset.yaml
            │   ├── redis-statefulset.yaml
            │   ├── chromadb-deployment.yaml
            │   ├── agent-deployment.yaml
            │   ├── agent-service.yaml
            │   ├── agent-configmap.yaml
            │   ├── agent-servicemonitor.yaml
            │   └── externalsecret.yaml
            └── README.md
```

**ArgoCD Application Manifest:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ai-agent
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "10"  # Deploy after observability
spec:
  project: default
  source:
    repoURL: https://github.com/AElQazouiInsights/pikube-kubernetes-service
    targetRevision: main
    path: argocd/apps/ai-agent
    helm:
      valueFiles:
        - values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: ai-operations
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

### Integration Point 3: HashiCorp Vault (Secrets Management)

**Vault Secret Structure:**

```bash
# Store secrets in Vault (run on gateway where Vault is hosted)
vault kv put secret/ai-agent/openai \
  api_key="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

vault kv put secret/ai-agent/anthropic \
  api_key="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

vault kv put secret/ai-agent/slack \
  webhook_url="https://hooks.slack.com/services/xxxxxxxxxxxxx"

vault kv put secret/ai-agent/pagerduty \
  integration_key="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**External Secret Resources:**

```yaml
# ExternalSecret for OpenAI
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
```

### Integration Point 4: Linkerd (Service Mesh)

**Enable Linkerd Injection:**

```yaml
# Namespace annotation
apiVersion: v1
kind: Namespace
metadata:
  name: ai-operations
  annotations:
    linkerd.io/inject: enabled
  labels:
    name: ai-operations
```

**Benefits:**
- ✅ Automatic mTLS encryption between agent and observability services
- ✅ Distributed tracing for agent operations
- ✅ Automatic retries and circuit breaking
- ✅ Traffic metrics (request rate, latency, success rate)

---

## Node Placement Strategy

Strategic placement of components maximizes performance while balancing resource usage.

```mermaid
graph TB
    subgraph GRAPEFRUIT["grapefruit-worker<br/>Orange Pi 5 Ultra<br/>16GB RAM, 931GB NVMe"]
        ORCH_G["Agent Orchestrator<br/>CPU: 1-2 cores<br/>RAM: 2-4GB"]
        REDIS_G["Redis Cache<br/>RAM: 2GB + 10GB PVC"]
        POSTGRES_G["PostgreSQL<br/>RAM: 4GB + 50GB PVC"]
    end

    subgraph LEMON["lemon-worker<br/>Orange Pi 5 Ultra<br/>16GB RAM, 2.5G Ethernet"]
        POSTGRES_REPLICA["PostgreSQL Replica<br/>(Optional HA)<br/>RAM: 4GB + 50GB PVC"]
    end

    subgraph ORANGE["orange-worker<br/>Orange Pi 5<br/>16GB RAM"]
        CHROMA["ChromaDB<br/>RAM: 2GB + 20GB PVC"]
    end

    ORCH_G <--> REDIS_G
    ORCH_G <--> POSTGRES_G
    ORCH_G <--> CHROMA

    POSTGRES_G -.replicate.-> POSTGRES_REPLICA

    classDef primary fill:#667eea,stroke:#764ba2,stroke-width:3px,color:#fff
    classDef storage fill:#96CEB4,stroke:#6C5CE7,stroke-width:2px,color:#000
    classDef optional fill:#FFD93D,stroke:#FAB005,stroke-width:2px,color:#000

    class ORCH_G primary
    class REDIS_G,POSTGRES_G,CHROMA storage
    class POSTGRES_REPLICA optional
```

**Placement Rationale:**

| Component | Node | Reason |
|-----------|------|--------|
| Agent Orchestrator | grapefruit-worker | NVMe for ultra-fast Redis cache, 16GB RAM, best CPU |
| Redis | grapefruit-worker | Co-locate with orchestrator for lowest latency |
| PostgreSQL | grapefruit-worker | NVMe for high-I/O workload (incidents, embeddings) |
| ChromaDB | orange-worker | Moderate I/O, separate from primary storage |
| PostgreSQL Replica | lemon-worker | Optional HA, 2.5G Ethernet for fast replication |

**Resource Allocation:**

```yaml
Total Cluster Resources:
  CPU: ~24 cores (across all workers)
  RAM: ~75GB (across all workers)

AI Agent Allocation:
  CPU: 3-4 cores (12-16% of cluster)
  RAM: 10-14GB (13-18% of cluster)
  Storage: 80GB PVCs (Longhorn replicated)

Impact: Minimal (leaves 84-88% CPU, 82-87% RAM for applications)
```

> [!TIP]
> **Storage Tiering in Action**
>
> We leverage your existing storage performance tiers:
> - **Tier 1 (NVMe)**: Agent core + Redis + PostgreSQL on grapefruit-worker
> - **Tier 2 (Samsung EVO)**: ChromaDB on other Orange Pi workers
> - **Longhorn Replication**: 2x replication for all PVCs (data safety)

---

## Cost Analysis & Optimization

Let's break down the economics.

### Monthly Cost Breakdown

```yaml
OpenAI API Costs:
  Model: GPT-4 Turbo (gpt-4-turbo-preview)
  Input: $0.01 per 1K tokens
  Output: $0.03 per 1K tokens

  Estimated Usage:
    Incidents per month: 60 (2/day average)
    Tokens per incident:
      - Input: 2,500 tokens (context + prompt)
      - Output: 500 tokens (analysis + recommendations)

    Monthly tokens:
      - Input: 60 × 2,500 = 150,000 tokens
      - Output: 60 × 500 = 30,000 tokens

    Monthly cost:
      - Input: 150K / 1K × $0.01 = $1.50
      - Output: 30K / 1K × $0.03 = $0.90
      - Total: $2.40 per month

Wait, what? Only $2.40?

Actually, that's WITHOUT caching. Real usage includes:
- Continuous monitoring (every 5 min = 288 times/day)
- Each check queries LLM for anomaly detection
- Cache hit ratio: 70% (after learning period)

Realistic calculation:
  Daily checks: 288
  Monthly checks: 288 × 30 = 8,640
  Uncached (30%): 8,640 × 0.30 = 2,592
  Tokens per check: 500 input, 100 output

  Monthly tokens:
    - Input: 2,592 × 500 = 1,296,000 tokens
    - Output: 2,592 × 100 = 259,200 tokens

  Monthly cost:
    - Input: 1,296K / 1K × $0.01 = $12.96
    - Output: 259K / 1K × $0.03 = $7.78
    - Embeddings: ~5,000 / month × $0.0001 = $0.50
    - Total: $21.24 per month

Anthropic (Backup):
  Usage: 10% of OpenAI (fallback only)
  Cost: ~$2-3 per month

Infrastructure (On-Cluster):
  Cost: $0 (already provisioned hardware)

External Services:
  Slack: $0 (free tier)
  PagerDuty: Depends on plan ($0-50)

TOTAL MONTHLY COST: $25-75 USD
```

> [!NOTE]
> **Wait, where's the $150-300 estimate?**
>
> The higher estimate ($150-300) assumes:
> - High-traffic production cluster (10-20 incidents/day)
> - No caching (cold start)
> - Verbose logging and analysis
> - Multiple LLM providers for redundancy
>
> For PiKube's scale (home/learning cluster), $25-75/month is realistic.

### Cost Optimization Strategies

**1. Aggressive Caching**

```python
# Cache LLM responses for identical contexts
cache_ttl = {
    "anomaly_detection": 3600,  # 1 hour (patterns repeat)
    "log_analysis": 1800,        # 30 min (logs change)
    "incident_resolution": 86400 # 24 hours (resolutions stable)
}

# Cache key includes context hash
cache_key = f"llm:{operation}:{hash(context)}"
```

**Expected savings: 60-70% reduction in API calls**

**2. Smart Sampling**

```python
# Don't analyze every log line
def should_analyze(log_entry):
    # Always analyze errors
    if log_entry.level == "ERROR":
        return True

    # Sample 1% of INFO logs
    if log_entry.level == "INFO":
        return random.random() < 0.01

    # Analyze WARNING if rate exceeds baseline
    if log_entry.level == "WARNING":
        return is_anomalous(log_entry)

    return False
```

**Expected savings: 90% reduction in log analysis overhead**

**3. Prompt Optimization**

```python
# Bad: Verbose prompt (2,000 tokens)
prompt_bad = f"""
You are an AI agent analyzing logs. Here are all the logs:
{all_logs}  # 10,000 log lines

Please analyze them and tell me what's wrong.
"""

# Good: Concise prompt (500 tokens)
prompt_good = f"""
Analyze these error patterns:
- Service: payment-service
- Errors: {error_count} in 10min (baseline: 5)
- Top error: "DB timeout" (87% of errors)
- Timeline: Started {start_time}

Root cause?
"""
```

**Expected savings: 75% reduction in tokens per call**

**4. Batch Processing**

```python
# Process multiple incidents in one LLM call
incidents_batch = [incident1, incident2, incident3]
prompt = f"Analyze these {len(incidents_batch)} incidents: ..."

# vs calling LLM 3 separate times
```

**Expected savings: 40% reduction through batching**

---

## What You've Learned

You now understand the complete architecture of a production-grade AI agent for PiKube:

- ✅ **Hybrid architecture** balances cloud LLM power with on-cluster privacy and control
- ✅ **Component roles**: Orchestrator (brain), Tools (actions), Memory (learning), Guardrails (safety)
- ✅ **Technology stack**: LangChain + FastAPI + Redis + PostgreSQL + ChromaDB + OpenAI
- ✅ **Integration points**: Seamless connection with Prometheus, Loki, ArgoCD, Vault, Linkerd
- ✅ **Node placement**: Strategic use of grapefruit-worker's NVMe for performance
- ✅ **Cost optimization**: Realistic $25-75/month through caching, sampling, prompt optimization
- ✅ **Deployment strategy**: ArgoCD-managed Helm umbrella chart with sync waves

---

## What's Next

In **Chapter 3: Prerequisites and Foundation**, we'll prepare your cluster for agent deployment:

- Verify cluster readiness (K3s, observability stack, storage)
- Create `ai-operations` namespace with proper RBAC
- Deploy PostgreSQL, Redis, ChromaDB with persistent storage
- Configure External Secrets integration with Vault
- Set up OpenAI/Anthropic API keys securely
- Build Docker image for ARM64

Let's get hands-on and start building!

---

**Questions or feedback?** Open an issue on the [PiKube GitHub repository](https://github.com/AElQazouiInsights/pikube-kubernetes-service).

---

*Last updated: 2025-01-14*
*Part of the PiKube Kubernetes Service Documentation*
