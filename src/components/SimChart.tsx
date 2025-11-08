import { useEffect, useRef } from "preact/hooks";

type Line = { label: string; values: number[] };
type Props = { width?: number; height?: number; series: { x: number[]; lines: Line[] } };

export default function SimChart({ width=640, height=220, series }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current; if (!cvs) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0,0,width,height);
    ctx.lineWidth = 1;

    const xs = series.x;
    const pad = 24;
    const W = width - 2*pad, H = height - 2*pad;

    function drawLine(vals: number[], color: string) {
      const ymin = Math.min(...vals), ymax = Math.max(...vals);
      const y0 = Math.min(0, ymin), y1 = Math.max(1, ymax); // под S 0..1, для прочих нормируем
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let i=0;i<vals.length;i++) {
        const x = pad + (i/(vals.length-1))*W;
        const y = pad + (1-( (vals[i]-y0)/(y1-y0||1) ))*H;
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }

    const colors = ["#4ade80","#60a5fa","#f87171","#a78bfa","#fbbf24"];
    series.lines.forEach((ln, i) => drawLine(ln.values, colors[i%colors.length]));
  }, [series, width, height]);

  return <canvas ref={ref} width={width} height={height} style="width:100%;max-width:800px;" />;
}
