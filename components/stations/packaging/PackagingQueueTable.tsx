import type { PackagingQueueItem } from "@/lib/stations/packaging/getPackagingQueue";

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

type ActionName = "take" | "release" | "advance";

export default function PackagingQueueTable({
  items,
  currentUserId,
  busyByCode,
  onAction,
}: {
  items: PackagingQueueItem[];
  currentUserId: string | null;
  busyByCode: Record<string, boolean>;
  onAction: (batchCode: string, action: ActionName) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Batch code</th>
            <th align="left">Product</th>
            <th align="right">Quantity</th>
            <th align="left">Created at</th>
            <th align="left">Assigned to</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const assignedToCurrent = Boolean(currentUserId && item.assigned_to === currentUserId);
            const assignedToOther = Boolean(item.assigned_to && item.assigned_to !== currentUserId);
            const busy = busyByCode[item.batch_code] === true;

            return (
              <tr key={item.batch_code}>
                <td style={{ padding: "8px 0" }}>{item.batch_code}</td>
                <td>{item.product}</td>
                <td align="right">{item.quantity}</td>
                <td>{formatDate(item.created_at)}</td>
                <td>{item.assigned_to ?? "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" disabled={busy || assignedToOther} onClick={() => onAction(item.batch_code, "take")}>
                      Take
                    </button>
                    <button type="button" disabled={busy || !assignedToCurrent} onClick={() => onAction(item.batch_code, "release")}>
                      Release
                    </button>
                    <button type="button" disabled={busy || !assignedToCurrent} onClick={() => onAction(item.batch_code, "advance")}>
                      Advance
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
