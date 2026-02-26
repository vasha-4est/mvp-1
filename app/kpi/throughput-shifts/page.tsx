import ThroughputShiftsKpiView from "@/components/kpi/ThroughputShiftsKpiView";
import { requirePageRole } from "@/lib/server/guards";

export default function ThroughputShiftsKpiPage() {
  requirePageRole("/kpi/throughput-shifts", ["OWNER", "COO"]);

  return (
    <main>
      <ThroughputShiftsKpiView />
    </main>
  );
}
