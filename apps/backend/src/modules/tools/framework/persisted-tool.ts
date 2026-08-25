import { Tool } from "../tool.interface";
import type { ToolMetadata } from "../tool.interface";
import type { ConnectorInvokerService, ConnectorInvokeConfig } from "./connector-invoker.service";
import type { ToolExecutionContext } from "./tool-execution-context";

/**
 * A runtime {@link Tool} materialized from a persisted `ToolDefinition` row.
 * Its behavior is entirely declarative — the invocation is delegated to the
 * generic {@link ConnectorInvokerService} using the row's resolved config — so
 * new HTTP/GraphQL/connector-backed tools are added with data, never code.
 */
export class PersistedTool extends Tool {
  readonly metadata: ToolMetadata;

  constructor(
    metadata: ToolMetadata,
    private readonly config: ConnectorInvokeConfig,
    private readonly invoker: ConnectorInvokerService,
  ) {
    super();
    this.metadata = metadata;
  }

  execute(input: Record<string, unknown>, context?: ToolExecutionContext): Promise<unknown> {
    if (!context) {
      throw new Error(`Persisted tool "${this.metadata.name}" requires an execution context`);
    }
    return this.invoker.invoke(this.config, input, context);
  }
}
