import { PromptBuilderService } from "./prompt-builder.service";

describe("PromptBuilderService", () => {
  const service = new PromptBuilderService();

  it("compiles standard templates with dictionary parameters", () => {
    const template = "Hello {{user.name}}! Welcome to {{company}}.";
    const context = {
      user: { name: "Alice" },
      company: "Acme Corp",
    };
    const compiled = service.compileTemplate(template, context);
    expect(compiled).toBe("Hello Alice! Welcome to Acme Corp.");
  });

  it("builds correct sequence of chat prompts", () => {
    const messages = service.build({
      systemPrompt: "You are a compiler.",
      userPrompt: "Compile code.",
      memoryContext: "Previous state: valid.",
    });

    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("You are a compiler.");
    expect(messages[1]?.role).toBe("system");
    expect(messages[1]?.content).toContain("Previous state: valid.");
    expect(messages[2]?.role).toBe("user");
    expect(messages[2]?.content).toBe("Compile code.");
  });
});
