import type { AssemblyBatch } from "@/lib/stations/assembly/normalize";

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function AssemblyTable({ rows }: { rows: AssemblyBatch[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Batch code</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Product</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Quantity</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>QC completed at</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px", color: "#666" }} colSpan={4}>
                No batches found.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.code}>
                <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>{row.code}</td>
                <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>{row.product}</td>
                <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>{row.quantity.toLocaleString()}</td>
                <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>{formatDate(row.qc_completed_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
