import { BatchListItem } from "../../lib/api/batch";

type BatchListProps = {
  items: BatchListItem[];
  error?: string | null;
  validationError?: string | null;
  filters: {
    prefix: string;
    fromDate: string;
    toDate: string;
  };
};

export function BatchList({ items, error, validationError, filters }: BatchListProps) {
  return (
    <section>
      <h1>Batches</h1>

      <form method="GET" style={{ display: "grid", gap: 8, maxWidth: 420, marginBottom: 16 }}>
        <label>
          Prefix
          <input name="prefix" defaultValue={filters.prefix} placeholder="B-250215" />
        </label>

        <label>
          date_from (YYYY-MM-DD)
          <input name="fromDate" defaultValue={filters.fromDate} placeholder="YYYY-MM-DD" />
        </label>

        <label>
          date_to (YYYY-MM-DD)
          <input name="toDate" defaultValue={filters.toDate} placeholder="YYYY-MM-DD" />
        </label>

        <button type="submit">Apply filters</button>
      </form>

      {validationError ? <p role="alert">{validationError}</p> : null}
      {error ? <p role="alert">{error}</p> : null}

      {!validationError && !error && items.length === 0 ? <p>No batches</p> : null}

      {!validationError && !error && items.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Status</th>
              <th>Created at</th>
              <th>Dry end at</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.code ?? "batch"}-${index}`}>
                <td>{item.code ?? "—"}</td>
                <td>{item.status ?? "—"}</td>
                <td>{item.created_at ?? "—"}</td>
                <td>{item.dry_end_at ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
