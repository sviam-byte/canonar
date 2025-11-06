import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

type Props = { data: Array<Record<string, any>>; x: string; y: string; title?: string; yLabel?: string };
export default function Spark({ data, x, y, title, yLabel }: Props) {
  return (
    <div style={{ height: 180, padding: 8, border: "1px solid var(--muted,#3d3d3d)", borderRadius: 8 }}>
      {title ? <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div> : null}
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey={x} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft" } : undefined} />
          <Tooltip />
          <Line type="monotone" dataKey={y} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
