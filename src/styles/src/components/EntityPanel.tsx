// src/components/EntityPanel.tsx
import React,{useMemo,useState,useEffect} from "react";
import { computeObject, computeCharacter, RegistryT } from "@/lib/models";

const isBrowser = typeof window !== "undefined";
const enc = (o:any)=> {
  const j = JSON.stringify(o); const b = isBrowser? btoa(unescape(encodeURIComponent(j))) : Buffer.from(j).toString("base64");
  return b.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const dec = (s:string|null)=>{ if(!s) return null; const b=s.replace(/-/g,"+").replace(/_/g,"/"); try{const j=isBrowser?decodeURIComponent(escape(atob(b))):Buffer.from(b,"base64").toString("utf8"); return JSON.parse(j);}catch{return null;}};

export default function EntityPanel({branch,meta,viewType,registry}:{branch:string;meta:any;viewType:string;registry:RegistryT;}){
  const initial = dec(isBrowser? new URLSearchParams(location.search).get("p"):null) ?? meta.param_bindings ?? {};
  const [p,setP]=useState<Record<string,number>>(initial);

  useEffect(()=>{ if(!isBrowser) return; const q=new URLSearchParams(location.search); q.set("p",enc(p)); history.replaceState(null,"","?"+q.toString());},[p]);

  const M = useMemo(()=>{
    const m = {...meta, param_bindings:p, type:viewType, model_ref: meta?.model_ref ?? viewType};
    try{ return viewType==="character"? computeCharacter(m,registry,branch): computeObject(m,registry,branch); }
    catch{ // безопасные дефолты
      const A=Number(p.A_star ?? p["A*"] ?? 100), E=Number(p.E0 ?? p.E ?? 0);
      const dose = A? E/A : 0, drift=Math.abs(dose-1)*0.25, topo=Math.log1p(Number(p.witness_count??0))*0.2;
      return { Pv:0.3, Vsigma:0.7, S:1/(1+Math.exp(-(0.3-0.7-drift+topo))), dose, drift, topo };
    }
  },[p,meta,registry,branch,viewType]);

  // список слайдеров по registry
  const ranges = (registry.models?.[meta.model_ref ?? viewType]?.params)||{};
  const keys = Object.keys(ranges);
  return (
    <div>
      {/* верхние плитки */}
      <div className="row">
        <div className="card">
          <div className="stats">
            <div className="stat"><div className="lbl">Pv</div><div className="val">{M.Pv.toFixed(3)}</div></div>
            <div className="stat"><div className="lbl">Vσ</div><div className="val">{M.Vsigma.toFixed(3)}</div></div>
            <div className="stat"><div className="lbl">S</div><div className="val">{M.S.toFixed(3)}</div></div>
            <div className="stat"><div className="lbl">k₀</div><div className="val">0.400</div></div>
            <div className="stat"><div className="lbl">Pxscore</div><div className="val">0.536</div></div>
            <div className="stat"><div className="lbl">drift</div><div className="val">{M.drift.toFixed(3)}</div></div>
          </div>
          <div style={{marginTop:12}}>
            <div className="lbl">Лимит сектора L* загрузка</div>
            <div className="scale"><div className="scale__fill" style={{width:"69%"}}/></div>
            <div className="note">83 / 120 (69%)</div>
          </div>
        </div>

        <div className="card">
          <div className="lbl">tda_signature</div>
          <div className="note" style={{fontFamily:"var(--mono)"}}>β=[0,1,0]; pers:c912..ee</div>
          <div className="lbl" style={{marginTop:8}}>witnesses</div>
          <div className="note">hrysh:micro_scars#812..974</div>
        </div>
      </div>

      {/* Внимание A*/E и слайдеры */}
      <div className="row">
        <div className="card">
          <div className="lbl">Внимание A*/E</div>
          <div className="scale"><div className="scale__fill" style={{width: `${Math.min(100, (Number(p.E0??p.E??0)/Math.max(1,Number(p.A_star??p["A*"]??100)))*100)}%`}}/></div>
          <div className="note">доза = {M.dose.toFixed(3)}</div>
          <div className="sliders" style={{marginTop:10}}>
            {keys.map(k=>{
              const spec = (ranges as any)[k];
              const val = Number(p[k] ?? spec.min);
              return (
                <div className="slider" key={k}>
                  <div className="slider__row">
                    <div className="slider__name">{k}</div>
                    <div className="slider__val">{val.toFixed(3)}</div>
                  </div>
                  <input type="range" min={spec.min} max={spec.max} step={spec.step??((spec.max-spec.min)/100)}
                         value={val} onChange={e=>setP(s=>({...s,[k]:Number(e.currentTarget.value)}))}/>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="lbl">Действия</div>
          <div className="actions" style={{marginTop:8}}>
            <button className="btn">План экспозиции</button>
            <button className="btn">Показать Vσ по чеку</button>
            <button className="btn warn">Локализовать трещину</button>
            <button className="btn">Объединить дубли</button>
            <button className="btn risk">Открыть тёмный слой</button>
          </div>
          <div className="note" style={{marginTop:10}}>После процедуры: пересчёт Pv/Vσ/S и лог аудита.</div>
        </div>
      </div>
    </div>
  );
}
