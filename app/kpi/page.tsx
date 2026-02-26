import KpiDashboardView from "@/components/kpi/KpiDashboardView";
import { requirePageRole } from "@/lib/server/guards";

export default function KpiDashboardPage() {
  requirePageRole("/kpi", ["OWNER", "COO"]);

  return (
    <main>
      <KpiDashboardView />
    </main>
  );
}
