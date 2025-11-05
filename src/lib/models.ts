export type RegistryT = {
  models: Record<string, { params: Record<string, {min:number,max:number,step?:number}> }>;
};

type MetaT = {
  param_bindings?: Record<string,number>;
  type?: "object"|"character";
};

const clamp = (x:number,min:number,max:number)=>Math.min(max,Math.max(min,x));
const σ = (x:number)=>1/(1+Math.exp(-x));

export function computeObject(meta:MetaT, _registry:RegistryT, _branch:string){
  const p = meta.param_bindings ?? {};
  const A = Number(p.A_star ?? p["A*"] ?? 100);
  const E = Number(p.E0 ?? p.E ?? 0);
  const q = Number(p.q ?? 0.5);
  const rho = Number(p.rho ?? 0.98);
  const ex = Number(p.exergy_cost ?? 0.5);
  const infra = Number(p.infra_footprint ?? 0.2);
  const hz = Number(p.hazard_rate ?? 0.1);
  const w = Number(p.witness_count ?? 0);
  const topoC = Number(p.topo_class ?? 0.2);
  const cpen = Number(p.causal_penalty ?? 0.0);
  const alpha = Number(p.cvar_alpha ?? 0.05);
  const dark = Number(p.dark_flag ?? 0);

  // внимание
  const dose = A ? E/A : 0;
  const risk_dry = Math.max(0, E - A) ** 2 * 0.001;
  const risk_decay = Math.max(0, A - E) * 0.002;

  // Pv: информация + свидетели
  const Pv = clamp(0.15 + 0.55*q + Math.log1p(w)*0.04 - 0.1*dark, 0, 3);

  // Vσ: эксергия, инфра, хвостовой риск и причинность
  const Vsigma = clamp(ex*0.45 + infra*0.35 + hz*(0.5+alpha) + cpen*0.6 + risk_dry + 0.5*risk_decay, 0, 5);

  // устойчивость
  const topo = Math.log1p(w) * 0.15 + topoC;
  const drift = Math.abs(dose - 1) * (1-rho) * 2.0; // чем хуже память (rho), тем больше дрейф
  const S = σ( 1.25*Pv - 1.15*Vsigma - 0.9*drift + topo*0.9 - 0.2*dark );

  return { Pv, Vsigma, S, dose, drift, topo, risk_dry, risk_decay };
}

export function computeCharacter(meta:MetaT, _registry:RegistryT, _branch:string){
  const p = meta.param_bindings ?? {};
  const will = Number(p.will ?? 0.5);
  const loyalty = Number(p.loyalty ?? 0.5);
  const stress = Number(p.stress ?? 0.3);
  const resources = Number(p.resources ?? 0.4);
  const competence = Number(p.competence ?? 0.5);
  const risk_tolerance = Number(p.risk_tolerance ?? 0.4);
  const mandate_power = Number(p.mandate_power ?? 0.3);
  const dark_exposure = Number(p.dark_exposure ?? 0);

  const influence = (will*0.55 + competence*0.6 + resources*0.45 + mandate_power*0.5) * (0.7 + 0.3*loyalty);
  const Pv = clamp(0.25 + 0.95*influence - 0.2*stress, 0, 4);
  const Vsigma = clamp(0.35*stress + 0.35*risk_tolerance + 0.2*dark_exposure, 0, 4);
  const drift = stress*0.35 + (1-loyalty)*0.25;
  const topo = 0.2 + 0.45*loyalty;
  const monstro_pr = σ(1.6*stress + 0.8*dark_exposure - 1.1*loyalty);
  const S = σ( 1.15*Pv - 1.0*Vsigma - 0.85*drift + topo*0.75 - 0.3*monstro_pr );

  return { Pv, Vsigma, S, dose:1, drift, topo, influence, monstro_pr };
}

// краткое объяснение для UI
export function explainObject(meta:MetaT, r:RegistryT, b:string){
  const p = meta.param_bindings ?? {};
  const m = computeObject(meta, r, b);
  const tips:string[] = [];
  if ((p.E0 ?? 0) > (p.A_star ?? 100)) tips.push("Пересушка: E > A* повышает риск_dry и долг Vσ.");
  else tips.push("Недокорм: A* > E повышает risk_decay и дрейф.");
  if ((p.q ?? 0.5) >= 0.7) tips.push("Качество свидетеля повышает Pv.");
  if ((p.causal_penalty ?? 0) > 0) tips.push("Штраф по причинности увеличивает Vσ и снижает S.");
  if ((p.witness_count ?? 0) > 50) tips.push("Свидетели увеличивают topo и стабилизируют форму.");
  if ((p.dark_flag ?? 0) > 0) tips.push("Тёмный слой увеличивает долг и снижает устойчивость.");
  tips.push(`Итог: S=${m.S.toFixed(3)} при Pv=${m.Pv.toFixed(3)} и Vσ=${m.Vsigma.toFixed(3)}.`);
  return tips;
}

export function explainCharacter(meta:MetaT, r:RegistryT, b:string){
  const p = meta.param_bindings ?? {};
  const m = computeCharacter(meta, r, b);
  const tips:string[] = [];
  if ((p.stress ?? 0) > 0.6) tips.push("Высокий стресс повышает долг и дрейф.");
  if ((p.loyalty ?? 0.5) < 0.4) tips.push("Низкая лояльность повышает дрейф и риск «монстра».");
  if ((p.mandate_power ?? 0) > 0.5) tips.push("Мандат усиливает influence и Pv.");
  if ((p.dark_exposure ?? 0) > 0) tips.push("Контакт с тёмным слоем повышает риск монструозности.");
  tips.push(`Влияние=${m.influence.toFixed(3)}, Pr[monstro]=${m.monstro_pr.toFixed(3)}, S=${m.S.toFixed(3)}.`);
  return tips;
}
