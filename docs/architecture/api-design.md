# Qwen Autopilot Platform — API Design

> **Version**: 2.0.0 (Phase 2 Design)
> **Status**: Approved — awaiting implementation

---

## General Rules & Structure

### RESTful URI Design

The API utilizes hierarchical, noun-based REST endpoints.

- Path naming is lowercase and uses plural nouns for collections (e.g., `/api/v1/workflows`).
- Actions that do not represent CRUD are exposed as sub-resources with verb suffixes (e.g., `/api/v1/executions/:id/cancel` or `/api/v1/workflows/:id/execute`).

### Versioning Strategy

- **Path-based Versioning**: The version identifier is prefixed in the base path (e.g., `/api/v1/...`).
- **Policy**: Non-breaking changes (new optional fields, new endpoints) do not increment the version. Breaking changes (removing endpoints, changing mandatory fields, modifying envelope) increment to `/api/v2`.

---

## Request & Response Formats

### Response Envelope

Every API response is returned in a standard envelope to simplify client parsing.

#### Success Envelope (`ApiSuccess<T>`)

```json
{
  "success": true,
  "data": {
    "id": "0190ad50-c8f2-7bc0-a7d0-1b2c3d4e5f60",
    "name": "Customer Support Agent",
    "status": "ACTIVE",
    "version": 1
  }
}
```

#### Failure Envelope (`ApiFailure`)

```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "code": "BAD_REQUEST",
    "message": "Validation failed: systemPrompt is required; modelConfig.maxTokens must be positive",
    "requestId": "req-01J5K...",
    "timestamp": "2026-07-14T17:00:00.000Z"
  }
}
```

---

## Query Parameters: Pagination, Filtering & Sorting

### Pagination Contract

Collection queries are paginated by default. We use offset-based pagination for configuration tables and cursor-based pagination for high-volume logs (`executions`, `audit_logs`).

#### Offset Query Parameters

- `page`: Page number (integer, default: `1`).
- `limit`: Page size limit (integer, default: `20`, max: `100`).

#### Offset Response Envelope (`PaginatedResponse<T>`)

```json
{
  "success": true,
  "data": [{ "id": "uuid-1", "name": "Agent A" }],
  "meta": {
    "currentPage": 1,
    "pageSize": 20,
    "totalItems": 156,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Filtering & Sorting Contract

- **Sorting**: Specified via the `sort` parameter using `field:asc` or `field:desc`. Multiple sorts are comma-separated (e.g., `?sort=createdAt:desc,name:asc`).
- **Filtering**: Provided using explicit filter params matching entity fields or structured operators (e.g., `?status=ACTIVE&category=support`).

---

## Authentication & Authorization

### Authentication Flow (JWT)

1. **Login**: Client submits credentials to `POST /api/v1/auth/login`.
2. **Tokens**: Server returns an Access Token (15m, short-lived JWT) and a Refresh Token (7d, stored in an HTTP-only cookie).
3. **Bearer Authorization**: Subsequent requests pass the access token in the `Authorization: Bearer <token>` header.
4. **Token Refresh**: When the access token expires, client hits `POST /api/v1/auth/refresh` sending the cookie to receive a new Access Token.

### Authorization Flow

1. **RBAC Guard**: The backend parses the JWT payload and verifies the user's role capabilities.
2. **Tenant Scoping**: All routes containing resource IDs (e.g., `/api/v1/workflows/:id`) check if the database record belongs to the organization ID specified in the user's JWT context. If tenant mismatch is detected, a `403 Forbidden` error is raised.

---

## Key Endpoints Map

### Identity & Access Context

- `POST /api/v1/auth/login` - Authenticate & retrieve tokens
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/register` - Create user
- `POST /api/v1/auth/logout` - Invalidate session

### Organization Context

- `POST /api/v1/organizations` - Create organization
- `GET /api/v1/organizations/:id/members` - List organization members
- `POST /api/v1/organizations/:id/members/invite` - Invite member

### Agents Context

- `GET /api/v1/agents` - List agents (paginated, filterable)
- `POST /api/v1/agents` - Create agent
- `GET /api/v1/agents/:id` - Fetch agent by ID
- `PATCH /api/v1/agents/:id` - Edit agent (requires `version`)
- `POST /api/v1/agents/:id/versions` - Snapshot current configuration

### Workflows Context

- `GET /api/v1/workflows` - List workflows
- `POST /api/v1/workflows` - Create workflow
- `GET /api/v1/workflows/:id` - Fetch workflow details
- `PATCH /api/v1/workflows/:id` - Update workflow
- `POST /api/v1/workflows/:id/execute` - Trigger async execution

### Execution Context

- `GET /api/v1/executions` - List workflow executions
- `GET /api/v1/executions/:id` - Get execution detail and steps
- `POST /api/v1/executions/:id/cancel` - Cancel a running execution
- `POST /api/v1/executions/:id/retry` - Retry failed step execution
