// src/components/EntityPanel.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { RegistryT } from "@/lib/models";
import {
  getParamDefs,
  computeCharacter,
  computeObject,
  simulateCharacter,
  simulateObject,
} from "@/lib/models";

import Spark from "@/components/charts/Spark";
import RadarParams from "@/components/charts/RadarParams";
import Scatter2D from "@/components/charts/Scatter2D";
import MapPin from "@/components/MapPin";
import MetricHelp from "@/components/MetricHelp";

import EligibilityBadges from "@/components/EligibilityBadges";
import { getEligibility, scenarioRelevantParams } from "@/lib/eligibility";

/* ───────── types ───────── */
type ViewTypePlural =
  | "characters"
  | "objects"
  | "places"
  | "protocols"
  | "events"
  | "documents"
  | (string & {});

type Props = {
  branch: string;
  viewType?: ViewTypePlural; // prefer
  type?: ViewTypePlural;     // legacy
  meta: any;                 // per-entity meta.json
  registry: RegistryT;
};

/* ───────── utils ───────── */
const isBrowser = typeof window !== "undefined";
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
const fmt = (x: unknown, d = 3) =>
  typeof x === "number" && Number.isFinite(x) ? Number(x).toFixed(d) : "—";
const singular = (t: string) => (t.endsWith("s") ? t.slice(0, -1) : t);

const enc = (o: unknown) => {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); } catch { return ""; }
};
const dec = <T,>(s: string | null): T | null => {
  try { return s ? (JSON.parse(decodeURIComponent(escape(atob(s)))) as T) : null; } catch { return null; }
};

/* ───────── fallback params (если registry пуст) ───────── */
type ParamDef = { min: number; max: number; step?: number; label?: string };

const DEFAULT_PARAMS: Record<string, Record<string, ParamDef>> = {
  object: {
    "A*": { min: 10, max: 1000, step: 10, label: "A*" },
    E: { min: 0, max: 1000, step: 10, label: "E" },
    exergy_cost: { min: 0, max: 10, step: 0.1, label: "exergy_cost" },
    infra_footprint: { min: 0, max: 10, step: 0.1, label: "infra_footprint" },
    hazard_rate: { min: 0, max: 1, step: 0.01, label: "hazard_rate" },
    topo: { min: 0, max: 3, step: 0.01, label: "topo" },
    witness_count: { min: 0, max: 500, step: 1, label: "witness_count" },
    map_x: { min: 0, max: 100, step: 1, label: "map_x" },
    map_y: { min: 0, max: 100, step: 1, label: "map_y" },
  },
  character: {
    will: { min: 0, max: 1, step: 0.01, label: "will" },
    loyalty: { min: 0, max: 1, step: 0.01, label: "loyalty" },
    stress: { min: 0, max: 1, step: 0.01, label: "stress" },
    resources: { min: 0, max: 1, step: 0.01, label: "resources" },
    competence: { min: 0, max: 1, step: 0.01, label: "competence" },
    risk_tolerance: { min: 0, max: 1, step: 0.01, label: "risk_tolerance" },
    mandate_power: { min: 0, max: 1, step: 0.01, label: "mandate_power" },
    dark_exposure: { min: 0, max: 1, step: 0.01, label: "dark_exposure" },
    topo: { min: 0, max: 3, step: 0.01, label: "topo" },
    map_x: { min: 0, max: 100, step: 1, label: "map_x" },
    map_y: { min: 0, max: 100, step: 1, label: "map_y" },
  },
};

/* ───────── tiny UI atoms ───────── */
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
        fontSize: 12,
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
  disabled?: boolean;
  highlighted?: boolean;
  onResetCanon?: () => void;
  onResetDefault?: () => void;
}) {
  const {
    k, label, min, max, step, val, onChange, hint, doc, disabled, highlighted, onResetCanon, onResetDefault,
  } = props;
  const id = `slider_${k}`;
  return (
    <div
      style={{
        padding: "10px 0",
        opacity: disabled ? 0.6 : 1,
        background: highlighted ? "rgba(140,180,255,0.06)" : "transparent",
        borderRadius: 6,
      }}
    >
      <Row>
        <label htmlFor={id} title={hint} style={{ width: 180, fontWeight: 600, cursor: "help" }}>
          {label}
        </label>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={val}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={val}
          disabled={disabled}
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
          >
            doc
          </a>
        ) : null}
        {disabled ? <span title="Заблокировано лором" style={{ fontSize: 12, opacity: 0.7, paddingLeft: 6 }}>🔒</span> : null}
        {onResetCanon ? (
          <button
            onClick={onResetCanon}
            title="Сброс к канону"
            style={{ marginLeft: 6, border: "1px solid #444", background: "#111", color: "#ddd", borderRadius: 6, padding: "2px 6px" }}
          >
            ↺C
          </button>
        ) : null}
        {onResetDefault ? (
          <button
            onClick={onResetDefault}
            title="Сброс к дефолту модели"
            style={{ marginLeft: 6, border: "1px solid #444", background: "#111", color: "#ddd", borderRadius: 6, padding: "2px 6px" }}
          >
            ↺D
          </button>
        ) : null}
      </Row>
      {hint ? <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

/* ───────── main ───────── */
export default function EntityPanel(props: Props) {
  const branch = props.branch;
  const viewTypePlural = (props.viewType || props.type || "objects") as string;
  const tkey = singular(String(viewTypePlural || props.meta?.type || "objects")); // 'object' | 'character' | ...
  const modelKey = props.meta?.model_ref || tkey;

  const registry = props.registry || ({} as RegistryT);
  const meta = props.meta || {};

  // параметры модели из registry с учётом extends/hybrid, иначе дефолты
  const registryModelParams =
    getParamDefs(registry, String(modelKey), String(tkey));

  const modelParams: Record<string, ParamDef> =
    registryModelParams && Object.keys(registryModelParams).length > 0
      ? registryModelParams
      : DEFAULT_PARAMS[tkey] || DEFAULT_PARAMS.object;

  // блокировки: глобальные и локальные
  const lockedGlobal = (registry as any)?.locks?.[tkey] || {};
  const lockedLocal = Array.isArray(meta.param_locked) ? new Set<string>(meta.param_locked) : new Set<string>();

  // baseline для сбросов
  const canonRef = useRef<Record<string, number>>({ ...(meta?.param_bindings ?? {}) });
  const defaultsRef = useRef<Record<string, number>>(
    Object.fromEntries(Object.entries(modelParams).map(([k, def]) => [k, Number(def.min)])),
  );

  // если сменились defs — обнови defaults для кнопки Defaults
  useEffect(() => {
    defaultsRef.current = Object.fromEntries(
      Object.entries(modelParams).map(([k, def]) => [k, Number(def.min)])
    );
    // не трогаем params, чтобы не затирать p= из URL
  }, [modelParams]);

  // старт: canon поверх дефолтов
  const [params, setParams] = useState<Record<string, number>>(() => ({
    ...defaultsRef.current,
    ...canonRef.current,
  }));

  // sandbox и импорт/экспорт
  const [ignoreLocks, setIgnoreLocks] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);
  const onImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const js = JSON.parse(String(reader.result));
        if (js && typeof js.params === "object") {
          setParams((s) => ({ ...s, ...js.params }));
        }
      } catch {
        /* no-op */
      }
    };
    reader.readAsText(file);
  }, []);
  const exportSnapshot = useCallback(() => {
    const data = JSON.stringify({ params }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = meta?.slug || meta?.title || "snapshot";
    a.download = `${base}-params.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [params, meta]);

  // URL p=
  useEffect(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    const u = dec<Record<string, number>>(q.get("p"));
    if (u && typeof u === "object") setParams((old) => ({ ...old, ...u }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    q.set("p", enc(params));
    const url = `${window.location.pathname}?${q.toString()}`;
    window.history.replaceState(null, "", url);
  }, [params]);

  // compute + simulate
  type ComputeFn = (m: any, r: any, b: string) => any;
  type SimFn = (m: any, days?: number) => any[];
  const COMPUTE: Record<string, ComputeFn> = {
    object: computeObject,
    character: computeCharacter,
    place: computeObject,
    protocol: computeObject,
    event: computeObject,
    document: computeObject,
  };
  const SIM: Record<string, SimFn> = {
    object: simulateObject,
    character: simulateCharacter,
    place: simulateObject,
    protocol: simulateObject,
    event: simulateObject,
    document: simulateObject,
  };
  const compute = COMPUTE[tkey] || computeObject;
  const simulate = SIM[tkey] || simulateObject;

  const metrics = useMemo(() => {
    const augmented = { ...meta, type: tkey, model_ref: modelKey, param_bindings: params };
    try {
      return compute(augmented, registry, branch) || {};
    } catch {
      return {};
    }
  }, [branch, meta, params, registry, tkey, modelKey, compute]);

  const sim = useMemo(() => simulate({ param_bindings: params }, 30), [simulate, params]);

  // подсказки и доки
  const hints = (meta?.param_hints ?? {}) as Record<string, string>;
  const docs = (meta?.param_docs ?? {}) as Record<string, string>;

  // UI фильтры и фокус
  const [showOnlyAdjustable, setShowOnlyAdjustable] = useState(true);
  const [scenarioFocus, setScenarioFocus] = useState<string>("");
  const relevant = useMemo(
    () => (scenarioFocus ? new Set(scenarioRelevantParams(tkey, scenarioFocus)) : null),
    [scenarioFocus, tkey],
  );

  const controls = useMemo(() => {
    const out: Array<{
      k: string;
      min: number;
      max: number;
      step: number;
      val: number;
      hint?: string;
      doc?: string;
      label: string;
      disabled: boolean;
      highlighted: boolean;
    }> = [];
    for (const [k, def] of Object.entries(modelParams)) {
      const disabled = !ignoreLocks && (lockedLocal.has(k) || !!(lockedGlobal?.[k]?.locked));
      if (showOnlyAdjustable && disabled) continue;
      out.push({
        k,
        min: Number(def.min),
        max: Number(def.max),
        step: Number(def.step ?? 1),
        val: Number(params[k] ?? def.min),
        hint: hints[k],
        doc: docs[k],
        label: def.label || k,
        disabled,
        highlighted: relevant ? relevant.has(k) : false,
      });
    }
    return out;
  }, [modelParams, params, hints, docs, showOnlyAdjustable, relevant, ignoreLocks, lockedLocal, lockedGlobal]);

  // пояснение
  const explain = useMemo(() => {
    if (tkey === "character") {
      const will = Number(params.will ?? 0.5);
      const comp = Number(params.competence ?? 0.5);
      const res = Number(params.resources ?? 0.5);
      const loy = Number(params.loyalty ?? 0.5);
      const infl = (will * 0.6 + comp * 0.6 + res * 0.4) * (0.7 + 0.3 * loy);
      const mon = 0.6 * Number(params.stress ?? 0.3) + 0.4 * Number(params.dark_exposure ?? 0.2);
      return [
        `Influence ≈ (0.6·will + 0.6·competence + 0.4·resources)·(0.7 + 0.3·loyalty) = ${fmt(infl, 3)}`,
        `Pr[monstro] ↑ от stress и dark_exposure = ${fmt(mon, 3)}`,
        `S = σ(α₁·Pv − α₂·Vσ − α₃·drift + α₄·topo).`,
      ];
    }
    const A = Number(params["A*"] ?? params.A_star ?? 100);
    const E = Number(params.E ?? params.E0 ?? 0);
    const dose = A ? E / A : 0;
    return [
      `dose = E / A* = ${fmt(dose, 3)} (целевое ≈ 1)`,
      `Vσ ↑ от exergy_cost, infra_footprint, hazard_rate и ошибок дозы`,
      `S = σ(1.2·Pv − 1.1·Vσ − 0.9·drift + 0.8·topo + 0.25·log(1+witness))`,
    ];
  }, [params, tkey]);

  // метрики для scatter
  const metricKeys = useMemo(() => {
    const base = ["Pv", "Vsigma", "S", "dose", "drift", "topo"];
    if (tkey === "character") base.push("influence", "monstro_pr");
    return base.filter((k) => k in (metrics || {}));
  }, [metrics, tkey]);

  const [xKey, setXKey] = useState<string>(metricKeys[0] ?? "Pv");
  const [yKey, setYKey] = useState<string>(metricKeys[1] ?? "Vsigma");

  useEffect(() => {
    if (!metricKeys.includes(xKey)) setXKey(metricKeys[0] ?? "Pv");
    if (!metricKeys.includes(yKey)) setYKey(metricKeys[1] ?? metricKeys[0] ?? "Vsigma");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKeys]);

  const path = sim.map((p) => ({
    x: Number((p as any)[xKey] ?? 0),
    y: Number((p as any)[yKey] ?? 0),
  }));
  const point = { x: Number((metrics as any)[xKey] ?? 0), y: Number((metrics as any)[yKey] ?? 0) };

  // годность сценариев
  const eligibility = useMemo(
    () => getEligibility(tkey, metrics as any, params, registry) ?? [],
    [tkey, metrics, params, registry],
  );

  // действия: сбросы и share
  const resetCanon = useCallback(() => setParams((s) => ({ ...s, ...canonRef.current })), []);
  const resetDefaults = useCallback(() => setParams({ ...defaultsRef.current }), []);
  const resetUrl = useCallback(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    q.delete("p");
    const url = `${window.location.pathname}?${q.toString()}`;
    window.history.replaceState(null, "", url);
    setParams((s) => ({ ...defaultsRef.current, ...canonRef.current }));
  }, []);
  const share = useCallback(() => {
    if (!isBrowser) return;
    const url = window.location.href;
    navigator?.clipboard?.writeText?.(url);
  }, []);

  // per-param reset
  const makeResetCanonFor = (k: string) => () =>
    setParams((s) => ({ ...s, [k]: canonRef.current[k] ?? s[k] }));
  const makeResetDefaultFor = (k: string, defMin: number) => () =>
    setParams((s) => ({ ...s, [k]: defMin }));

  /* ───────── render ───────── */
  return (
    <div className="entity-panel" style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
      {/* левая колонка: контролы */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{meta?.title ?? meta?.name ?? "card"}</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={resetCanon} title="Сбросить к канону сущности">Canon</button>
            <button onClick={resetDefaults} title="Сбросить к дефолтам модели">Defaults</button>
            <button onClick={resetUrl} title="Очистить p= в URL">Clear URL</button>
            <button onClick={share} title="Копировать URL">Share</button>
            <button onClick={exportSnapshot} title="Экспортировать параметры в JSON">Export</button>
            <button onClick={() => importRef.current?.click()} title="Импортировать параметры из JSON">Import</button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              onChange={onImportFile}
              style={{ display: "none" }}
            />
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Ветка: <code>{branch}</code> • Тип: <code>{tkey}</code> • Модель: <code>{modelKey}</code>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={showOnlyAdjustable}
              onChange={(e) => setShowOnlyAdjustable(e.target.checked)}
            />
            только регулируемые
          </label>

          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={ignoreLocks}
              onChange={(e) => setIgnoreLocks(e.target.checked)}
            />
            sandbox (игнорировать замки)
          </label>

          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            фокус:
            <select value={scenarioFocus} onChange={(e) => setScenarioFocus(e.target.value)} style={{ padding: "2px 6px" }}>
              <option value="">—</option>
              <option value="negotiation">переговоры</option>
              <option value="repair_nomonstr">ремонт без монстра</option>
              <option value="incident_localize">локализация инцидента</option>
            </select>
          </label>
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
            disabled={c.disabled}
            highlighted={c.highlighted}
            onResetCanon={makeResetCanonFor(c.k)}
            onResetDefault={makeResetDefaultFor(c.k, c.min)}
          />
        ))}
      </section>

      {/* правая колонка: метрики, графики, карта, годность */}
      <section>
        {/* метрики */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {"Pv" in (metrics || {}) && <Badge label="Pv" value={(metrics as any).Pv} hint="Предсказательная ценность" />}
          {"Vsigma" in (metrics || {}) && <Badge label="Vσ" value={(metrics as any).Vsigma} hint="Онтологический долг" />}
          {"S" in (metrics || {}) && <Badge label="S" value={(metrics as any).S} hint="Стабильность формы" />}
          {"dose" in (metrics || {}) && <Badge label="dose" value={(metrics as any).dose} hint="E/A*" />}
          {"drift" in (metrics || {}) && <Badge label="drift" value={(metrics as any).drift} hint="Дрейф" />}
          {"topo" in (metrics || {}) && <Badge label="topo" value={(metrics as any).topo} hint="Топологическая защита" />}
          {tkey === "character" && "influence" in (metrics || {}) && (
            <Badge label="Influence" value={(metrics as any).influence} hint="Влияние" />
          )}
          {tkey === "character" && "monstro_pr" in (metrics || {}) && (
            <Badge label="Pr[monstro]" value={(metrics as any).monstro_pr} hint="Риск монструозности" />
          )}
          {tkey === "object" && "risk_dry" in (metrics || {}) && (
            <Badge label="risk_dry" value={(metrics as any).risk_dry} hint="Переэкспозиция" />
          )}
          {tkey === "object" && "risk_decay" in (metrics || {}) && (
            <Badge label="risk_decay" value={(metrics as any).risk_decay} hint="Недокорм" />
          )}
        </div>

        {/* годность */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Годность по сценариям</div>
          <EligibilityBadges items={eligibility} />
        </div>

        {/* пояснение */}
        <div style={{ padding: 12, border: "1px solid var(--muted, #3d3d3d)", borderRadius: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Что происходит</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {explain.map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{s}</li>
            ))}
          </ul>
        </div>

        {/* графики */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <Spark data={sim} x="t" y="S" title="Стабильность S (30d)" />
          <RadarParams params={params} defs={modelParams} title="Профиль параметров" />
        </div>

        {/* scatter */}
        {metricKeys.length >= 1 ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <label>Scatter X:</label>
              <select value={xKey} onChange={(e) => setXKey(e.target.value)}>
                {metricKeys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <label>Y:</label>
              <select value={yKey} onChange={(e) => setYKey(e.target.value)}>
                {metricKeys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <Scatter2D
              path={path}
              currentPoint={point}
              xLabel={xKey}
              yLabel={yKey}
              title="Траектория (30d) и текущая точка"
            />
          </>
        ) : null}

        {/* карта */}
        <MapPin
          title="Локализация на карте"
          imageUrl={meta?.map?.image}
          x={Number(params.map_x ?? 50)}
          y={Number(params.map_y ?? 50)}
          onChange={(mx, my) => setParams((s) => ({ ...s, map_x: mx, map_y: my }))}
        />

        {/* справка */}
        <div style={{ marginTop: 12 }}>
          <MetricHelp />
        </div>

        {/* био */}
        {tkey === "character" && (meta?.bio || meta?.subtitle) ? (
          <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--muted, #3d3d3d)", borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Био</div>
            {meta?.subtitle ? <div style={{ opacity: 0.8, marginBottom: 6 }}>{meta.subtitle}</div> : null}
            {meta?.bio ? <div style={{ whiteSpace: "pre-wrap" }}>{meta.bio}</div> : null}
          </div>
        ) : null}

        {/* инспектор */}
        <details style={{ marginTop: 8 }}>
          <summary>Model inspector</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.85 }}>
{JSON.stringify({ branch, type: tkey, model: modelKey, params, metrics }, null, 2)}
          </pre>
        </details>
      </section>

      <style>{`
        .entity-panel button {
          border: 1px solid #444; background: #111; color: #ddd;
          padding: 6px 10px; border-radius: 8px; cursor: pointer;
        }
        .entity-panel button:hover { background: #151515; }
        input[type="range"] { accent-color: #8ad; }
        select { background: #111; color: #ddd; border: 1px solid #444; border-radius: 6px; padding: 4px 8px; }
        code { background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 4px; }
      `}</style>
    </div>
  );
}
