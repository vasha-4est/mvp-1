import { ReactNode } from "react";

type ControlTowerSectionProps = {
  title: string;
  children: ReactNode;
};

export function ControlTowerSection({ title, children }: ControlTowerSectionProps) {
  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 12,
        background: "#fff",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}
