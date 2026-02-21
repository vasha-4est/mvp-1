import { requirePageRole } from "@/lib/server/guards";

export default function DryingBoardPage() {
  requirePageRole("/drying", ["OWNER", "COO"]);

  return (
    <main>
      <h1>Drying Board</h1>
      <p>Coming soon.</p>
      <p>This is a safe read-only entry point for the upcoming drying workflow.</p>
    </main>
  );
}
