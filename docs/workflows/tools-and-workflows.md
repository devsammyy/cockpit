# Tools & Workflows — how they connect (and how to go live)

Tools are the **verbs** of the platform; workflows are the **sentences**.
This guide explains the relationship and walks through connecting the three
built-in real-world connectors (Slack, GitHub, Email) so your workflows take
real actions — not drafts.

## The relationship

A workflow invokes tools in two ways:

1. **`TOOL_CALL` steps — the workflow decides.** The step names a tool from
   the catalog and templates its arguments from earlier steps:

   ```jsonc
   {
     "id": "notifyOps",
     "type": "TOOL_CALL",
     "name": "Notify ops channel",
     "config": {
       "toolName": "slack_send_message",
       "arguments": {
         "channel": "#ops-alerts",
         "text": "Remediation applied: {{ remediate.output }}",
       },
     },
   }
   ```

2. **`AGENT_TASK` steps — Qwen decides.** The tools you enable on an agent
   step (the chips in the builder's step editor) become functions Qwen may
   call mid-reasoning. The model chooses _whether_, _when_, and _with what
   arguments_ — the platform enforces _if it's allowed_.

Either path runs the same governed pipeline:

```
permission → input validation (Zod) → policy engine (rate limits, quotas,
risk ceiling, business hours) → approval gate (if required) → credential
injection from the encrypted vault → invocation → audit log + history
```

The **Tools → Runner** tab exercises exactly this pipeline, so it's a
faithful preview of what a workflow step will do.

## Built-in real connectors

| Tool                  | What it really does                             | Credential key (Tools → Store credential) |
| --------------------- | ----------------------------------------------- | ----------------------------------------- |
| `slack_send_message`  | Posts to a Slack channel via `chat.postMessage` | `SLACK_API_TOKEN`                         |
| `github_create_issue` | Creates a real issue via the GitHub REST API    | `GITHUB_PERSONAL_ACCESS_TOKEN`            |
| `email_send`          | Sends a real email via the Resend API           | `RESEND_API_KEY`                          |

Credentials are AES-256-GCM encrypted at rest, injected only at execution
time through the mediated execution context, and never shown again after
storing. A tool invoked without its credential fails fast with an actionable
message (e.g. _"store a credential with key `SLACK_API_TOKEN`"_) — no silent
mocks.

### Slack (~5 min)

1. Create a Slack app → _OAuth & Permissions_ → add bot scope `chat:write`.
2. Install to your workspace; copy the **Bot User OAuth Token** (`xoxb-…`).
3. `/invite @YourBot` in the target channel.
4. Tools → **Store credential** → key `SLACK_API_TOKEN`.
5. Runner test: `{ "channel": "#alerts", "text": "Hello from Autopilot ✅" }`

### GitHub (~2 min)

1. GitHub → Settings → Developer settings → **Fine-grained token** with
   _Issues: Read & write_ on one repository.
2. Store credential → key `GITHUB_PERSONAL_ACCESS_TOKEN`.
3. Runner test:
   `{ "owner": "you", "repo": "your-repo", "title": "Test", "body": "🤖" }`
   → a real issue appears; the response contains its real URL.

### Email (~2 min)

1. Create a free [Resend](https://resend.com) account → API key.
2. Store credential → key `RESEND_API_KEY`.
3. Runner test:
   `{ "to": "you@example.com", "subject": "Test", "body": "Hello!" }`
   The default sender is Resend's sandbox (`onboarding@resend.dev`, delivers
   to the account owner's address); pass `from` with a verified domain for
   production use.

## Attaching documents (resumes, briefs, tickets)

Any input field on the Run form accepts files via **Attach files
(PDF/text)** — select multiple at once. PDFs are parsed in the browser (never
uploaded until the run starts) with pdf.js; text formats are read directly.
Each attached file is merged into the field under its own heading so an AI
step can distinguish, e.g., multiple candidates.

Extracted text is sanitized before it reaches any model
([`sanitize-resume.ts`](../../apps/frontend/src/lib/text/sanitize-resume.ts)):
hidden zero-width **keyword-stuffing** is stripped and **prompt-injection**
lines ("ignore previous instructions…") are neutralized, with a visible note
of what was filtered. This keeps AI screening fair and injection-resistant.

## Where the templates use them

- **System Alert → Diagnose → Remediate → Verify** ends with a
  `slack_send_message` TOOL_CALL — the remediation summary lands in your
  real channel.
- **Resume Screening → Rank → Interview** ends with an `email_send`
  TOOL_CALL — the approved interview plan is emailed to
  `{{ input.notifyEmail }}` (the Run form asks for it automatically). The
  step uses `onFailure: "continue"`, so a missing email credential degrades
  gracefully instead of failing the run.

> Templates are seeded idempotently by slug. If you seeded before the email
> step existed, reset dev data (`make clean && make dev`) or edit the
> workflow in the builder to pick up the new step.

## The end-to-end "autopilot" demo chain

1. Enable the webhook trigger:
   `POST /api/v1/workflows/:id/triggers/webhook` → returns hook URL + secret.
2. Fire it like a monitoring system (no login):

   ```bash
   curl -X POST <host>/api/v1/hooks/workflows/<id> \
     -H 'x-hook-token: <secret>' -H 'Content-Type: application/json' \
     -d '{"alert":"CPU 97% on prod-db-1, replica lagging 40s"}'
   ```

3. Qwen diagnoses → proposes remediation → **pauses at the approval gate**.
4. A human approves in the console → remediation runs → **a real Slack
   message arrives in your channel**.

External event in → AI reasoning → human judgment → real-world action out.

## Adding your own tools

- **Code connector**: extend `Connector` in
  `apps/backend/src/modules/tools/connector-framework.ts`, register it in
  `tools.module.ts` (see the three built-ins as references).
- **Declarative connector**: persist a config-driven HTTP/GraphQL tool — no
  engine changes (see `docs/architecture/tools-framework.md`).
- **MCP server**: register the server; its tools are discovered and
  registered automatically over JSON-RPC/stdio — zero code changes.
