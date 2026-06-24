import { NextRequest, NextResponse } from "next/server";

import { verifySameOriginRequest } from "@/backend/security/csrf";
import { logSecurityEvent } from "@/backend/security/events";

export function proxy(request: NextRequest) {
  const result = verifySameOriginRequest(request);

  if (!result.ok) {
    logSecurityEvent({
      metadata: {
        reason: result.reason,
      },
      request,
      type: "csrf.blocked",
    });

    return NextResponse.json(
      {
        error: "잘못된 요청 출처입니다.",
      },
      {
        status: 403,
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
