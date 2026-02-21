import { ControlTowerSection } from "./ControlTowerSection";

const SECTION_TITLES = [
  "WIP Summary",
  "Drying Risk Summary",
  "Station Load Summary",
  "Recent Events",
] as const;

export function ControlTowerLoadingState() {
  return (
    <div
      aria-live="polite"
      style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
    >
      {SECTION_TITLES.map((title) => (
        <ControlTowerSection key={title} title={title}>
          <p style={{ margin: 0, color: "#666" }}>Loading…</p>
        </ControlTowerSection>
      ))}
    </div>
  );
}
