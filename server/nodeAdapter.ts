import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/** Converte uma requisição Node (servidor local de dev/E2E) em Request padrão e devolve a Response. */
export async function serveNode(
  handler: (request: Request) => Promise<Response>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const host = req.headers.host ?? 'localhost';
  const proto = (req.headers['x-forwarded-proto'] as string) || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  const url = new URL(req.url ?? '/', `${proto}://${host}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error — necessário no Node para corpo em streaming
    duplex: 'half',
  });
  const response = await handler(request);
  const out: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    if (key === 'set-cookie') return;
    out[key] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) out['set-cookie'] = cookies;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}
