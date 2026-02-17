import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/server/guards";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";

export async function GET(request: Request) {
  const auth = requireAuth(request);

  if (auth.ok === false) {
    return auth.response;
  }

  return NextResponse.json(
    {
      ok: true,
      role: auth.role.toUpperCase(),
    },
    {
      status: 200,
      headers: {
        [REQUEST_ID_HEADER]: auth.requestId,
      },
    }
  );
}
