import { NextResponse } from "next/server";

import { requireOwner } from "@/lib/server/guards";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { createUser, findUserByUsername, listUsers, normalizeRoleList } from "@/lib/server/controlModel";
import { hashPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function POST(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const username = typeof (body as { username?: unknown })?.username === "string" ? (body as { username: string }).username.trim() : "";
  const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";
  const roles = normalizeRoleList((body as { roles?: unknown })?.roles);

  if (!username || !password || !roles || roles.length === 0) {
    return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR" });
  }

  const existing = await findUserByUsername(username);
  if (existing) {
    return json(auth.requestId, 409, { ok: false, code: "USERNAME_EXISTS" });
  }

  const passwordHash = await hashPassword(password, 12);
  const created = await createUser({ username, passwordHash, roles });

  return json(auth.requestId, 201, { ok: true, user_id: created.user_id });
}

export async function GET(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  const username = url.searchParams.get("username") ?? undefined;

  const data = await listUsers({
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20,
    username,
  });

  return json(auth.requestId, 200, {
    ok: true,
    data,
  });
}
