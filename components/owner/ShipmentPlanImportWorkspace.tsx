"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  parseShipmentPlanPastedRows,
  shipmentPlanImportTemplateHeaders,
} from "@/lib/shipmentPlan/parsePastedRows";
import { formatDateTime as formatDateTimeCommon } from "@/lib/ui/formatDateTime";

const REQUEST_ID_HEADER = "x-request-id";

type ValidationError = {
  row_index: number;
  field: string;
  code: string;
  message: string;
};

type NormalizedRow = {
  import_batch_id?: string;
  shipment_id?: string;
  planned_date?: string;
  deadline_at?: string;
  destination?: string;
  products_sku?: string;
  planned_qty?: number;
};

type ValidationState = {
  import_batch_id: string;
  valid: boolean;
  stats: {
    rows_count: number;
    shipments_count: number;
    source_table_values: string[];
  };
  normalized_rows: NormalizedRow[];
  errors: ValidationError[];
};

type LatestBatchRow = {
  import_batch_id: string;
  shipment_id: string;
  planned_date: string | null;
  deadline_at: string | null;
  destination: string | null;
  products_sku: string;
  planned_qty: number;
  pasted_at: string | null;
  status: string;
};

type LatestBatchState = {
  import_batch_id: string | null;
  stats: {
    rows_count: number;
    shipments_count: number;
    latest_pasted_at: string | null;
  };
  rows: LatestBatchRow[];
};

function createRequestId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `req-${Date.now()}`;
}

function formatDateTime(value: string | null | undefined): string {
  return formatDateTimeCommon(value, { empty: "n/a" });
}

function summarizeError(error: ValidationError): string {
  const rowLabel = error.row_index > 0 ? `Row ${error.row_index}` : "Batch";
  return `${rowLabel}: ${error.field} (${error.code}) - ${error.message}`;
}

export default function ShipmentPlanImportWorkspace() {
  const [input, setInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [inputFormat, setInputFormat] = useState<"json" | "delimited" | null>(null);
  const [validationState, setValidationState] = useState<ValidationState | null>(null);
  const [latestBatch, setLatestBatch] = useState<LatestBatchState | null>(null);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRefreshingLatest, setIsRefreshingLatest] = useState(false);
  const [acknowledgeSupersede, setAcknowledgeSupersede] = useState(false);
  const [commitRequestId, setCommitRequestId] = useState<string | null>(null);

  const loadLatestBatch = useCallback(async () => {
    setIsRefreshingLatest(true);
    setLatestError(null);

    try {
      const response = await fetch("/api/shipment-plan/import/latest", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            import_batch_id?: string | null;
            stats?: LatestBatchState["stats"];
            rows?: LatestBatchRow[];
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setLatestBatch(null);
        setLatestError(payload?.error || "Could not load the latest staged shipment plan batch.");
        return;
      }

      setLatestBatch({
        import_batch_id: payload.import_batch_id ?? null,
        stats: payload.stats ?? {
          rows_count: 0,
          shipments_count: 0,
          latest_pasted_at: null,
        },
        rows: Array.isArray(payload.rows) ? payload.rows : [],
      });
    } catch {
      setLatestBatch(null);
      setLatestError("Could not load the latest staged shipment plan batch.");
    } finally {
      setIsRefreshingLatest(false);
    }
  }, []);

  useEffect(() => {
    void loadLatestBatch();
  }, [loadLatestBatch]);

  const requiresSupersedeAcknowledgement = Boolean(
    latestBatch?.import_batch_id && validationState?.valid
  );

  const supersedeLabel = useMemo(() => {
    if (!latestBatch?.import_batch_id || !validationState?.import_batch_id) {
      return "I understand this import will become the active staged shipment plan.";
    }

    if (latestBatch.import_batch_id === validationState.import_batch_id) {
      return `I understand this will restage batch ${validationState.import_batch_id}; only the newest staged rows remain active.`;
    }

    return `I understand this import will supersede active staged batch ${latestBatch.import_batch_id} with ${validationState.import_batch_id}.`;
  }, [latestBatch?.import_batch_id, validationState?.import_batch_id]);

  const canCommit =
    validationState?.valid === true &&
    !isCommitting &&
    (!requiresSupersedeAcknowledgement || acknowledgeSupersede);

  async function handleValidate() {
    setStatusMessage(null);
    setValidationError(null);
    setValidationState(null);
    setAcknowledgeSupersede(false);
    setCommitRequestId(null);

    const parsed = parseShipmentPlanPastedRows(input);
    if ("error" in parsed) {
      setInputFormat(null);
      setParseError(parsed.error);
      return;
    }

    setParseError(null);
    setInputFormat(parsed.format);
    setIsValidating(true);

    try {
      const response = await fetch("/api/shipment-plan/import/validate", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          [REQUEST_ID_HEADER]: createRequestId(),
        },
        body: JSON.stringify({ rows: parsed.rows }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ({
            ok?: boolean;
            error?: string;
          } & Partial<ValidationState>)
        | null;

      if (!response.ok || !payload?.ok) {
        setValidationError(payload?.error || "Validation failed.");
        return;
      }

      setValidationState({
        import_batch_id: payload.import_batch_id ?? "",
        valid: payload.valid === true,
        stats: payload.stats ?? {
          rows_count: 0,
          shipments_count: 0,
          source_table_values: [],
        },
        normalized_rows: Array.isArray(payload.normalized_rows) ? payload.normalized_rows : [],
        errors: Array.isArray(payload.errors) ? payload.errors : [],
      });
      setCommitRequestId(createRequestId());
    } catch {
      setValidationError("Validation failed.");
    } finally {
      setIsValidating(false);
    }
  }

  async function handleCommit() {
    if (!validationState?.valid) {
      return;
    }

    const parsed = parseShipmentPlanPastedRows(input);
    if ("error" in parsed) {
      setParseError(parsed.error);
      return;
    }

    setIsCommitting(true);
    setStatusMessage(null);
    setValidationError(null);

    try {
      const activeCommitRequestId = commitRequestId ?? createRequestId();
      if (!commitRequestId) {
        setCommitRequestId(activeCommitRequestId);
      }

      const response = await fetch("/api/shipment-plan/import", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          [REQUEST_ID_HEADER]: activeCommitRequestId,
        },
        body: JSON.stringify({ rows: parsed.rows }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            import_batch_id?: string;
            stats?: { rows_count?: number; shipments_count?: number };
            replayed?: boolean;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setValidationError(payload?.error || "Import failed.");
        return;
      }

      setStatusMessage(
        payload.replayed
          ? `Import request replayed for ${payload.import_batch_id ?? validationState.import_batch_id}.`
          : `Shipment plan import committed for ${payload.import_batch_id ?? validationState.import_batch_id}.`
      );
      await loadLatestBatch();
    } catch {
      setValidationError("Import failed.");
    } finally {
      setIsCommitting(false);
    }
  }

  function handleReset() {
    setInput("");
    setInputFormat(null);
    setParseError(null);
    setValidationError(null);
    setValidationState(null);
    setStatusMessage(null);
    setAcknowledgeSupersede(false);
    setCommitRequestId(null);
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h2 style={{ margin: 0 }}>Shipment Plan Import</h2>
          <p style={{ margin: 0, color: "#4b5563", maxWidth: 760 }}>
            Paste a shipment-plan export from logistics, validate it before staging, then commit it as the active
            import used by shipment readiness and the next production-planning layer.
          </p>
        </div>
        <button type="button" onClick={loadLatestBatch} disabled={isRefreshingLatest}>
          {isRefreshingLatest ? "Refreshing..." : "Refresh latest batch"}
        </button>
      </div>

      <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, background: "#fff", display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="shipment-plan-input" style={{ fontWeight: 600 }}>
            Pasted shipment plan rows
          </label>
          <textarea
            id="shipment-plan-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={`Paste JSON rows or spreadsheet rows with headers.\n\n${shipmentPlanImportTemplateHeaders()}`}
            rows={12}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 13,
            }}
          />
          <p style={{ margin: 0, color: "#6b7280" }}>
            Accepted formats: JSON array/object with <code>rows</code>, spreadsheet copy-paste with canonical headers,
            or raw rows without headers in canonical column order.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={handleValidate} disabled={isValidating || isCommitting}>
            {isValidating ? "Validating..." : "Validate import"}
          </button>
          <button type="button" onClick={handleCommit} disabled={!canCommit}>
            {isCommitting ? "Committing..." : "Commit import"}
          </button>
          <button type="button" onClick={handleReset} disabled={isValidating || isCommitting}>
            Reset
          </button>
        </div>

        {inputFormat ? (
          <p style={{ margin: 0, color: "#6b7280" }}>
            Parsed format: <strong>{inputFormat === "json" ? "JSON" : "Spreadsheet rows"}</strong>
          </p>
        ) : null}

        {parseError ? (
          <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 6, background: "#fef2f2", color: "#991b1b" }}>
            {parseError}
          </p>
        ) : null}

        {validationError ? (
          <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 6, background: "#fef2f2", color: "#991b1b" }}>
            {validationError}
          </p>
        ) : null}

        {statusMessage ? (
          <p style={{ margin: 0, padding: "10px 12px", borderRadius: 6, background: "#ecfdf5", color: "#166534" }}>
            {statusMessage}
          </p>
        ) : null}

        {validationState ? (
          <div style={{ display: "grid", gap: 14, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ margin: 0 }}>
                Validation batch: <strong>{validationState.import_batch_id || "n/a"}</strong>
              </p>
              <p style={{ margin: 0, color: "#374151" }}>
                Rows: <strong>{validationState.stats.rows_count}</strong> | Shipments:{" "}
                <strong>{validationState.stats.shipments_count}</strong>
              </p>
              {validationState.stats.source_table_values.length > 0 ? (
                <p style={{ margin: 0, color: "#374151" }}>
                  Source tables: {validationState.stats.source_table_values.join(", ")}
                </p>
              ) : null}
            </div>

            {validationState.errors.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Validation errors</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {validationState.errors.map((error, index) => (
                    <li key={`${error.row_index}-${error.field}-${index}`}>{summarizeError(error)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ margin: 0, color: "#166534" }}>Validation passed. Review the preview and commit when ready.</p>
            )}

            {requiresSupersedeAcknowledgement ? (
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={acknowledgeSupersede}
                  onChange={(event) => setAcknowledgeSupersede(event.target.checked)}
                />
                <span>{supersedeLabel}</span>
              </label>
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>shipment_id</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>planned_date</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>deadline_at</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>destination</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>products_sku</th>
                    <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>planned_qty</th>
                  </tr>
                </thead>
                <tbody>
                  {validationState.normalized_rows.slice(0, 10).map((row, index) => (
                    <tr key={`${row.shipment_id ?? "shipment"}-${row.products_sku ?? "sku"}-${index}`}>
                      <td style={{ padding: "8px 0" }}>{row.shipment_id || "n/a"}</td>
                      <td style={{ padding: "8px 0" }}>{row.planned_date || "n/a"}</td>
                      <td style={{ padding: "8px 0" }}>{formatDateTime(row.deadline_at)}</td>
                      <td style={{ padding: "8px 0" }}>{row.destination || "n/a"}</td>
                      <td style={{ padding: "8px 0" }}>{row.products_sku || "n/a"}</td>
                      <td align="right" style={{ padding: "8px 0" }}>{row.planned_qty ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </article>

      <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, background: "#fff", display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Latest staged batch</h3>
          <p style={{ margin: 0, color: "#4b5563" }}>
            This is the active staged shipment plan currently consumed by shipment-readiness reads.
          </p>
        </div>

        {latestError ? (
          <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 6, background: "#fef2f2", color: "#991b1b" }}>
            {latestError}
          </p>
        ) : null}

        {!latestError && latestBatch?.import_batch_id ? (
          <>
            <p style={{ margin: 0 }}>
              Active batch: <strong>{latestBatch.import_batch_id}</strong>
            </p>
            <p style={{ margin: 0, color: "#374151" }}>
              Rows: <strong>{latestBatch.stats.rows_count}</strong> | Shipments:{" "}
              <strong>{latestBatch.stats.shipments_count}</strong> | Last pasted:{" "}
              <strong>{formatDateTime(latestBatch.stats.latest_pasted_at)}</strong>
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>shipment_id</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>planned_date</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>destination</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>products_sku</th>
                    <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>planned_qty</th>
                  </tr>
                </thead>
                <tbody>
                  {latestBatch.rows.slice(0, 10).map((row, index) => (
                    <tr key={`${row.shipment_id}-${row.products_sku}-${index}`}>
                      <td style={{ padding: "8px 0" }}>{row.shipment_id}</td>
                      <td style={{ padding: "8px 0" }}>{row.planned_date || "n/a"}</td>
                      <td style={{ padding: "8px 0" }}>{row.destination || "n/a"}</td>
                      <td style={{ padding: "8px 0" }}>{row.products_sku}</td>
                      <td align="right" style={{ padding: "8px 0" }}>{row.planned_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : !latestError ? (
          <p style={{ margin: 0, color: "#6b7280" }}>No staged shipment plan batch yet.</p>
        ) : null}
      </article>
    </section>
  );
}
