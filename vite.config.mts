import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = env.DEV_API_PORT || process.env.DEV_API_PORT || '8787';
  const apiTarget = env.DEV_API_URL || process.env.DEV_API_URL || `http://127.0.0.1:${port}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    preview: {
      port: 4173,
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    build: { sourcemap: false, target: 'es2022' },
    test: {
      include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
      testTimeout: 30_000,
      hookTimeout: 120_000,
      // testes de integração compartilham um Postgres embutido: um arquivo por vez
      fileParallelism: false,
    },
  };
});
