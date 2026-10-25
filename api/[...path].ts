// Ponto de entrada serverless da Vercel: um único handler (catch-all) para toda a API.
import { createApp } from '../server/app';
import { serveNode } from '../server/nodeAdapter';

const app = createApp();

export default async function handler(req: any, res?: any) {
  if (res && typeof res.writeHead === 'function') {
    return serveNode(app, req, res);
  }
  return app(req);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
