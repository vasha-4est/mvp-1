export type BatchListFilters = {
  prefix?: string;
  fromDate?: string;
  toDate?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateBatchFilters(filters: BatchListFilters): string | null {
  const fromDate = filters.fromDate?.trim();
  const toDate = filters.toDate?.trim();

  if (fromDate && !isValidDate(fromDate)) {
    return "Invalid date_from value. Expected YYYY-MM-DD";
  }

  if (toDate && !isValidDate(toDate)) {
    return "Invalid date_to value. Expected YYYY-MM-DD";
  }

  if (fromDate && toDate && fromDate > toDate) {
    return "Invalid date range: date_from must be <= date_to";
  }

  return null;
}

export function serializeBatchFilters(filters: BatchListFilters): string {
  const params = new URLSearchParams();

  const prefix = filters.prefix?.trim();
  if (prefix) {
    params.set("prefix", prefix);
  }

  const fromDate = filters.fromDate?.trim();
  if (fromDate) {
    params.set("fromDate", fromDate);
  }

  const toDate = filters.toDate?.trim();
  if (toDate) {
    params.set("toDate", toDate);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}
