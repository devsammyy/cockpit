# Autonomous Business Workflow Engine Architecture & Developer Guide

This document describes the component configurations, dynamic AI planners, state machines, templates library, and operational guides for the Autonomous Business Workflow Engine.

---

## 1. System Components & Topology

The workflow engine interprets goals, builds execution graphs (DAGs), resolves step dependencies, monitors state runs, and recovers from anomalies.

```mermaid
graph TD
    A[User Goal Input] --> B[Workflow Planner]
    B --> C[Structured Output Engine]
    C --> D[Prisma / SQL Database]
    D --> E[Workflow Engine Service]
    E --> F[Tool Executor Service]
    E --> G[Agent Runtime Service]
```

---

## 2. Dynamic Lifecycle Pipelines

### Complete AI-Driven Workflow Lifecycle

```mermaid
sequenceDiagram
    participant User as User / Frontend Dashboard
    participant Planner as Workflow Planner Service
    participant LLM as Qwen Cloud (Structured Output)
    participant Engine as Workflow Engine Service
    participant Executor as Tool Executor / Agent Runtime

    User->>Planner: planAndExecute(goalText)
    Planner->>LLM: parse(goalText, WorkflowDefinitionSchema)
    LLM-->>Planner: ExecutableStepGraph
    Planner->>Engine: execute(executionId, ExecutableStepGraph)

    loop For each step in DAG
        Note over Engine: Check current Step Type
        alt Step is TOOL_CALL
            Engine->>Executor: executeTool(toolName, arguments)
            Executor-->>Engine: ToolResult
        else Step is AGENT_TASK
            Engine->>Executor: runAgentInference(agentId, prompt)
            Executor-->>Engine: AgentResponse
        end
        Note over Engine: Update database Execution variables context
    end
    Engine-->>User: Workflow Execution Completed
```

### State Machine Lifecycle Transitions

```mermaid
stateDiagram-v2
    [*] --> PENDING: Plan Created
    PENDING --> RUNNING: Engine Start
    RUNNING --> PENDING_APPROVAL: Policy checkpoint hit (Approvals required)
    PENDING_APPROVAL --> RUNNING: Approved by Admin
    PENDING_APPROVAL --> REJECTED: Rejected by Admin
    RUNNING --> COMPLETED: Graph execution finishes (reaches END)
    RUNNING --> FAILED: Exception thrown / Loop limit hit
    REJECTED --> [*]
    COMPLETED --> [*]
    FAILED --> [*]
```

---

## 3. Pre-configured Enterprise Templates

Seeded templates are defined inside [workflow-templates.ts](file:///home/talented/Desktop/Personal/qwen_hack/apps/backend/src/modules/workflows/workflow-templates.ts):

1. **Support Diagnostics & Escalation**:
   -Urgency Classification -> SQLite health check query -> Slack alerts escalation if urgent.
2. **Customer Inquiry Proposal**:
   -Enriches details -> drafts email proposal templates automatically using Assistant models.

---

## 4. Operational Runbooks

### Recovering from Failed Execution Loops

1. **Diagnosis**: If an execution hangs with status `RUNNING` or gets cancelled. Loop guards limit iterations to exactly 30 cycles.
2. **Remediation**:
   - Check **Workflow Designer > Execution Monitor**.
   - Review variables parameters schema for loop cycles.
   - Re-draft goal to optimize split conditions logic.
