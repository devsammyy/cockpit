import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";

export interface ApprovalRecord {
  executionId: string;
  stepId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt: Date;
  decidedAt?: Date;
  decidedBy?: string;
  rejectionReason?: string;
  payload: any;
}

@Injectable()
export class ApprovalEngineService {
  private readonly logger = new Logger(ApprovalEngineService.name);
  private readonly approvals = new Map<string, ApprovalRecord>();

  private getKey(executionId: string, stepId: string): string {
    return `${executionId}:${stepId}`;
  }

  /**
   * Register a new step execution that requires human approval.
   */
  async requestApproval(executionId: string, stepId: string, payload: any): Promise<void> {
    const key = this.getKey(executionId, stepId);
    if (this.approvals.has(key)) {
      throw new BadRequestException(
        `Approval request already exists for ${executionId} step ${stepId}`,
      );
    }

    this.approvals.set(key, {
      executionId,
      stepId,
      status: "PENDING",
      requestedAt: new Date(),
      payload,
    });

    this.logger.log(`Approval requested for execution ${executionId} at step ${stepId}`);
  }

  /**
   * Approve a pending checkpoint.
   */
  async approve(executionId: string, stepId: string, userId: string): Promise<void> {
    const key = this.getKey(executionId, stepId);
    const record = this.approvals.get(key);
    if (!record) {
      throw new NotFoundException(
        `No approval request found for execution ${executionId} step ${stepId}`,
      );
    }
    if (record.status !== "PENDING") {
      throw new BadRequestException(`Approval is already decided: ${record.status}`);
    }

    record.status = "APPROVED";
    record.decidedAt = new Date();
    record.decidedBy = userId;
    this.logger.log(`Execution ${executionId} step ${stepId} APPROVED by user ${userId}`);
  }

  /**
   * Reject a pending checkpoint.
   */
  async reject(
    executionId: string,
    stepId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const key = this.getKey(executionId, stepId);
    const record = this.approvals.get(key);
    if (!record) {
      throw new NotFoundException(
        `No approval request found for execution ${executionId} step ${stepId}`,
      );
    }
    if (record.status !== "PENDING") {
      throw new BadRequestException(`Approval is already decided: ${record.status}`);
    }

    record.status = "REJECTED";
    record.decidedAt = new Date();
    record.decidedBy = userId;
    record.rejectionReason = reason;
    this.logger.log(
      `Execution ${executionId} step ${stepId} REJECTED by user ${userId} for reason: ${reason}`,
    );
  }

  /**
   * Retrieve current pending approvals.
   */
  async getPending(): Promise<ApprovalRecord[]> {
    return Array.from(this.approvals.values()).filter((a) => a.status === "PENDING");
  }

  /**
   * Fetch current status of a checkpoint.
   */
  async getStatus(
    executionId: string,
    stepId: string,
  ): Promise<"PENDING" | "APPROVED" | "REJECTED" | "NONE"> {
    const key = this.getKey(executionId, stepId);
    return this.approvals.get(key)?.status ?? "NONE";
  }
}
