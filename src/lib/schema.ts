import { z } from "zod";

export const MetaCommon = z.object({
  entity_id: z.string().uuid(),
  type: z.enum(["character","object","place","protocol","event","document"]),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  authors: z.array(z.object({ name: z.string(), role: z.string().optional() })).default([]),
  year: z.union([z.number(), z.object({ from: z.number(), to: z.number() })]),
  version_tags: z.array(z.string()),
  status: z.enum(["draft","published","deprecated"]).default("published"),
  tags: z.array(z.string()).default([]),
  relations: z.array(z.object({ entity_id: z.string().optional(), type: z.string() })).default([]),
  media: z.array(z.object({ src: z.string(), caption: z.string().optional(), kind: z.string().optional() })).default([]),
  model_ref: z.string().default("default"),
  param_bindings: z.record(z.any()).default({}),
  notes: z.string().optional(),
  changelog: z.array(z.object({ by: z.string(), msg: z.string(), ts: z.string() })).default([])
});
export type MetaCommonT = z.infer<typeof MetaCommon>;
