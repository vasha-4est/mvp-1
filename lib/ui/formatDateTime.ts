const DEFAULT_LOCALE = "ru-RU";
const DEFAULT_TIMEZONE = "Europe/Moscow";

type FormatMode = "date" | "datetime";

export function formatDateTime(
  value: unknown,
  options?: {
    mode?: FormatMode;
    empty?: string;
  }
): string {
  const empty = options?.empty ?? "—";
  const mode = options?.mode ?? "datetime";

  if (typeof value !== "string" || !value.trim()) {
    return empty;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(mode === "datetime"
      ? {
          hour: "2-digit",
          minute: "2-digit",
        }
      : {}),
  }).format(parsed);
}
