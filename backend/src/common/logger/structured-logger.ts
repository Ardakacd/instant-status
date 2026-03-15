/**
 * Structured JSON logger for querying and alerting.
 * Outputs: { timestamp, level, context, message, ...extra }
 * Pass an object as second param to add fields: log("msg", { event, userId, error })
 */
export type LogContext = Record<string, unknown>;

function isPlainObject(value: unknown): value is LogContext {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Error) &&
    !(value instanceof Date)
  );
}

export class StructuredLogger {
  constructor(private readonly context: string) {}

  private write(level: string, message: string, ...optionalParams: unknown[]) {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
    };

    const last = optionalParams[optionalParams.length - 1];
    if (isPlainObject(last)) {
      Object.assign(entry, last);
    } else if (optionalParams.length === 1 && typeof optionalParams[0] === "string" && optionalParams[0].length > 0) {
      entry.stack = optionalParams[0];
    } else if (optionalParams.length >= 2) {
      if (typeof optionalParams[0] === "string") entry.stack = optionalParams[0];
      if (typeof optionalParams[1] === "string") entry.path = optionalParams[1];
    }

    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  log(message: string, context?: LogContext): void {
    this.write("log", message, context);
  }

  error(message: string, stackOrContext?: LogContext | string): void {
    this.write("error", message, stackOrContext);
  }

  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }
}
