// Ponto de entrada oficial serverless da Vercel: api/index.ts
import { createApp } from '../server/app';
import { serveNode } from '../server/nodeAdapter';

let cachedApp: ReturnType<typeof createApp> | null = null;
function getApp() {
  if (!cachedApp) {
    cachedApp = createApp();
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  try {
    const app = getApp();
    if (res && typeof res.writeHead === 'function') {
      return await serveNode(app, req, res);
    }
    return await app(req);
  } catch (err: any) {
    const errorMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const stack = err?.stack || errorMsg;
    console.error('[handler] Erro fatal no handler serverless:', errorMsg, stack);
    const fallbackBody = JSON.stringify({
      error: 'server_error',
      message: errorMsg,
      details: stack,
    });
    if (res && typeof res.writeHead === 'function') {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      }
      res.end(fallbackBody);
      return;
    }
    return new Response(fallbackBody, {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
