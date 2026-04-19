// Frontend logger — batches entries and POSTs to /api/logs.
// Mirrors the backend debug/info/warn/error interface so call sites are identical.

interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  source: "frontend";
  message: string;
  userId?: string;
  context?: Record<string, unknown>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const FLUSH_INTERVAL_MS = 5000;

let buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function enqueue(level: LogEntry["level"], message: string, meta?: { userId?: string; context?: Record<string, unknown> }): void {
  buffer.push({
    timestamp: new Date().toISOString(),
    level,
    source: "frontend",
    message,
    ...meta,
  });

  // Start periodic flush if not already running
  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  }
}

async function sendWithRetry(entries: LogEntry[], attempt = 0): Promise<boolean> {
  try {
    const response = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(entries),
    });
    return response.ok;
  } catch {
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return sendWithRetry(entries, attempt + 1);
    }
    return false;
  }
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;

  const entries = buffer;
  buffer = [];

  const success = await sendWithRetry(entries);
  if (!success) {
    // Re-buffer failed entries for next flush attempt
    buffer = [...entries, ...buffer];
  }
}

type LogMeta = { userId?: string; context?: Record<string, unknown> };

export const logger = {
  debug: (message: string, meta?: LogMeta): void => enqueue("debug", message, meta),
  info: (message: string, meta?: LogMeta): void => enqueue("info", message, meta),
  warn: (message: string, meta?: LogMeta): void => enqueue("warn", message, meta),
  error: (message: string, meta?: LogMeta): void => enqueue("error", message, meta),
  /** Immediately flush all buffered entries. Exposed for testing. */
  flush,
  /** Reset internal state. Exposed for testing only. */
  _reset: (): void => {
    buffer = [];
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  },
  /** Read current buffer length. Exposed for testing only. */
  _bufferLength: (): number => buffer.length,
};
