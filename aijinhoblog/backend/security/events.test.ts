import { describe, expect, it } from "vitest";

import {
  createSecurityEventEntry,
  logSecurityEvent,
  sanitizeSecurityMetadata,
  setSecurityEventWriterForTest,
} from "@/backend/security/events";

describe("security event logging", () => {
  it("redacts sensitive metadata but preserves hashed fields", () => {
    expect(
      sanitizeSecurityMetadata({
        clientIp: "203.0.113.10",
        clientIpHash: "ip-hash",
        email: "user@example.com",
        emailHash: "email-hash",
        nested: {
          accessToken: "secret-token",
          reason: "invalid_credentials",
        },
        password: "pw",
      }),
    ).toEqual({
      clientIp: "[redacted]",
      clientIpHash: "ip-hash",
      email: "[redacted]",
      emailHash: "email-hash",
      nested: {
        accessToken: "[redacted]",
        reason: "invalid_credentials",
      },
      password: "[redacted]",
    });
  });

  it("summarizes requests without logging query strings", () => {
    const entry = createSecurityEventEntry(
      {
        metadata: {
          reason: "missing-origin",
        },
        request: new Request("https://blog.example.com/api/auth/login?token=secret", {
          headers: {
            "user-agent": "vitest",
          },
          method: "POST",
        }),
        type: "csrf.blocked",
      },
      new Date("2026-06-25T00:00:00.000Z"),
    );

    expect(entry).toMatchObject({
      at: "2026-06-25T00:00:00.000Z",
      category: "security",
      metadata: {
        reason: "missing-origin",
      },
      request: {
        method: "POST",
        path: "/api/auth/login",
        userAgent: "vitest",
      },
      severity: "warning",
      type: "csrf.blocked",
    });
  });

  it("writes sanitized security events", () => {
    const entries: unknown[] = [];
    const restore = setSecurityEventWriterForTest((entry) => entries.push(entry));

    try {
      logSecurityEvent({
        metadata: {
          email: "user@example.com",
          emailHash: "hash",
        },
        type: "auth.login_failed",
      });
    } finally {
      restore();
    }

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      metadata: {
        email: "[redacted]",
        emailHash: "hash",
      },
      type: "auth.login_failed",
    });
  });
});
