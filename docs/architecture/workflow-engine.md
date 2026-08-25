# Autonomous Business Workflow Engine

The workflow engine is the platform's core capability: it turns declarative
workflow definitions (or natural-language goals) into resilient, observable,
multi-tenant autonomous executions. It orchestrates agent reasoning, tool
calls, human approvals, and failure recovery without any workflow-specific
logic in the core — every node type is a pluggable handler.

## Design principles

| Principle                 | How it is realized                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Declarative**           | Workflows are JSON (`steps` + `connections`); the engine interprets them. Authoring needs no code.             |
| **Modular / extensible**  | Node types are handlers behind a registry (`STEP_HANDLERS` multi-provider). Adding a type = one class.         |
| **Event-driven**          | Execution runs on a BullMQ queue; every transition emits a persisted timeline event.                           |
| **Resilient**             | Per-step retry with backoff, saga-style compensation, checkpoint-and-resume across restarts.                   |
| **Observable**            | Full step + event history in Postgres; token/cost/duration accounting; Prometheus metrics from earlier phases. |
| **Secure & multi-tenant** | Every route and query is org-scoped via the JWT principal; JWT auth guards all endpoints.                      |
| **Provider-independent**  | AI turns go through the shared `AgentRuntime` → LLM provider abstraction, not Qwen directly.                   |

## Component map

```mermaid
graph TB
    subgraph API["HTTP API (org-scoped, JWT-guarded)"]
        WC[WorkflowsController]
        AC[ApprovalsController]
    end

    subgraph Control["Control plane"]
        LIFE[WorkflowLifecycleService<br/>start · pause · resume · cancel · retry]
        REPO[WorkflowRepositoryService<br/>CRUD + versioning + validation]
        PLAN[WorkflowPlannerService<br/>goal → validated DAG + estimates]
        TRIG[TriggerService<br/>scheduled · event-driven]
        COORD[ApprovalCoordinatorService<br/>durable approvals + SLA]
    end

    subgraph Queue["BullMQ: workflow-executions"]
        PROC[WorkflowExecutionProcessor<br/>run · resume · scheduled]
    end

    subgraph Core["Execution core (no node-type logic)"]
        EXEC[WorkflowExecutorService<br/>drive loop + checkpointing]
        RESOLVER[Dependency resolver<br/>token-based DAG scheduler]
        STATE[Execution state machine]
        DECIDE[DecisionEngineService<br/>risk · confidence · gating]
        RECOVER[RecoveryManagerService<br/>retry + compensation]
        EVENTS[ExecutionEventsService<br/>persistent timeline]
    end

    subgraph Handlers["Step handlers (registry)"]
        H1[AgentTask]
        H2[ToolCall]
        H3[Condition]
        H4[Approval]
        H5[Delay]
        H6[Webhook]
        H7[Memory]
        H8[SubWorkflow]
    end

    subgraph Platform["Reused platform services"]
        AGENT[AgentRuntime → LLM provider]
        TOOLS[ToolExecutor + PolicyEngine]
        MEM[Memory + ReflectionEngine]
    end

    WC --> LIFE & REPO & PLAN & TRIG
    AC --> COORD
    LIFE --> Queue
    COORD --> Queue
    TRIG --> Queue
    PROC --> EXEC
    EXEC --> RESOLVER & STATE & DECIDE & RECOVER & EVENTS
    EXEC --> Handlers
    H1 --> AGENT
    H2 --> TOOLS
    H4 --> COORD
    H7 --> MEM
    EXEC --> MEM
```

## Execution lifecycle

```mermaid
graph LR
    G[Goal] --> P[Planning]
    P --> V[Validation]
    V --> Q[Queue]
    Q --> R[Context + Decision]
    R --> S[Step execution]
    S -->|approval| A[Wait · checkpoint]
    A -->|approved| S
    S -->|retry| S
    S -->|fail| C[Compensate]
    S --> M[Monitoring · events]
    S -->|drained| RF[Reflection]
    RF --> MU[Memory update]
    MU --> DONE[Completion]
    C --> FAIL[Failed]
```

## Execution state machine

Persisted on `Execution.status`; every transition is guarded by
`assertTransition()`.

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> RUNNING
    PENDING --> CANCELLED
    RUNNING --> WAITING_APPROVAL
    RUNNING --> PAUSED
    RUNNING --> COMPLETED
    RUNNING --> FAILED
    RUNNING --> CANCELLED
    WAITING_APPROVAL --> RUNNING: approved
    WAITING_APPROVAL --> FAILED: rejected
    WAITING_APPROVAL --> CANCELLED
    PAUSED --> RUNNING: resume
    PAUSED --> CANCELLED
    FAILED --> PENDING: retry (new run)
    COMPLETED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

## DAG scheduling (dependency resolver)

The resolver uses **token/firing semantics** so one algorithm handles
sequential, parallel, conditional, and bounded-loop flows:

- Completing a step fires a **real** token along its selected outgoing edges
  (all edges for normal steps; the label-matched edge for `CONDITION`).
- Unselected branches fire **skip** tokens so join steps never wait forever.
- A step is **ready** when every incoming non-loop edge delivered a token and
  at least one was real; **skipped** if all were skips (skips propagate).
- Edges labelled `loop` re-arm their target, bounded by `loop.maxIterations`.

The whole scheduler state is JSON-serializable and checkpointed after every
wave, which is what makes pause/resume and restart-recovery possible.

## Sequence — approval pause & resume

```mermaid
sequenceDiagram
    participant U as User
    participant API as WorkflowsController
    participant Q as BullMQ
    participant W as Executor (worker)
    participant DB as Postgres
    participant CO as ApprovalCoordinator

    U->>API: POST /workflows/:id/execute
    API->>DB: create Execution (PENDING)
    API->>Q: enqueue run
    Q->>W: run
    W->>DB: status RUNNING, run steps, checkpoint
    W->>CO: APPROVAL step → request()
    CO->>DB: create Approval (PENDING) + event
    W->>DB: status WAITING_APPROVAL (checkpoint)
    Note over W: job ends — worker freed
    U->>API: POST /workflow-approvals/:id/decide APPROVE
    API->>CO: decide()
    CO->>DB: Approval APPROVED + event
    CO->>Q: enqueue resume(approvedStepId)
    Q->>W: resume
    W->>DB: load checkpoint, fire approved step, continue
    W->>DB: status COMPLETED + reflection
```

## Failure recovery

1. **Retry** — each step honors its `retry` policy (attempts, backoff). Retries
   emit `STEP_RETRIED` timeline events.
2. **Graceful degradation** — a step with `onFailure: "continue"` records its
   error into the variable bag and the run proceeds.
3. **Compensation** — steps declare a `compensation` tool call. On terminal
   failure the recovery manager unwinds registered compensations in reverse
   order (saga pattern), best-effort.
4. **Checkpoint recovery** — the full scheduler state is persisted after every
   wave, so a crashed worker resumes exactly where it left off.
5. **Manual intervention** — pause/resume/cancel/retry are first-class controls.

## Data model (ER)

```mermaid
erDiagram
    Workflow ||--o{ WorkflowVersion : "has versions"
    Workflow ||--o{ Execution : "runs"
    Execution ||--o{ StepExecution : "records steps"
    Execution ||--o{ ExecutionEvent : "timeline"
    Execution ||--o{ Approval : "gates"
    Execution ||--o{ Execution : "sub-workflows"
    Organization ||--o{ Workflow : "owns"
    Organization ||--o{ Execution : "owns"

    Workflow {
      uuid id PK
      uuid organizationId FK
      string name
      json definition
      string triggerType
      json triggerConfig
      string status
      uuid currentVersionId
      int version
    }
    Execution {
      uuid id PK
      string status
      json input
      json variables "incl. __engine checkpoint"
      json output
      string currentStepId
      int totalTokensUsed
      int totalCostEstimate
      int totalDurationMs
      int attemptNumber
    }
    StepExecution {
      uuid id PK
      string stepId
      string stepType
      string status
      json output
      int durationMs
      int sequenceNumber
    }
    ExecutionEvent {
      uuid id PK
      string type
      string message
      json data
    }
    Approval {
      uuid id PK
      string stepId
      string type
      string status
      json payload
      int slaMinutes
    }
```

## Key files

| File                                             | Responsibility                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `engine/workflow-definition.schema.ts`           | Declarative schema (node types, retry, compensation, loops, estimates) |
| `engine/dependency-resolver.ts`                  | Token-based DAG scheduler + structural validation                      |
| `engine/execution-state.ts`                      | State machine + event/step status enums                                |
| `engine/workflow-executor.service.ts`            | The orchestrator core (drive loop, checkpointing, recovery wiring)     |
| `engine/step-handler.registry.ts` + `handlers/*` | Pluggable node types                                                   |
| `engine/decision-engine.service.ts`              | Runtime risk/confidence gating                                         |
| `engine/recovery-manager.service.ts`             | Retry + compensation                                                   |
| `engine/approval-coordinator.service.ts`         | Durable approvals + SLA escalation                                     |
| `engine/workflow-lifecycle.service.ts`           | start/pause/resume/cancel/retry                                        |
| `engine/workflow-planner.service.ts`             | Goal → validated DAG + estimates                                       |
| `engine/workflow-repository.service.ts`          | CRUD + versioning + validation                                         |
| `engine/trigger.service.ts`                      | Scheduled (cron) + event-driven triggers                               |
| `engine/workflow-execution.processor.ts`         | BullMQ worker                                                          |
| `engine/reference-templates.ts`                  | 6 production reference workflows                                       |

See also: [workflow-template-guide.md](../workflows/workflow-template-guide.md),
[workflow-extension-guide.md](../workflows/workflow-extension-guide.md),
[workflow-runbook.md](../operations/workflow-runbook.md).
