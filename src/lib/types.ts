// src/lib/types.ts
export type ParamDef = { min: number; max: number; step?: number; label?: string };
export type ModelDef = { params: Record<string, ParamDef>; extends?: string };
export type ModelsMap = Record<string, ModelDef>;

export type LocksMap = Record<
  string,                    // тип: "character" | "object" | ...
  Record<string, { locked: boolean; reason?: string }>
>;

export type EligibilityCfg = {
  negotiation?: { corridor_min?: number; visibility?: boolean };
  repair_nomonstr?: { bootstrap_min?: number; monstro_pr_max?: number };
  incident_localize?: { localize_min?: number };
  [k: string]: Record<string, number | boolean> | undefined;
};

export type RegistryT = {
  models: ModelsMap;
  locks?: LocksMap;
  eligibility?: EligibilityCfg;
  thresholds?: { monstro?: number };
  map?: any;
};
