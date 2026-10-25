// Aplica as migrations de supabase/migrations no banco indicado por MIGRATION_DATABASE_URL.
// Use uma conexão com privilégio de DDL (ex.: "postgres"); a aplicação em produção usa o papel restrito.
import { existsSync } from 'node:fs';
import { createDb } from '../server/db';
import { runMigrations } from '../server/migrate';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error('Defina MIGRATION_DATABASE_URL (conexão com permissão de DDL) em .env.local ou no ambiente.');
  process.exit(1);
}

const sql = createDb(url);
try {
  const applied = await runMigrations(sql);
  console.log(applied.length ? `Migrations aplicadas:\n - ${applied.join('\n - ')}` : 'Banco já está atualizado.');
} catch (e) {
  console.error('Falha ao aplicar migrations:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
