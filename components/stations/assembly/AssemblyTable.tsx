import type { AssemblySetSku } from "@/lib/stations/assembly/normalize";

function formatQty(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

export function AssemblyTable({ rows }: { rows: AssemblySetSku[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Set SKU</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Set name</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>BOM components</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px", color: "#666" }} colSpan={3}>
                No set SKUs found.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.sku}>
                <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px", fontFamily: "monospace" }}>{row.sku}</td>
                <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>{row.name}</td>
                <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>
                  {row.components.length === 0 ? (
                    <span style={{ color: "#666" }}>No BOM components</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {row.components.map((component) => (
                        <li key={`${row.sku}:${component.sku}`}>
                          <span style={{ fontFamily: "monospace" }}>{component.sku}</span>
                          {" — Qty per set: "}
                          {formatQty(component.requiredQty)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
