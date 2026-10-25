import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type TestPostgres } from '../helpers/pg';
import { createDb, type Sql } from '../../server/db';

let pg: TestPostgres;
let app: Sql;

beforeAll(async () => {
  pg = await startPostgres();
  app = createDb(pg.appUrl);
});
afterAll(async () => {
  await app?.end({ timeout: 2 });
  await pg?.stop();
});

describe('banco real: migrations, papel restrito e RLS', () => {
  it('aplica as migrations em um PostgreSQL real', async () => {
    const [v] = await pg.admin<{ v: string }[]>`select version() as v`;
    expect(v!.v).toMatch(/PostgreSQL/);
    const tables = await pg.admin<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`;
    expect(tables.map((t) => t.tablename)).toEqual(
      expect.arrayContaining(['invitations', 'responses', 'availability_slots', 'attempt_events', 'admin_credentials']),
    );
  });

  it('RLS está habilitada em todas as tabelas do app', async () => {
    const rows = await pg.admin<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
  });

  it('o papel da aplicação lê e grava, mas não executa DDL nem é superusuário', async () => {
    await app`select count(*) from invitations`;
    await expect(app.unsafe('create table hacked (id int)')).rejects.toThrow();
    await expect(app.unsafe('drop table invitations')).rejects.toThrow();
    const [r] = await app<{ rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean }[]>`
      select rolsuper, rolbypassrls, rolcreaterole from pg_roles where rolname = current_user`;
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false });
  });

  it('um papel sem policy (como anon/authenticated do Supabase) não vê nenhuma linha', async () => {
    await pg.admin.unsafe(`
      insert into invitations (token, name, opening_message, question)
      values ('${'x'.repeat(43)}', 'Teste RLS', 'Oi', 'Pergunta?');
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon_sim') then
          create role anon_sim login password 'anon_sim_pw';
        end if;
      end $$;
      grant usage on schema public to anon_sim;
      grant select on invitations to anon_sim;`);
    const anon = createDb(`postgres://anon_sim:anon_sim_pw@127.0.0.1:${pg.port}/entre_nos`);
    try {
      const rows = await anon`select * from invitations`;
      expect(rows).toHaveLength(0); // RLS ligada e sem policy: nada visível
    } finally {
      await anon.end({ timeout: 1 });
    }
    const asApp = await app`select count(*)::int as n from invitations`;
    expect(asApp[0]!.n).toBe(1); // o papel da app vê (policy específica)
  });

  it('recusa TLS desativado fora do localhost', () => {
    expect(() => createDb('postgres://u:p@db.example.com:5432/postgres?sslmode=disable')).toThrow(/sslmode=disable/);
  });
});
