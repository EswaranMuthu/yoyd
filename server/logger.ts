type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, tag: string, message: string, meta?: Record<string, unknown>): string {
  const color = LOG_COLORS[level];
  const metaStr = meta ? ` ${DIM}${JSON.stringify(meta)}${RESET}` : "";
  return `${DIM}${timestamp()}${RESET} ${color}${level.toUpperCase().padEnd(5)}${RESET} [${tag}] ${message}${metaStr}`;
}

function createTaggedLogger(tag: string) {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      console.log(formatMessage("debug", tag, message, meta));
    },
    info(message: string, meta?: Record<string, unknown>) {
      console.log(formatMessage("info", tag, message, meta));
    },
    warn(message: string, meta?: Record<string, unknown>) {
      console.warn(formatMessage("warn", tag, message, meta));
    },
    error(message: string, error?: unknown, meta?: Record<string, unknown>) {
      const errMsg = error instanceof Error ? error.message : String(error || "");
      const errStack = error instanceof Error ? error.stack : undefined;
      const combined = { ...meta, ...(errMsg ? { error: errMsg } : {}), ...(errStack ? { stack: errStack } : {}) };
      console.error(formatMessage("error", tag, message, Object.keys(combined).length > 0 ? combined : undefined));
    },
  };
}

export const logger = {
  db: createTaggedLogger("db"),
  s3: createTaggedLogger("s3"),
  auth: createTaggedLogger("auth"),
  vault: createTaggedLogger("vault"),
  routes: createTaggedLogger("routes"),
  storage: createTaggedLogger("storage"),
  server: createTaggedLogger("server"),
};
