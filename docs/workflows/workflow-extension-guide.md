# Workflow Engine Extension Guide

The engine core contains **zero node-type-specific logic**. Extending it means
adding a handler — the orchestrator, planner schema, validation, and console
builder pick it up without core changes.

## Add a new node type

1. **Implement the handler** in `engine/handlers/`:

   ```ts
   @Injectable()
   export class SlackNotifyHandler implements StepHandler {
     readonly type = "SLACK_NOTIFY";

     constructor(private readonly toolExecutor: ToolExecutorService) {}

     async execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult> {
       const channel = compileTemplate(String(step.config["channel"] ?? ""), context.variables);
       const text = compileTemplate(String(step.config["text"] ?? ""), context.variables);
       await this.toolExecutor.execute(
         "slack_send_message",
         { channel, text },
         {
           orgId: context.organizationId,
           userId: context.userId,
         },
       );
       return { output: { channel, sent: true } };
     }
   }
   ```

2. **Register it** in `workflow.module.ts` — add the class to
   `STEP_HANDLER_CLASSES`. The `STEP_HANDLERS` multi-provider and
   `StepHandlerRegistry` do the rest.

3. **Add the type** to `STEP_TYPES` in `workflow-definition.schema.ts` so the
   planner and validation know it exists.

4. (Optional) **Teach the planner** about it by mentioning it in the planner's
   system prompt, and add a duration/cost prior in `STEP_DURATION_MS`.

5. (Optional) **Surface it in the builder** — add a `StepTypeMeta` entry in the
   frontend `components/workflow/definition-io.ts` and an icon in `step-node.tsx`.

That's the entire surface. No changes to the executor, resolver, or state
machine.

## Handler contract

```ts
interface StepHandler {
  readonly type: string;
  execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult>;
}

interface StepResult {
  output: Record<string, unknown>; // stored under the step id in the variable bag
  branchLabel?: string; // CONDITION-style: selects the outgoing edge
  pause?: { reason: "APPROVAL"; approvalId: string }; // suspend the run
  tokensUsed?: number; // rolled into execution accounting
  costMicroUsd?: number;
  toolCalls?: number;
}
```

Guidelines:

- **Pure side effects belong in tools**, not handlers — call `ToolExecutor` so
  policy/approval/history/credential injection all apply.
- **Interpolate config** with `compileTemplate` / `resolveArgs` so authors can
  reference prior outputs.
- **Throw on failure** — the recovery manager handles retry/compensation; don't
  swallow errors.
- **To pause**, return a `pause` signal (see the `APPROVAL` handler) and create
  the durable record the resume path will key on.
- **Keep handlers stateless** — all run state lives in the checkpointed variable
  bag, so handlers stay horizontally scalable.

## Extend recovery

- New retry semantics → extend `RetryPolicySchema` and `RecoveryManagerService`.
- New compensation targets → any step can already declare `compensation`; to
  compensate non-tool actions, generalize `RecoveryManagerService.compensate`.

## Extend the decision engine

`DecisionEngineService.evaluate` returns `PROCEED | REQUIRE_APPROVAL | BLOCK`
from a risk/confidence assessment. Add inputs (external system health, business
constraints, memory signals) by extending `evaluate` — the executor consults it
before every step, so new gating rules take effect immediately.

## Add a trigger source

`TriggerService` handles cron (scheduled) and application events. To add e.g. a
webhook-inbound trigger, add a controller route that calls
`triggerService.emit(orgId, eventName, payload)` — event-driven workflows whose
`triggerConfig.event` matches will each start a run.

## Testing a new handler

Follow `engine/workflow-executor.service.spec.ts`: register your handler in a
`StepHandlerRegistry`, drive a definition through the executor with the
in-memory Prisma fake, and assert on final state. Pure logic (config parsing,
interpolation) is unit-tested directly.
