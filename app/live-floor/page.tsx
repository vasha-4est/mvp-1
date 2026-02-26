import { LiveFloorView } from "@/components/live-floor/LiveFloorView";
import { requirePageRole } from "@/lib/server/guards";

export default function LiveFloorPage() {
  requirePageRole("/live-floor", ["OWNER", "COO"]);

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <h1>Live Floor</h1>
      <LiveFloorView />
    </main>
  );
}
