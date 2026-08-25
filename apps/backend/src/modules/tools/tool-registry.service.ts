import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { Tool } from "./tool.interface";

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, Tool>();

  /**
   * Register a new tool with the registry.
   */
  register(tool: Tool): void {
    const { name } = tool.metadata;
    if (this.tools.has(name)) {
      this.logger.warn(`Overwriting already registered tool: ${name}`);
    }
    this.tools.set(name, tool);
    this.logger.log(`Registered tool: ${name}`);
  }

  /**
   * Remove a registered tool (e.g. when an MCP server disconnects).
   */
  unregister(name: string): void {
    if (this.tools.delete(name)) {
      this.logger.log(`Unregistered tool: ${name}`);
    }
  }

  /** Whether a tool with this name is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a registered tool by name.
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get list of all registered tools.
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Raw invocation of an already-resolved tool with already-validated input.
   * Input validation, timeout, retry, and sandboxing are owned by the execution
   * pipeline (see ToolExecutorService); this is the thin invocation seam.
   */
  async invoke(tool: Tool, input: any, context?: any): Promise<any> {
    return tool.execute(input, context);
  }

  /**
   * Execute a tool by name with input validation, timeout, and retry capabilities.
   * Retained for the agent runtime, which invokes tools directly.
   */
  async execute(name: string, args: Record<string, any>, context?: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException(`Tool with name ${name} not found in registry`);
    }

    // Input validation
    const parsed = tool.metadata.inputSchema.safeParse(args);
    if (!parsed.success) {
      throw new BadRequestException(
        `Validation failed for tool ${name} arguments: ${parsed.error.message}`,
      );
    }

    const { timeoutMs = 30000, retryAttempts = 0 } = tool.metadata;

    let attempt = 0;
    while (true) {
      try {
        return await this.executeWithTimeout(tool, parsed.data, context, timeoutMs);
      } catch (error) {
        attempt++;
        if (attempt > retryAttempts) {
          this.logger.error(
            `Tool ${name} failed after ${attempt} attempts: ${(error as Error).message}`,
          );
          throw error;
        }
        this.logger.warn(`Tool ${name} failed on attempt ${attempt}. Retrying...`);
        // Backoff delay
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
  }

  private async executeWithTimeout(
    tool: Tool,
    input: any,
    context: any,
    timeoutMs: number,
  ): Promise<any> {
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([tool.execute(input, context), timeoutPromise]);
      return result;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
