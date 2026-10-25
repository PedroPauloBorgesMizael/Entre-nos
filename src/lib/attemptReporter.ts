import { ApiError } from './api';

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // alternativa para contextos não seguros (ex.: teste em http na rede local)
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

export interface AttemptReporterOptions {
  token: string;
  send: (eventId: string) => Promise<unknown>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const MAX_PENDING = 200;

/**
 * Entrega cada clique em "Não" ao servidor.
 *  - cada clique recebe um UUID próprio → o servidor é idempotente, então repetir é seguro;
 *  - se o envio falhar (rede/5xx), o evento continua na fila e é reenviado com espera crescente;
 *  - a fila fica no sessionStorage, então sobrevive a um recarregamento da página.
 * A interface nunca depende do resultado: o botão se move de qualquer jeito.
 */
export class AttemptReporter {
  private pending: string[] = [];
  private inFlight = false;
  private failures = 0;
  private timer: unknown = null;
  private readonly key: string;

  constructor(private readonly opts: AttemptReporterOptions) {
    this.key = `entre-nos:attempts:${opts.token}`;
    try {
      const raw = opts.storage?.getItem(this.key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) this.pending = parsed.filter((x): x is string => typeof x === 'string').slice(-MAX_PENDING);
    } catch {
      this.pending = [];
    }
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  record(): string {
    const id = uuid();
    this.pending.push(id);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.persist();
    void this.flush();
    return id;
  }

  async flush(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    this.cancelTimer();
    try {
      while (this.pending.length > 0) {
        const id = this.pending[0]!;
        try {
          await this.opts.send(id);
        } catch (e) {
          if (!(e instanceof ApiError) || e.retryable) {
            this.failures += 1;
            this.scheduleRetry();
            return;
          }
          // 4xx definitivo (convite encerrado, payload inválido): não adianta repetir
        }
        this.failures = 0;
        this.pending.shift();
        this.persist();
      }
    } finally {
      this.inFlight = false;
    }
  }

  dispose(): void {
    this.cancelTimer();
  }

  private scheduleRetry(): void {
    const wait = Math.min(30_000, 1_000 * 2 ** Math.min(this.failures, 5));
    const set = this.opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.timer = set(() => void this.flush(), wait);
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    (this.opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.timer);
    this.timer = null;
  }

  private persist(): void {
    try {
      if (this.pending.length === 0) this.opts.storage?.removeItem(this.key);
      else this.opts.storage?.setItem(this.key, JSON.stringify(this.pending));
    } catch {
      /* armazenamento indisponível (modo privado): segue só em memória */
    }
  }
}
