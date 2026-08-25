import { ApprovalEngineService } from "./approval-engine.service";
import { BadRequestException } from "@nestjs/common";

describe("ApprovalEngineService", () => {
  let service: ApprovalEngineService;

  beforeEach(() => {
    service = new ApprovalEngineService();
  });

  it("registers pending approvals and resolves status", async () => {
    await service.requestApproval("exec_1", "step_1", { amount: 50 });
    expect(await service.getStatus("exec_1", "step_1")).toBe("PENDING");

    const pending = await service.getPending();
    expect(pending.length).toBe(1);
    expect(pending[0]?.payload.amount).toBe(50);
  });

  it("approves pending checkpoints successfully", async () => {
    await service.requestApproval("exec_1", "step_1", {});
    await service.approve("exec_1", "step_1", "user_1");

    expect(await service.getStatus("exec_1", "step_1")).toBe("APPROVED");
  });

  it("rejects checkpoints with custom reasons", async () => {
    await service.requestApproval("exec_1", "step_1", {});
    await service.reject("exec_1", "step_1", "user_1", "Limit exceeded");

    expect(await service.getStatus("exec_1", "step_1")).toBe("REJECTED");
  });

  it("throws exception on double decisions", async () => {
    await service.requestApproval("exec_1", "step_1", {});
    await service.approve("exec_1", "step_1", "user_1");

    await expect(service.approve("exec_1", "step_1", "user_2")).rejects.toThrow(
      BadRequestException,
    );
  });
});
