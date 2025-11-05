// src/components/EntityView.tsx
import React, { useMemo, useState, useEffect } from "react";
import ParamSlider from "@/ParamSlider";
import MetricBadge from "@/MetricBadge";
import { computeObject, computeCharacter, type RegistryT } from "@/lib/models";

// base64url кодек для query-параметра
const b64u = {
  enc: (obj: unknown) => {
    const json = JSON.stringify(obj);
    const utf8 = new TextEncoder().encode(json);
    const bin = Array.from(utf8, (b) => String.fromCharCode(b)).join("");
    const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  },
  dec: (s: string | null) => {
    if (!s) return null;
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  },
};

type Props = {
  branch: string;
  meta: any;           // meta из *.meta.json: { type, model_ref, param_bindings? ... }
  registry: RegistryT; // реестр моделей
};

const isBrowser = typeof window !== "undefined";

// дефолтные диапазоны
const DEFAULT_RANGES: Record<string, [number, number, number]> = {
  // character
  will: [0, 1, 0.01],
  loyalty: [0, 1, 0.01],
  stress: [0, 1, 0.01],
  resources: [0, 1, 0.01],
  competence: [0, 1, 0.01],
  risk_tolerance: [0, 1, 0.01],
  // object
  "A*": [10, 1000, 10],
  A_star: [10, 1000, 10],
  E: [0, 1000, 5],
  E0: [0, 1000, 5],
  q: [0, 1, 0.01],
  rho: [0.5, 0.999, 0.001],
  exergy_cost: [0, 3, 0.01],
  infra_footprint: [0, 3, 0.01],
  hazard_rate: [0, 1, 0.01],
  topo_class: [0, 5, 1],
  witness_count: [0, 200, 1],
};

export default function EntityView({ branch, meta, registry }: Props) {
  // старт из URL (только в браузере), затем из meta.param_bindings
  const initialFromQuery =
    isBrowser ? (b64u.dec(new URLSearchParams(window.location.search).get("p")) as Record<string, number> | null) : null;

  const startParams: Record<string, number> =
    initialFromQuery ??
    (meta?.param_bindings as Record<string, number> | undefined) ??
    {};

  const [params, setParams] = useState<Record<string, number>>(startParams);

  // синхронизация URL-снимка
  useEffect(() => {
    if (!isBrowser) return;
    const q = new URLSearchParams(window.location.search);
    q.set("p", b64u.enc(params));
    const url = `${window.location.pathname}?${q.toString()}`;
    window.history.replaceState(null, "", url);
  }, [params]);

  // расчёт метрик
  const metrics = useMemo(() => {
    const metaWithParams = { ...meta, param_bindings: params };
    if (meta.type === "character") {
      return computeCharacter(metaWithParams, registry as any, branch as any);
    }
    return computeObject(metaWithParams, registry as any, branch as any);
  }, [params, meta, registry, branch]);

  // построение контролов
  const controls = useMemo(() => {
    const modelId = meta?.model_ref;
    const regModel: any =
      (registry as any)?.models?.[modelId] || (registry as any)?.models?.[meta?.type];

    let keys: string[] = [];

    if (regModel?.params && typeof regModel.params === "object") {
      keys = Object.keys(regModel.params);
    } else if (meta?.param_bindings && typeof meta.param_bindings === "object") {
      keys = Object.keys(meta.param_bindings);
    } else if (meta?.type === "character") {
      keys = ["will", "loyalty", "stress", "resources", "competence", "risk_tolerance"];
    } else {
      keys = ["A*", "E", "q", "rho", "exergy_cost", "infra_footprint", "hazard_rate", "topo_class", "witness_count"];
      if (("A_star" in startParams) || !("A*" in startParams)) {
        keys = keys.map((k) => (k === "A*" ? "A_star" : k));
      }
      if (("E0" in startParams) || !("E" in startParams)) {
        keys = keys.map((k) => (k === "E" ? "E0" : k));
      }
    }

    const list: Array<[string, number, number, number]> = keys.map((k) => {
      const spec = regModel?.params?.[k];
      if (spec && typeof spec === "object") {
        const min = Number(spec.min ?? (DEFAULT_RANGES[k]?.[0] ?? 0));
        const max = Number(spec.max ?? (DEFAULT_RANGES[k]?.[1] ?? 1));
        const est = (max - min) / 100;
        const base = spec.step ?? (DEFAULT_RANGES[k]?.[2] ?? est);
        const step = Number(Number.isFinite(base) && base > 0 ? base : 0.01);
        return [k, min, max, step];
      }
      const [min, max, stepDef] = DEFAULT_RANGES[k] ?? [0, 1, 0.01];
      const est = (max - min) / 100;
      const step = Number(Number.isFinite(stepDef) && stepDef > 0 ? stepDef : est || 0.01);
      return [k, min, max, step];
    });

    return list.sort((a, b) => a[0].localeCompare(b[0]));
  }, [meta, registry, startParams]);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        {controls.map(([k, min, max, step]) => (
          <ParamSlider
            key={k}
            label={k}
            min={min}
            max={max}
            step={step}
            value={Number(params[k] ?? startParams[k] ?? (min + max) / 2)}
            onChange={(v) => setParams((s) => ({ ...s, [k]: v }))}
          />
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <MetricBadge label="Pv" value={metrics.Pv} />
          <MetricBadge label="Vσ" value={metrics.Vsigma} />
          <MetricBadge label="S" value={metrics.S} />
          <MetricBadge label="dose" value={metrics.dose} />
          <MetricBadge label="drift" value={metrics.drift} />
          <MetricBadge label="topo" value={metrics.topo} />
        </div>
        <div className="text-xs opacity-70">URL хранит снимок ползунков.</div>
      </div>
    </div>
  );
}
