import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { createDb, type Sql } from '../../server/db';
import { runMigrations } from '../../server/migrate';

export interface TestPostgres {
  /** conexão privilegiada (DDL), usada só para migrar/preparar dados */
  admin: Sql;
  /** conexão do papel restrito entre_nos_app — a mesma que a aplicação usa em produção */
  appUrl: string;
  adminUrl: string;
  port: number;
  stop: () => Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const APP_PASSWORD = 'app_test_password';

/** Sobe um PostgreSQL REAL (binários oficiais via embedded-postgres), aplica as migrations e habilita o papel da app. */
export async function startPostgres(): Promise<TestPostgres> {
  const dir = mkdtempSync(join(tmpdir(), 'entre-nos-pg-'));
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres_test_password',
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('entre_nos');

  const adminUrl = `postgres://postgres:postgres_test_password@127.0.0.1:${port}/entre_nos`;
  const admin = createDb(adminUrl);
  await runMigrations(admin);
  await admin.unsafe(`alter role entre_nos_app with login password '${APP_PASSWORD}'`);

  return {
    admin,
    adminUrl,
    appUrl: `postgres://entre_nos_app:${APP_PASSWORD}@127.0.0.1:${port}/entre_nos`,
    port,
    stop: async () => {
      await admin.end({ timeout: 2 }).catch(() => {});
      await pg.stop().catch(() => {});
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
