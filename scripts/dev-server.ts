// Servidor local de desenvolvimento: executa a MESMA API da Vercel, lendo .env.local.
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createApp } from '../server/app';
import { serveNode } from '../server/nodeAdapter';

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
} else if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const port = Number(process.env.DEV_API_PORT ?? 8787);
const app = createApp();

createServer((req, res) => {
  serveNode(app, req, res).catch((e) => {
    console.error(e);
    res.writeHead(500).end();
  });
}).listen(port, '127.0.0.1', () => console.log(`API local em http://127.0.0.1:${port}`));
