import { requirePageRole } from "@/lib/server/guards";

import PickingWorkspaceView from "@/components/picking/PickingWorkspaceView";

/**
 * Smoke test (DevTools Console):
 * 1) Open /picking while logged in as OWNER/COO and verify shipment/picking status filters + pagination work.
 * 2) Select one shipment and confirm counterparty / destination warehouse / planned date / deadline context is visible.
 * 3) Build a draft, then rebuild it explicitly and verify the UI explains immutable picking-list snapshots vs fresh draft availability.
 * 4) Create a picking list from the draft, confirm one line, and verify refreshed state remains aligned.
 */
export default function PickingPage() {
  requirePageRole("/picking", ["OWNER", "COO"]);

  return (
    <main>
      <PickingWorkspaceView />
    </main>
  );
}
