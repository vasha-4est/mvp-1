import ShipmentSlaKpiView from "@/components/kpi/ShipmentSlaKpiView";
import { requirePageRole } from "@/lib/server/guards";

export default function ShipmentSlaKpiPage() {
  requirePageRole("/kpi/shipment-sla", ["OWNER", "COO"]);

  return (
    <main>
      <ShipmentSlaKpiView />
    </main>
  );
}
