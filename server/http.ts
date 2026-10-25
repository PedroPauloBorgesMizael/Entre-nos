import type { z } from 'zod';
import type { ApiErrorBody } from '../shared/contracts';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Partial<ApiErrorBody> = {},
  ) {
    super(message);
  }
}

const BASE_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', ...init.headers },
  });
}

export function errorResponse(e: HttpError, headers: Record<string, string> = {}): Response {
  const body: ApiErrorBody = { error: e.code, message: e.message, ...e.extra };
  return json(body, { status: e.status, headers });
}

const MAX_JSON_BYTES = 64 * 1024;

/** Lê o corpo com limite de tamanho (evita abuso por payloads gigantes). */
export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'payload_too_large', 'Conteúdo grande demais.');
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => {});
      throw new HttpError(413, 'payload_too_large', 'Conteúdo grande demais.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export async function readJson(request: Request): Promise<unknown> {
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Envie os dados como JSON.');
  }
  const bytes = await readBody(request, MAX_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON inválido.');
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function fieldErrorsFromZod(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join('.') || '_';
    if (!(key in out)) out[key] = i.message;
  }
  return out;
}

export function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new HttpError(422, 'validation_error', 'Confira os campos e tente novamente.', {
      fieldErrors: fieldErrorsFromZod(r.error.issues),
    });
  }
  return r.data;
}
