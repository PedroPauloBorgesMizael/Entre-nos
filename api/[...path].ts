// Ponto de entrada serverless da Vercel: um único handler (catch-all) para toda a API.
import { createApp } from '../server/app';

const app = createApp();
const handle = (request: Request) => app(request);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
