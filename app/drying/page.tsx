import { requirePageRole } from "@/lib/server/guards";

import DryingBoardClient from "@/components/drying/DryingBoardClient";

export default function DryingBoardPage() {
  requirePageRole("/drying", ["OWNER", "COO"]);

  return (
    <main>
      <DryingBoardClient />
    </main>
  );
}
