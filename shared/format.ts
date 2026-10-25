import type { SuggestionMode } from './contracts';

const LABELS: Record<SuggestionMode, string> = { place: 'Local', food: 'Comida', free: 'Sugestão' };

export function suggestionLabel(mode: SuggestionMode): string {
  return LABELS[mode];
}

/** Junta a opção escolhida e o texto livre numa única descrição legível. */
export function suggestionValue(selectedOption: string | null, suggestionText: string | null): string {
  return [selectedOption, suggestionText].filter((x): x is string => !!x && x.trim() !== '').join(' · ');
}

export const EMAIL_STATUS_LABEL = {
  pending: 'Aguardando envio',
  sending: 'Enviando…',
  sent: 'Aceito pelo provedor de e-mail',
  failed: 'Falhou',
  skipped: 'Não enviado (e-mail não configurado)',
} as const;

export const INVITATION_STATUS_LABEL = {
  draft: 'Rascunho',
  active: 'Aguardando resposta',
  confirmed: 'Confirmado',
  closed: 'Encerrado',
} as const;
