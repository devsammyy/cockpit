import { Test } from "@nestjs/testing";
import { PlannerService } from "./planner.service";
import { LLM_PROVIDER } from "../ai-provider/llm-provider.interface";

describe("PlannerService", () => {
  let service: PlannerService;
  let mockLlm: any;

  beforeEach(async () => {
    mockLlm = {
      chat: jest.fn().mockResolvedValue({
        message: {
          content: JSON.stringify({
            steps: [{ id: "s1", type: "AGENT_TASK", name: "Step One", config: {} }],
            reasoning: "Test reasoning",
          }),
        },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlannerService,
        {
          provide: LLM_PROVIDER,
          useValue: mockLlm,
        },
      ],
    }).compile();

    service = moduleRef.get<PlannerService>(PlannerService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("generates correct execution plan mapping", async () => {
    const plan = await service.generatePlan("Run mock workflow", ["tool_1"]);
    expect(plan.reasoning).toBe("Test reasoning");
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0]?.id).toBe("s1");
    expect(mockLlm.chat).toHaveBeenCalled();
  });
});
