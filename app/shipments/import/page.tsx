import { requirePageRole } from "@/lib/server/guards";

import ShipmentPlanImportWorkspace from "@/components/owner/ShipmentPlanImportWorkspace";

/**
 * Smoke test (DevTools Console):
 * 1) Open /shipments/import while logged in as OWNER/COO.
 * 2) Validate pasted shipment-plan rows and confirm preview/errors render.
 * 3) Commit a valid import and refresh latest batch to confirm the active batch updates.
 */
export default function ShipmentImportPage() {
  requirePageRole("/shipments/import", ["OWNER", "COO"]);

  return (
    <main>
      <ShipmentPlanImportWorkspace />
    </main>
  );
}
