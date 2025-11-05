import React,{useMemo,useState,useEffect} from "react";
import ParamSlider from "./ParamSlider";
import MetricBadge from "./MetricBadge";
import { computeObject, computeCharacter, type RegistryT } from "@/lib/models";

function enc(o:any){ return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
function dec(s:string|null){ try{ return s?JSON.parse(decodeURIComponent(escape(atob(s)))):null; }catch{return null;} }

export default function EntityView({branch, meta, registry}:{branch:string;meta:any;registry:RegistryT;}){
  const initial = dec(new URLSearchParams(location.search).get("p")) ?? meta.param_bindings ?? {};
  const [params,setParams]=useState<Record<string,number>>(initial);

  useEffect(()=>{ const q=new URLSearchParams(location.search); q.set("p",enc(params)); history.replaceState(null,"","?"+q.toString()); },[params]);

  const metrics = useMemo(()=>{
    const m = {...meta, param_bindings: params};
    if (meta.type==="character") return computeCharacter(m, registry as any, branch as any);
    return computeObject(m, registry as any, branch as any);
  },[params,meta,registry,branch]);

  const controls = meta.type==="character"
    ? [["will",0,1,0.01],["loyalty",0,1,0.01],["stress",0,1,0.01],["resources",0,1,0.01],["competence",0,1,0.01]] as const
    : [["A_star",10,1000,10],["E0",0,1000,5],["q",0,1,0.01],["rho",0.5,0.999,0.001],["exergy_cost",0,3,0.01],["infra_footprint",0,3,0.01],["hazard_rate",0,1,0.01],["witness_count",0,200,1]] as const;

  return (<div className="grid md:grid-cols-2 gap-6">
    <div>{controls.map(([k,min,max,step])=>(
      <ParamSlider key={k} label={k as string} min={min} max={max} step={step} value={Number(params[k as string] ?? 0)} onChange={v=>setParams(s=>({...s,[k as string]:v}))}/>
    ))}</div>
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <MetricBadge label="Pv" value={metrics.Pv}/><MetricBadge label="Vσ" value={metrics.Vsigma}/>
        <MetricBadge label="S" value={metrics.S}/><MetricBadge label="dose" value={metrics.dose}/>
        <MetricBadge label="drift" value={metrics.drift}/><MetricBadge label="topo" value={metrics.topo}/>
      </div>
      <div className="text-xs opacity-70">URL хранит снимок ползунков.</div>
    </div>
  </div>);
}
