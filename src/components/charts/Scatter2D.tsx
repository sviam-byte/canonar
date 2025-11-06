import React from "react";
import { ScatterChart, CartesianGrid, XAxis, YAxis, Tooltip, Scatter, ResponsiveContainer, Line } from "recharts";

type Props = {
  currentPoint?: { x: number; y: number };
  path?: Array<{ x: number; y: number }>;
  xLabel?: string;
  yLabel?: string;
  title?: string;
};

export default function Scatter2D({ currentPoint, path, xLabel, yLabel, title }: Props) {
  const pdata = path ?? [];
  const cdata = currentPoint ? [currentPoint] : [];
  return (
    <div style={{ height: 260, padding: 8, border: "1px solid var(--muted,#3d3d3d)", borderRadius: 8 }}>
      {title ? <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div> : null}
      <ResponsiveContainer width="100%" height={210}>
        <ScatterChart>
          <CartesianGrid />
          <XAxis dataKey="x" name={xLabel ?? "X"} tick={{ fontSize: 10 }} />
          <YAxis dataKey="y" name={yLabel ?? "Y"} tick={{ fontSize: 10 }} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          {pdata.length > 1 ? <Line type="monotone" dataKey="y" data={pdata} dot={false} strokeWidth={2} /> : null}
          {cdata.length ? <Scatter data={cdata} name="now" /> : null}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
