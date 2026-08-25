-- AlterTable
ALTER TABLE "credentials" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "key_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "last_used_at" TIMESTAMP(3),
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "rotated_at" TIMESTAMP(3),
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'ORGANIZATION',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_id" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "mcp_servers" ADD COLUMN     "auth_type" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "capabilities" JSONB,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "credential_key" TEXT,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "headers" JSONB,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "last_health_check_at" TIMESTAMP(3),
ADD COLUMN     "protocol_version" TEXT,
ADD COLUMN     "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "tool_definitions" ADD COLUMN     "approval_type" TEXT,
ADD COLUMN     "audit_config" JSONB,
ADD COLUMN     "connector_id" UUID,
ADD COLUMN     "documentation" TEXT,
ADD COLUMN     "idempotent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "owner" TEXT,
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requires_approval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retry_policy" JSONB,
ADD COLUMN     "risk_level" TEXT NOT NULL DEFAULT 'LOW',
ADD COLUMN     "supported_providers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timeout_ms" INTEGER NOT NULL DEFAULT 120000,
ADD COLUMN     "validation_rules" JSONB;

-- AlterTable
ALTER TABLE "tool_execution_history" ADD COLUMN     "approval_id" UUID,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "correlation_id" TEXT,
ADD COLUMN     "execution_id" UUID,
ADD COLUMN     "risk_level" TEXT,
ADD COLUMN     "run_by_type" TEXT NOT NULL DEFAULT 'USER',
ADD COLUMN     "sandboxed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "step_execution_id" UUID,
ADD COLUMN     "tool_definition_id" UUID,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "tool_policies" ADD COLUMN     "allowed_organizations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "business_hours" JSONB,
ADD COLUMN     "concurrency_limit" INTEGER,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "daily_quota" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rate_limit_per_minute" INTEGER,
ADD COLUMN     "restricted_operations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "risk_ceiling" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "connectors" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "connector_type" TEXT NOT NULL,
    "base_url" TEXT,
    "auth_type" TEXT NOT NULL DEFAULT 'NONE',
    "config" JSONB NOT NULL,
    "credential_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "health_status" TEXT DEFAULT 'UNKNOWN',
    "last_health_check_at" TIMESTAMP(3),
    "last_health_error" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connectors_organization_id_status_idx" ON "connectors"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "connectors_organization_id_slug_key" ON "connectors"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "credentials_organization_id_scope_user_id_idx" ON "credentials"("organization_id", "scope", "user_id");

-- CreateIndex
CREATE INDEX "mcp_servers_organization_id_status_idx" ON "mcp_servers"("organization_id", "status");

-- CreateIndex
CREATE INDEX "tool_definitions_organization_id_status_idx" ON "tool_definitions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "tool_definitions_category_idx" ON "tool_definitions"("category");

-- CreateIndex
CREATE INDEX "tool_execution_history_organization_id_created_at_idx" ON "tool_execution_history"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "tool_execution_history_organization_id_tool_name_idx" ON "tool_execution_history"("organization_id", "tool_name");

-- CreateIndex
CREATE INDEX "tool_execution_history_correlation_id_idx" ON "tool_execution_history"("correlation_id");

-- CreateIndex
CREATE INDEX "tool_policies_organization_id_tool_name_idx" ON "tool_policies"("organization_id", "tool_name");

-- AddForeignKey
ALTER TABLE "tool_definitions" ADD CONSTRAINT "tool_definitions_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
