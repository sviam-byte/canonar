import React, {useEffect, useMemo, useRef, useState} from "react";
import ParamSlider from "@/components/ParamSlider";
import MetricBadge from "@/components/MetricBadge";
import { computeObject, computeCharacter, explainObject, explainCharacter, type RegistryT } from "@/lib/models";

function enc(o:any){ return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
function dec(s:string|null){ try{ return s?JSON.parse(decodeURIComponent(escape(atob(s)))):null; }catch{return null;} }

type Meta = {
  type: "object"|"character";
  title?: string;
  subtitle?: string;
  param_bindings?: Record<string,number>;
  param_hints?: Record<string,string>;
  doc_refs?: Record<string,string>;
  bio?: { text?: string; roles?: string[]; sigils?: string[]; };
  media?: { images?: {src:string; caption?:string}[] };
};

export default function EntityPanel({
  branch, meta, registry
}:{branch:string; meta:Meta; registry:RegistryT;}){
  const initial = dec(new URLSearchParams(location.search).get("p")) ?? meta.param_bindings ?? {};
  const [params,setParams] = useState<Record<string,number>>(initial);
  const [urlTimer,setUrlTimer] = useState<number|undefined>(undefined);

  // аккуратный апдейт URL: не на каждый тик
  const updateUrl = (p:Record<string,number>)=>{
    if (urlTimer) clearTimeout(urlTimer);
    const id = window.setTimeout(()=>{
      const q = new URLSearchParams(location.search);
      q.set("p", enc(p));
      history.replaceState(null,"","?"+q.toString());
    }, 250);
    setUrlTimer(id);
  };

  // список контролов из реестра
  const model = registry.models[meta.type];
  const controls = useMemo(()=>{
    return Object.entries(model.params).map(([k,def])=>({
      key:k, ...def,
      value: Number(params[k] ?? meta.param_bindings?.[k] ?? def.min)
    }));
  }, [model, params, meta]);

  const setOne = (k:string,v:number)=>{
    setParams(s=>{ const next = {...s, [k]:v}; updateUrl(next); return next; });
  };

  const metrics = useMemo(()=>{
    const m = {...meta, param_bindings: params};
    return meta.type==="character"
      ? computeCharacter(m as any, registry, branch)
      : computeObject(m as any, registry, branch);
  },[params,meta,registry,branch]);

  const explain = useMemo(()=>{
    const m = {...meta, param_bindings: params};
    return meta.type==="character"
      ? explainCharacter(m as any, registry, branch)
      : explainObject(m as any, registry, branch);
  },[params,meta,registry,branch]);

  return (
    <div className="entity">
      <header className="entity__head">
        <h1>{meta.title || "Entity"}</h1>
        {meta.subtitle ? <div className="entity__sub">{meta.subtitle}</div> : null}
      </header>

      <section className="entity__grid">
        {/* Ползунки */}
        <div className="entity__left">
          {controls.map(c=>(
            <ParamSlider
              key={c.key}
              label={c.key}
              min={c.min} max={c.max} step={c.step ?? 1}
              value={c.value}
              hint={meta.param_hints?.[c.key]}
              docRef={meta.doc_refs?.[c.key]}
              onChange={(v)=>setOne(c.key,v)}
            />
          ))}
        </div>

        {/* Метрики + объяснение */}
        <div className="entity__right">
          <div className="metrics">
            <MetricBadge label="Pv"    value={metrics.Pv}    desc="прирост предсказательной ценности"/>
            <MetricBadge label="Vσ"    value={metrics.Vsigma} desc="онтологический долг"/>
            <MetricBadge label="S"     value={metrics.S}     desc="стабильность формы/кода"/>
            {"dose" in metrics ? <MetricBadge label="dose"  value={(metrics as any).dose} /> : null}
            {"drift" in metrics ? <MetricBadge label="drift" value={(metrics as any).drift}/> : null}
            {"topo" in metrics ? <MetricBadge label="topo"  value={(metrics as any).topo} /> : null}
            {"influence" in metrics ? <MetricBadge label="Influence" value={(metrics as any).influence}/> : null}
            {"monstro_pr" in metrics ? <MetricBadge label="Pr[monstro]" value={(metrics as any).monstro_pr}/> : null}
          </div>

          <div className="explain">
            <div className="explain__title">Почему так</div>
            <ul>
              {explain.map((t,i)=>(<li key={i}>{t}</li>))}
            </ul>
          </div>
        </div>
      </section>

      {/* Контентные блоки для персонажей */}
      {meta.type==="character" && meta.bio ? (
        <section className="bio">
          {meta.bio.text ? <p>{meta.bio.text}</p> : null}
          <div className="bio__tags">
            {meta.bio.roles?.length ? <div>Роли: {meta.bio.roles.join(", ")}</div> : null}
            {meta.bio.sigils?.length ? <div>Сигиллы: {meta.bio.sigils.join(", ")}</div> : null}
          </div>
        </section>
      ) : null}

      {meta.media?.images?.length ? (
        <section className="media">
          {meta.media.images.map((m,i)=>(
            <figure key={i}><img src={m.src} alt={m.caption || ""}/><figcaption>{m.caption}</figcaption></figure>
          ))}
        </section>
      ) : null}

      <footer className="entity__foot">URL хранит снимок ползунков.</footer>
    </div>
  );
}
