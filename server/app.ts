import { ConfigError, loadConfig, type Config } from './config';
import { assertSameOrigin, requireAdmin } from './auth';
import { getDb, type Sql } from './db';
import type { FetchLike } from './email';
import { HttpError, errorResponse, json } from './http';
import * as admin from './routes/admin';
import * as adminAuth from './routes/adminAuth';
import * as pub from './routes/public';
import type { Ctx, RouteHandler } from './types';

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
  /** 'none' = pública; 'admin' = exige sessão + CSRF nas mutações; 'csrf' = só CSRF (login/recuperação) */
  access: 'none' | 'admin' | 'csrf';
}

const ID = '([^/]+)';
const routes: Route[] = [
  // público (somente por token)
  { method: 'GET', pattern: new RegExp(`^/invite/${ID}$`), handler: pub.getInvite, access: 'none' },
  { method: 'GET', pattern: new RegExp(`^/invite/${ID}/photo$`), handler: pub.getPhoto, access: 'none' },
  { method: 'POST', pattern: new RegExp(`^/invite/${ID}/attempt$`), handler: pub.postAttempt, access: 'none' },
  { method: 'POST', pattern: new RegExp(`^/invite/${ID}/confirm$`), handler: pub.postConfirm, access: 'none' },

  // autenticação administrativa
  { method: 'POST', pattern: /^\/admin\/login$/, handler: adminAuth.postLogin, access: 'csrf' },
  { method: 'POST', pattern: /^\/admin\/logout$/, handler: adminAuth.postLogout, access: 'csrf' },
  { method: 'GET', pattern: /^\/admin\/me$/, handler: adminAuth.getMe, access: 'none' },
  { method: 'GET', pattern: /^\/admin\/recover\/questions$/, handler: adminAuth.getRecoveryQuestions, access: 'none' },
  { method: 'POST', pattern: /^\/admin\/recover$/, handler: adminAuth.postRecover, access: 'csrf' },
  { method: 'POST', pattern: /^\/admin\/password$/, handler: adminAuth.postChangePassword, access: 'csrf' },

  // painel
  { method: 'GET', pattern: /^\/admin\/summary$/, handler: admin.getSummary, access: 'admin' },
  { method: 'GET', pattern: /^\/admin\/invitations$/, handler: admin.listInvitations, access: 'admin' },
  { method: 'POST', pattern: /^\/admin\/invitations$/, handler: admin.createInvitation, access: 'admin' },
  { method: 'GET', pattern: new RegExp(`^/admin/invitations/${ID}$`), handler: admin.getInvitation, access: 'admin' },
  { method: 'PUT', pattern: new RegExp(`^/admin/invitations/${ID}$`), handler: admin.updateInvitation, access: 'admin' },
  { method: 'POST', pattern: new RegExp(`^/admin/invitations/${ID}/close$`), handler: admin.closeInvitation, access: 'admin' },
  { method: 'POST', pattern: new RegExp(`^/admin/invitations/${ID}/activate$`), handler: admin.activateInvitation, access: 'admin' },
  { method: 'POST', pattern: new RegExp(`^/admin/invitations/${ID}/reopen$`), handler: admin.reopenInvitation, access: 'admin' },
  { method: 'POST', pattern: new RegExp(`^/admin/invitations/${ID}/seen$`), handler: admin.markSeen, access: 'admin' },
  { method: 'POST', pattern: new RegExp(`^/admin/invitations/${ID}/resend-email$`), handler: admin.resendEmail, access: 'admin' },
  { method: 'GET', pattern: new RegExp(`^/admin/invitations/${ID}/photo$`), handler: admin.getAdminPhoto, access: 'admin' },
  { method: 'PUT', pattern: new RegExp(`^/admin/invitations/${ID}/photo$`), handler: admin.putPhoto, access: 'admin' },
  { method: 'DELETE', pattern: new RegExp(`^/admin/invitations/${ID}/photo$`), handler: admin.deletePhoto, access: 'admin' },
];

export interface AppOptions {
  getConfig?: () => Config;
  getSql?: (cfg: Config) => Sql;
  fetchImpl?: FetchLike;
  waitUntil?: (p: Promise<unknown>) => void;
}

/** waitUntil da Vercel (contexto de requisição) quando disponível; fora dela, só deixa a promessa seguir. */
function platformWaitUntil(p: Promise<unknown>): void {
  const ctx = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[
    Symbol.for('@vercel/request-context')
  ]?.get?.();
  if (ctx?.waitUntil) ctx.waitUntil(p);
  else void p.catch(() => {});
}

let cachedConfig: Config | null = null;
function defaultGetConfig(): Config {
  cachedConfig ??= loadConfig(process.env);
  return cachedConfig;
}

export function createApp(options: AppOptions = {}): (request: Request) => Promise<Response> {
  const getConfig = options.getConfig ?? defaultGetConfig;
  const getSql = options.getSql ?? ((cfg: Config) => getDb(cfg.databaseUrl));
  const fetchImpl = options.fetchImpl ?? fetch;
  const waitUntil = options.waitUntil ?? platformWaitUntil;

  return async function handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/api(?=\/)/, '').replace(/\/+$/, '') || '/';

      let matchedPath = false;
      for (const route of routes) {
        const m = route.pattern.exec(path);
        if (!m) continue;
        matchedPath = true;
        if (route.method !== request.method) continue;

        let cfg: Config;
        try {
          cfg = getConfig();
        } catch (e) {
          if (e instanceof ConfigError) {
            console.error('[config]', e.message);
            throw new HttpError(503, 'server_misconfigured', 'O servidor não está configurado corretamente.');
          }
          throw e;
        }
        const sql = getSql(cfg);
        const ctx: Ctx = { request, url, cfg, sql, fetchImpl, waitUntil };

        if (route.access !== 'none') assertSameOrigin(request, cfg);
        if (route.access === 'admin') await requireAdmin(request, cfg, sql);
        return await route.handler(ctx, m.slice(1).map(decodeURIComponent));
      }
      if (matchedPath) throw new HttpError(405, 'method_not_allowed', 'Método não permitido.');
      return json({ error: 'not_found', message: 'Recurso não encontrado.' }, { status: 404 });
    } catch (e) {
      if (e instanceof HttpError) {
        const headers: Record<string, string> = {};
        if (e.extra.retryAfterSeconds) headers['retry-after'] = String(e.extra.retryAfterSeconds);
        return errorResponse(e, headers);
      }
      // Nunca devolver detalhes internos ao cliente
      console.error('[api] erro inesperado:', e instanceof Error ? `${e.name}: ${e.message}` : 'desconhecido');
      return errorResponse(new HttpError(500, 'internal_error', 'Algo deu errado. Tente novamente em instantes.'));
    }
  };
}
