import PackagingQueueClient from "@/components/stations/packaging/PackagingQueueClient";
import { requirePageRole } from "@/lib/server/guards";

export default function PackagingStationPage() {
  requirePageRole("/stations/packaging", ["OWNER", "COO"]);

  return (
    <main>
      <PackagingQueueClient />
    </main>
  );
}
