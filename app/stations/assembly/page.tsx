import { AssemblyStationClient } from "@/components/stations/assembly/AssemblyStationClient";
import { requirePageRole } from "@/lib/server/guards";

export default function AssemblyStationPage() {
  requirePageRole("/stations/assembly", ["OWNER", "COO"]);

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <h1>Assembly</h1>
      <AssemblyStationClient />
    </main>
  );
}
