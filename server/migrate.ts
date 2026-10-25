import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Sql } from './db';

export const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/** Aplica, em ordem e em transações, as migrations ainda não registradas. Retorna as aplicadas agora. */
export async function runMigrations(sql: Sql, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table schema_migrations enable row level security`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const content = readFileSync(join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    applied.push(file);
  }
  return applied;
}
