import type { IncomingMessage, ServerResponse } from 'node:http';

async function readStream(stream: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/** Converte uma requisição Node (servidor local de dev/E2E ou Vercel serverless) em Request padrão e devolve a Response. */
export async function serveNode(
  handler: (request: Request) => Promise<Response>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
    const proto = (req.headers['x-forwarded-proto'] as string) || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    const url = new URL(req.url ?? '/', `${proto}://${host}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else if (v !== undefined) headers.set(k, v);
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

    let body: any;
    if (hasBody) {
      const anyReq = req as unknown as { body?: unknown; readableEnded?: boolean };
      if (anyReq.body !== undefined && anyReq.body !== null) {
        if (typeof anyReq.body === 'string' || Buffer.isBuffer(anyReq.body) || anyReq.body instanceof Uint8Array) {
          body = anyReq.body;
        } else {
          body = JSON.stringify(anyReq.body);
        }
      } else if (!req.readableEnded) {
        body = await readStream(req);
      }
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body,
      // @ts-expect-error duplex necessário para Node Request com body
      duplex: body !== undefined ? 'half' : undefined,
    });

    const response = await handler(request);
    const out: Record<string, string | string[]> = {};
    response.headers.forEach((value, key) => {
      if (key === 'set-cookie') return;
      out[key] = value;
    });
    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    if (cookies.length > 0) out['set-cookie'] = cookies;
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err: any) {
    const errorMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('[serveNode] Erro na requisição:', errorMsg, err?.stack);
    if (!res.headersSent) {
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
    }
    res.end(
      JSON.stringify({
        error: 'service_unavailable',
        message: 'Serviço temporariamente indisponível. Aguarde alguns instantes e tente novamente.',
        details: errorMsg,
      }),
    );
  }
}
