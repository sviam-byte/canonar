// src/lib/sim_full.ts
import { sigma, clamp, log1p } from "@/lib/metrics";

// — детерминированный rng (LCG)
function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0xffffffff);
}
const qtile = (arr: number[], q: number) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const i = clamp(Math.floor(q * (a.length - 1)), 0, a.length - 1);
  return a[i];
};

export type FullScenario = {
  title: string;
  days: number;
  entity: {
    type: string;               // "object" | "character" | "hybrid"
    model_ref?: string;
    param_bindings?: Record<string, number>;
  };
  branch?: "pre-borders"|"pre-rector"|"current";
  // стартовые состояния
  state?: { E?: number; A?: number; H?: number; R?: number; Mw?: number; Topo?: number; Cvar?: number };
  // константы процесса
  k?: {
    rho?: number;       // инерция E
    kA_decay?: number;  // распад A
    kH_leak?: number;   // утечка "влаги" H
    kR_wear?: number;   // износ надёжности от |dose-1|
    kC_decay?: number;  // распад Cvar
  };
  // политика управления дозой (PID по ошибке e = 1 - dose)
  policy?: {
    type: "pid";
    kp: number; ki: number; kd: number;
    A_bounds?: [number, number];
    du_max?: number;         // шаг изменения A за день
    settle_band?: number;    // полоса |dose-1|, в которой интегратор не растёт
  };
  // шум и количество прогонов для percentiles
  noise?: { sigmaE?: number; sigmaA?: number; seed?: number; repeats?: number };
  // интервенции (совместимы с вашим форматом + новые)
  interventions?: Array<
    | { t: number; kind: "exposure_plan"; Astar?: number; v?: number; q?: number; rho?: number }
    | { t: number; kind: "patch_plan"; R: number; s: number }
    | { t: number; kind: "witness_rally"; addMw?: number; addTopo?: number }
    | { t: number; kind: "shock"; cvarBoost: number; days: number }
    | { t: number; kind: "causal_surgery"; deltaC: number }
    | { t: number; kind: "reliability_boost"; dR: number }
    | { t: number; kind: "budget_cut"; dInfra: number; dExergy: number }
    | { t: number; kind: "auto_quarantine_at_S"; threshold: number } // если S<th — обнуляем v
  >;
};

export type FullSeries = {
  day: number;
  S: number; Pv: number; Vsigma: number;
  E: number; A: number; dose: number; R: number; Mw: number; Topo: number;
};

function computePv({ Mw, Topo, dose, R }:{Mw:number;Topo:number;dose:number;R:number}, branch:"pre-borders"|"pre-rector"|"current") {
  const memMult = branch === "pre-borders" ? 0.8 : branch === "pre-rector" ? 0.9 : 1.0;
  return 0.6 * log1p(Mw) * memMult + 0.4 * Topo - 0.25 * Math.abs(1 - dose) - 0.1 * (1 - R);
}
function computeVsigma({ exergy, infra, Cvar, dose, R }:{exergy:number;infra:number;Cvar:number;dose:number;R:number}) {
  const dosePen = Math.abs(1 - dose);
  return 0.45*exergy + 0.35*infra + 0.40*Cvar + 0.35*dosePen + 0.25*(1 - R);
}
function computeDrift({ hazard, exergy, infra, dose }:{hazard:number;exergy:number;infra:number;dose:number}) {
  return 0.5*hazard + 0.25*exergy + 0.2*infra + 0.15*Math.abs(1 - dose);
}
function computeS({Pv,Vsigma,drift,Topo,Mw,branch}:{Pv:number;Vsigma:number;drift:number;Topo:number;Mw:number;branch:"pre-borders"|"pre-rector"|"current"}) {
  const memMult = branch === "pre-borders" ? 0.4 : branch === "pre-rector" ? 0.7 : 1.0;
  return sigma(1.2*Pv - 1.1*Vsigma - 0.9*drift + 0.8*Topo + 0.25*log1p(Mw)*memMult);
}

export function runFullOnce(s: FullScenario): FullSeries[] {
  const days = s.days ?? 30;
  const branch = (s.branch || "current") as "pre-borders"|"pre-rector"|"current";

  // параметры и старт
  const k = { rho:0.985, kA_decay:0.02, kH_leak:0.01, kR_wear:0.08, kC_decay:0.15, ...(s.k||{}) };
  let E   = s.state?.E   ?? 60;
  let A   = s.state?.A   ?? 100;
  let H   = s.state?.H   ?? 0.5;
  let R   = s.state?.R   ?? 0.85;
  let Mw  = s.state?.Mw  ?? 0.3;
  let Topo= s.state?.Topo?? 0.2;
  let Cvar= s.state?.Cvar?? 0.3;

  let v = 20, q = 0.6, rho = k.rho!;
  let exergy = 0.8, infra = 0.4, hazard = 0.7, causal = 0.2;

  // управление (PID по A)
  const pol = s.policy || { type:"pid", kp:0.6, ki:0.05, kd:0.2, du_max:10, A_bounds:[10,1000], settle_band:0.03 };
  let I = 0, ePrev = 0;

  const noise = { sigmaE: s.noise?.sigmaE ?? 2.0, sigmaA: s.noise?.sigmaA ?? 1.0 };
  const rng = makeRng(s.noise?.seed ?? 1);

  // интервенции
  const schedule = new Map<number, FullScenario["interventions"]>();
  (s.interventions || []).forEach(iv => {
    if (!iv) return;
    const arr = schedule.get((iv as any).t) || [];
    arr.push(iv);
    schedule.set((iv as any).t, arr);
  });
  const activeShocks = new Map<number, number>(); // day_end -> cvarBoost
  let quarantine = false;

  const rows: FullSeries[] = [];
  for (let t=0; t<days; t++) {
    // применить интервенции
    (schedule.get(t) || []).forEach(iv => {
      if (iv!.kind === "exposure_plan") {
        if ("rho" in iv && typeof iv.rho === "number") rho = iv.rho!;
        if ("v"   in iv && typeof iv.v   === "number") v   = iv.v!;
        if ("q"   in iv && typeof iv.q   === "number") q   = iv.q!;
      } else if (iv!.kind === "patch_plan") {
        exergy = Math.max(0, exergy - 0.2 * iv.R * iv.s);
        infra  = Math.max(0, infra  - 0.05 * iv.R);
        R      = clamp(R + 0.05 * iv.R * iv.s, 0, 1);
      } else if (iv!.kind === "witness_rally") {
        Mw   = Math.max(0, Mw + (iv.addMw ?? 0.3));
        Topo = Topo + (iv.addTopo ?? 0.05);
      } else if (iv!.kind === "shock") {
        Cvar += iv.cvarBoost;
        activeShocks.set(t + iv.days, iv.cvarBoost);
      } else if (iv!.kind === "causal_surgery") {
        causal = Math.max(0, causal + iv.deltaC);
      } else if (iv!.kind === "reliability_boost") {
        R = clamp(R + iv.dR, 0, 1);
      } else if (iv!.kind === "budget_cut") {
        infra = Math.max(0, infra + iv.dInfra);
        exergy= Math.max(0, exergy + iv.dExergy);
      } else if (iv!.kind === "auto_quarantine_at_S") {
        // обработаем ниже после вычисления S на текущем шаге
      }
    });

    // процесс: E и A с шумом
    const dE = rho * E + (quarantine ? 0 : v*q) - E;
    E += dE + noise.sigmaE! * (rng() - 0.5);
    A += -k.kA_decay! * (A - 100) + noise.sigmaA! * (rng() - 0.5); // стремится к 100
    H += -k.kH_leak! * H + 0.02 * (1 - Math.abs(1 - E/Math.max(1, A))); // когда доза близка к 1, запас «влаги» восстанавливается
    A = clamp(A + 15 * H, pol.A_bounds?.[0] ?? 10, pol.A_bounds?.[1] ?? 2000);

    const dose = E / Math.max(1e-6, A);

    // PID по A: хотим dose≈1
    const e = 1 - dose;
    if (Math.abs(e) > (pol.settle_band ?? 0.03)) I += e; // анти-windup простым «мертвым коридором»
    const D = e - ePrev; ePrev = e;
    const dA = clamp(pol.kp*e + pol.ki*I + pol.kd*D, -(pol.du_max ?? 10), (pol.du_max ?? 10));
    A = clamp(A + dA, pol.A_bounds?.[0] ?? 10, pol.A_bounds?.[1] ?? 2000);

    // wear
    R = clamp(R - k.kR_wear! * Math.abs(1 - dose), 0, 1);

    // распад/окончание шоков
    if (activeShocks.has(t)) {
      Cvar = Math.max(0, Cvar - (activeShocks.get(t) || 0));
      activeShocks.delete(t);
    }
    Cvar = Math.max(0, Cvar * (1 - k.kC_decay!));

    // метрики
    const Pv = computePv({ Mw, Topo, dose, R }, branch);
    const Vsigma = computeVsigma({ exergy, infra, Cvar, dose, R });
    const drift = computeDrift({ hazard, exergy, infra, dose });
    const S = computeS({ Pv, Vsigma, drift, Topo, Mw, branch });

    // auto-quarantine check
    (schedule.get(t) || []).forEach(iv => {
      if (iv!.kind === "auto_quarantine_at_S" && S < iv.threshold) quarantine = true;
    });

    rows.push({ day:t, S, Pv, Vsigma, E, A, dose, R, Mw, Topo });
  }
  return rows;
}

export function runFull(s: FullScenario) {
  const reps = Math.max(1, Math.floor(s.noise?.repeats ?? 1));
  if (reps === 1) return { mean: runFullOnce(s) };

  const bags: FullSeries[][] = [];
  for (let r=0; r<reps; r++) bags.push(runFullOnce({ ...s, noise:{ ...(s.noise||{}), seed:(s.noise?.seed||1)+r } }));

  const days = bags[0].length;
  const mean: FullSeries[] = [];
  const p10: number[] = [], p90: number[] = [], p50: number[] = [];
  for (let t=0; t<days; t++) {
    const Sarr = bags.map(b => b[t].S);
    const Pv   = bags.map(b => b[t].Pv);
    const Vs   = bags.map(b => b[t].Vsigma);
    const E    = bags.map(b => b[t].E);
    const A    = bags.map(b => b[t].A);
    const dose = bags.map(b => b[t].dose);

    mean.push(bags[0][t]); // любое – структура одинаковая, ниже не используется
    p10.push(qtile(Sarr, 0.10)); p50.push(qtile(Sarr, 0.50)); p90.push(qtile(Sarr, 0.90));
  }
  return { mean, bands:{ S:{ p10, p50, p90 } } };
}
