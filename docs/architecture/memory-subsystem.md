# Memory & Context Subsystem Architecture & Developer Guide

This document describes the component configurations, lifecycles, and operational runbooks for the Memory and Context subsystem.

---

## 1. System Components & Topology

The memory subsystem is decoupled from workflows. It provides short-term memory (during executions), long-term memory (user preferences), semantic index stores, and reflection generators.

```mermaid
graph TD
    A[Agent Runtime / Execution Loop] --> B[Context Builder]
    A --> C[Reflection Engine]
    B --> D[Semantic Memory Service]
    B --> E[Long-Term Preference Memory]
    D --> F[SQL Database / Vector storage]
```

---

## 2. Dynamic Lifecycle Pipelines

### Complete Memory Lifecycle

```mermaid
flowchart TD
    A[Observe Action] --> B[Classify Type]
    B --> C[Compute Similarity Embeddings]
    C --> D[Save to SQL Vault / Vector]
    D --> E[Query via Context Builder]
    E --> F[Inject into LLM Prompt Context]
```

### Context Builder Pipeline

```mermaid
sequenceDiagram
    participant User as AgentRuntime
    participant Context as Context Builder
    participant DB as SQL DB / Semantic Memory

    User->>Context: compile(prompt, orgId)
    Context->>DB: searchSemanticMemories(embedding)
    DB-->>Context: RelevantTextMatches
    Context->>Context: checkTokenLimit constraints()
    Note over Context: Truncate and optimize prompt sizes
    Context-->>User: ContextualPromptString
```

### Reflection Pipeline

```mermaid
sequenceDiagram
    participant App as AgentRuntime
    participant Engine as Reflection Engine
    participant DB as SQL DB / Reflections table
    participant Semantic as Semantic Index

    Note over App: Workflow completion success/fail status
    App->>Engine: analyzeExecution(execId, status, tools)
    Engine->>DB: createReflectionRecord()
    Engine->>Semantic: store(reflectionText, mockVector)
    Engine-->>App: learnings indexed successfully
```

---

## 3. Security & Multi-Tenancy

1. **Organization Isolation**: Every memory lookup enforces filters against the active session `orgId`.
2. **Metadata filtering**: Restricts access context parameters.
3. **Data Protection**: Encrypts sensitive entities if designated.

---

## 4. Operational Runbooks

### Cleaning Stale Memories

1. **Diagnosis**: If context building yields irrelevant historical prompt instructions.
2. **Remediation**:
   - Navigate to **Vault Settings > Memory Explorer**.
   - Clear or soft-delete specific keys from preferences.
   - Adjust default token bounds to compress history further.
