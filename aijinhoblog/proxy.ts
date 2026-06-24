import { NextRequest, NextResponse } from "next/server";

import { verifySameOriginRequest } from "@/backend/security/csrf";

export function proxy(request: NextRequest) {
  const result = verifySameOriginRequest(request);

  if (!result.ok) {
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
