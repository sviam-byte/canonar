import React from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer } from "recharts";

type ParamDef = { min: number; max: number; step?: number; label?: string };
type Props = { params: Record<string, number>; defs: Record<string, ParamDef>; title?: string };

export default function RadarParams({ params, defs, title }: Props) {
  const data = Object.keys(defs).map((k) => {
    const def = defs[k];
    const min = Number(def.min), max = Number(def.max);
    const v = Number(params[k] ?? def.min);
    const norm = max > min ? (v - min) / (max - min) : 0;
    return { key: def.label || k, value: Math.max(0, Math.min(1, norm)) };
  });

  return (
    <div style={{ height: 260, padding: 8, border: "1px solid var(--muted,#3d3d3d)", borderRadius: 8 }}>
      {title ? <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div> : null}
      <ResponsiveContainer width="100%" height={210}>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="key" tick={{ fontSize: 10 }} />
          <PolarRadiusAxis angle={30} domain={[0, 1]} />
          <Tooltip />
          <Radar name="params" dataKey="value" stroke="#88aadd" fill="#88aadd" fillOpacity={0.25} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
