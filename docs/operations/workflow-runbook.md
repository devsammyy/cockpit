# Workflow Engine Runbook

Operational guide for the autonomous workflow engine. Executions run on the
BullMQ `workflow-executions` queue processed by `WorkflowExecutionProcessor`
(concurrency 5).

## Health signals

| Signal                                                         | Where                                            | Healthy                                    |
| -------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| Queue depth (`bullmq_queue_jobs{queue="workflow-executions"}`) | Grafana / Prometheus                             | `waiting` drains; not monotonically rising |
| Workflow success rate                                          | Analytics dashboard; `workflow_executions_total` | Failures not spiking                       |
| Approvals aging                                                | Approvals page (ESCALATED badge)                 | Few/no SLA breaches                        |
| Execution p95 duration                                         | Analytics                                        | Stable                                     |

## Common operations

### Inspect a stuck run

1. Open the execution in the console → **Timeline** and **Steps** tabs show the
   exact event/step history.
2. `currentStepId` on the execution shows where it is.
3. If `WAITING_APPROVAL`, resolve the approval (Approvals page or the inline
   banner on the execution).

### An execution is stuck in RUNNING but nothing is happening

- Check the worker is alive: `docker logs qwen-autopilot-backend | grep WorkflowExecutionProcessor`.
- Check Redis: `redis-cli ping`. The engine checkpoints after every wave, so a
  worker restart resumes automatically — re-enqueue with a resume job if needed
  (Resume from the console).

### Approvals not resuming after approve

- Approving enqueues a `resume` job. Confirm the queue is processing:
  `redis-cli llen bull:workflow-executions:wait`.
- Verify the approval row moved to `APPROVED`
  (`GET /workflow-approvals/execution/:id`).

### Queue backlog

- Raise processor concurrency (`@Processor(..., { concurrency: N })`) or scale
  worker containers (the engine is stateless per job — see
  [scaling-guide.md](scaling-guide.md)).
- Backpressure is by design: bursts queue rather than overwhelming Qwen quota or
  the database.

### Scheduled workflow not firing

- Schedules register on boot (`TriggerService.bootstrapSchedules`) and on
  create/update. Confirm the repeatable job exists:
  `redis-cli keys 'bull:workflow-executions:repeat:*'`.
- Verify `triggerType=SCHEDULED` and a valid `triggerConfig.cron`.

## Failure semantics

| Situation                               | Engine behavior                                                     |
| --------------------------------------- | ------------------------------------------------------------------- |
| Step throws, `retry` set                | Retries with backoff (`STEP_RETRIED` events), then fails the run    |
| Step throws, `onFailure: continue`      | Records error into variables, run proceeds                          |
| Run fails with registered compensations | Compensations run in reverse order (`COMPENSATION_EXECUTED` events) |
| Worker crashes mid-run                  | Resumes from the last checkpoint on the next `run`/`resume` job     |
| Approval rejected                       | Run → FAILED at the approval step                                   |
| Approval SLA exceeded                   | Marked ESCALATED (visible in Approvals), still actionable           |

## Manual interventions (console or API)

| Action         | Endpoint                                                               |
| -------------- | ---------------------------------------------------------------------- |
| Pause          | `POST /workflows/executions/:id/pause`                                 |
| Resume         | `POST /workflows/executions/:id/resume`                                |
| Cancel         | `POST /workflows/executions/:id/cancel` (also voids pending approvals) |
| Retry (failed) | `POST /workflows/executions/:id/retry` (new attempt, same input)       |

## Data & observability

- **Timeline**: `execution_events` table / `GET /workflows/executions/:id/events`.
- **Steps**: `step_executions` table / `.../steps`.
- **Approvals**: `approvals` table / `/workflow-approvals`.
- **Accounting**: `totalTokensUsed`, `totalCostEstimate`, `totalDurationMs`,
  `totalToolCalls` on the execution; the console Analytics dashboard aggregates
  these.
- Reflections are written to memory after every run (success or failure) and
  feed future planning.

## Safety limits

| Limit                    | Value                                      | Where                  |
| ------------------------ | ------------------------------------------ | ---------------------- |
| Step activations per run | 500                                        | `MAX_STEP_ACTIVATIONS` |
| Loop iterations          | per-step `loop.maxIterations` (default 10) | resolver               |
| Sub-workflow depth       | 3                                          | `SubWorkflowHandler`   |
| Inline delay             | 5 minutes                                  | `DelayHandler`         |
| Step timeout             | 120s default, per-step override            | executor               |
| Webhook targets          | private/loopback ranges blocked            | `WebhookHandler`       |
