import React from "react";
export default function MetricBadge({label,value}:{label:string;value:number}){
  return <div className="px-2 py-1 rounded border text-sm">{label}: {Number.isFinite(value)?value.toFixed(3):"—"}</div>;
}
