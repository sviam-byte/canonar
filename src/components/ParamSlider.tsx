import React from "react";

type Props = {
  label: string;
  min: number; max: number; step?: number;
  value: number;
  onChange: (v:number)=>void;
  hint?: string;
  docRef?: string;
};

export default function ParamSlider({label,min,max,step=1,value,onChange,hint,docRef}:Props){
  return (
    <div className="param">
      <div className="param__head">
        <label>{label}</label>
        <div className="param__meta">
          {hint ? <span className="param__hint" title={hint}>ⓘ</span> : null}
          {docRef ? <a href={docRef} target="_blank" rel="noreferrer" className="param__doc">статья</a> : null}
          <span className="param__val">{Number(value).toFixed(3)}</span>
        </div>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e)=>onChange(Number(e.target.value))}
      />
    </div>
  );
}
