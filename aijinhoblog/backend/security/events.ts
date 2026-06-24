type SecurityEventSeverity = "info" | "warning" | "error";

export type SecurityEventType =
  | "auth.login_failed"
  | "auth.rate_limited"
  | "auth.signup_failed"
  | "csrf.blocked"
  | "ssrf.blocked";

export type SecurityEventMetadata = Record<string, unknown>;

type SecurityEventInput = {
  metadata?: SecurityEventMetadata;
  request?: Request;
  severity?: SecurityEventSeverity;
  type: SecurityEventType;
};

export type SecurityEventEntry = {
  at: string;
  category: "security";
  metadata: SecurityEventMetadata;
  request?: {
    method: string;
    path: string;
    userAgent: string | null;
  };
  severity: SecurityEventSeverity;
  type: SecurityEventType;
};

type SecurityEventWriter = (entry: SecurityEventEntry) => void;

const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|email|identifier|ip|password|secret|token)/i;
let securityEventWriter: SecurityEventWriter = (entry) => {
  console.warn(JSON.stringify(entry));
};

function shouldRedactKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key) && !key.toLowerCase().endsWith("hash");
}

function sanitizeMetadataValue(key: string, value: unknown): unknown {
  if (shouldRedactKey(key)) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(key, item));
  }

  if (value && typeof value === "object") {
    return sanitizeSecurityMetadata(value as SecurityEventMetadata);
  }

  return value;
}

export function sanitizeSecurityMetadata(metadata: SecurityEventMetadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, sanitizeMetadataValue(key, value)]),
  );
}

function summarizeRequest(request: Request) {
  const url = new URL(request.url);

  return {
    method: request.method,
    path: url.pathname,
    userAgent: request.headers.get("user-agent"),
  };
}

export function createSecurityEventEntry(
  { metadata = {}, request, severity = "warning", type }: SecurityEventInput,
  now = new Date(),
): SecurityEventEntry {
  return {
    at: now.toISOString(),
    category: "security",
    metadata: sanitizeSecurityMetadata(metadata),
    request: request ? summarizeRequest(request) : undefined,
    severity,
    type,
  };
}

export function logSecurityEvent(event: SecurityEventInput) {
  const entry = createSecurityEventEntry(event);

  securityEventWriter(entry);

  return entry;
}

export function setSecurityEventWriterForTest(writer: SecurityEventWriter) {
  const previous = securityEventWriter;

  securityEventWriter = writer;

  return () => {
    securityEventWriter = previous;
  };
}
