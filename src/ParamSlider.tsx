import React from "react";
type Props={label:string;min?:number;max?:number;step?:number;value:number;onChange:(v:number)=>void;hint?:string;};
export default function ParamSlider({label,min=0,max=1,step=0.01,value,onChange,hint}:Props){
  return (<div className="mb-3">
    <div className="flex justify-between text-sm"><span>{label}</span><span>{value.toFixed(2)}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))} className="w-full"/>
    {hint && <div className="text-xs opacity-70">{hint}</div>}
  </div>);
}
