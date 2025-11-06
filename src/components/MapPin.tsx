import React, { useRef } from "react";

type Props = {
  width?: number;
  height?: number;
  imageUrl?: string;
  x: number; // 0..100
  y: number; // 0..100
  onChange: (x: number, y: number) => void;
  title?: string;
};

export default function MapPin({ width = 420, height = 240, imageUrl, x, y, onChange, title }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const xpx = Math.round((x / 100) * width);
  const ypx = Math.round((y / 100) * height);

  const handle = (ev: React.MouseEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const nx = Math.max(0, Math.min(1, (ev.clientX - box.left) / box.width));
    const ny = Math.max(0, Math.min(1, (ev.clientY - box.top) / box.height));
    onChange(Math.round(nx * 100), Math.round(ny * 100));
  };

  return (
    <div style={{ padding: 8, border: "1px solid var(--muted,#3d3d3d)", borderRadius: 8 }}>
      {title ? <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div> : null}
      <div
        ref={ref}
        onClick={handle}
        style={{
          width,
          height,
          position: "relative",
          background: imageUrl
            ? `center/cover url(${imageUrl})`
            : "repeating-linear-gradient(45deg,#222,#222 10px,#1a1a1a 10px,#1a1a1a 20px)",
          borderRadius: 8,
          cursor: "crosshair"
        }}
      >
        <div
          style={{
            position: "absolute",
            left: xpx - 6,
            top: ypx - 6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#88aadd",
            border: "2px solid #111",
            boxShadow: "0 0 0 2px rgba(136,170,221,0.35)"
          }}
          title={`${x}%, ${y}%`}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>Кликни по карте. Точка хранится в URL.</div>
    </div>
  );
}
