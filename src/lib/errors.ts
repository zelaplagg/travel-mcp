/** An error whose message is safe and useful to show to the MCP client. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** A failure of an upstream data provider (network, timeout, HTTP error). */
export class UpstreamError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; retryable: boolean }) {
    super(message);
    this.name = 'UpstreamError';
    this.status = options.status;
    this.retryable = options.retryable;
  }
}

/** Converts any thrown value into a message that is safe to return to the client. */
export function toUserMessage(error: unknown): string {
  if (error instanceof ToolError) return error.message;
  if (error instanceof UpstreamError) {
    return 'A data provider is temporarily unavailable or returned an error. Please try again later.';
  }
  return 'Unexpected internal error.';
}
