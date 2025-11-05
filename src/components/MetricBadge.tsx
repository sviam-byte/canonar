import React from "react";
export default function MetricBadge({label,value,desc}:{label:string;value:number;desc?:string;}){
  return (
    <div className="metric" title={desc || ""}>
      <span className="metric__label">{label}</span>
      <span className="metric__val">{Number(value).toFixed(3)}</span>
    </div>
  );
}
