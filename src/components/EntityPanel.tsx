// src/components/EntityPanel.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import type { RegistryT } from "@/lib/models";
import { computeCharacter, computeObject } from "@/lib/models";

type Props = {
  branch: string;
  meta: any;           // { title, type?, param_bindings?, param_hints?, param_docs?, bio?, subtitle? }
  registry: RegistryT; // registry.models.{character|object}.params
};

const isBrowser = typeof window !== "undefined";
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

const enc = (o: unknown) => {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
  catch { return ""; }
};
const dec = <T,>(s: string | null): T | null => {
  try { return s ? (JSON.parse(decodeURIComponent(escape(atob(s)))) as T) : null; }
  catch { return null; }
};
const fmt = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const singularize = (t?: string) => {
  if (!t) return "object";
  const s = t.toLowerCase();
  if (s === "characters") return "character";
  if (s === "objects") return "object";
  return s.endsWith("s") ? s.slice(0, -1) : s;
};

// UI atoms
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{children}</div>;
}
function Badge({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div title={hint ?? ""} style={{
      display: "inline-flex", gap: 6, alignItems: "center",
      padding: "6px 10px", borderRadius: 8, border: "1px solid var(--muted, #3d3d3d)", fontSize: 12
    }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <strong>{typeof value === "number" ? fmt(value) : value}</strong>
    </div>
  );
}
function LabeledRange(props: {
  k: string; label: string; min: number; max: number; step: number; val: number;
  onChange: (v: number) => void; hint?: string; doc?: string;
}) {
  const { k, label, min, max, step, val, onChange, hint, doc } = props;
  const id = `slider_${k}`;
  return (
    <div style={{ padding: "10px 0" }}>
      <Row>
        <label htmlFor={id} title={hint} style={{ width: 160, fontWeight: 600, cursor: "help" }}>{label}</label>
        <input id={id} type="range" min={min} max={max} step={step} value={val}
               onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
        <input type="number" min={min} max={max} step={step} value={val}
               onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
               style={{ width: 96 }} title={hint} />
        {doc ? (
          <a href={doc} target="_blank" rel="noreferrer"
             style={{ fontSize: 12, opacity: 0.8, textDecoration: "underline" }}>doc</a>
        ) : null}
      </Row>
      {hint ? <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

// Main
export default function EntityPanel({ branch, meta, registry }: Props) {
  const tkey = singularize(meta?.type ?? "object");
  const model = registry?.models?.[tkey] ?? registry?.models?.object;

  // стартовые значения: meta.param_bindings, затем дефолты из реестра
  const [params, setParams] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {
      ...(meta?.param_bindings as Record<string, number> | undefined ?? {})
    const defs = model?.params ?? {};
    for (const [k, def] of Object.entries(defs)) if (base[k] == null) base[k] = def.min;
    return base;
  });

  // применяем p= из URL только на клиенте
  useEffect(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    const u = dec<Record<string, number>>(q.get("p"));
    if (u && typeof u === "object") setParams((old) => ({ ...old, ...u }));
  }, []);

  // синк снимка ползунков в URL
  useEffect(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    q.set("p", enc(params));
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [params]);

  // пересчёт метрик
  const metrics = useMemo(() => {
    const augmented = { ...meta, param_bindings: params, type: tkey };
    return tkey === "character"
      ? computeCharacter(augmented, registry, branch)
      : computeObject(augmented, registry, branch);
  }, [branch, meta, params, registry, tkey]);

  // контролы
  const controls = useMemo(() => {
    const out: Array<{ k: string; min: number; max: number; step: number; val: number; hint?: string; doc?: string; label: string; }> = [];
    const hints = (meta?.param_hints as Record<string, string>) ?? {};
    const docs = (meta?.param_docs as Record<string, string>) ?? {};
    const defs = model?.params ?? {};
    for (const [k, def] of Object.entries(defs)) {
      out.push({
        k, min: def.min, max: def.max, step: def.step ?? (def.max - def.min) / 100,
        val: Number(params[k] ?? def.min), hint: hints[k], doc: docs[k], label: k
      });
    }
    return out;
  }, [meta, model?.params, params]);

  // объяснения
  const explain = useMemo(() => {
    if (tkey === "character") {
      const will = Number(params.will ?? 0.5);
      const comp = Number(params.competence ?? 0.5);
      const res  = Number(params.resources ?? 0.5);
      const loy  = Number(params.loyalty ?? 0.5);
      const stress = Number(params.stress ?? 0.3);
      const infl = (will * 0.6 + comp * 0.6 + res * 0.4) * (0.7 + 0.3 * loy);
      return [
        `Влияние ≈ (0.6·will + 0.6·competence + 0.4·resources)·(0.7 + 0.3·loyalty) = ${fmt(infl)}`,
        `Pv ↑ с влиянием и ↓ при высоком stress.`,
        `Vσ ↑ от stress и risk_tolerance.`,
        `S = σ(1.1·Pv − 1.0·Vσ − 0.8·drift + 0.7·topo).`,
      ];
    } else {
      const A = Number(params.A_star ?? params["A*"] ?? 100);
      const E = Number(params.E0 ?? params.E ?? 0);
      const dose = A ? E / A : 0;
      const risk_dry   = Math.max(0, E - A) ** 2 * 0.001;
      const risk_decay = Math.max(0, A - E) * 0.002;
      return [
        `dose = E/A* = ${fmt(dose)} (цель ≈ 1).`,
        `risk_dry = max(0, E − A*)²·0.001 = ${fmt(risk_dry, 4)}.`,
        `risk_decay = max(0, A* − E)·0.002 = ${fmt(risk_decay, 4)}.`,
        `Pv ↑ c q и числом свидетелей; Vσ ↑ c exergy_cost, infra_footprint, hazard_rate и ошибкой дозы.`,
        `S = σ(1.2·Pv − 1.1·Vσ − 0.9·drift + 0.8·topo).`,
      ];
    }
  }, [params, tkey]);

  const reset = useCallback(() => {
    const base: Record<string, number> = {};
    const defs = model?.params ?? {};
    for (const [k, def] of Object.entries(defs)) base[k] = def.min;
    setParams(base);
  }, [model?.params]);

  const share = useCallback(() => {
    if (!isBrowser) return;
    navigator.clipboard?.writeText(window.location.href);
  }, []);

  if (!model?.params) {
    return (
      <div style={{ padding: 16, border: "1px solid #a33", borderRadius: 8, color: "#faa" }}>
        Нет параметров для типа <code>{tkey}</code>. Проверь <code>src/data/models/registry.json</code>.
      </div>
    );
  }

  return (
    <div className="entity-panel" style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
      {/* Лево: параметры */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{meta?.title ?? meta?.name ?? meta?.slug ?? "card"}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset}>Reset</button>
            <button onClick={share} title="Копировать URL со снимком ползунков">Share</button>
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Ветка: <code>{branch}</code> • Тип: <code>{tkey}</code>
        </div>

        {controls.map((c) => (
          <LabeledRange key={c.k} {...c} onChange={(v) => setParams((s) => ({ ...s, [c.k]: v }))} />
        ))}
      </section>

      {/* Право: метрики, объяснения, био */}
      <section>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <Badge label="Pv"   value={metrics.Pv}     hint="Предсказательная ценность" />
          <Badge label="Vσ"   value={metrics.Vsigma} hint="Онтологический долг" />
          <Badge label="S"    value={metrics.S}      hint="Стабильность формы" />
          <Badge label="dose" value={metrics.dose}   hint="Отношение E/A*" />
          <Badge label="drift" value={metrics.drift} hint="Дрейф при неверной дозе" />
          <Badge label="topo" value={metrics.topo}   hint="Топологическая защита" />
        </div>

        <div style={{ padding: 12, border: "1px solid var(--muted, #3d3d3d)", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Что происходит</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {explain.map((s, i) => (<li key={i} style={{ marginBottom: 4 }}>{s}</li>))}
          </ul>
        </div>

        {tkey === "character" && (meta?.bio || meta?.subtitle) ? (
          <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--muted, #3d3d3d)", borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Био</div>
            {meta?.subtitle ? <div style={{ opacity: 0.8, marginBottom: 6 }}>{meta.subtitle}</div> : null}
            {meta?.bio ? <div style={{ whiteSpace: "pre-wrap" }}>{meta.bio}</div> : null}
          </div>
        ) : null}
      </section>

      <style>{`
        .entity-panel button { border: 1px solid #444; background: #111; color: #ddd; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
        .entity-panel button:hover { background: #151515; }
        input[type="range"] { accent-color: #8ad; }
        code { background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 4px; }
      `}</style>
    </div>
  );
}
