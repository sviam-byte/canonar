import mitt from 'mitt';
import { Registry, EntityRuntime, SnapshotPoint, BranchT } from './types';
import { computeDose, computePv, computeVsigma, computeStability, monstroPr } from './metrics';
import { CausalDAG } from './graph';

type ScenarioId =
  | 'exposure-plan' | 'witness-rally' | 'dark-layer'
  | 'chron-verify' | 'memory-mirror'
  | 'patch-plan' | 'localize-crack' | 'deduplicate'
  | 'causal-surgery' | 'andon-cord' | 'ethics-surcharge' | 'family-pr'
  | 'sector-shock' | 'infra-reroute' | 'blackstart-dryrun'
  | 'v-futures' | 'cvar-hedge' | 'apophenia-tax'
  | 'media-analyze' | 'topo-seal'
  | 'de-monster' | 'influence-pulse' | 'optionality-guard';

export interface ScenarioInput {
  id: ScenarioId;
  args: Record<string, any>;
  ttl?: number; // откатное окно
}

export interface ScenarioEffect {
  deltaParams?: Record<string, number>;
  deltaEdges?: Array<{ op:'add'|'remove'|'freeze', from:string, to:string, kind:string, weight?:number }>;
  note?: string;
}

export interface ScenarioResult {
  before: { Pv:number; Vsigma:number; S:number; monstro?:number };
  after:  { Pv:number; Vsigma:number; S:number; monstro?:number };
  diff:   { dPv:number; dVs:number; dS:number; dMonstro?:number };
  dryRunSeries?: SnapshotPoint[];
  effect?: ScenarioEffect;
}

export class ScenarioEngine {
  private bus = mitt();
  constructor(
    private registry: Registry,
    private branch: BranchT,
    private dag: CausalDAG
  ) {}

  on(event:'commit'|'rollback', handler: (payload:any)=>void) { this.bus.on(event, handler); }

  /** Главный вход: прогон сценария (симуляция) */
  simulate(entity: EntityRuntime, input: ScenarioInput): ScenarioResult {
    const before = this.metrics(entity);

    const eff = this.computeEffect(entity, input);
    const nextParams = { ...entity.params, ...(eff.deltaParams||{}) };

    // пересчёт показателей (без коммита)
    const Pv = computePv({ params: nextParams, branch: this.branch, hasChron:true, hasIris:this.branch!=='pre-borders' });
    const Vsigma = computeVsigma({ params: nextParams, branch: this.branch, causalPenalty: this.dag.causalPenalty() });
    const S = computeStability({ Pv, Vsigma, drift: entity.metrics.drift, topoBonus: nextParams['topo_class']||0, witnesses: nextParams['witness_count']||0, branch:this.branch });
    const monstro = entity.meta.type==='character' ? monstroPr(nextParams, this.dag.causalPenalty(), nextParams['loyalty']??0.5): undefined;

    const after = { Pv, Vsigma, S, monstro };

    return {
      before,
      after,
      diff: { dPv: Pv-before.Pv, dVs: Vsigma-before.Vsigma, dS: S-before.S, dMonstro: monstro!==undefined && before.monstro!==undefined ? (monstro-before.monstro) : undefined },
      dryRunSeries: undefined,
      effect: eff
    };
  }

  /** Коммитит изменения (если прошёл eligibility) и журналит */
  commit(entity: EntityRuntime, sim: ScenarioResult) {
    if (!sim.effect) return;
    // apply params
    if (sim.effect.deltaParams) Object.assign(entity.params, sim.effect.deltaParams);
    // apply edges
    sim.effect.deltaEdges?.forEach(ch=>{
      if (ch.op==='add') this.dag.addEdge({ from: ch.from, to: ch.to, kind: ch.kind, weight: ch.weight ?? 0.2 });
      if (ch.op==='remove') this.dag.removeEdge(ch.from, ch.to, ch.kind);
      if (ch.op==='freeze') this.dag.freezeEdge(ch.from, ch.to, ch.kind);
    });
    // refresh entity.metrics minimally (Pv/Vσ/S)
    const Pv = computePv({ params: entity.params, branch: this.branch, hasChron:true, hasIris:this.branch!=='pre-borders' });
    const Vsigma = computeVsigma({ params: entity.params, branch: this.branch, causalPenalty: this.dag.causalPenalty() });
    const S = computeStability({ Pv, Vsigma, drift: entity.metrics.drift, topoBonus: entity.params['topo_class']||0, witnesses: entity.params['witness_count']||0, branch:this.branch });
    const monstro = entity.meta.type==='character' ? monstroPr(entity.params, this.dag.causalPenalty(), entity.params['loyalty']??0.5): undefined;
    entity.metrics = { ...entity.metrics, Pv, Vsigma, S, monstroPr: monstro };

    this.bus.emit('commit', { entity_id: entity.meta.entity_id, effect: sim.effect, at: new Date().toISOString() });
  }

  rollback(entity: EntityRuntime, snapshot: EntityRuntime) {
    entity.params = { ...snapshot.params };
    entity.metrics = { ...snapshot.metrics };
    this.bus.emit('rollback', { entity_id: entity.meta.entity_id, at: new Date().toISOString() });
  }

  /** где вся логика сценариев живёт */
  private computeEffect(entity: EntityRuntime, input: ScenarioInput): ScenarioEffect {
    const p = entity.params;
    switch (input.id) {
      case 'exposure-plan': {
        // A*: целевая, q: качество свидетеля, v: недельный поток
        const { Astar, q=0.6, v=30 } = input.args;
        const deltaE = Math.max(0, v*q*0.8); // немного потерь
        return { deltaParams: { 'A*': Astar ?? p['A*'] ?? 100, 'E': (p['E']??0)+deltaE } };
      }
      case 'witness-rally': {
        const { quota=10, topoBoost=0.1 } = input.args;
        return { deltaParams: { 'witness_count': (p['witness_count']??0)+quota, 'topo_class': (p['topo_class']??0)+topoBoost } };
      }
      case 'dark-layer': {
        const { volume=1.0 } = input.args;
        return { deltaParams: { 'dLL': (p['dLL']??0)+0.15*volume, 'stress': (p['stress']??0)+0.05*volume } };
      }
      case 'chron-verify': {
        const { level=0.6 } = input.args;
        return { deltaParams: { 'dLL': (p['dLL']??0) + 0.3*level } };
      }
      case 'memory-mirror': {
        // снижает ρ (забывчивость) и увеличивает потолок v косвенно через dLogDetF
        const { strength=0.5 } = input.args;
        return { deltaParams: { 'dLogDetF': (p['dLogDetF']??0)+0.25*strength } };
      }
      case 'patch-plan': {
        const { R=1.0, skill=0.5, mode='localize' } = input.args;
        const dropVs = - Math.max(0.05, 0.2*R*skill) * (mode==='rewrite' ? 1.0 : 0.6);
        const gainPv = + Math.max(0.02, 0.12*R*skill);
        return { deltaParams: { 'infra_footprint': Math.max(0, (p['infra_footprint']??0)+dropVs), 'dLL': (p['dLL']??0)+gainPv } };
      }
      case 'localize-crack': {
        return { deltaParams: { 'cvar': Math.max(0, (p['cvar']??0) - 0.1), 'infra_footprint': (p['infra_footprint']??0)+0.05 } };
      }
      case 'deduplicate': {
        // параметр-маркер для препроцесса; здесь — лёгкий минус к infra
        return { deltaParams: { 'infra_footprint': Math.max(0, (p['infra_footprint']??0) - 0.15) } };
      }
      case 'causal-surgery': {
        const { op='add', from, to, weight=0.7, kind='causes' } = input.args;
        return { deltaEdges: [{ op, from, to, weight, kind }] };
      }
      case 'andon-cord': {
        // пауза — можно выставить блокирующий флаг (оставляю как пометку)
        return { note: 'Andon: paused' };
      }
      case 'ethics-surcharge': {
        const { factor=0.1 } = input.args;
        return { deltaParams: { 'l3': (p['l3']??1)+factor, 'l4': (p['l4']??1)+factor } };
      }
      case 'sector-shock': {
        const { strength=1.0 } = input.args;
        return { deltaParams: { 'cvar': (p['cvar']??0) + 0.3*strength } };
      }
      case 'infra-reroute': {
        const { gain=-0.2 } = input.args;
        return { deltaParams: { 'infra_footprint': Math.max(0, (p['infra_footprint']??0) + gain) } };
      }
      case 'blackstart-dryrun': {
        // делается вне сущности: см. мониторинг ΣVσ
        return { note: 'Blackstart dry-run scheduled' };
      }
      case 'media-analyze': {
        const { novelty=0.5 } = input.args;
        return { deltaParams: { 'dLogDetF': (p['dLogDetF']??0) + 0.2*novelty } };
      }
      case 'topo-seal': {
        const { windowBoost=0.3 } = input.args;
        return { deltaParams: { 'topo_class': (p['topo_class']??0) + windowBoost, 'infra_footprint': (p['infra_footprint']??0)+0.1 } };
      }
      case 'de-monster': {
        const { care=0.4 } = input.args;
        return { deltaParams: { 'stress': Math.max(0, (p['stress']??0) - 0.2*care) } };
      }
      case 'influence-pulse': {
        const { speech=0.5 } = input.args;
        return { deltaParams: { 'will': (p['will']??0) + 0.1*speech, 'resources': (p['resources']??0) - 0.05*speech } };
      }
      case 'optionality-guard': {
        return { note: 'Optionality guard flagged — requires conclave.' };
      }
      default: return {};
    }
  }

  private metrics(entity: EntityRuntime) {
    const Pv = entity.metrics.Pv, Vsigma = entity.metrics.Vsigma, S = entity.metrics.S;
    const monstro = entity.metrics.monstroPr;
    return { Pv, Vsigma, S, monstro };
  }
}
