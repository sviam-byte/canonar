import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT = join(ROOT, 'content');  // положи все {slug}.meta.json сюда
const OUT = join(ROOT, 'public', 'gen');
await fs.mkdir(OUT, { recursive: true });

const Meta = z.object({
  entity_id: z.string().uuid().optional(),
  type: z.enum(['character','object','place','protocol','document','event','hybrid']),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  version_tags: z.array(z.enum(['pre-borders','pre-rector','current'])).optional(),
  tags: z.array(z.string()).optional(),
  relations: z.array(z.object({
    from: z.string(), to:z.string(), kind:z.string(), weight: z.number().optional(), frozen: z.boolean().optional()
  })).optional(),
  media: z.array(z.object({
    type: z.enum(['image','audio','video']),
    url: z.string(), caption: z.string().optional(), source: z.string().optional(), dark: z.boolean().optional()
  })).optional(),
  model_ref: z.string().optional(),
  param_bindings: z.record(z.number()).optional(),
  param_locked: z.array(z.string()).optional(),
  coords: z.object({x:z.number(), y:z.number()}).nullable().optional()
});

const files = (await fs.readdir(CONTENT)).filter(f=>f.endsWith('.meta.json'));
const index = [];

for (const f of files) {
  const raw = await fs.readFile(join(CONTENT, f), 'utf8');
  const json = JSON.parse(raw);
  const meta = Meta.parse(json);

  // автозаполнение UUID
  if (!meta.entity_id) {
    meta.entity_id = randomUUID();
    await fs.writeFile(join(CONTENT, f), JSON.stringify(meta, null, 2), 'utf8');
  }

  // быстрый интегрити-чек: заблокированные рычаги должны существовать в модели — проверка уже на клиенте
  index.push({ entity_id: meta.entity_id, slug: meta.slug, type: meta.type, title: meta.title, tags: meta.tags||[] });
  await fs.writeFile(join(OUT, `${meta.entity_id}.json`), JSON.stringify(meta), 'utf8');
}

await fs.writeFile(join(OUT, `index.json`), JSON.stringify(index), 'utf8');
console.log(`✔ prebuild: ${index.length} entities → /public/gen`);
