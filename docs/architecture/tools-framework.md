# Tool Execution Framework Architecture & Developer Guide

This document describes the component topology, execution sequences, connector designs, MCP integration patterns, security profiles, and runbooks of the Tool Execution Framework.

---

## 1. System Components & Topology

The Tool Execution Framework enables agents to safely interface with external environments. It enforces security policies, handles manual approval gates, decrypts credentials, and audits actions.

```mermaid
graph TD
    A[Agent Runtime / Workflow Execution] --> B[Tool Executor]
    B --> C[Policy Engine]
    B --> D[Approval Manager]
    B --> E[Credential Manager]
    B --> F[Tool Registry]
    F --> G[Slack Connector]
    F --> H[GitHub Connector]
    F --> I[MCP Client Dynamic Tools]
```

---

## 2. Dynamic Lifecycle Pipelines

### Complete Execution Pipeline

```mermaid
sequenceDiagram
    participant Agent as Agent / Core Engine
    participant Executor as Tool Executor Service
    participant Policy as Policy Engine
    participant Approval as Approval Manager (DB)
    participant Vault as Credential Manager
    participant Registry as Tool Registry
    participant Target as External API / Client

    Agent->>Executor: execute(toolName, args)
    Executor->>Policy: evaluate(toolName, userId)
    Policy-->>Executor: Allowed (requiresApproval = true)

    Executor->>Approval: pause & createPendingRecord()
    Approval-->>Executor: PendingApprovalId
    Note over Executor: Return PENDING_APPROVAL status

    Note over Agent: Admin clicks 'Approve' in Settings Queue
    Agent->>Approval: approve(PendingApprovalId)
    Approval->>Executor: resume(PendingApprovalId)

    Executor->>Vault: getDecryptedCredential(key)
    Vault-->>Executor: PlainText Token
    Executor->>Registry: get(toolName)
    Registry-->>Executor: ToolInstance

    Executor->>Target: executeWithTimeout(args + Token)
    Target-->>Executor: ToolResult
    Executor->>Approval: updateStatus(COMPLETED, ToolResult)
    Executor-->>Agent: ToolResult
```

---

## 3. Connector Framework Architecture

Connectors are structured extensions subclassed from a unified [Connector](file:///home/talented/Desktop/Personal/qwen_hack/apps/backend/src/modules/tools/connector-framework.ts) base:

```typescript
export abstract class Connector extends Tool {
  abstract override readonly metadata: ConnectorMetadata;
}
```

Every connector defines custom inputs and output schemas verified by Zod validators. They must not include business execution state, rendering them modular, isolated, and stateless.

---

## 4. MCP Dynamic Integration Guide

The Model Context Protocol (MCP) discovers and integrates tools dynamically at runtime:

1. **Dynamic Tool Specs**: Standardizes JSON-Schema descriptions.
2. **Standard Inputs/Outputs**: Allows standardizing parameters without code updates.
3. **Transport Protocol**: Connects via Stdio processes or HTTP/SSE servers, managed inside [McpClientService](file:///home/talented/Desktop/Personal/qwen_hack/apps/backend/src/modules/tools/mcp-client.service.ts).

---

## 5. Security Model & Credentials Vault

1. **AES-256-GCM Storage**: Sensitive parameters (tokens, keys) are encrypted before writing to SQL databases.
2. **Derivation Keys**: Strong unique keys are derived from the system secret via SHA-256 hashing.
3. **Policy Control**: Fine-grained RBAC and policy checks guard execution targets against unauthorized users.

---

## 6. Operational Runbooks

### Approving Stuck Executions

1. **Diagnosis**: If an agent hangs or returns `PENDING_APPROVAL` status.
2. **Remediation**:
   - Navigate to **Vault Settings > Approvals Queue**.
   - Review arguments payload risk level.
   - Click **Approve** to resume execution.
