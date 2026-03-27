import { requirePageRole } from "@/lib/server/guards";

import ProductionLiveView from "@/components/production/ProductionLiveView";

/**
 * Smoke test (DevTools Console):
 * 1) Open /production/live while logged in as OWNER/COO.
 * 2) Confirm the worker cards, anti-duplication panel, and status slices render from current production launch state.
 * 3) Compare one active SKU against /production/plan and verify worker/status/WIP stay aligned after refresh.
 */
export default function ProductionLivePage() {
  requirePageRole("/production/live", ["OWNER", "COO"]);

  return (
    <main>
      <ProductionLiveView />
    </main>
  );
}
