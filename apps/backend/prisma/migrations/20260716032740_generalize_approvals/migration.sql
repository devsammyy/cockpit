-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "delegated_to" UUID,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "subject_type" TEXT NOT NULL DEFAULT 'WORKFLOW_STEP',
ADD COLUMN     "tool_execution_id" UUID,
ALTER COLUMN "execution_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "approvals_subject_type_status_idx" ON "approvals"("subject_type", "status");
