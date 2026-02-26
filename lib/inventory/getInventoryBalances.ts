import { callGasRead } from "@/lib/integrations/gasRead";

type BalanceItem = {
  sku_id: string;
  location_id: string;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  version_id: string;
  updated_at: string;
};

type BalanceRow = Partial<Record<keyof BalanceItem, unknown>>;

type BalanceResponse = {
  balances?: unknown;
};

export type InventoryBalancesResult =
  | { ok: true; items: BalanceItem[] }
  | { ok: false; error: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getInventoryBalances(
  requestId: string,
  filters?: { sku_id?: string; location_id?: string }
): Promise<InventoryBalancesResult> {
  const response = await callGasRead<BalanceResponse>(
    "inventory.balance.get",
    {
      sku_id: filters?.sku_id ?? "",
      location_id: filters?.location_id ?? "",
    },
    requestId,
    { timeoutMs: 25_000, retries: 2, retryBackoffMs: 500 }
  );

  if (!response.ok || !response.data || !Array.isArray(response.data.balances)) {
    return { ok: false, error: typeof response.error === "string" ? response.error : "Bad gateway" };
  }

  const items = (response.data.balances as BalanceRow[]).map((row) => ({
    sku_id: asString(row.sku_id).trim(),
    location_id: asString(row.location_id).trim(),
    on_hand_qty: asNumber(row.on_hand_qty),
    reserved_qty: asNumber(row.reserved_qty),
    available_qty: asNumber(row.available_qty),
    version_id: asString(row.version_id).trim(),
    updated_at: asString(row.updated_at).trim(),
  }));

  return { ok: true, items };
}
