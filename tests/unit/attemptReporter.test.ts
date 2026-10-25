import { describe, expect, it } from 'vitest';
import { AttemptReporter } from '../../src/lib/attemptReporter';
import { ApiError } from '../../src/lib/api';

describe('fila de tentativas (AttemptReporter)', () => {
  it('registra evento, dispara envio e esvazia a fila com sucesso', async () => {
    const sent: string[] = [];
    const reporter = new AttemptReporter({
      token: 'test-token',
      send: async (id) => {
        sent.push(id);
      },
    });

    const id = reporter.record();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    // Permite que a promessa assíncrona do flush termine
    await reporter.flush();
    expect(sent).toEqual([id]);
    expect(reporter.pendingCount).toBe(0);
  });

  it('mantém evento na fila e agenda retry em caso de falha de rede temporária', async () => {
    let failCount = 1;
    const sent: string[] = [];
    let scheduledMs = 0;

    const reporter = new AttemptReporter({
      token: 'test-token',
      send: async (id) => {
        if (failCount > 0) {
          failCount--;
          throw new ApiError(0, 'network', 'Falha temporária de rede');
        }
        sent.push(id);
      },
      setTimer: (_fn, ms) => {
        scheduledMs = ms;
        return 1;
      },
    });

    const id = reporter.record();
    await reporter.flush();

    // Primeira tentativa falhou, evento ficou na fila e retry foi agendado
    expect(reporter.pendingCount).toBe(1);
    expect(scheduledMs).toBeGreaterThan(0);

    // Na segunda tentativa bem-sucedida, remove da fila
    await reporter.flush();
    expect(reporter.pendingCount).toBe(0);
    expect(sent).toEqual([id]);
  });

  it('descarta evento da fila se a falha for 4xx definitiva', async () => {
    const reporter = new AttemptReporter({
      token: 'test-token',
      send: async () => {
        throw new ApiError(404, 'not_found', 'Convite não encontrado');
      },
    });

    reporter.record();
    await reporter.flush();

    // Erro 404 definitivo não deve continuar tentando eternamente
    expect(reporter.pendingCount).toBe(0);
  });

  it('recupera eventos pendentes do storage inicial', async () => {
    const storageData = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => storageData.get(k) ?? null,
      setItem: (k: string, v: string) => storageData.set(k, v),
      removeItem: (k: string) => storageData.delete(k),
    };

    const savedId = '00000000-0000-0000-0000-000000000001';
    fakeStorage.setItem('entre-nos:attempts:test-token', JSON.stringify([savedId]));

    const sent: string[] = [];
    const reporter = new AttemptReporter({
      token: 'test-token',
      send: async (id) => {
        sent.push(id);
      },
      storage: fakeStorage,
    });

    expect(reporter.pendingCount).toBe(1);
    await reporter.flush();
    expect(sent).toEqual([savedId]);
    expect(reporter.pendingCount).toBe(0);
    expect(fakeStorage.getItem('entre-nos:attempts:test-token')).toBeNull();
  });
});
