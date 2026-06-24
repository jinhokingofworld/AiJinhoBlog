const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type HeaderReader = {
  get(name: string): string | null;
};

type SameOriginRequest = {
  headers: HeaderReader;
  method: string;
  url: string;
};

function readOrigin(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function readRequestOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function verifySameOriginRequest(request: SameOriginRequest) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return {
      ok: true,
      reason: null,
    } as const;
  }

  const requestOrigin = readRequestOrigin(request.url);

  if (!requestOrigin) {
    return {
      ok: false,
      reason: "invalid-request-url",
    } as const;
  }

  const origin = readOrigin(request.headers.get("origin"));

  if (origin) {
    return origin === requestOrigin
      ? ({ ok: true, reason: null } as const)
      : ({ ok: false, reason: "cross-origin" } as const);
  }

  const referer = readOrigin(request.headers.get("referer"));

  if (referer) {
    return referer === requestOrigin
      ? ({ ok: true, reason: null } as const)
      : ({ ok: false, reason: "cross-origin" } as const);
  }

  return {
    ok: false,
    reason: "missing-origin",
  } as const;
}
