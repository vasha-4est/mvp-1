import LabelingStationClient from "@/components/stations/labeling/LabelingStationClient";
import { requirePageRole } from "@/lib/server/guards";

export default function LabelingStationPage() {
  requirePageRole("/stations/labeling", ["OWNER", "COO"]);

  return (
    <main>
      <LabelingStationClient />
    </main>
  );
}
