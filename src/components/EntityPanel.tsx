import React, { useEffect, useMemo, useState, useCallback } from "react";
import type { RegistryT } from "@/lib/models";
import { computeCharacter, computeObject } from "@/lib/models";

type ViewTypePlural =
  | "characters"
  | "objects"
  | "places"
  | "protocols"
  | "events"
  | "documents"
  // допускаем новые типы без правок:
  | (string & {});

type Props = {
  branch: string;
  viewType: ViewTypePlural;   // plural из маршрута
  meta: any;                  // per-entity meta/*.meta.json
  registry: RegistryT;        // registry.json
};

// ── utils ───────────────────────────────────────────────────────────────────
const isBrowser = typeof window !== "undefined";
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
const fmt = (x: number, d = 3) => (Number.isFinite(x) ? Number(x).toFixed(d) : "—");
const singular = (t: string) => (t.endsWith("s") ? t.slice(0, -1) : t);

const enc = (o: unknown) => {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  } catch {
    return "";
  }
};
const dec = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(decodeURIComponent(escape(atob(s)))) as T) : null;
  } catch {
    return null;
  }
};

// ── tiny UI ─────────────────────────────────────────────────────────────────
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{children}</div>;
}
function Badge({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div
      title={hint ?? ""}
      style={{
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid var(--muted, #3d3d3d)",
        fontSize: 12
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}</span>
      <strong>{typeof value === "number" ? fmt(value, 3) : value}</strong>
    </div>
  );
}
function LabeledRange(props: {
  k: string;
  label: string;
  min: number;
  max: number;
  step: number;
  val: number;
  onChange: (v: number) => void;
  hint?: string;
  doc?: string;
}) {
  const { k, label, min, max, step, val, onChange, hint, doc } = props;
  const id = `slider_${k}`;
  return (
    <div style={{ padding: "10px 0" }}>
      <Row>
        <label htmlFor={id} title={hint} style={{ width: 160, fontWeight: 600, cursor: "help" }}>
          {label}
        </label>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={val}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={val}
          onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
          style={{ width: 96 }}
          title={hint}
        />
        {doc ? (
          <a
            href={doc}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, opacity: 0.8, textDecoration: "underline" }}
            title="Открыть пояснение модели"
          >
            doc
          </a>
        ) : null}
      </Row>
      {hint ? <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────
export default function EntityPanel({ branch, viewType, meta, registry }: Props) {
  // тип берём из маршрута, а не угадываем по meta
  const tkey = singular(String(viewType || meta?.type || "objects")); // 'character' | 'object' | ...
  const modelKey = meta?.model_ref || tkey;

  // параметры из registry для данного типа/модели
  const modelParams: Record<
    string,
    { min: number; max: number; step?: number; label?: string }
  > = registry?.models?.[modelKey]?.params ?? registry?.models?.object?.params ?? {};

  // стартовые значения: meta.param_bindings → дефолты из реестра
  const [params, setParams] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = { ...(meta?.param_bindings ?? {}) };
    for (const [k, def] of Object.entries(modelParams)) {
      if (base[k] == null) base[k] = Number(def.min);
    }
    return base;
  });

  // применяем p= из URL только на клиенте
  useEffect(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    const u = dec<Record<string, number>>(q.get("p"));
    if (u && typeof u === "object") setParams((old) => ({ ...old, ...u }));
  }, []);

  // синхронизация URL
  useEffect(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    q.set("p", enc(params));
    const url = `${window.location.pathname}?${q.toString()}`;
    window.history.replaceState(null, "", url);
  }, [params]);

  // вычислители по типу: новые типы → fallback к object
  type ComputeFn = (m: any, r: any, b: string) => any;
  const COMPUTE: Record<string, ComputeFn> = {
    object: computeObject,
    character: computeCharacter,
    place: computeObject,
    protocol: computeObject,
    event: computeObject,
    document: computeObject
  };
  const compute = COMPUTE[tkey] || computeObject;

  // пересчёт метрик
  const metrics = useMemo(() => {
    const augmented = { ...meta, type: tkey, param_bindings: params };
    return compute(augmented, registry, branch);
  }, [branch, meta, params, registry, tkey]);

  // контролы: метки из registry.label если есть, хинты/доки из meta
  const controls = useMemo(() => {
    const hints = (meta?.param_hints ?? {}) as Record<string, string>;
    const docs = (meta?.param_docs ?? {}) as Record<string, string>;
    const out: Array<{
      k: string;
      min: number;
      max: number;
      step: number;
      val: number;
      hint?: string;
      doc?: string;
      label: string;
    }> = [];
    for (const [k, def] of Object.entries(modelParams)) {
      out.push({
        k,
        min: Number(def.min),
        max: Number(def.max),
        step: Number(def.step ?? 1),
        val: Number(params[k] ?? def.min),
        hint: hints[k],
        doc: docs[k],
        label: def.label || k
      });
    }
    return out;
  }, [meta, modelParams, params]);

  // краткие объяснения по типам
  const explain = useMemo(() => {
    if (tkey === "character") {
      const will = Number(params.will ?? 0.5);
      const comp = Number(params.competence ?? 0.5);
      const res = Number(params.resources ?? 0.5);
      const loy = Number(params.loyalty ?? 0.5);
      const stress = Number(params.stress ?? 0.3);
      const infl = (will * 0.6 + comp * 0.6 + res * 0.4) * (0.7 + 0.3 * loy);
      return [
        `Influence ≈ (0.6·will + 0.6·competence + 0.4·resources)·(0.7 + 0.3·loyalty) = ${fmt(infl, 3)}`,
        `Pv ↑ c influence, Pv ↓ при высоком stress.`,
        `Vσ ↑ от stress и risk_tolerance.`,
        `S = σ(α₁·Pv − α₂·Vσ − α₃·drift + α₄·topo).`
      ];
    }
    const A = Number(params["A*"] ?? params.A_star ?? 100);
    const E = Number(params.E ?? params.E0 ?? 0);
    const dose = A ? E / A : 0;
    const risk_dry = Math.max(0, E - A) ** 2 * 0.001;
    const risk_decay = Math.max(0, A - E) * 0.002;
    return [
      `dose = E / A* = ${fmt(dose, 3)}. Цель ~ 1.`,
      `Переэкспозиция: risk_dry = max(0, E − A*)² · 0.001 = ${fmt(risk_dry, 4)}.`,
      `Недокорм: risk_decay = max(0, A* − E) · 0.002 = ${fmt(risk_decay, 4)}.`,
      `Pv ↑ с q и свидетелями; Vσ ↑ от exergy_cost, infra_footprint, hazard_rate и ошибок дозы.`,
      `S = σ(α₁·Pv − α₂·Vσ − α₃·drift + α₄·topo).`
    ];
  }, [params, tkey]);

  const reset = useCallback(() => {
    const base: Record<string, number> = {};
    for (const [k, def] of Object.entries(modelParams)) base[k] = Number(def.min);
    setParams(base);
  }, [modelParams]);

  const share = useCallback(() => {
    if (!isBrowser) return;
    const url = window.location.href;
    if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(url);
  }, []);

  if (!modelParams || Object.keys(modelParams).length === 0) {
    return (
      <div style={{ padding: 16, border: "1px solid #a33", borderRadius: 8, color: "#faa" }}>
        Нет параметров для модели <code>{modelKey}</code>. Проверь <code>src/data/models/registry.json</code>.
      </div>
    );
  }

  return (
    <div className="entity-panel" style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
      {/* левая колонка: ползунки */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{meta?.title ?? meta?.name ?? "card"}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset}>Reset</button>
            <button onClick={share} title="Копировать URL со снимком ползунков">Share</button>
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Ветка: <code>{branch}</code> • Тип: <code>{tkey}</code> • Модель: <code>{modelKey}</code>
        </div>

        {controls.map((c) => (
          <LabeledRange
            key={c.k}
            k={c.k}
            label={c.label}
            min={c.min}
            max={c.max}
            step={c.step}
            val={c.val}
            onChange={(v) => setParams((s) => ({ ...s, [c.k]: v }))}
            hint={c.hint}
            doc={c.doc}
          />
        ))}
      </section>

      {/* правая колонка: метрики + объяснения + спец-бейджи */}
      <section>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <Badge label="Pv" value={metrics?.Pv} hint="Предсказательная ценность" />
          <Badge label="Vσ" value={metrics?.Vsigma} hint="Онтологический долг" />
          <Badge label="S" value={metrics?.S} hint="Стабильность формы" />
          {"dose" in (metrics ?? {}) && <Badge label="dose" value={(metrics as any).dose} hint="Отношение E/A*" />}
          {"drift" in (metrics ?? {}) && <Badge label="drift" value={(metrics as any).drift} hint="Дрейф" />}
          {"topo" in (metrics ?? {}) && <Badge label="topo" value={(metrics as any).topo} hint="Топологическая защита" />}

          {tkey === "character" && (
            <>
              {"influence" in (metrics ?? {}) && (
                <Badge label="Influence" value={(metrics as any).influence} hint="Центральность влияния" />
              )}
              {"monstro_pr" in (metrics ?? {}) && (
                <Badge label="Pr[monstro]" value={(metrics as any).monstro_pr} hint="Риск монструозности" />
              )}
            </>
          )}

          {tkey === "object" && (
            <>
              {"risk_dry" in (metrics ?? {}) && (
                <Badge label="risk_dry" value={(metrics as any).risk_dry} hint="Штраф переэкспозиции" />
              )}
              {"risk_decay" in (metrics ?? {}) && (
                <Badge label="risk_decay" value={(metrics as any).risk_decay} hint="Штраф недокорма" />
              )}
            </>
          )}
        </div>

        <div style={{ padding: 12, border: "1px solid var(--muted, #3d3d3d)", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Что происходит</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {explain.map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{s}</li>
            ))}
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
        .entity-panel button {
          border: 1px solid #444; background: #111; color: #ddd; padding: 6px 10px; border-radius: 8px; cursor: pointer;
        }
        .entity-panel button:hover { background: #151515; }
        input[type="range"] { accent-color: #8ad; }
        code { background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 4px; }
      `}</style>
    </div>
  );
}
