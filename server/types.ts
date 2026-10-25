import type { Config } from './config';
import type { Sql } from './db';
import type { FetchLike } from './email';

export interface Ctx {
  request: Request;
  url: URL;
  cfg: Config;
  sql: Sql;
  fetchImpl: FetchLike;
  /** Mantém trabalho em segundo plano vivo após a resposta (Vercel) — ou só o dispara (local/testes). */
  waitUntil: (p: Promise<unknown>) => void;
}

export type RouteHandler = (ctx: Ctx, params: string[]) => Promise<Response>;
