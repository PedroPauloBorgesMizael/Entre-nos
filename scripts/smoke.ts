/**
 * Smoke test autônomo da API catch-all do Entre Nós.
 * Executa sem serviços externos e sem abrir conexões de banco de dados,
 * validando o roteamento da Vercel, middlewares de segurança e tratamento de erros.
 *
 * Execução: npm run smoke
 */
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';
import type { Config } from '../server/config';
import type { Sql } from '../server/db';

const MOCK_CONFIG: Config = {
  databaseUrl: 'postgres://localhost/smoke_test',
  appUrl: 'https://entre-nos.vercel.app',
  isProduction: true,
  adminEmail: 'admin@entre-nos.local',
  adminUsername: 'admin',
  adminInitialPasswordHash: '$2a$12$e8kZ1qW8kZ1qW8kZ1qW8kOe8kZ1qW8kZ1qW8kZ1qW8kZ1qW8kZ1qW',
  recoveryQuestions: ['Qual o seu livro favorito?', 'Em qual cidade você nasceu?'],
  recoveryAnswerHashes: [
    '$2a$12$e8kZ1qW8kZ1qW8kZ1qW8kOe8kZ1qW8kZ1qW8kZ1qW8kZ1qW8kZ1qW',
    '$2a$12$e8kZ1qW8kZ1qW8kZ1qW8kOe8kZ1qW8kZ1qW8kZ1qW8kZ1qW8kZ1qW',
  ],
  sessionSecret: 'smoke-test-secret-key-with-more-than-32-characters-length!',
  resendApiKey: null,
  emailFrom: 'Entre Nós <onboarding@resend.dev>',
};

function createSmokeSql(): Sql {
  const fn: any = async (strings: TemplateStringsArray, ..._values: any[]) => {
    const q = strings.join('?');
    if (q.includes('from invitations where token')) {
      return [
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Convidado Smoke Test',
          opening_message: 'Mensagem de abertura do smoke test',
          photo_enabled: false,
          status: 'active',
          question: 'Onde prefere?',
          suggestion_mode: 'place',
          suggestion_options: ['Café', 'Jantar'],
        },
      ];
    }
    if (q.includes('from responses where invitation_id')) return [];
    if (q.includes('from availability_slots')) {
      return [{ id: '00000000-0000-0000-0000-000000000002', starts_at: new Date(Date.now() + 86400000) }];
    }
    if (q.includes('record_no_attempt')) return [{ status: 'recorded' }];
    if (q.includes('from auth_throttle')) return [{ wait: 0, failures: 0, last_failure_at: null }];
    if (q.includes('from admin_credentials')) return [];
    return [];
  };
  fn.begin = async (cb: any) => cb(fn);
  fn.end = async () => {};
  return fn as Sql;
}

const app = createApp({
  getConfig: () => MOCK_CONFIG,
  getSql: () => createSmokeSql(),
});

interface RouteCheck {
  name: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  expectedStatus: number;
}

const CHECKS: RouteCheck[] = [
  {
    name: 'GET convite ativo com token válido (32+ chars)',
    method: 'GET',
    path: '/api/invite/valid_token_for_smoke_test_32_chars',
    expectedStatus: 200,
  },
  {
    name: 'GET convite com token curto (deve retornar 404 imediato sem expor rota)',
    method: 'GET',
    path: '/api/invite/token-muito-curto',
    expectedStatus: 404,
  },
  {
    name: 'POST tentativa botão Não com payload válido',
    method: 'POST',
    path: '/api/invite/valid_token_for_smoke_test_32_chars/attempt',
    headers: { 'content-type': 'application/json' },
    body: { eventId: randomUUID() },
    expectedStatus: 202,
  },
  {
    name: 'POST login com credenciais incorretas (validação bcrypt e 401)',
    method: 'POST',
    path: '/api/admin/login',
    headers: {
      'content-type': 'application/json',
      origin: 'https://entre-nos.vercel.app',
      'x-requested-with': 'entre-nos',
    },
    body: { username: 'admin', password: 'senha-incorreta-smoke' },
    expectedStatus: 401,
  },
  {
    name: 'POST login sem cabeçalhos CSRF (deve retornar 403 Forbidden)',
    method: 'POST',
    path: '/api/admin/login',
    headers: { 'content-type': 'application/json' },
    body: { username: 'admin', password: 'qualquer-senha' },
    expectedStatus: 403,
  },
  {
    name: 'GET perguntas de recuperação (acesso público para tela de recuperação)',
    method: 'GET',
    path: '/api/admin/recover/questions',
    expectedStatus: 200,
  },
  {
    name: 'GET resumo administrativo sem cookie de sessão (deve retornar 401)',
    method: 'GET',
    path: '/api/admin/summary',
    expectedStatus: 401,
  },
  {
    name: 'GET rota inexistente (deve retornar 404 padronizado)',
    method: 'GET',
    path: '/api/rota-inexistente',
    expectedStatus: 404,
  },
];

async function runSmokeTests() {
  console.log('[smoke] Iniciando verificação do roteador e rotas da API...');
  let passed = 0;
  let failed = 0;

  for (const check of CHECKS) {
    const t0 = Date.now();
    try {
      const init: RequestInit = {
        method: check.method,
        headers: {
          ...check.headers,
        },
      };
      if (check.body !== undefined) {
        init.body = JSON.stringify(check.body);
      }
      const req = new Request(`https://entre-nos.vercel.app${check.path}`, init);

      const timeoutPromise = new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout de 2000ms excedido')), 2000),
      );

      const res = await Promise.race([app(req), timeoutPromise]);
      const dt = Date.now() - t0;

      if (res.status === check.expectedStatus) {
        console.log(`  ✓ ${check.name} -> HTTP ${res.status} (${dt}ms)`);
        passed++;
      } else {
        console.error(`  ✗ ${check.name} -> esperado ${check.expectedStatus}, recebido ${res.status} (${dt}ms)`);
        failed++;
      }
    } catch (err: any) {
      const dt = Date.now() - t0;
      console.error(`  ✗ ${check.name} -> ERRO (${dt}ms):`, err?.message || err);
      failed++;
    }
  }

  console.log(`[smoke] Resultado: ${passed} passaram, ${failed} falharam.`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

runSmokeTests().catch((err) => {
  console.error('[smoke] Erro fatal:', err);
  process.exit(1);
});
