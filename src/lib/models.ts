import type { MetaCommonT } from "./schema";

export type Branch = "pre-borders" | "pre-rector" | "current";
export type RegistryT = {
  coeff: any; branchCaps: Record<string,{rho:number; vMax:number; muM:number; kappa:number;}>;
};

export type Metrics = { dose:number; risk_dry:number; risk_decay:number; Pv:number; Vsigma:number; S:number; drift:number; topo:number; };
const clamp = (x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));

export function computeObject(meta: MetaCommonT, reg: RegistryT, branch: Branch): Metrics {
  const p = meta.param_bindings; const caps = reg.branchCaps[branch];
  const A_star = p.A_star ?? 100, E0 = p.E0 ?? 0, q = clamp(p.q ?? 0.6), rho = p.rho ?? caps.rho;
  const v = Math.min(p.v ?? 0, caps.vMax); const Et = rho*E0 + v*q;
  const dose = Et/Math.max(1e-9,A_star);
  const risk_dry = Math.max(0, Et - A_star)**2, risk_decay = Math.max(0, A_star - Et);
  const kappa = reg.coeff.Pv?.kappa ?? 0.4, dLL = p.dLL ?? 0, dLogDetF = p.dLogDetF ?? 0;
  const Pv = dLL + kappa*dLogDetF;
  const lam = reg.coeff.Vsigma ?? {}; const X = p.exergy_cost ?? 0, CVaR = p.CVaR ?? (p.hazard_rate ?? 0)*3;
  const Hinfra = p.infra_footprint ?? 0, Ccausal = p.causal_penalty ?? 0, Pi = risk_dry + 0.5*risk_decay;
  const Vsigma = (lam.lambda1??1)*X+(lam.lambda2??1)*CVaR+(lam.lambda3??1)*Hinfra+(lam.lambda4??1)*Ccausal+(lam.lambda5??1)*Pi;
  const Mw = Math.log(1 + (p.witness_count ?? 0)) * (reg.branchCaps[branch].muM ?? 0);
  const topo = (p.topo_class ? 0.4 : 0.1) + 0.1*Mw;
  const drift = (p.drift0 ?? 0) + (p.eta ?? 0.5)*Math.abs(dose-1);
  const Ssig = reg.coeff.S ?? {}; const Slin = (Ssig.alpha1??1)*Pv - (Ssig.alpha2??1)*Vsigma - (Ssig.alpha3??1)*drift + (Ssig.alpha4??1)*topo + (Ssig.alpha5??1)*Mw;
  const S = 1/(1+Math.exp(-Slin));
  return { dose, risk_dry, risk_decay, Pv, Vsigma, S, drift, topo };
}

export function computeCharacter(meta: MetaCommonT, reg: RegistryT, branch: Branch): Metrics {
  const p = meta.param_bindings;
  const will=clamp(p.will??0.5), res=clamp(p.resources??0.5), comp=clamp(p.competence??0.5), loyalty=clamp(p.loyalty??0.5), stress=clamp(p.stress??0.5);
  const centrality = p.centrality ?? 0.6;
  const Pv = centrality * (will*0.5 + comp*0.5);
  const Vsigma = (1 - loyalty)*0.8 + stress*0.6 + (p.causal_penalty ?? 0);
  const topo = 0.2 + (p.trust_links ?? 0)*0.05;
  const drift = 0.3*stress + 0.2*(1-loyalty);
  const Slin = Pv - Vsigma - drift + topo; const S = 1/(1+Math.exp(-Slin));
  return { dose:1, risk_dry:0, risk_decay:0, Pv, Vsigma, S, drift, topo };
}
