import React from "react";
import type { EligibilityItem } from "@/lib/eligibility";

type Props = { items?: EligibilityItem[] | null; className?: string };

export default function EligibilityBadges({ items, className }: Props) {
  const safe: EligibilityItem[] = Array.isArray(items) ? items : [];
  if (safe.length === 0) return null;

  return (
    <div
      className={typeof className === "string" ? className : undefined}
      style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
    >
      {safe.map((it) => (
        <div
          key={it.key || `${it.label}-${Math.random().toString(36).slice(2)}`}
          title={it.why || ""}
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            border: "1px solid var(--muted, #3d3d3d)",
            borderRadius: 8,
            padding: "6px 10px",
            background: it.ok ? "rgba(60,180,90,0.08)" : "rgba(180,60,60,0.08)"
          }}
        >
          <strong style={{ fontSize: 12 }}>{it.label ?? "—"}</strong>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{it.ok ? "ok" : "fail"}</span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            {Number.isFinite(it.score) ? Math.round(it.score * 100) + "%" : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
