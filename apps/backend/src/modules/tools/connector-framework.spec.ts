import { EmailConnector, GitHubConnector, SlackConnector } from "./connector-framework";
import type { ToolExecutionContext } from "./framework/tool-execution-context";

const contextWithSecret = (value: string | null): ToolExecutionContext =>
  ({ getSecret: jest.fn().mockResolvedValue(value) }) as unknown as ToolExecutionContext;

describe("SlackConnector", () => {
  let connector: SlackConnector;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    connector = new SlackConnector();
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("posts to the Slack Web API with the vault token and returns the message ts", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1721140000.12345" }), { status: 200 }),
    );

    const result = await connector.execute(
      { channel: "#alerts", text: "Deploy done" },
      contextWithSecret("xoxb-token"),
    );

    expect(result).toEqual({ status: "ok", ts: "1721140000.12345" });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer xoxb-token");
    expect(JSON.parse(init.body as string)).toEqual({ channel: "#alerts", text: "Deploy done" });
  });

  it("surfaces Slack API errors (ok=false) as failures", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "channel_not_found", ok: false }), { status: 200 }),
    );

    await expect(
      connector.execute({ channel: "#nope", text: "x" }, contextWithSecret("xoxb-token")),
    ).rejects.toThrow("Slack API error: channel_not_found");
  });

  it("fails fast with a clear message when no credential is stored — no network call", async () => {
    await expect(
      connector.execute({ channel: "#alerts", text: "x" }, contextWithSecret(null)),
    ).rejects.toThrow('store a credential with key "SLACK_API_TOKEN"');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("GitHubConnector", () => {
  let connector: GitHubConnector;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    connector = new GitHubConnector();
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("creates a real issue and returns its URL and number", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ html_url: "https://github.com/acme/api/issues/7", number: 7 }),
        { status: 201 },
      ),
    );

    const result = await connector.execute(
      { body: "Details", owner: "acme", repo: "api", title: "Bug" },
      contextWithSecret("ghp_token"),
    );

    expect(result).toEqual({ issueUrl: "https://github.com/acme/api/issues/7", number: 7 });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/api/issues");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer ghp_token");
  });

  it("URL-encodes owner and repo path segments", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ html_url: "u", number: 1 }), { status: 201 }),
    );

    await connector.execute(
      { body: "b", owner: "we ird/../org", repo: "repo", title: "t" },
      contextWithSecret("ghp_token"),
    );

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe("https://api.github.com/repos/we%20ird%2F..%2Forg/repo/issues");
  });

  it("surfaces non-201 responses with status and detail", async () => {
    fetchSpy.mockResolvedValue(new Response('{"message":"Not Found"}', { status: 404 }));

    await expect(
      connector.execute(
        { body: "b", owner: "acme", repo: "missing", title: "t" },
        contextWithSecret("ghp_token"),
      ),
    ).rejects.toThrow("GitHub API error 404");
  });

  it("fails fast with a clear message when no credential is stored — no network call", async () => {
    await expect(
      connector.execute({ body: "b", owner: "a", repo: "r", title: "t" }, contextWithSecret(null)),
    ).rejects.toThrow('store a credential with key "GITHUB_PERSONAL_ACCESS_TOKEN"');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("EmailConnector", () => {
  let connector: EmailConnector;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    connector = new EmailConnector();
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("sends a real email through the Resend API and returns the message id", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: "re_123" }), { status: 200 }));

    const result = await connector.execute(
      { body: "Interview plan attached.", subject: "Interview plan", to: "hr@acme.com" },
      contextWithSecret("re_api_key"),
    );

    expect(result).toEqual({ id: "re_123", status: "sent" });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer re_api_key");
    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload["to"]).toEqual(["hr@acme.com"]);
    expect(payload["subject"]).toBe("Interview plan");
    expect(payload["from"]).toBe("Qwen Autopilot <onboarding@resend.dev>");
  });

  it("honors a custom verified sender via from", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));

    await connector.execute(
      { body: "b", from: "HR <hr@company.com>", subject: "s", to: "x@y.z" },
      contextWithSecret("re_api_key"),
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((JSON.parse(init.body as string) as Record<string, unknown>)["from"]).toBe(
      "HR <hr@company.com>",
    );
  });

  it("surfaces API errors with status and message", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid `to` address" }), { status: 422 }),
    );

    await expect(
      connector.execute({ body: "b", subject: "s", to: "bad" }, contextWithSecret("re_api_key")),
    ).rejects.toThrow("Email API error 422: Invalid `to` address");
  });

  it("fails fast with a clear message when no credential is stored — no network call", async () => {
    await expect(
      connector.execute({ body: "b", subject: "s", to: "x@y.z" }, contextWithSecret(null)),
    ).rejects.toThrow('store a credential with key "RESEND_API_KEY"');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
