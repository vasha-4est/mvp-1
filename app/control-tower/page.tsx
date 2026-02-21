import { requirePageRole } from "@/lib/server/guards";

import { ControlTowerView } from "@/components/control-tower/ControlTowerView";

export default function ControlTowerPage() {
  requirePageRole("/control-tower", ["OWNER", "COO"]);

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <h1>Control Tower</h1>
      <ControlTowerView />
    </main>
  );
}
