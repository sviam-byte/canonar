import { useMemo } from "preact/hooks";
import SimChart from "./SimChart";
import { simulate } from "@/lib/sim";
import { mergeModel } from "@/lib/models";
import registry from "@/data/models/registry.json";
import { runFull } from "@/lib/sim_full";

type Scenario = {
  branch: string;
  slug: string;
  title: string;
  description?: string;
  entity: { type: string; model_ref?: string; param_bindings?: Record<string,number> };
  days: number;
  interventions: any[];
  engine?: "basic"|"full";
  policy?: any;
  noise?: any;
  state?: any;
  k?: any;
};

export default function ScenarioRunner({ scenario }: { scenario: Scenario }) {
  const modelKey = (scenario.entity.model_ref || scenario.entity.type) as string;
  const model = mergeModel(registry as any, modelKey);

  const params = {
    ...Object.fromEntries(Object.entries((model as any).params).map(([k,p]: any)=>[k,p.def])),
    ...(scenario.entity.param_bindings||{})
  };

  const weights = {
    lambda: { x:1, cvar:1, infra:0.7, causal:1.0, dose:0.6 },
    alpha:  { pv:1.5, vs:1.2, drift:0.8, topo:0.9, mw:0.6 },
    kappa:  0.4
  };

  const basic = useMemo(() => simulate({
    days: scenario.days,
    registry: registry as any,
    model,
    params,
    weights,
    topoClass: params["topo_class"] ? String(params["topo_class"]) : "none",
    Mw0: Math.log(1 + (params["witness_count"]||3))
  }, scenario.interventions), [scenario]);

  const full = useMemo(() => {
    if ((scenario.engine || "full") !== "full") return null;
    return runFull({
      title: scenario.title,
      days: scenario.days,
      branch: scenario.branch || "current",
      entity: scenario.entity,
      interventions: scenario.interventions || [],
      policy: scenario.policy,
      noise: scenario.noise,
      state: scenario.state,
      k: scenario.k
    } as any);
  }, [scenario]);

  const series = (full?.mean ?? basic) as any[];
  const x    = series.map((p:any)=>p.day);
  const S    = series.map((p:any)=>p.S);
  const Pv   = series.map((p:any)=>p.Pv);
  const Vs   = series.map((p:any)=>p.Vsigma);
  const dose = series.map((p:any)=>p.dose);

  return (
    <div class="space-y-4">
      {scenario.description && <p>{scenario.description}</p>}
      <SimChart series={{ x, lines: [
        { label: "S", values: S },
        { label: "Pv", values: Pv },
        { label: "Vσ", values: Vs },
      ]}} />
      <SimChart series={{ x, lines: [
        { label: "dose", values: dose },
      ]}} />
      {full?.bands && (
        <details open class="mt-2">
          <summary>Перцентильная полоса S (10–90%)</summary>
          <SimChart series={{ x, lines:[ { label:"S median", values: full.bands.S.p50 } ] }} />
        </details>
      )}
    </div>
  );
}
