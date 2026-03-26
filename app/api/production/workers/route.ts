import { NextResponse } from "next/server";

import { getLocalWorkersFallback, shouldUseLocalProductionFallback } from "@/lib/dev/productionLaunchLocal";
import { withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import type { AllowedRole } from "@/lib/server/controlModel";
import { requireAnyRole } from "@/lib/server/guards";
import { listUsers } from "@/lib/server/controlModel";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const fallbackUsers = getLocalWorkersFallback();
    const result = await withDevFastTimeout(listUsers({ page: 1, pageSize: 100 }), {
      users: fallbackUsers.map((user) => ({
        ...user,
        roles: user.roles as AllowedRole[],
        is_active: true,
      })),
      total: fallbackUsers.length,
    });
    const users = result.users
      .filter((user) => user.is_active)
      .map((user) => ({
        id: user.id,
        username: user.username,
        roles: user.roles,
      }))
      .sort((left, right) => left.username.localeCompare(right.username));

    return json(auth.requestId, 200, {
      ok: true,
      items: users,
    });
  } catch {
    if (shouldUseLocalProductionFallback()) {
      return json(auth.requestId, 200, {
        ok: true,
        items: getLocalWorkersFallback(),
      });
    }

    return json(auth.requestId, 502, {
      ok: false,
      error: "Bad gateway",
      code: "BAD_GATEWAY",
    });
  }
}
