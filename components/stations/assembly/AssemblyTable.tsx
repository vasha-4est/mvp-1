import type { AssemblyBomComponent, AssemblySetSku } from "@/lib/stations/assembly/normalize";

type BomStatus = "loading" | "ready" | "not_found" | "error";

export type AssemblyBomStateMap = Record<string, { status: BomStatus; components: AssemblyBomComponent[] }>;

function formatQty(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

export function AssemblyTable({ rows, bomBySku }: { rows: AssemblySetSku[]; bomBySku: AssemblyBomStateMap }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Set SKU</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>Set SKU name</th>
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
            rows.map((row) => {
              const bomState = bomBySku[row.sku] ?? { status: "loading" as const, components: [] };

              return (
                <tr key={row.sku}>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px", fontFamily: "monospace" }}>{row.sku}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>{row.sku_name}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px" }}>
                    {bomState.status === "loading" ? <span style={{ color: "#666" }}>Loading BOM…</span> : null}
                    {bomState.status === "not_found" ? <span style={{ color: "#666" }}>BOM not found</span> : null}
                    {bomState.status === "error" ? <span style={{ color: "#b42318" }}>Failed to load BOM</span> : null}
                    {bomState.status === "ready" && bomState.components.length === 0 ? (
                      <span style={{ color: "#666" }}>No BOM components</span>
                    ) : null}
                    {bomState.status === "ready" && bomState.components.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {bomState.components.map((component) => (
                          <li key={`${row.sku}:${component.sku}`}>
                            <span style={{ fontFamily: "monospace" }}>{component.sku}</span>
                            {" — Qty per set: "}
                            {formatQty(component.requiredQty)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
