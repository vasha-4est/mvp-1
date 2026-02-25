import { requirePageRole } from "@/lib/server/guards";

import DeficitKpiView from "@/components/kpi/DeficitKpiView";

export default function DeficitKpiPage() {
  requirePageRole("/kpi/deficit", ["OWNER", "COO"]);

  return (
    <main>
      <DeficitKpiView />
    </main>
  );
}
