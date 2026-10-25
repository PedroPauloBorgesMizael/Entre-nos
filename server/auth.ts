import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { Config } from './config';
import type { Sql } from './db';
import { HttpError, parseCookies } from './http';

export const BCRYPT_COST = 12;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const CSRF_HEADER_VALUE = 'entre-nos';

/** Respostas de recuperação: correspondência exata, ignorando apenas espaços nas pontas e normalização Unicode. */
export function normalizeAnswer(s: string): string {
  return s.normalize('NFC').trim();
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  // hash descartável para igualar o tempo de resposta quando o usuário não confere
  dummyHash ??= await bcrypt.hash('entre-nos-dummy-password', BCRYPT_COST);
  return dummyHash;
}

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

function secretKey(cfg: Config): Uint8Array {
  return new TextEncoder().encode(cfg.sessionSecret);
}

export async function createSessionCookie(cfg: Config, sessionVersion: number): Promise<string> {
  const jwt = await new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin')
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey(cfg));
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
  let sv: unknown;
  try {
    const { payload } = await jwtVerify(token, secretKey(cfg), { algorithms: ['HS256'], subject: 'admin' });
    sv = payload.sv;
  } catch {
    throw unauthorized;
  }
  const creds = await getCredentials(sql, cfg);
  if (sv !== creds.sessionVersion) throw unauthorized;
  return creds;
}

/** Proteção CSRF para mutações: cabeçalho customizado + Origin igual ao do site (além de SameSite=Strict). */
export function assertSameOrigin(request: Request, cfg: Config): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const forbidden = new HttpError(403, 'forbidden', 'Requisição não permitida.');
  if (request.headers.get('x-requested-with') !== CSRF_HEADER_VALUE) throw forbidden;
  const origin = request.headers.get('origin');
  if (!origin) throw forbidden;

  const appOrigin = new URL(cfg.appUrl).origin;
  if (origin === appOrigin) return;

  // Em desenvolvimento local, aceita requisições vindas de localhost / 127.0.0.1
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
  const ok = await bcrypt.compare(password, userOk ? creds.hash : await getDummyHash());
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

