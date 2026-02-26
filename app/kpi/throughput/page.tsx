import ThroughputKpiView from "@/components/kpi/ThroughputKpiView";
import { requirePageRole } from "@/lib/server/guards";

export default function ThroughputKpiPage() {
  requirePageRole("/kpi/throughput", ["OWNER", "COO"]);

  return (
    <main>
      <ThroughputKpiView />
    </main>
  );
}
