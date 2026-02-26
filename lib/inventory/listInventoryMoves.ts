import { callGasRead } from "@/lib/integrations/gasRead";

type MoveItem = {
  move_id: string;
  sku_id: string;
  from_location_id: string;
  to_location_id: string;
  qty: number;
  reason: string;
  actor_user_id: string;
  actor_role_id: string;
  proof_ref: string;
  created_at: string;
};

type MoveRow = Partial<Record<keyof MoveItem, unknown>>;

type MovesResponse = {
  items?: unknown;
};

export type InventoryMovesResult =
  | { ok: true; items: MoveItem[] }
  | { ok: false; error: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listInventoryMoves(
  requestId: string,
  options?: { limit?: number; sku_id?: string }
): Promise<InventoryMovesResult> {
  const rawLimit = options?.limit;
  const limit = typeof rawLimit === "number" && Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 50;

  const response = await callGasRead<MovesResponse>(
    "inventory.moves.list",
    { limit, sku_id: options?.sku_id ?? "" },
    requestId,
    { timeoutMs: 25_000, retries: 2, retryBackoffMs: 500 }
  );

  if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
    return { ok: false, error: typeof response.error === "string" ? response.error : "Bad gateway" };
  }

  const items = (response.data.items as MoveRow[]).map((row) => ({
    move_id: asString(row.move_id).trim(),
    sku_id: asString(row.sku_id).trim(),
    from_location_id: asString(row.from_location_id).trim(),
    to_location_id: asString(row.to_location_id).trim(),
    qty: asNumber(row.qty),
    reason: asString(row.reason),
    actor_user_id: asString(row.actor_user_id),
    actor_role_id: asString(row.actor_role_id),
    proof_ref: asString(row.proof_ref),
    created_at: asString(row.created_at),
  }));

  return { ok: true, items };
}
