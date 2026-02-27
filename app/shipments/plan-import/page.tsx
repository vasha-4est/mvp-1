"use client";

import { useMemo, useState } from "react";

type ImportResponse = {
  ok?: boolean;
  dry_run?: boolean;
  replayed?: boolean;
  import_id?: string;
  stats?: { rows?: number; shipments?: number; lines?: number };
  error?: string;
  details?: { fields?: Array<{ field?: string; message?: string }> };
};

function parseRows(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)) {
      return (parsed as { rows: unknown[] }).rows;
    }
  } catch {
    // fallback to CSV/TSV
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(delimiter);
    const row: Record<string, unknown> = {};
    headers.forEach((key, index) => {
      row[key] = (parts[index] ?? "").trim();
    });
    return row;
  });
}

export default function ShipmentPlanImportPage() {
  const [tz, setTz] = useState("Europe/Moscow");
  const [planDate, setPlanDate] = useState("");
  const [defaultDestination, setDefaultDestination] = useState("OZON_FBO_SPB");
  const [defaultShipDate, setDefaultShipDate] = useState("");
  const [rawRows, setRawRows] = useState("[]");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const rowsPreview = useMemo(() => {
    try {
      return parseRows(rawRows);
    } catch {
      return [];
    }
  }, [rawRows]);

  async function submit(mode: "dry_run" | "commit") {
    setIsLoading(true);
    setResult(null);

    const rows = parseRows(rawRows).map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return row;
      }
      const typed = row as Record<string, unknown>;
      return {
        ...typed,
        ship_date: typed.ship_date || defaultShipDate || undefined,
        destination: typed.destination || defaultDestination || undefined,
      };
    });

    try {
      const response = await fetch("/api/shipment-plan/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify({
          tz,
          ...(planDate ? { plan_date: planDate } : {}),
          mode,
          rows,
        }),
      });

      const payload = (await response.json()) as ImportResponse;
      setResult(payload);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Request failed" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <h1>Shipment Plan Import</h1>
      <p>OWNER tool for dry-run / commit shipment plan rows.</p>

      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <label>
          TZ
          <input value={tz} onChange={(event) => setTz(event.target.value)} style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Plan date (optional)
          <input value={planDate} onChange={(event) => setPlanDate(event.target.value)} placeholder="YYYY-MM-DD" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Default ship_date
          <input value={defaultShipDate} onChange={(event) => setDefaultShipDate(event.target.value)} placeholder="YYYY-MM-DD" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Default destination
          <input value={defaultDestination} onChange={(event) => setDefaultDestination(event.target.value)} style={{ display: "block", width: "100%" }} />
        </label>
      </div>

      <label>
        JSON rows or TSV/CSV
        <textarea
          value={rawRows}
          onChange={(event) => setRawRows(event.target.value)}
          rows={14}
          style={{ display: "block", width: "100%", fontFamily: "monospace" }}
        />
      </label>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button type="button" disabled={isLoading} onClick={() => submit("dry_run")}>
          Import (dry-run)
        </button>
        <button type="button" disabled={isLoading} onClick={() => submit("commit")}>
          Import (commit)
        </button>
      </div>

      <p style={{ marginTop: 12 }}>Parsed rows: {rowsPreview.length}</p>

      {result ? (
        <pre style={{ marginTop: 16, background: "#f6f6f6", padding: 12, overflowX: "auto" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </main>
  );
}
