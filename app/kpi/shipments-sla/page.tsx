import ShipmentsSlaKpiView from "@/components/kpi/ShipmentsSlaKpiView";
import { requirePageRole } from "@/lib/server/guards";

export default function ShipmentsSlaKpiPage() {
  requirePageRole("/kpi/shipments-sla", ["OWNER", "COO"]);

  return (
    <main>
      <ShipmentsSlaKpiView />
    </main>
  );
}
