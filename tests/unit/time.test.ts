import { describe, expect, it } from 'vitest';
import { brasiliaToUtc, utcToBrasiliaFields, formatSlot, formatStamp } from '../../shared/time';

describe('utilitários de fuso horário e data (shared/time)', () => {
  it('converte data e hora de Brasília para UTC corretamente (UTC-3 fixo)', () => {
    // 31/10/2026 às 15:00 em Brasília = 18:00 UTC
    const d1 = brasiliaToUtc('2026-10-31', '15:00');
    expect(d1).not.toBeNull();
    expect(d1?.toISOString()).toBe('2026-10-31T18:00:00.000Z');

    // 01/11/2026 às 19:30 em Brasília = 22:30 UTC
    const d2 = brasiliaToUtc('2026-11-01', '19:30');
    expect(d2?.toISOString()).toBe('2026-11-01T22:30:00.000Z');
  });

  it('recusa datas ou horários inexistentes ou inválidos', () => {
    expect(brasiliaToUtc('2026-02-31', '15:00')).toBeNull();
    expect(brasiliaToUtc('invalid', '15:00')).toBeNull();
    expect(brasiliaToUtc('2026-10-31', '25:00')).toBeNull();
    expect(brasiliaToUtc('2026-10-31', '12:60')).toBeNull();
  });

  it('converte instante UTC de volta para os campos do formulário em Brasília', () => {
    const utcIso = '2026-10-31T18:00:00.000Z';
    const fields = utcToBrasiliaFields(utcIso);
    expect(fields.date).toBe('2026-10-31');
    expect(fields.time).toBe('15:00');
  });

  it('formata rótulos de slots de forma elegante em português', () => {
    // Sábado 31/10/2026 18:00 UTC = 15:00 BRT
    const slot1 = formatSlot('2026-10-31T18:00:00.000Z');
    expect(slot1.weekday).toMatch(/sábado/i);
    expect(slot1.time).toBe('15h');
    expect(slot1.date).toBe('31/10/2026');

    // Quarta com minutos
    const slot2 = formatSlot('2026-11-04T22:30:00.000Z');
    expect(slot2.weekday).toMatch(/quarta-feira/i);
    expect(slot2.time).toBe('19h30');
  });

  it('formata carimbo de data/hora para o painel', () => {
    const stamp = formatStamp('2026-10-24T23:45:00.000Z');
    expect(stamp).toMatch(/24\/10\/2026 20:45/);
  });
});
