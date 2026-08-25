# Qwen Autopilot Platform — Database Design

> **Version**: 2.0.0 (Phase 2 Design)
> **Status**: Approved — awaiting implementation

---

## Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    users {
        uuid id PK
        varchar email UK
        varchar password_hash
        varchar display_name
        varchar avatar_url
        varchar status
        timestamp email_verified_at
        timestamp last_login_at
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
        integer version
    }

    organizations {
        uuid id PK
        varchar name
        varchar slug UK
        varchar plan
        jsonb settings
        integer max_agents
        integer max_workflows
        integer max_executions_per_month
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
        integer version
    }

    organization_members {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        uuid role_id FK
        timestamp joined_at
        uuid invited_by FK
        varchar status
    }

    roles {
        uuid id PK
        uuid organization_id FK "null = system role"
        varchar name
        varchar description
        boolean is_system
        jsonb permissions
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
        integer version
    }

    agents {
        uuid id PK
        uuid organization_id FK
        uuid registry_id FK "null = custom agent"
        varchar name
        varchar description
        varchar slug UK
        text system_prompt
        jsonb model_config
        jsonb tools
        jsonb memory_config
        varchar status
        uuid current_version_id FK
        integer max_tokens_per_execution
        integer max_tool_calls_per_step
        integer execution_timeout_ms
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
        integer version
    }

    agent_versions {
        uuid id PK
        uuid agent_id FK
        integer version_number
        jsonb snapshot
        text changelog
        uuid published_by FK
        timestamp published_at
    }

    tool_definitions {
        uuid id PK
        uuid organization_id FK "null = system tool"
        varchar name
        varchar description
        varchar category
        jsonb input_schema
        jsonb output_schema
        varchar executor_type
        jsonb executor_config
        varchar status
        boolean is_built_in
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
        integer version
    }

    memories {
        uuid id PK
        uuid organization_id FK
        uuid agent_id FK
        uuid execution_id FK "null = agent-level memory"
        varchar scope
        varchar key
        jsonb value
        vector embedding "1536 dims pgvector (future)"
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }

    workflows {
        uuid id PK
        uuid organization_id FK
        varchar name
        varchar description
        varchar slug UK
        jsonb definition
        varchar trigger_type
        jsonb trigger_config
        varchar status
        uuid current_version_id FK
        varchar tags "array"
        varchar category
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
        integer version
    }

    workflow_versions {
        uuid id PK
        uuid workflow_id FK
        integer version_number
        jsonb definition
        jsonb trigger_config
        text changelog
        uuid published_by FK
        timestamp published_at
    }

    executions {
        uuid id PK
        uuid organization_id FK
        uuid workflow_id FK
        uuid workflow_version_id FK
        varchar status
        jsonb input
        jsonb output
        jsonb variables
        varchar current_step_id
        timestamp started_at
        timestamp completed_at
        timestamp failed_at
        text error_message
        varchar error_step_id
        integer total_tokens_used
        integer total_tool_calls
        integer total_duration_ms
        integer total_cost_estimate
        uuid triggered_by FK
        varchar trigger_type
        integer attempt_number
        integer max_attempts
        uuid parent_execution_id FK
        timestamp created_at
        timestamp updated_at
        integer version
    }

    step_executions {
        uuid id PK
        uuid execution_id FK
        varchar step_id
        varchar step_type
        varchar status
        jsonb input
        jsonb output
        uuid agent_id FK
        text prompt_sent
        text response_received
        jsonb tokens_used
        jsonb tool_calls
        timestamp started_at
        timestamp completed_at
        integer duration_ms
        text error_message
        integer retry_count
        integer sequence_number
    }

    audit_logs {
        uuid id PK
        uuid organization_id FK
        timestamp timestamp
        varchar actor_id
        varchar actor_type
        varchar action
        varchar resource_type
        varchar resource_id
        jsonb changes
        jsonb metadata
        varchar request_id
        varchar ip_address
        varchar user_agent
    }

    notifications {
        uuid id PK
        uuid organization_id FK
        uuid recipient_id FK
        varchar type
        varchar title
        text body
        varchar severity
        varchar channel
        timestamp delivered_at
        timestamp read_at
        varchar source_type
        varchar source_id
        varchar action_url
        timestamp created_at
    }

    webhooks {
        uuid id PK
        uuid organization_id FK
        varchar name
        varchar url
        varchar secret
        varchar events "array"
        boolean is_active
        timestamp last_delivered_at
        integer last_status_code
        integer consecutive_failures
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
        integer version
    }

    integrations {
        uuid id PK
        uuid organization_id FK
        varchar name
        varchar type
        varchar provider
        jsonb config
        varchar status
        timestamp last_health_check_at
        varchar health_status
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
        integer version
    }

    organizations ||--|{ organization_members : "has"
    users ||--|{ organization_members : "belongs_to"
    roles ||--|{ organization_members : "authorizes"
    organizations ||--|{ roles : "defines"
    organizations ||--|{ agents : "owns"
    organizations ||--|{ tool_definitions : "defines"
    organizations ||--|{ workflows : "owns"
    organizations ||--|{ executions : "runs"
    organizations ||--|{ audit_logs : "records"
    organizations ||--|{ notifications : "receives"
    organizations ||--|{ webhooks : "triggers"
    organizations ||--|{ integrations : "links"

    agents ||--|{ agent_versions : "has_history"
    agents ||--|{ memories : "uses_memory"
    workflows ||--|{ workflow_versions : "has_history"
    workflows ||--|{ executions : "instantiates"
    executions ||--|{ step_executions : "tracks_steps"
    executions ||--|{ memories : "uses_execution_memory"
    executions ||--o{ executions : "spawns_sub_executions"
```

---

## Database Design Specifications

### UUID Strategy: UUIDv7

To ensure high-performance indexing and scale, **UUIDv7 (time-based, lexicographically sortable)** is specified for all primary keys.

- **Benefits**: Unlike random UUIDv4, UUIDv7 incorporates a Unix epoch timestamp at the start of the 128-bit value. This results in sequential insert keys, avoiding page splitting in B-Tree indices while keeping primary keys globally unique across nodes.
- **Implementation**: Generated either at the application level via `@types/uuid` or inside PostgreSQL using a custom function/extension before schema initialization.

### Indexing Strategy

To optimize latency for multi-tenant and query operations, the following indexes are specified:

1. **Multi-tenancy isolation**:
   - Every tenant table has a compound index or foreign key index on `organization_id` combined with specific query properties.
   - Example: `IDX_agent_organization` on `agents(organization_id, slug)` where slug is queried within the tenant scope.

2. **Query Optimization**:
   - `users(email)`: Unique index.
   - `organizations(slug)`: Unique index.
   - `workflow_versions(workflow_id, version_number)`: Compound index for quick version lookups.
   - `agent_versions(agent_id, version_number)`: Compound index.
   - `executions(organization_id, status)`: Fast filtering of active runs.
   - `step_executions(execution_id, sequence_number)`: Retrieve step histories in insertion order.
   - `memories(agent_id, key)`: Index on key lookup.
   - `audit_logs(organization_id, timestamp)`: Optimized for pagination.

### Soft Deletes

All core entities (`users`, `organizations`, `roles`, `agents`, `tool_definitions`, `workflows`, `webhooks`, `integrations`) use **Soft Deletes**.

- **Field**: `deleted_at TIMESTAMP NULL`
- **Behavior**: When deleted, `deleted_at` is set to the current time. All queries at the repository level include `WHERE deleted_at IS NULL` by default.
- **Exception**: Run history entities (`executions`, `step_executions`, `audit_logs`) do not support soft deletes to protect audit compliance.

### Audit Fields

All mutable tables contain standard audit fields:

- `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`: Read-only creation timestamp.
- `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`: Updated automatically on modifications.
- `version INTEGER DEFAULT 1`: Used for optimistic locking.

### Optimistic Locking

To prevent concurrent overwrite anomalies when multiple users or autonomous agents edit configurations:

- Every update request contains the `version` the client read.
- The SQL query checks `WHERE id = ? AND version = ?`.
- On success, the version is incremented (`version = version + 1`).
- If zero rows are affected, a `ConflictException` is returned to prompt a merge/retry.
