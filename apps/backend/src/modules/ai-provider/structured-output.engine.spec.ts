import { Test } from "@nestjs/testing";
import { z } from "zod";
import { StructuredOutputEngine } from "./structured-output.engine";
import { LLM_PROVIDER } from "./llm-provider.interface";
import { BadRequestException } from "@nestjs/common";

describe("StructuredOutputEngine", () => {
  let engine: StructuredOutputEngine;
  let mockLlm: any;

  const testSchema = z.object({
    reply: z.string(),
    score: z.number(),
  });

  beforeEach(async () => {
    mockLlm = {
      chat: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StructuredOutputEngine,
        {
          provide: LLM_PROVIDER,
          useValue: mockLlm,
        },
      ],
    }).compile();

    engine = moduleRef.get<StructuredOutputEngine>(StructuredOutputEngine);
  });

  it("parses valid JSON response block", async () => {
    const text = '```json\n{"reply": "hello", "score": 90}\n```';
    const result = await engine.parse(text, testSchema);
    expect(result).toEqual({ reply: "hello", score: 90 });
  });

  it("triggers repair loop on broken JSON syntax", async () => {
    // Initial text has malformed JSON missing a closing curly bracket
    const brokenText = '{"reply": "broken", "score": 40';

    // Mock repair call resolves valid formatted JSON
    mockLlm.chat.mockResolvedValueOnce({
      message: {
        content: '{"reply": "broken", "score": 40}',
      },
    });

    const result = await engine.parse(brokenText, testSchema, 1);
    expect(result).toEqual({ reply: "broken", score: 40 });
    expect(mockLlm.chat).toHaveBeenCalled();
  });

  it("throws BadRequestException if repair attempts exhausted", async () => {
    const brokenText = '{"reply": "broken", "score": 40';
    mockLlm.chat.mockResolvedValueOnce({
      message: {
        content: "Still broken output text",
      },
    });

    await expect(engine.parse(brokenText, testSchema, 1)).rejects.toThrow(BadRequestException);
  });
});
