import type { WorkflowDefinition } from "./workflow-definition.schema";

/**
 * Production-quality reference workflows demonstrating the platform's full
 * capability surface: agent reasoning, tool calls, conditional branching,
 * human approval gates, compensation, and memory. Seeded per-organization on
 * demand; users author additional workflows without code changes.
 *
 * Every template is a declarative WorkflowDefinition — no engine changes are
 * needed to run them.
 */
export interface ReferenceTemplate {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  definition: WorkflowDefinition;
}

export const REFERENCE_TEMPLATES: ReferenceTemplate[] = [
  {
    category: "Sales",
    definition: {
      connections: [
        { fromStepId: "start", toStepId: "classify" },
        { fromStepId: "classify", toStepId: "gather" },
        { fromStepId: "gather", toStepId: "quote" },
        { fromStepId: "quote", toStepId: "approval" },
        { fromStepId: "approval", toStepId: "respond" },
        { fromStepId: "respond", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Inquiry received", type: "START" },
        {
          config: {
            promptTemplate:
              "Classify this customer inquiry by intent and urgency:\n{{ input.inquiry }}",
            systemPrompt: "You classify inbound sales inquiries.",
          },
          id: "classify",
          name: "Classify inquiry",
          type: "AGENT_TASK",
        },
        {
          config: {
            operation: "retrieve",
            query: "pricing and product information for {{ classify.output }}",
          },
          id: "gather",
          name: "Gather product context",
          type: "MEMORY",
        },
        {
          config: {
            promptTemplate:
              "Using this context: {{ gather.output }}\nDraft a price quote for the inquiry: {{ input.inquiry }}",
            systemPrompt: "You draft accurate, itemized sales quotes.",
          },
          id: "quote",
          name: "Generate quote",
          type: "AGENT_TASK",
        },
        {
          config: {
            approverRole: "SALES_MANAGER",
            message: "Approve this quote before it is sent to the customer:\n{{ quote.output }}",
            slaMinutes: 240,
          },
          id: "approval",
          name: "Manager approval",
          type: "APPROVAL",
        },
        {
          config: {
            promptTemplate:
              "Write a polished customer-facing response delivering this approved quote: {{ quote.output }}",
            systemPrompt: "You write professional customer responses.",
          },
          id: "respond",
          name: "Send response",
          type: "AGENT_TASK",
        },
        { config: {}, id: "end", name: "Complete", type: "END" },
      ],
    },
    description:
      "Classify a customer inquiry, gather product context, draft a quote, require manager approval, then send the response.",
    name: "Customer Inquiry → Quote → Approval",
    slug: "customer-inquiry-quote-approval",
    tags: ["sales", "approval", "customer"],
  },
  {
    category: "Support",
    definition: {
      connections: [
        { fromStepId: "start", toStepId: "categorize" },
        { fromStepId: "categorize", toStepId: "diagnostics" },
        { fromStepId: "diagnostics", toStepId: "recommend" },
        { fromStepId: "recommend", toStepId: "severity" },
        { fromStepId: "severity", label: "true", toStepId: "escalate" },
        { fromStepId: "severity", label: "false", toStepId: "resolve" },
        { fromStepId: "escalate", toStepId: "end" },
        { fromStepId: "resolve", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Ticket opened", type: "START" },
        {
          config: {
            promptTemplate:
              "Categorize this support ticket and assign a severity (critical/normal):\n{{ input.ticket }}",
            systemPrompt: "You triage support tickets.",
          },
          id: "categorize",
          name: "Categorize ticket",
          type: "AGENT_TASK",
        },
        {
          config: {
            promptTemplate:
              "Based on the category {{ categorize.output }}, list the diagnostic checks to run.",
          },
          id: "diagnostics",
          name: "Gather diagnostics",
          type: "AGENT_TASK",
        },
        {
          config: {
            promptTemplate: "Given diagnostics {{ diagnostics.output }}, recommend a resolution.",
          },
          id: "recommend",
          name: "Recommend solution",
          type: "AGENT_TASK",
        },
        {
          config: { expression: "categorize.output.toLowerCase().includes('critical')" },
          id: "severity",
          name: "Critical?",
          type: "CONDITION",
        },
        {
          config: {
            approverRole: "SUPPORT_LEAD",
            message: "Critical ticket needs escalation review:\n{{ recommend.output }}",
          },
          id: "escalate",
          name: "Escalate to engineer",
          type: "APPROVAL",
        },
        {
          config: {
            key: "resolution_{{ input.ticketId }}",
            operation: "store",
            value: "{{ recommend.output }}",
          },
          id: "resolve",
          name: "Record resolution",
          type: "MEMORY",
        },
        { config: {}, id: "end", name: "Complete", type: "END" },
      ],
    },
    description:
      "Categorize a support ticket, run diagnostics, recommend a solution, and escalate for approval only when the ticket is critical.",
    name: "Support Ticket → Diagnose → Escalate",
    slug: "support-ticket-diagnose-escalate",
    tags: ["support", "conditional", "escalation"],
  },
  {
    category: "Finance",
    definition: {
      connections: [
        { fromStepId: "start", toStepId: "extract" },
        { fromStepId: "extract", toStepId: "validate" },
        { fromStepId: "validate", toStepId: "validateGate" },
        { fromStepId: "validateGate", label: "true", toStepId: "approval" },
        { fromStepId: "validateGate", label: "false", toStepId: "reject" },
        { fromStepId: "approval", toStepId: "post" },
        { fromStepId: "post", toStepId: "end" },
        { fromStepId: "reject", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Invoice received", type: "START" },
        {
          config: {
            promptTemplate:
              "Extract vendor, amount, due date, and line items from this invoice:\n{{ input.invoice }}",
            systemPrompt: "You extract structured data from invoices.",
          },
          id: "extract",
          name: "Extract invoice data",
          type: "AGENT_TASK",
        },
        {
          config: {
            promptTemplate:
              "Validate the extracted invoice {{ extract.output }} against purchase order {{ input.purchaseOrder }}. Reply with VALID or INVALID and a reason.",
          },
          id: "validate",
          name: "Validate against PO",
          type: "AGENT_TASK",
        },
        {
          config: {
            expression:
              "validate.output.toUpperCase().includes('VALID') && !validate.output.toUpperCase().includes('INVALID')",
          },
          id: "validateGate",
          name: "Valid?",
          type: "CONDITION",
        },
        {
          config: {
            approverRole: "FINANCE_MANAGER",
            message: "Approve payment for invoice:\n{{ extract.output }}",
            slaMinutes: 480,
          },
          id: "approval",
          name: "Manager approval",
          type: "APPROVAL",
        },
        {
          compensation: {
            arguments: { invoice: "{{ extract.output }}" },
            toolName: "accounting_reverse_entry",
          },
          config: {
            arguments: { entry: "{{ extract.output }}" },
            toolName: "accounting_post_entry",
          },
          id: "post",
          name: "Post to accounting",
          onFailure: "fail",
          retry: { backoffFactor: 2, initialDelayMs: 1000, maxAttempts: 3 },
          type: "TOOL_CALL",
        },
        {
          config: {
            promptTemplate: "Draft a rejection note for the invalid invoice: {{ validate.output }}",
          },
          id: "reject",
          name: "Reject invoice",
          type: "AGENT_TASK",
        },
        { config: {}, id: "end", name: "Complete", type: "END" },
      ],
    },
    description:
      "Extract invoice data, validate against the PO, require finance approval, and post to accounting with a compensating reversal on downstream failure.",
    name: "Invoice → Validate → Approve → Post",
    slug: "invoice-validate-approve-post",
    tags: ["finance", "compensation", "approval"],
  },
  {
    category: "HR",
    definition: {
      connections: [
        { fromStepId: "start", toStepId: "evaluate" },
        { fromStepId: "evaluate", toStepId: "rank" },
        { fromStepId: "rank", toStepId: "approval" },
        { fromStepId: "approval", toStepId: "schedule" },
        { fromStepId: "schedule", toStepId: "notify" },
        { fromStepId: "notify", toStepId: "emailPlan" },
        { fromStepId: "emailPlan", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Applications received", type: "START" },
        {
          config: {
            promptTemplate:
              "Evaluate each candidate against the job requirements {{ input.requirements }}:\n{{ input.candidates }}",
            systemPrompt: "You are an impartial technical recruiter.",
          },
          id: "evaluate",
          name: "Evaluate candidates",
          type: "AGENT_TASK",
        },
        {
          config: {
            promptTemplate:
              "Rank the evaluated candidates and pick the top 3: {{ evaluate.output }}",
          },
          id: "rank",
          name: "Rank applicants",
          type: "AGENT_TASK",
        },
        {
          config: {
            approverRole: "HIRING_MANAGER",
            message: "Approve the shortlist before scheduling interviews:\n{{ rank.output }}",
          },
          id: "approval",
          name: "Hiring manager approval",
          type: "APPROVAL",
        },
        {
          config: {
            promptTemplate: "Propose interview slots for the approved shortlist: {{ rank.output }}",
          },
          id: "schedule",
          name: "Schedule interviews",
          type: "AGENT_TASK",
        },
        {
          config: {
            promptTemplate:
              "Draft stakeholder notifications for the scheduled interviews: {{ schedule.output }}",
          },
          id: "notify",
          name: "Notify stakeholders",
          type: "AGENT_TASK",
        },
        {
          config: {
            arguments: {
              body: "{{ notify.output }}",
              subject: "Interview plan — approved shortlist",
              to: "{{ input.notifyEmail }}",
            },
            toolName: "email_send",
          },
          id: "emailPlan",
          name: "Email interview plan",
          // Real-world action: the drafted plan is actually emailed. If the
          // email credential isn't configured yet, degrade gracefully — the
          // run still completes and the failed step is visible in history.
          onFailure: "continue",
          retry: { backoffFactor: 2, initialDelayMs: 1000, maxAttempts: 2 },
          type: "TOOL_CALL",
        },
        { config: {}, id: "end", name: "Complete", type: "END" },
      ],
    },
    description:
      "Screen and rank candidates, get hiring-manager approval on the shortlist, schedule interviews, and email the interview plan to the hiring team.",
    name: "Resume Screening → Rank → Interview",
    slug: "resume-screening-rank-interview",
    tags: ["hr", "recruiting", "approval"],
  },
  {
    category: "Operations",
    definition: {
      connections: [
        { fromStepId: "start", toStepId: "diagnose" },
        { fromStepId: "diagnose", toStepId: "risky" },
        { fromStepId: "risky", label: "true", toStepId: "approval" },
        { fromStepId: "risky", label: "false", toStepId: "remediate" },
        { fromStepId: "approval", toStepId: "remediate" },
        { fromStepId: "remediate", toStepId: "verify" },
        { fromStepId: "verify", toStepId: "notify" },
        { fromStepId: "notify", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Alert fired", type: "START" },
        {
          config: {
            promptTemplate:
              "Diagnose this system alert and assess remediation risk (low/high):\n{{ input.alert }}",
            systemPrompt: "You are an SRE diagnosing production alerts.",
          },
          id: "diagnose",
          name: "Diagnose alert",
          type: "AGENT_TASK",
        },
        {
          config: { expression: "diagnose.output.toLowerCase().includes('high')" },
          id: "risky",
          name: "High-risk remediation?",
          type: "CONDITION",
        },
        {
          config: {
            approverRole: "ON_CALL_LEAD",
            message: "High-risk remediation requires approval:\n{{ diagnose.output }}",
            slaMinutes: 30,
          },
          id: "approval",
          name: "On-call approval",
          type: "APPROVAL",
        },
        {
          compensation: { arguments: {}, toolName: "ops_rollback_remediation" },
          config: {
            arguments: { plan: "{{ diagnose.output }}" },
            toolName: "ops_run_remediation",
          },
          id: "remediate",
          name: "Run remediation",
          retry: { backoffFactor: 2, initialDelayMs: 2000, maxAttempts: 2 },
          type: "TOOL_CALL",
        },
        {
          config: {
            promptTemplate: "Verify system health after remediation: {{ remediate.output }}",
          },
          id: "verify",
          name: "Verify health",
          type: "AGENT_TASK",
        },
        {
          config: {
            arguments: { channel: "#ops", text: "Alert remediated: {{ verify.output }}" },
            toolName: "slack_send_message",
          },
          id: "notify",
          name: "Notify engineers",
          onFailure: "continue",
          type: "TOOL_CALL",
        },
        { config: {}, id: "end", name: "Complete", type: "END" },
      ],
    },
    description:
      "Diagnose a system alert, gate high-risk remediations behind approval, run remediation with rollback compensation, verify health, and notify the team.",
    name: "System Alert → Diagnose → Remediate → Verify",
    slug: "system-alert-remediate-verify",
    tags: ["operations", "compensation", "conditional"],
  },
  {
    category: "Sales",
    definition: {
      connections: [
        { fromStepId: "start", toStepId: "qualify" },
        { fromStepId: "qualify", toStepId: "qualified" },
        { fromStepId: "qualified", label: "true", toStepId: "enrich" },
        { fromStepId: "qualified", label: "false", toStepId: "nurture" },
        { fromStepId: "enrich", toStepId: "proposal" },
        { fromStepId: "proposal", toStepId: "approval" },
        { fromStepId: "approval", toStepId: "followup" },
        { fromStepId: "followup", toStepId: "end" },
        { fromStepId: "nurture", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Lead received", type: "START" },
        {
          config: {
            promptTemplate:
              "Qualify this sales lead (score fit and intent, reply QUALIFIED or UNQUALIFIED):\n{{ input.lead }}",
            systemPrompt: "You qualify inbound sales leads.",
          },
          id: "qualify",
          name: "Qualify lead",
          type: "AGENT_TASK",
        },
        {
          config: {
            expression:
              "qualify.output.toUpperCase().includes('QUALIFIED') && !qualify.output.toUpperCase().includes('UNQUALIFIED')",
          },
          id: "qualified",
          name: "Qualified?",
          type: "CONDITION",
        },
        {
          config: {
            arguments: { lead: "{{ input.lead }}" },
            toolName: "crm_enrich_contact",
          },
          id: "enrich",
          name: "Enrich CRM record",
          onFailure: "continue",
          type: "TOOL_CALL",
        },
        {
          config: {
            promptTemplate:
              "Generate a tailored proposal for the enriched lead: {{ enrich.output }}",
          },
          id: "proposal",
          name: "Generate proposal",
          type: "AGENT_TASK",
        },
        {
          config: {
            approverRole: "SALES_MANAGER",
            message: "Approve this proposal before sending:\n{{ proposal.output }}",
          },
          id: "approval",
          name: "Manager approval",
          type: "APPROVAL",
        },
        {
          config: {
            promptTemplate:
              "Draft a follow-up sequence for the approved proposal: {{ proposal.output }}",
          },
          id: "followup",
          name: "Schedule follow-up",
          type: "AGENT_TASK",
        },
        {
          config: {
            key: "nurture_{{ input.leadId }}",
            operation: "store",
            value: "Unqualified lead parked for nurture: {{ qualify.output }}",
          },
          id: "nurture",
          name: "Park for nurture",
          type: "MEMORY",
        },
        { config: {}, id: "end", name: "Complete", type: "END" },
      ],
    },
    description:
      "Qualify a sales lead, enrich the CRM, generate a proposal, get approval, and schedule follow-up — parking unqualified leads for nurture.",
    name: "Sales Lead → Qualify → Proposal → Follow-up",
    slug: "sales-lead-qualify-proposal",
    tags: ["sales", "conditional", "crm"],
  },
];
