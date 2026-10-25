// Ponto de entrada serverless da Vercel: um único handler (catch-all) para toda a API.
import { createApp } from '../server/app';
import { serveNode } from '../server/nodeAdapter';

let cachedApp: ReturnType<typeof createApp> | null = null;
function getApp() {
  if (!cachedApp) {
    cachedApp = createApp();
  }
  return cachedApp;
}

export default async function handler(req: any, res?: any) {
  try {
    const app = getApp();
    if (res && typeof res.writeHead === 'function') {
      return await serveNode(app, req, res);
    }
    return await app(req);
  } catch (err) {
    console.error('[handler] Erro capturado no handler serverless:', err);
    const fallbackBody = JSON.stringify({
      error: 'service_unavailable',
      message: 'Serviço temporariamente indisponível. Aguarde alguns instantes e tente novamente.',
    });
    if (res && typeof res.writeHead === 'function') {
      if (!res.headersSent) {
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
      }
      res.end(fallbackBody);
      return;
    }
    return new Response(fallbackBody, {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
