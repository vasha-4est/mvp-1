import EodSnapshotView from "@/components/eod/EodSnapshotView";
import { requirePageRole } from "@/lib/server/guards";

export default function EodPage() {
  requirePageRole("/eod", ["OWNER", "COO"]);

  return (
    <main>
      <EodSnapshotView />
    </main>
  );
}
