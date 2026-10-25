import postgres from 'postgres';

export type Sql = postgres.Sql;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Cria o cliente Postgres. TLS é OBRIGATÓRIO para qualquer host que não seja local
 * (o Supabase exige TLS). `sslmode=disable` na URL é recusado fora do localhost.
 * O pooler do Supabase em modo transação (porta 6543) não suporta prepared statements.
 */
export function createDb(databaseUrl: string): Sql {
  const url = new URL(databaseUrl);
  const local = LOCAL_HOSTS.has(url.hostname);
  const sslmode = url.searchParams.get('sslmode');
  if (!local && sslmode === 'disable') {
    throw new Error('DATABASE_URL com sslmode=disable não é permitido fora do localhost.');
  }
  return postgres(databaseUrl, {
    ssl: local ? false : 'require',
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  });
}

let shared: { url: string; sql: Sql } | null = null;

export function getDb(databaseUrl: string): Sql {
  if (!shared || shared.url !== databaseUrl) {
    void shared?.sql.end({ timeout: 1 }).catch(() => {});
    shared = { url: databaseUrl, sql: createDb(databaseUrl) };
  }
  return shared.sql;
}
