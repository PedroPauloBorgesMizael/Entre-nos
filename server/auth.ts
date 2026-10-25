import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Config } from './config';
import type { Sql } from './db';
import { HttpError, parseCookies } from './http';

// Garante que o bcryptjs use o crypto nativo do Node em qualquer runtime serverless
bcrypt.setRandomFallback((len: number) => {
  return Array.from(randomBytes(len));
});

export const BCRYPT_COST = 12;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const CSRF_HEADER_VALUE = 'entre-nos';

interface JwtPayload {
  sub: string;
  sv: number;
  iat: number;
  exp: number;
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signSessionJwt(sessionVersion: number, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: 'admin',
    sv: sessionVersion,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const sig = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${sig}`;
}

export function verifySessionJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  const headerStr = parts[0];
  const bodyStr = parts[1];
  const sigStr = parts[2];
  const unsigned = `${headerStr}.${bodyStr}`;
  const expectedSig = createHmac('sha256', secret).update(unsigned).digest('base64url');
  if (sigStr.length !== expectedSig.length) return null;
  if (!timingSafeEqual(Buffer.from(sigStr), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(bodyStr)) as JwtPayload;
    if (payload.sub !== 'admin') return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Respostas de recuperação: correspondência exata, ignorando apenas espaços nas pontas e normalização Unicode. */
export function normalizeAnswer(s: string): string {
  return s.normalize('NFC').trim();
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Hash bcrypt válido pré-computado para tempo de resposta constante quando o usuário não confere
const DUMMY_HASH = '$2a$12$0nzbJOr/CAwILo7kdZjSkO4MqT5UI9xUmk2Kvd6.wbTBQjcfm67B6';

// ---------------------------------------------------------------------------
// Credenciais e sessão
// ---------------------------------------------------------------------------

export interface Credentials {
  hash: string;
  sessionVersion: number;
}

export async function getCredentials(sql: Sql, cfg: Config): Promise<Credentials> {
  const rows = await sql<{ password_hash: string; session_version: number }[]>`
    select password_hash, session_version from admin_credentials where id = 1`;
  const row = rows[0];
  return row
    ? { hash: row.password_hash, sessionVersion: row.session_version }
    : { hash: cfg.adminInitialPasswordHash, sessionVersion: 0 };
}

export function sessionCookieName(cfg: Config): string {
  return cfg.appUrl.startsWith('https:') ? '__Host-entre_nos_session' : 'entre_nos_session';
}

export async function createSessionCookie(cfg: Config, sessionVersion: number): Promise<string> {
  const jwt = signSessionJwt(sessionVersion, cfg.sessionSecret);
  const secure = cfg.appUrl.startsWith('https:') ? '; Secure' : '';
  return `${sessionCookieName(cfg)}=${jwt}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie(cfg: Config): string {
  const secure = cfg.appUrl.startsWith('https:') ? '; Secure' : '';
  return `${sessionCookieName(cfg)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

/** Garante sessão válida E ainda vigente (a versão muda a cada troca de senha). */
export async function requireAdmin(request: Request, cfg: Config, sql: Sql): Promise<Credentials> {
  const token = parseCookies(request.headers.get('cookie'))[sessionCookieName(cfg)];
  const unauthorized = new HttpError(401, 'unauthorized', 'Faça login para continuar.');
  if (!token) throw unauthorized;
  const payload = verifySessionJwt(token, cfg.sessionSecret);
  if (!payload) throw unauthorized;
  const creds = await getCredentials(sql, cfg);
  if (payload.sv !== creds.sessionVersion) throw unauthorized;
  return creds;
}

/** Proteção CSRF para mutações: cabeçalho customizado + Origin igual ao do site (além de SameSite=Strict). */
export function assertSameOrigin(request: Request, cfg: Config): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const forbidden = new HttpError(403, 'forbidden', 'Requisição não permitida.');
  if (request.headers.get('x-requested-with') !== CSRF_HEADER_VALUE) throw forbidden;
  const origin = request.headers.get('origin');
  if (!origin) throw forbidden;

  // 1. Confere com appUrl configurado
  const appOrigin = new URL(cfg.appUrl).origin;
  if (origin === appOrigin) return;

  // 2. Confere com o próprio Origin da requisição atual (mesmo host e protocolo)
  try {
    const reqOrigin = new URL(request.url).origin;
    if (origin === reqOrigin) return;
  } catch {}

  // 3. Em URLs da Vercel (preview deployments ou domínios *.vercel.app do projeto)
  try {
    const parsedOrigin = new URL(origin);
    const parsedReq = new URL(request.url);
    if (
      parsedOrigin.protocol === 'https:' &&
      parsedOrigin.hostname.endsWith('.vercel.app') &&
      parsedReq.hostname.endsWith('.vercel.app')
    ) {
      return;
    }
  } catch {}

  // 4. Em desenvolvimento local, aceita requisições vindas de localhost / 127.0.0.1
  if (!cfg.isProduction) {
    try {
      const parsed = new URL(origin);
      if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
        return;
      }
    } catch {
      throw forbidden;
    }
  }

  throw forbidden;
}

// ---------------------------------------------------------------------------
// Limite de tentativas (global: há um único administrador, sem guardar IP)
// ---------------------------------------------------------------------------

export type ThrottleScope = 'login' | 'recover';
const FAILURES_BEFORE_LOCK = 5;
const FAILURE_WINDOW_MS = 60 * 60 * 1000;

export async function lockedForSeconds(sql: Sql, scope: ThrottleScope): Promise<number> {
  const rows = await sql<{ wait: number | null }[]>`
    select ceil(extract(epoch from (locked_until - now())))::int as wait
      from auth_throttle where scope = ${scope} and locked_until > now()`;
  return rows[0]?.wait ?? 0;
}

export async function assertNotLocked(sql: Sql, scope: ThrottleScope): Promise<void> {
  const wait = await lockedForSeconds(sql, scope);
  if (wait > 0) {
    throw new HttpError(429, 'too_many_attempts', 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.', {
      retryAfterSeconds: wait,
    });
  }
}

export async function registerFailure(sql: Sql, scope: ThrottleScope): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`insert into auth_throttle (scope) values (${scope}) on conflict do nothing`;
    const [row] = await tx<{ failures: number; last_failure_at: Date | null }[]>`
      select failures, last_failure_at from auth_throttle where scope = ${scope} for update`;
    const stale = !row?.last_failure_at || Date.now() - row.last_failure_at.getTime() > FAILURE_WINDOW_MS;
    const failures = (stale ? 0 : (row?.failures ?? 0)) + 1;
    const lockSeconds =
      failures >= FAILURES_BEFORE_LOCK ? Math.min(900, 30 * 2 ** (failures - FAILURES_BEFORE_LOCK)) : 0;
    await tx`
      update auth_throttle
         set failures = ${failures},
             last_failure_at = now(),
             locked_until = ${lockSeconds > 0 ? sql`now() + make_interval(secs => ${lockSeconds})` : null}
       where scope = ${scope}`;
  });
}

export async function resetThrottle(sql: Sql, scope: ThrottleScope): Promise<void> {
  await sql`delete from auth_throttle where scope = ${scope}`;
}

// ---------------------------------------------------------------------------
// Fluxos
// ---------------------------------------------------------------------------

async function verifyPassword(creds: Credentials, password: string, userOk = true): Promise<boolean> {
  const ok = await bcrypt.compare(password, userOk ? creds.hash : DUMMY_HASH);
  return ok && userOk;
}

export async function login(sql: Sql, cfg: Config, username: string, password: string): Promise<Credentials> {
  await assertNotLocked(sql, 'login');
  const creds = await getCredentials(sql, cfg);
  const userOk = safeEqual(username, cfg.adminUsername);
  const ok = await verifyPassword(creds, password, userOk);
  if (!ok) {
    await registerFailure(sql, 'login');
    throw new HttpError(401, 'invalid_credentials', 'Usuário ou senha incorretos.');
  }
  await resetThrottle(sql, 'login');
  return creds;
}

async function storeNewPassword(sql: Sql, newPassword: string): Promise<number> {
  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const [row] = await sql<{ session_version: number }[]>`
    insert into admin_credentials (id, password_hash, session_version)
    values (1, ${hash}, 1)
    on conflict (id) do update
      set password_hash = excluded.password_hash,
          session_version = admin_credentials.session_version + 1,
          updated_at = now()
    returning session_version`;
  return row!.session_version;
}

/** Troca de senha logado: exige a senha atual (com o mesmo limite de tentativas) e invalida as outras sessões. */
export async function changePassword(
  sql: Sql,
  cfg: Config,
  currentPassword: string,
  newPassword: string,
): Promise<number> {
  await assertNotLocked(sql, 'login');
  const creds = await getCredentials(sql, cfg);
  if (!(await verifyPassword(creds, currentPassword))) {
    await registerFailure(sql, 'login');
    throw new HttpError(400, 'invalid_current_password', 'A senha atual está incorreta.');
  }
  await resetThrottle(sql, 'login');
  return storeNewPassword(sql, newPassword);
}

/** Recuperação: exige as DUAS respostas; grava o novo hash e invalida todas as sessões. */
export async function recoverPassword(
  sql: Sql,
  cfg: Config,
  answer1: string,
  answer2: string,
  newPassword: string,
): Promise<number> {
  await assertNotLocked(sql, 'recover');
  const ok1 = await bcrypt.compare(normalizeAnswer(answer1), cfg.recoveryAnswerHashes[0]);
  const ok2 = await bcrypt.compare(normalizeAnswer(answer2), cfg.recoveryAnswerHashes[1]);
  if (!(ok1 && ok2)) {
    await registerFailure(sql, 'recover');
    throw new HttpError(401, 'invalid_answers', 'As respostas não conferem.');
  }
  const sv = await storeNewPassword(sql, newPassword);
  await resetThrottle(sql, 'recover');
  await resetThrottle(sql, 'login');
  return sv;
}

