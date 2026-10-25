import bcrypt from 'bcryptjs';
import type { Config } from '../../server/config';
import { createApp } from '../../server/app';
import { createDb, type Sql } from '../../server/db';
import { normalizeAnswer } from '../../server/auth';
import { utcToBrasiliaFields } from '../../shared/time';
import type { InvitationInput } from '../../shared/contracts';
import type { TestPostgres } from './pg';

export const ADMIN = {
  username: 'admin-teste',
  password: 'senha-de-teste-123',
  email: 'admin@exemplo.test',
  q1: 'Qual o nome do primeiro pet?',
  a1: 'Bolinha',
  q2: 'Em que cidade nos conhecemos?',
  a2: 'São Paulo',
  appUrl: 'https://entre-nos.example.test',
  sessionSecret: 'segredo-de-sessao-para-testes-com-32-chars-ou-mais',
  resendKey: 're_test_chave_super_secreta',
};

export interface SentEmail {
  to: string[];
  from: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  authorization: string;
}

export type EmailMode = 'ok' | 'http-error' | 'network-error';

export interface Harness {
  cfg: Config;
  sql: Sql;
  emails: SentEmail[];
  setEmailMode: (m: EmailMode) => void;
  flush: () => Promise<void>;
  call: (method: string, path: string, opts?: CallOptions) => Promise<Response>;
  json: <T = any>(res: Response) => Promise<T>;
  login: (password?: string) => Promise<string>;
  admin: (method: string, path: string, cookie: string, body?: unknown) => Promise<Response>;
  createInvite: (cookie: string, overrides?: Partial<InvitationInput>) => Promise<{ id: string; token: string; slots: { id: string; startsAt: string }[]; detail: any }>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

interface CallOptions {
  body?: unknown;
  rawBody?: Uint8Array | string;
  contentType?: string;
  cookie?: string;
  origin?: string | null;
  csrf?: boolean;
}

export const futureSlot = (daysAhead: number, time = '19:00') => ({
  date: utcToBrasiliaFields(new Date(Date.now() + daysAhead * 86_400_000)).date,
  time,
});

export function baseInvite(overrides: Partial<InvitationInput> = {}): InvitationInput {
  return {
    name: 'Marina',
    openingMessage: 'Tenho uma pergunta para você.',
    photoEnabled: false,
    status: 'active',
    question: 'Tem algum lugar que você gostaria de conhecer?',
    suggestionMode: 'place',
    suggestionOptions: [],
    slots: [futureSlot(10, '15:00'), futureSlot(11, '19:00')],
    ...overrides,
  };
}

export async function makeHarness(pg: TestPostgres): Promise<Harness> {
  const cfg: Config = {
    databaseUrl: pg.appUrl,
    appUrl: ADMIN.appUrl,
    isProduction: true,
    adminEmail: ADMIN.email,
    adminUsername: ADMIN.username,
    adminInitialPasswordHash: bcrypt.hashSync(ADMIN.password, 4),
    recoveryQuestions: [ADMIN.q1, ADMIN.q2],
    recoveryAnswerHashes: [bcrypt.hashSync(normalizeAnswer(ADMIN.a1), 4), bcrypt.hashSync(normalizeAnswer(ADMIN.a2), 4)],
    sessionSecret: ADMIN.sessionSecret,
    resendApiKey: ADMIN.resendKey,
    emailFrom: 'Entre Nós <onboarding@resend.dev>',
  };
  const sql = createDb(pg.appUrl);
  const emails: SentEmail[] = [];
  let mode: EmailMode = 'ok';
  const waits: Promise<unknown>[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://api.resend.com/')) throw new Error(`fetch inesperado: ${url}`);
    if (mode === 'network-error') throw new Error('ECONNRESET simulado');
    if (mode === 'http-error') {
      return new Response(JSON.stringify({ name: 'validation_error', message: 'domínio não verificado' }), { status: 403 });
    }
    const body = JSON.parse(String(init?.body));
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    emails.push({ ...body, headers, authorization: headers.authorization ?? '' });
    return new Response(JSON.stringify({ id: `msg_${emails.length}` }), { status: 200 });
  };

  const app = createApp({
    getConfig: () => cfg,
    getSql: () => sql,
    fetchImpl,
    waitUntil: (p) => void waits.push(p),
  });

  const call: Harness['call'] = (method, path, opts = {}) => {
    const headers: Record<string, string> = {};
    if (opts.cookie) headers.cookie = opts.cookie;
    const isMutation = method !== 'GET';
    if (isMutation && opts.csrf !== false) headers['x-requested-with'] = 'entre-nos';
    if (isMutation && opts.origin !== null) headers.origin = opts.origin ?? ADMIN.appUrl;
    let body: BodyInit | undefined;
    if (opts.rawBody !== undefined) {
      body = opts.rawBody as BodyInit;
      headers['content-type'] = opts.contentType ?? 'application/octet-stream';
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers['content-type'] = opts.contentType ?? 'application/json';
    }
    return app(new Request(`${ADMIN.appUrl}/api${path}`, { method, headers, body }));
  };

  const parseJson = async <T,>(res: Response) => (await res.json()) as T;

  const login: Harness['login'] = async (password = ADMIN.password) => {
    const res = await call('POST', '/admin/login', { body: { username: ADMIN.username, password } });
    if (res.status !== 200) throw new Error(`login falhou: ${res.status} ${await res.text()}`);
    const setCookie = res.headers.getSetCookie()[0]!;
    return setCookie.split(';')[0]!;
  };

  const admin: Harness['admin'] = (method, path, cookie, body) => call(method, `/admin${path}`, { cookie, body });

  const createInvite: Harness['createInvite'] = async (cookie, overrides = {}) => {
    const res = await admin('POST', '/invitations', cookie, baseInvite(overrides));
    if (res.status !== 201) throw new Error(`create falhou: ${res.status} ${await res.text()}`);
    const detail = await parseJson<any>(res);
    const token = String(detail.link).split('/c/')[1]!;
    return { id: detail.id, token, slots: detail.slots, detail };
  };

  return {
    cfg,
    sql,
    emails,
    setEmailMode: (m) => void (mode = m),
    flush: async () => void (await Promise.all(waits.splice(0))),
    call,
    json: parseJson,
    login,
    admin,
    createInvite,
    reset: async () => {
      await Promise.all(waits.splice(0)).catch(() => {});
      emails.length = 0;
      mode = 'ok';
      await pg.admin.unsafe(
        'truncate invitations, auth_throttle, admin_credentials restart identity cascade',
      );
    },
    close: async () => void (await sql.end({ timeout: 2 })),
  };
}
