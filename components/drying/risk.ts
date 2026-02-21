import type { CSSProperties } from "react";

export type RiskLabel = "OVERDUE" | "<=4h" | ">4h" | "NO_DATE";

export type NormalizedDryingItem = {
  code: string;
  dryEndAt: Date | null;
  risk: RiskLabel;
};

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  return [];
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function getRiskLabel(dryEndAt: Date | null, now: Date): RiskLabel {
  if (!dryEndAt) {
    return "NO_DATE";
  }

  if (now.getTime() > dryEndAt.getTime()) {
    return "OVERDUE";
  }

  if (dryEndAt.getTime() - now.getTime() <= FOUR_HOURS_MS) {
    return "<=4h";
  }

  return ">4h";
}

export function normalizeDryingPayload(payload: unknown, now = new Date()): NormalizedDryingItem[] {
  const rows = readItems(payload);

  return rows.map((item) => {
    const record = isRecord(item) ? item : {};

    const codeRaw = record.code ?? record.batch_code ?? record.batchCode ?? record.id ?? "—";

    const dryEndRaw = record.dry_end_at ?? record.dryEndAt ?? record.dry_end ?? record.dry_end_time ?? null;

    const code = typeof codeRaw === "string" || typeof codeRaw === "number" ? String(codeRaw) : "—";
    const dryEndAt = toDate(dryEndRaw);

    return {
      code,
      dryEndAt,
      risk: getRiskLabel(dryEndAt, now),
    };
  });
}

function rankRisk(risk: RiskLabel): number {
  switch (risk) {
    case "OVERDUE":
      return 0;
    case "<=4h":
      return 1;
    case ">4h":
      return 2;
    case "NO_DATE":
      return 3;
  }
}

export function sortDryingItems(items: NormalizedDryingItem[]): NormalizedDryingItem[] {
  return [...items].sort((a, b) => {
    const byRisk = rankRisk(a.risk) - rankRisk(b.risk);
    if (byRisk !== 0) {
      return byRisk;
    }

    if (a.dryEndAt && b.dryEndAt) {
      return a.dryEndAt.getTime() - b.dryEndAt.getTime();
    }

    if (a.dryEndAt && !b.dryEndAt) {
      return -1;
    }

    if (!a.dryEndAt && b.dryEndAt) {
      return 1;
    }

    return a.code.localeCompare(b.code);
  });
}

export function getRiskBadgeStyle(risk: RiskLabel): CSSProperties {
  const baseStyle: CSSProperties = {
    display: "inline-block",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 600,
  };

  switch (risk) {
    case "OVERDUE":
      return { ...baseStyle, backgroundColor: "#fee2e2", color: "#991b1b" };
    case "<=4h":
      return { ...baseStyle, backgroundColor: "#ffedd5", color: "#9a3412" };
    case ">4h":
      return { ...baseStyle, backgroundColor: "#dcfce7", color: "#166534" };
    case "NO_DATE":
      return { ...baseStyle, backgroundColor: "#e5e7eb", color: "#374151" };
  }
}

export function formatTimeLeft(dryEndAt: Date | null, now: Date): string {
  if (!dryEndAt) {
    return "—";
  }

  const diffMs = dryEndAt.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  const totalMinutes = Math.floor(absMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const readable = `${hours}h ${minutes}m`;

  if (diffMs < 0) {
    return `overdue by ${readable}`;
  }

  return readable;
}
