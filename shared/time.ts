// Fuso e formatação de datas — compartilhado entre navegador, API e e-mail.
// Todas as disponibilidades são instantes únicos (UTC) exibidos no horário de Brasília.

export const TIME_ZONE = 'America/Sao_Paulo';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function wallClockAsUtc(ts: number): number {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(ts)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

/**
 * Converte "AAAA-MM-DD" + "HH:mm" (relógio de Brasília) para o instante UTC correspondente.
 * Retorna null para entrada inválida ou horário inexistente.
 */
export function brasiliaToUtc(date: string, time: string): Date | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [number, number, number, number, number];
  // Valida se o dia pertence ao mês solicitado (evita rollover no Date.UTC)
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (da < 1 || da > daysInMonth) return null;

  const naive = Date.UTC(y, mo - 1, da, h, mi);
  // duas passadas cobrem qualquer mudança de offset entre o palpite e o resultado
  let guess = naive - (wallClockAsUtc(naive) - naive);
  guess = naive - (wallClockAsUtc(guess) - guess);
  if (wallClockAsUtc(guess) !== naive) return null; // ex.: 31/02 ou horário que não existe
  return new Date(guess);
}

/** Converte um instante para os campos de formulário "AAAA-MM-DD" / "HH:mm" em Brasília. */
export function utcToBrasiliaFields(iso: string | Date): { date: string; time: string } {
  const ts = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  const p = Object.fromEntries(partsFormatter.formatToParts(new Date(ts)).map((x) => [x.type, x.value])) as Record<string, string>;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, weekday: 'long' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const longDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
});
const hmFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface SlotLabel {
  weekday: string; // "sábado"
  date: string; // "31/10/2026"
  dayMonth: string; // "31 de outubro"
  time: string; // "15h" ou "15h30"
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatSlot(iso: string | Date): SlotLabel {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const hm = hmFormatter.formatToParts(d);
  const hour = hm.find((p) => p.type === 'hour')?.value ?? '0';
  const minute = hm.find((p) => p.type === 'minute')?.value ?? '00';
  return {
    weekday: capitalize(weekdayFormatter.format(d)),
    date: dateFormatter.format(d),
    dayMonth: longDateFormatter.format(d),
    time: minute === '00' ? `${Number(hour)}h` : `${Number(hour)}h${minute}`,
  };
}

const stamp = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "24/10/2026 21:05" — para carimbos de data/hora no painel. */
export function formatStamp(iso: string | Date): string {
  return stamp.format(typeof iso === 'string' ? new Date(iso) : iso).replace(',', '');
}
