import DailySummaryView from "@/components/daily/DailySummaryView";
import { requirePageRole } from "@/lib/server/guards";

export default function DailySummaryPage() {
  requirePageRole("/daily/summary", ["OWNER", "COO"]);

  return (
    <main>
      <DailySummaryView />
    </main>
  );
}
