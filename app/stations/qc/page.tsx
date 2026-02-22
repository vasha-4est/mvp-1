import { requirePageRole } from "@/lib/server/guards";

import QcStationTable from "@/components/stations/qc/QcStationTable";

export default function QcStationPage() {
  requirePageRole("/stations/qc", ["OWNER", "COO"]);

  return (
    <main>
      <QcStationTable />
    </main>
  );
}
