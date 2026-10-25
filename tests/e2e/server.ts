import { createServer, type Server } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import bcrypt from 'bcryptjs';
import { createApp } from '../../server/app';
import { createDb, type Sql } from '../../server/db';
import { serveNode } from '../../server/nodeAdapter';
import { normalizeAnswer } from '../../server/auth';
import { startPostgres, type TestPostgres } from '../helpers/pg';
import type { Config } from '../../server/config';

export const E2E_ADMIN = {
  username: 'admin-e2e',
  password: 'senha-e2e-123456',
  email: 'admin-e2e@exemplo.test',
  q1: 'Qual o nome do pet?',
  a1: 'Pipoca',
  q2: 'Qual a cidade?',
  a2: 'Curitiba',
  sessionSecret: 'segredo-de-sessao-para-testes-com-32-chars-ou-mais',
};

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
};

export interface E2ETestServer {
  url: string;
  sql: Sql;
  pg: TestPostgres;
  stop: () => Promise<void>;
}

export async function startE2EServer(port = 8899): Promise<E2ETestServer> {
  const pg = await startPostgres();
  const sql = createDb(pg.appUrl);
  const appUrl = `http://127.0.0.1:${port}`;

  const cfg: Config = {
    databaseUrl: pg.appUrl,
    appUrl,
    isProduction: false,
    adminEmail: E2E_ADMIN.email,
    adminUsername: E2E_ADMIN.username,
    adminInitialPasswordHash: bcrypt.hashSync(E2E_ADMIN.password, 4),
    recoveryQuestions: [E2E_ADMIN.q1, E2E_ADMIN.q2],
    recoveryAnswerHashes: [
      bcrypt.hashSync(normalizeAnswer(E2E_ADMIN.a1), 4),
      bcrypt.hashSync(normalizeAnswer(E2E_ADMIN.a2), 4),
    ],
    sessionSecret: E2E_ADMIN.sessionSecret,
    resendApiKey: null, // modo local sem chave (registra skipped de forma segura)
    emailFrom: 'Entre Nós <onboarding@resend.dev>',
  };

  const app = createApp({
    getConfig: () => cfg,
    getSql: () => sql,
  });

  const distDir = join(process.cwd(), 'dist');

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', appUrl);

    // Rota da API
    if (url.pathname.startsWith('/api/')) {
      serveNode(app, req, res).catch((err) => {
        console.error('[e2e api error]', err);
        res.writeHead(500).end();
      });
      return;
    }

    // Servir arquivos estáticos do Vite dist/
    let filePath = join(distDir, url.pathname);
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(distDir, 'index.html'); // SPA fallback
    }

    try {
      const data = readFileSync(filePath);
      const ext = extname(filePath);
      const mime = MIME_MAP[ext] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': mime });
      res.end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    url: appUrl,
    sql,
    pg,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await sql.end({ timeout: 2 }).catch(() => {});
      await pg.stop().catch(() => {});
    },
  };
}
