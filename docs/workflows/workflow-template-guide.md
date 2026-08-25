# Workflow Template Guide

Workflows are **declarative JSON** — `steps` + `connections` plus optional
per-step reliability policies. You author them in the visual builder, via the
API, or by seeding the built-in reference library. No code changes are ever
required to add a workflow.

> **Real-world actions:** for how workflows invoke tools (Slack, GitHub,
> Email), credential setup, and the end-to-end webhook→approval→action demo
> chain, see [tools-and-workflows.md](tools-and-workflows.md).

## Anatomy

```jsonc
{
  "steps": [
    { "id": "start", "type": "START", "name": "Start", "config": {} },
    {
      "id": "classify",
      "type": "AGENT_TASK",
      "name": "Classify",
      "config": { "promptTemplate": "Classify: {{ input.ticket }}" },
    },
    { "id": "end", "type": "END", "name": "End", "config": {} },
  ],
  "connections": [
    { "fromStepId": "start", "toStepId": "classify" },
    { "fromStepId": "classify", "toStepId": "end" },
  ],
}
```

## Node types

| Type           | Purpose                     | Required config  | Notes                                                         |
| -------------- | --------------------------- | ---------------- | ------------------------------------------------------------- |
| `START`        | Entry point                 | —                | Exactly one.                                                  |
| `END`          | Termination                 | —                | At least one.                                                 |
| `AGENT_TASK`   | Qwen reasoning turn         | `promptTemplate` | Optional `systemPrompt`, `tools`, `model`.                    |
| `TOOL_CALL`    | Invoke a registered tool    | `toolName`       | `arguments` interpolated; runs full policy/approval pipeline. |
| `CONDITION`    | Boolean branch              | `expression`     | Outgoing edges **must** be labelled `true` and `false`.       |
| `APPROVAL`     | Durable human gate          | —                | Optional `message`, `slaMinutes`, `type`. Pauses the run.     |
| `DELAY`        | Inline wait                 | `durationMs`     | Capped at 5 min; use scheduled triggers for longer.           |
| `WEBHOOK`      | External HTTP call          | `url`            | `method`, `body`, `headers`; private ranges blocked.          |
| `MEMORY`       | Read/write org memory       | `operation`      | `retrieve` (with `query`) or `store` (with `key`/`value`).    |
| `SUB_WORKFLOW` | Run another workflow inline | `workflowId`     | `input` interpolated; depth-bounded (max 3).                  |

## Variable interpolation

Every string config value supports `{{ path }}` interpolation against the live
variable bag:

- `{{ input.field }}` — the execution input.
- `{{ stepId.output }}` — a prior step's output (each step stores its result
  under its own id).
- Objects render as JSON; missing paths render empty.

`CONDITION.expression` is evaluated against the same bag, e.g.
`classify.output.toLowerCase().includes('critical')`.

## Reliability policies (per step, all optional)

```jsonc
{
  "id": "post",
  "type": "TOOL_CALL",
  "name": "Post to accounting",
  "config": {
    "toolName": "accounting_post_entry",
    "arguments": { "entry": "{{ extract.output }}" },
  },

  "retry": { "maxAttempts": 3, "initialDelayMs": 1000, "backoffFactor": 2 },
  "timeoutMs": 30000,
  "onFailure": "fail", // or "continue" for graceful degradation
  "compensation": {
    "toolName": "accounting_reverse_entry",
    "arguments": { "invoice": "{{ extract.output }}" },
  },
}
```

- **retry** — bounded exponential backoff before the step is considered failed.
- **timeoutMs** — hard cap on a single step attempt.
- **onFailure: "continue"** — record the error and proceed instead of failing
  the run.
- **compensation** — a tool call run in reverse order if the _run_ later fails
  (saga rollback).
- **loop** — `{ "maxIterations": N }` on a step targeted by a `loop`-labelled
  edge bounds re-entry.

## Control flow patterns

- **Sequential**: chain steps with single connections.
- **Parallel + join**: fan multiple edges out of one step; a downstream step
  with multiple incoming edges waits for all of them.
- **Conditional**: `CONDITION` step with `true`/`false` labelled edges. The
  untaken branch is skipped and its skip propagates to joins.
- **Loop**: an edge labelled `loop` back to an earlier step, bounded by
  `loop.maxIterations` on the target.
- **Human approval**: an `APPROVAL` step (or a step the decision engine gates)
  pauses the run until decided.

## Triggers

| triggerType        | triggerConfig                     | Behavior                                                      |
| ------------------ | --------------------------------- | ------------------------------------------------------------- |
| `MANUAL` (default) | —                                 | Run via the console or `POST /workflows/:id/execute`.         |
| `SCHEDULED`        | `{ "cron": "0 9 * * *" }`         | Registered as a repeatable job; materializes a run per tick.  |
| `EVENT`            | `{ "event": "invoice.received" }` | `POST /workflows/events/emit` fans out to matching workflows. |

## The 6 reference templates

Seed them with **Seed enterprise templates** in the console or
`POST /workflows/templates/seed`:

1. **Customer Inquiry → Quote → Approval** (sales) — classify, gather context,
   quote, manager approval, respond.
2. **Support Ticket → Diagnose → Escalate** (support) — categorize, diagnose,
   recommend, escalate only when critical (conditional).
3. **Invoice → Validate → Approve → Post** (finance) — extract, validate vs PO,
   finance approval, post with compensating reversal.
4. **Resume Screening → Rank → Interview** (HR) — evaluate, rank, approve
   shortlist, schedule, notify.
5. **System Alert → Diagnose → Remediate → Verify** (ops) — diagnose, gate
   high-risk remediations, run with rollback compensation, verify, notify.
6. **Sales Lead → Qualify → Proposal → Follow-up** (sales) — qualify, enrich
   CRM, propose, approve, follow up; park unqualified for nurture.

Each demonstrates a different capability: approvals, conditionals, compensation,
memory, graceful degradation. They are ordinary definitions — copy one, edit it
in the builder, and save your own.
