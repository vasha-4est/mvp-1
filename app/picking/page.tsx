import { requirePageRole } from "@/lib/server/guards";

import PickingWorkspaceView from "@/components/picking/PickingWorkspaceView";

/**
 * Smoke test (DevTools Console):
 * 1) Open /picking while logged in as OWNER/COO.
 * 2) Select one shipment, build a draft, and verify suggested locations/qty come from current shipment + inventory state.
 * 3) Create a picking list from the draft, confirm one line, and verify refreshed state remains aligned.
 */
export default function PickingPage() {
  requirePageRole("/picking", ["OWNER", "COO"]);

  return (
    <main>
      <PickingWorkspaceView />
    </main>
  );
}
