import type { WorkflowStep } from "@/lib/api/types";

/**
 * Human-readable facts about a step's configuration, shown in the run dialog
 * so operators can see exactly what will happen — models used, tools invoked,
 * who must approve, retry behavior — before they start an execution.
 */
export function summarizeStepConfig(step: WorkflowStep): string[] {
  const facts: string[] = [];
  const config = step.config;
  // Engine-level knobs (retry/onFailure/timeout/compensation) live on the step
  // root in the definition JSON; the narrow frontend type only declares config.
  const root = step as unknown as Record<string, unknown>;

  const model = config["model"];
  if (typeof model === "string") facts.push(`model ${model}`);

  const toolName = config["toolName"];
  if (typeof toolName === "string") facts.push(`tool ${toolName}`);

  const tools = config["tools"];
  if (Array.isArray(tools) && tools.length > 0) facts.push(`tools ${tools.join(", ")}`);

  const approverRole = config["approverRole"];
  if (typeof approverRole === "string") facts.push(`approver ${approverRole.replaceAll("_", " ")}`);

  const slaMinutes = config["slaMinutes"];
  if (typeof slaMinutes === "number") {
    facts.push(slaMinutes >= 60 ? `SLA ${String(slaMinutes / 60)}h` : `SLA ${String(slaMinutes)}m`);
  }

  const expression = config["expression"];
  if (typeof expression === "string") facts.push(`branches on: ${expression}`);

  const delayMs = config["delayMs"];
  if (typeof delayMs === "number") facts.push(`waits ${String(Math.round(delayMs / 1000))}s`);

  const url = config["url"];
  if (typeof url === "string") facts.push(`calls ${url}`);

  const retry = root["retry"];
  if (retry && typeof retry === "object") {
    const attempts = (retry as Record<string, unknown>)["maxAttempts"];
    if (typeof attempts === "number") facts.push(`retries ×${String(attempts)}`);
  }

  const onFailure = root["onFailure"];
  if (typeof onFailure === "string") facts.push(`on failure: ${onFailure}`);

  const timeoutMs = root["timeoutMs"];
  if (typeof timeoutMs === "number") facts.push(`timeout ${String(Math.round(timeoutMs / 1000))}s`);

  if (root["compensation"]) facts.push("auto-undo on downstream failure");

  return facts;
}
