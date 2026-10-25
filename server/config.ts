// Configuração lida SOMENTE de variáveis de ambiente do servidor (nenhuma com prefixo VITE_).

export interface Config {
  databaseUrl: string;
  appUrl: string; // sem barra final
  isProduction: boolean;
  adminEmail: string;
  adminUsername: string;
  adminInitialPasswordHash: string;
  recoveryQuestions: [string, string];
  recoveryAnswerHashes: [string, string];
  sessionSecret: string;
  resendApiKey: string | null;
  emailFrom: string;
}

export class ConfigError extends Error {}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new ConfigError(`Variável de ambiente ausente: ${name}`);
  return v;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appUrl = required(env, 'APP_URL').replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    throw new ConfigError('APP_URL não é uma URL válida.');
  }
  const isProduction = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (isProduction && !isLocalHost && parsed.protocol !== 'https:') {
    throw new ConfigError('APP_URL deve usar https em produção.');
  }

  const sessionSecret = required(env, 'ADMIN_SESSION_SECRET');
  if (sessionSecret.length < 32) throw new ConfigError('ADMIN_SESSION_SECRET precisa ter ao menos 32 caracteres.');

  const hashRe = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
  const checkHash = (name: string) => {
    const v = required(env, name);
    if (!hashRe.test(v)) throw new ConfigError(`${name} não é um hash bcrypt válido (use npm run hash).`);
    return v;
  };

  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    appUrl,
    isProduction,
    adminEmail: required(env, 'ADMIN_EMAIL'),
    adminUsername: required(env, 'ADMIN_USERNAME'),
    adminInitialPasswordHash: checkHash('ADMIN_INITIAL_PASSWORD_HASH'),
    recoveryQuestions: [required(env, 'ADMIN_RECOVERY_QUESTION_1'), required(env, 'ADMIN_RECOVERY_QUESTION_2')],
    recoveryAnswerHashes: [checkHash('ADMIN_RECOVERY_ANSWER_1_HASH'), checkHash('ADMIN_RECOVERY_ANSWER_2_HASH')],
    sessionSecret,
    resendApiKey: env.RESEND_API_KEY?.trim() || null,
    emailFrom: env.EMAIL_FROM?.trim() || 'Entre Nós <onboarding@resend.dev>',
  };
}
