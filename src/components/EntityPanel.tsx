// src/components/EntityPanel.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import type { RegistryT } from "@/lib/models";
import { computeCharacter, computeObject } from "@/lib/models";

type Props = {
  branch: string;
  meta: any;              // ожидает { title, type?, param_bindings?, param_hints?, param_docs? }
  registry: RegistryT;    // ожидает registry.models.{character|object}.params
};

// ---- helpers ---------------------------------------------------------------

const isBrowser = typeof window !== "undefined";
const σ = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

function enc(o: unknown): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  } catch {
    return "";
  }
}
function dec<T = unknown>(s: string | null): T | null {
  try {
    return s ? (JSON.parse(decodeURIComponent(escape(atob(s)))) as T) : null;
  } catch {
    return null;
  }
}
function fmt(x: number, d = 3) {
  return Number.isFinite(x) ? x.toFixed(d) : "—";
}
function singularize(t?: string) {
  if (!t) return "object";
  const s = t.toLowerCase();
  return s.endsWith("s") ? s.slice(0, -1) : s;
}

// ---- small UI atoms --------------------------------------------------------

function Row({ children }: { children: React.ReactNode }) {
  return <div className="row" style={{ display: "flex", gap: 12, alignItems: "center" }}>{children}</div>;
}
function Badge({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div
      className="badge"
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
}) {
  const { k, label, min, max, step, val, onChange, hint, doc } = props;
  const id = `slider_${k}`;
  return (
    <div className="param" style={{ padding: "10px 0" }}>
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

// ---- main panel ------------------------------------------------------------

export default function EntityPanel({ branch, meta, registry }: Props) {
  // тип и модель
  const tkey = singularize(meta?.type ?? "object");
  const model = registry?.models?.[tkey] ?? registry?.models?.object;

  // стартовые параметры: из meta.param_bindings; URL-слепок применяем только на клиенте
  const [params, setParams] = useState<Record<string, number>>(() => {
    const base = (meta?.param_bindings as Record<string, number>) ?? {};
    // заполняем дефолтами из модели, если есть
    if (model?.params) {
      for (const [k, def] of Object.entries(model.params)) {
        if (base[k] == null) base[k] = def.min;
      }
    }
    return base;
  });

  // применяем p= из URL на клиенте
  useEffect(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    const u = dec<Record<string, number>>(q.get("p"));
    if (u && typeof u === "object") {
      setParams((old) => ({ ...old, ...u }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // синхронизируем URL
  useEffect(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    q.set("p", enc(params));
    const url = `${window.location.pathname}?${q.toString()}`;
    window.history.replaceState(null, "", url);
  }, [params]);

  // пересчёт метрик
  const metrics = useMemo(() => {
    const augmented = { ...meta, param_bindings: params, type: tkey };
    return tkey === "character"
      ? computeCharacter(augmented, registry, branch)
      : computeObject(augmented, registry, branch);
  }, [branch, meta, params, registry, tkey]);

  // список контролов из реестра + хинты/доки из meta
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
    }> = [];
    const hints = (meta?.param_hints as Record<string, string>) ?? {};
    const docs = (meta?.param_docs as Record<string, string>) ?? {};
    const p = model?.params ?? {};
    for (const [k, def] of Object.entries(p)) {
      out.push({
        k,
        min: def.min,
        max: def.max,
        step: def.step ?? 1,
        val: Number(params[k] ?? def.min),
        hint: hints[k],
        doc: docs[k],
        label: k,
      });
    }
    return out;
  }, [meta, model?.params, params]);

  // быстрые формулы «что происходит»
  const explain = useMemo(() => {
    if (tkey === "character") {
      const will = Number(params.will ?? 0.5);
      const comp = Number(params.competence ?? 0.5);
      const res = Number(params.resources ?? 0.5);
      const loy = Number(params.loyalty ?? 0.5);
      const stress = Number(params.stress ?? 0.3);
      const infl = (will * 0.6 + comp * 0.6 + res * 0.4) * (0.7 + 0.3 * loy);
      return [
        `Влияние ≈ (0.6·will + 0.6·competence + 0.4·resources)·(0.7 + 0.3·loyalty) = ${fmt(infl, 3)}`,
        `Pv растёт с влиянием и падает при высоком stress.`,
        `Vσ растёт от stress и risk_tolerance.`,
        `S = σ(1.1·Pv − 1.0·Vσ − 0.8·drift + 0.7·topo).`,
      ];
    } else {
      const A = Number(params.A_star ?? params["A*"] ?? 100);
      const E = Number(params.E0 ?? params.E ?? 0);
      const dose = A ? E / A : 0;
      const risk_dry = Math.max(0, E - A) ** 2 * 0.001;
      const risk_decay = Math.max(0, A - E) * 0.002;
      return [
        `dose = E / A* = ${fmt(dose, 3)}. Цель — близко к 1.`,
        `Переэкспозиция: risk_dry = max(0, E − A*)² · 0.001 = ${fmt(risk_dry, 4)}.`,
        `Недокорм: risk_decay = max(0, A* − E) · 0.002 = ${fmt(risk_decay, 4)}.`,
        `Pv ↑ с качеством свидетелей q и числом свидетелей; Vσ ↑ от exergy_cost, infra_footprint, hazard_rate, ошибок дозы.`,
        `S = σ(1.2·Pv − 1.1·Vσ − 0.9·drift + 0.8·topo).`,
      ];
    }
  }, [params, tkey]);

  const reset = useCallback(() => {
    const base: Record<string, number> = {};
    if (model?.params) {
      for (const [k, def] of Object.entries(model.params)) base[k] = def.min;
    }
    setParams(base);
  }, [model?.params]);

  const share = useCallback(() => {
    if (!isBrowser) return;
    navigator.clipboard?.writeText(window.location.href);
  }, []);

  // реестр не найден
  if (!model?.params) {
    return (
      <div style={{ padding: 16, border: "1px solid #a33", borderRadius: 8, color: "#faa" }}>
        Не найден реестр параметров для типа <code>{tkey}</code>. Создай <code>src/data/models/registry.json</code> с
        ключами <code>character</code> и <code>object</code>.
      </div>
    );
  }

  // ---- UI ----
  return (
    <div className="entity-panel" style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
      {/* Левая колонка — параметры */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{meta?.title ?? meta?.name ?? "card"}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset}>Reset</button>
            <button onClick={share} title="Копировать URL со снимком ползунков">
              Share
            </button>
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          Ветка: <code>{branch}</code> • Тип: <code>{tkey}</code>
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

      {/* Правая колонка — метрики, объяснение, спарк */}
      <section>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <Badge label="Pv" value={metrics.Pv} hint="Предсказательная ценность" />
          <Badge label="Vσ" value={metrics.Vsigma} hint="Онтологический долг" />
          <Badge label="S" value={metrics.S} hint="Стабильность формы" />
          <Badge label="dose" value={metrics.dose} hint="Отношение E/A*" />
          <Badge label="drift" value={metrics.drift} hint="Дрейф кода при неверной дозе" />
          <Badge label="topo" value={metrics.topo} hint="Топологическая защита/память" />
        </div>

        <div style={{ padding: 12, border: "1px solid var(--muted, #3d3d3d)", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Что происходит</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {explain.map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Био и прочее для персонажа */}
        {tkey === "character" && (meta?.bio || meta?.subtitle) ? (
          <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--muted, #3d3d3d)", borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Био</div>
            {meta?.subtitle ? <div style={{ opacity: 0.8, marginBottom: 6 }}>{meta.subtitle}</div> : null}
            {meta?.bio ? <div style={{ whiteSpace: "pre-wrap" }}>{meta.bio}</div> : null}
          </div>
        ) : null}
      </section>

      {/* Небольшие стили по месту, чтобы не зависеть от Tailwind */}
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
