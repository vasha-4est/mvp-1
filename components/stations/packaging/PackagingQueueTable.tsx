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

export default function PackagingQueueTable({ items }: { items: PackagingQueueItem[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Batch code</th>
            <th align="left">Product</th>
            <th align="right">Quantity</th>
            <th align="left">Created at</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.batch_code}>
              <td style={{ padding: "8px 0" }}>{item.batch_code}</td>
              <td>{item.product}</td>
              <td align="right">{item.quantity}</td>
              <td>{formatDate(item.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
