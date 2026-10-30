const SECRET_PATTERNS = [
  /(0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/g, // private keys / 32-byte secrets
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g, // JWTs
];

/** Strip anything that looks like a key or token before it reaches the console. */
export function redact(message: string): string {
  // Transaction hashes are 32 bytes too, so only redact when the text mentions a key/secret/token.
  if (!/key|secret|token|jwt|authorization/i.test(message)) return message;
  return SECRET_PATTERNS.reduce((m, re) => m.replace(re, "[REDACTED]"), message);
}

function write(level: "info" | "warn" | "error", scope: string, message: string, err?: unknown) {
  if (process.env.NODE_ENV === "test" && level === "info") return;
  const detail = err instanceof Error ? ` — ${err.message}` : err ? ` — ${String(err)}` : "";
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} [${scope}] ${redact(message + detail)}`;
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const logger = {
  info: (scope: string, message: string) => write("info", scope, message),
  warn: (scope: string, message: string, err?: unknown) => write("warn", scope, message, err),
  error: (scope: string, message: string, err?: unknown) => write("error", scope, message, err),
};
