import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireOwner } from "@/lib/server/guards";
import { importShipmentPlan, type ShipmentPlanImportPayload } from "@/lib/shipmentPlan/service";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parsePayload(body: unknown):
  | { ok: true; payload: ShipmentPlanImportPayload }
  | { ok: false; fields: Array<{ field: string; message: string }> } {
  if (!isRecord(body)) {
    return { ok: false, fields: [{ field: "body", message: "Body must be a JSON object" }] };
  }

  const fields: Array<{ field: string; message: string }> = [];
  const payload: ShipmentPlanImportPayload = {};

  if (body.tz !== undefined) {
    const tz = asString(body.tz);
    if (!tz || !isIanaTimezone(tz)) {
      fields.push({ field: "tz", message: "Field 'tz' must be a valid IANA timezone" });
    } else {
      payload.tz = tz;
    }
  }

  if (body.plan_date !== undefined) {
    const planDate = parseDate(body.plan_date);
    if (!planDate) {
      fields.push({ field: "plan_date", message: "Field 'plan_date' must be YYYY-MM-DD" });
    } else {
      payload.plan_date = planDate;
    }
  }

  if (body.shipment_id !== undefined) {
    const shipmentId = asString(body.shipment_id);
    if (!shipmentId) {
      fields.push({ field: "shipment_id", message: "Field 'shipment_id' must be a non-empty string" });
    } else {
      payload.shipment_id = shipmentId;
    }
  }

  const modeRaw = body.mode;
  if (modeRaw !== undefined) {
    if (modeRaw !== "commit" && modeRaw !== "dry_run") {
      fields.push({ field: "mode", message: "Field 'mode' must be 'commit' or 'dry_run'" });
    } else {
      payload.mode = modeRaw;
    }
  }

  if (body.rows !== undefined) {
    if (!Array.isArray(body.rows)) {
      fields.push({ field: "rows", message: "Field 'rows' must be an array" });
    } else {
      payload.rows = [];

      body.rows.forEach((item, index) => {
        if (!isRecord(item)) {
          fields.push({ field: `rows[${index}]`, message: "Each row must be an object" });
          return;
        }

        const shipmentId = asString(item.shipment_id);
        const shipDate = parseDate(item.ship_date);
        const destination = asString(item.destination);
        const skuId = asString(item.sku_id);

        const qtyValue = item.qty;
        const qty =
          typeof qtyValue === "number"
            ? qtyValue
            : typeof qtyValue === "string" && /^\d+$/.test(qtyValue.trim())
              ? Number(qtyValue.trim())
              : NaN;

        if (!shipmentId) fields.push({ field: `rows[${index}].shipment_id`, message: "shipment_id is required" });
        if (!shipDate) fields.push({ field: `rows[${index}].ship_date`, message: "ship_date must be YYYY-MM-DD" });
        if (!destination) fields.push({ field: `rows[${index}].destination`, message: "destination is required" });
        if (!skuId) fields.push({ field: `rows[${index}].sku_id`, message: "sku_id is required" });
        if (!Number.isInteger(qty) || qty <= 0) {
          fields.push({ field: `rows[${index}].qty`, message: "qty must be integer > 0" });
        }

        payload.rows?.push({
          shipment_id: shipmentId || "",
          ship_date: shipDate || "",
          destination: destination || "",
          sku_id: skuId || "",
          qty: Number.isInteger(qty) ? qty : 0,
          ...(typeof item.comment === "string" ? { comment: item.comment } : {}),
        });
      });
    }
  }

  if (fields.length > 0) {
    return { ok: false, fields };
  }

  return { ok: true, payload };
}

function statusForCode(code: string): number {
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR") return 400;
  if (code === "FORBIDDEN") return 403;
  return 502;
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
    return json(auth.requestId, 400, {
      ok: false,
      code: "BAD_REQUEST",
      error: "Invalid JSON body",
      details: { fields: [{ field: "body", message: "Invalid JSON body" }] },
      request_id: auth.requestId,
    });
  }

  const parsed = parsePayload(body);
  if (parsed.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "BAD_REQUEST",
      error: "Validation failed",
      details: { fields: parsed.fields },
      request_id: auth.requestId,
    });
  }

  const result = await importShipmentPlan(auth.requestId, parsed.payload);
  if (result.ok === false) {
    return json(auth.requestId, statusForCode(result.code), {
      ok: false,
      code: result.code === "FORBIDDEN" ? "FORBIDDEN" : result.code === "BAD_REQUEST" ? "BAD_REQUEST" : "BAD_GATEWAY",
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
      request_id: auth.requestId,
    });
  }

  const replayed = result.data.replayed === true;
  const status = replayed ? 200 : result.data.dry_run ? 200 : 201;

  return json(auth.requestId, status, {
    ok: true,
    replayed,
    ...(result.data.import_id ? { import_id: result.data.import_id } : {}),
    ...(result.data.dry_run ? { dry_run: true, normalized_preview: result.data.normalized_preview ?? [] } : {}),
    stats: result.data.stats,
    generated_at: result.data.generated_at,
    tz: result.data.tz,
    request_id: auth.requestId,
  });
}
