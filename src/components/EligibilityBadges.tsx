// src/components/EligibilityBadges.tsx
import React from "react";
import type { EligibilityReport } from "@/lib/eligibility";

function Chip({ ok, label, title }: { ok: boolean; label: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
        border: `1px solid ${ok ? "#296d2d" : "#7a2b2b"}`,
        color: ok ? "#9fe3a1" : "#ffb3b3",
        background: ok ? "rgba(41,109,45,.12)" : "rgba(122,43,43,.12)"
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: ok ? "#3fcf5a" : "#ff5c5c" }} />
      {label}
    </span>
  );
}

export default function EligibilityBadges({ items }: { items: EligibilityReport[] }) {
  const label = (k: string) =>
    k === "negotiation"
      ? "Переговоры"
      : k === "repair_nomonstr"
      ? "Ремонт без монстра"
      : k === "incident_localize"
      ? "Локализация инцидента"
      : k;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((r) => (
        <Chip key={r.key} ok={r.ok} label={label(r.key)} title={r.reasons.join("; ")} />
      ))}
    </div>
  );
}
