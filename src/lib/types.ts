export type BranchT = 'pre-borders' | 'pre-rector' | 'current';

export type EntityTypeT = 'character' | 'object' | 'place' | 'protocol' | 'document' | 'event' | 'hybrid';

export type RelationKind =
  | 'causes' | 'caused-by'
  | 'participant' | 'owns' | 'owned-by'
  | 'source-of' | 'derived-from'
  | 'same-as' | 'conflicts-with';

export interface RelationEdge {
  from: string; // entity_id
  to: string;   // entity_id
  kind: RelationKind;
  weight?: number;     // для causal_penalty
  frozen?: boolean;    // заморожено Мечом
}

export interface MediaRef {
  type: 'image'|'audio'|'video';
  url: string;
  caption?: string;
  source?: string;
  dark?: boolean; // «тёмный слой»
}

export interface MetaAuthors { name: string; role?: string }

export interface EntityMeta {
  entity_id: string;         // UUID
  type: EntityTypeT;
  slug: string;              // ветвевой путь
  title: string;
  subtitle?: string;
  authors?: MetaAuthors[];
  year?: number | { start:number; end:number };
  source?: string;
  version_tags?: BranchT[];
  status?: 'draft'|'published'|'deprecated';
  tags?: string[];
  relations?: RelationEdge[];
  media?: MediaRef[];
  model_ref?: string;
  param_bindings?: Record<string, number>;     // дефолты/кэпы карточки
  param_locked?: string[];                     // запрещённые рычаги (лор/ветка)
  notes?: string;
  changelog?: { at:string; by:string; msg:string }[];
  coords?: { x:number; y:number } | null;      // для карты
}

export interface ModelParamDef {
  min: number; max: number; def: number; step?: number;
  unit?: string; explain?: string;
}
export interface ModelDef {
  key: string;
  extends?: string;             // поддержка «hybrid» и наследования
  params: Record<string, ModelParamDef>;
  thresholds?: Record<string, number>;
}

export interface Registry {
  branch: BranchT;
  models: Record<string, ModelDef>;
  locks?: Partial<Record<EntityTypeT, string[]>>;
  eligibility?: Record<string, unknown>; // см. eligibility.ts
  map?: { bounds:[number,number]; base:string };
  thresholds?: {
    blackstart: number;  // Vσ*
    monstro: number;     // порог «монстра»
  };
}

export interface SnapshotPoint {
  day: number;
  S: number;
  Pv: number;
  Vsigma: number;
  dose: number;
  drift: number;
}

export interface EntityRuntime {
  meta: EntityMeta;
  params: Record<string, number>;    // текущие значения
  metrics: {
    Pv: number; Vsigma: number; S: number; dose: number; drift: number; monstroPr?: number;
  };
}
