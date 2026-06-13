export type RetryFetchResult<T> = {
  data: T | null;
  attempts: number;
  durationMs: number;
  status: number;
};

export class RetryableRequestError extends Error {
  attempts: number;
  durationMs: number;
  status?: number;

  constructor({
    attempts,
    durationMs,
    message,
    status,
  }: {
    attempts: number;
    durationMs: number;
    message: string;
    status?: number;
  }) {
    super(message);
    this.name = "RetryableRequestError";
    this.attempts = attempts;
    this.durationMs = durationMs;
    this.status = status;
  }
}

type RetryOptions = {
  retryDelayMs?: number;
  retryStatuses?: number[];
  timeoutMs?: number;
  totalAttempts?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_TOTAL_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_RETRY_STATUSES = [408, 409, 425, 429, 500, 502, 503, 504];

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number, retryStatuses: number[]) {
  return retryStatuses.includes(status);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function readResponseBody(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text) {
    return {
      data: null,
      message: "",
    };
  }

  try {
    const data = JSON.parse(text) as unknown;
    const message =
      typeof data === "object" && data && "message" in data
        ? String(data.message)
        : typeof data === "object" && data && "error" in data
          ? JSON.stringify(data.error)
          : text;

    return {
      data,
      message,
    };
  } catch {
    return {
      data: null,
      message: text,
    };
  }
}

export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<RetryFetchResult<T>> {
  const startedAt = Date.now();
  const timeoutMs =
    options.timeoutMs ?? readPositiveInt(process.env.AI_HTTP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const totalAttempts =
    options.totalAttempts ??
    readPositiveInt(process.env.AI_HTTP_TOTAL_ATTEMPTS, DEFAULT_TOTAL_ATTEMPTS);
  const retryDelayMs =
    options.retryDelayMs ??
    readPositiveInt(process.env.AI_HTTP_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS);
  const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES;
  let lastError: unknown;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      const body = await readResponseBody(response);
      const durationMs = Date.now() - startedAt;

      if (response.ok) {
        return {
          data: body.data as T,
          attempts: attempt,
          durationMs,
          status: response.status,
        };
      }

      const message = body.message || `HTTP 요청이 실패했습니다. status=${response.status}`;

      if (attempt >= totalAttempts || !isRetryableStatus(response.status, retryStatuses)) {
        throw new RetryableRequestError({
          attempts: attempt,
          durationMs,
          message,
          status: response.status,
        });
      }

      lastError = new RetryableRequestError({
        attempts: attempt,
        durationMs,
        message,
        status: response.status,
      });
    } catch (error) {
      if (error instanceof RetryableRequestError) {
        throw error;
      }

      const durationMs = Date.now() - startedAt;
      const message = isAbortError(error)
        ? `HTTP 요청이 ${timeoutMs}ms 안에 완료되지 않았습니다.`
        : error instanceof Error
          ? error.message
          : "HTTP 요청 중 알 수 없는 오류가 발생했습니다.";

      if (attempt >= totalAttempts) {
        throw new RetryableRequestError({
          attempts: attempt,
          durationMs,
          message,
        });
      }

      lastError = new RetryableRequestError({
        attempts: attempt,
        durationMs,
        message,
      });
    } finally {
      clearTimeout(timeout);
    }

    await sleep(retryDelayMs * attempt);
  }

  throw new RetryableRequestError({
    attempts: totalAttempts,
    durationMs: Date.now() - startedAt,
    message: lastError instanceof Error ? lastError.message : "HTTP 요청 재시도에 실패했습니다.",
  });
}
