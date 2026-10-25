// Contratos da API (tipos + validação). Usados pelo front e pelo servidor.
import { z } from 'zod';

export type SuggestionMode = 'place' | 'food' | 'free';
export type InvitationStatus = 'draft' | 'active' | 'confirmed' | 'closed';
export type EmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export const SUGGESTION_MODES: readonly SuggestionMode[] = ['place', 'food', 'free'];

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .trim()
    .min(min, `${label} é obrigatório.`)
    .max(max, `${label} deve ter no máximo ${max} caracteres.`);

/** Remove caracteres de controle (exceto quebra de linha) antes de validar. */
const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') : s);

export const slotInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.'),
});

export const invitationInputSchema = z.object({
  name: z.preprocess(clean, trimmed(1, 80, 'O nome')),
  openingMessage: z.preprocess(clean, trimmed(1, 600, 'A mensagem de abertura')),
  photoEnabled: z.boolean(),
  status: z.enum(['draft', 'active']),
  question: z.preprocess(clean, trimmed(1, 300, 'A pergunta')),
  suggestionMode: z.enum(['place', 'food', 'free']),
  suggestionOptions: z
    .array(z.preprocess(clean, trimmed(1, 120, 'A opção')))
    .max(12, 'No máximo 12 opções.')
    .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, 'Há opções repetidas.'),
  slots: z.array(slotInputSchema).max(30, 'No máximo 30 horários.'),
});
export type InvitationInput = z.infer<typeof invitationInputSchema>;

export const attemptSchema = z.object({ eventId: z.uuid() });

export const confirmSchema = z.object({
  slotId: z.uuid('Escolha uma data válida.'),
  selectedOption: z.preprocess(clean, trimmed(1, 120, 'A opção')).nullish(),
  suggestionText: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : clean(v)), trimmed(1, 300, 'A sugestão').nullish()),
});
export type ConfirmInput = z.infer<typeof confirmSchema>;

export const PASSWORD_MIN = 12;
const passwordField = z
  .string()
  .min(PASSWORD_MIN, `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`)
  .max(200, 'Senha muito longa.');

export const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});
export const recoverSchema = z.object({
  answer1: z.string().min(1).max(200),
  answer2: z.string().min(1).max(200),
  newPassword: passwordField,
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordField,
});

// ---------------------------------------------------------------------------
// Tipos de resposta
// ---------------------------------------------------------------------------

export interface PublicSlot {
  id: string;
  startsAt: string;
}

export interface PublicAnswer {
  startsAt: string;
  suggestionType: SuggestionMode;
  selectedOption: string | null;
  suggestionText: string | null;
}

export interface PublicInvite {
  state: 'open' | 'answered';
  name: string;
  openingMessage: string;
  photoUrl: string | null;
  question: string;
  suggestionMode: SuggestionMode;
  suggestionOptions: string[];
  slots: PublicSlot[];
  answer: PublicAnswer | null;
}

export interface ConfirmResult {
  outcome: 'created' | 'already_confirmed';
  answer: PublicAnswer;
}

export interface AdminResponse {
  id: string;
  startsAt: string;
  suggestionType: SuggestionMode;
  selectedOption: string | null;
  suggestionText: string | null;
  confirmedAt: string;
  state: 'confirmed' | 'archived';
  emailStatus: EmailStatus;
  emailAttempts: number;
  emailError: string | null;
  emailSentAt: string | null;
  seen: boolean;
}

export interface AdminInvitationListItem {
  id: string;
  name: string;
  status: InvitationStatus;
  createdAt: string;
  noAttempts: number;
  hasResponse: boolean;
  unseenResponse: boolean;
  link: string;
}

export interface AdminInvitationDetail {
  id: string;
  name: string;
  openingMessage: string;
  photoEnabled: boolean;
  hasPhoto: boolean;
  photoVersion: string | null;
  status: InvitationStatus;
  question: string;
  suggestionMode: SuggestionMode;
  suggestionOptions: string[];
  slots: { id: string; startsAt: string }[];
  noAttempts: number;
  createdAt: string;
  updatedAt: string;
  link: string;
  response: AdminResponse | null;
  archivedResponses: AdminResponse[];
  /** Convites confirmados preservam resposta; só nome, mensagem e foto podem mudar. */
  locked: boolean;
}

export interface AdminNotification {
  invitationId: string;
  name: string;
  startsAt: string;
  confirmedAt: string;
  seen: boolean;
  emailStatus: EmailStatus;
}

export interface AdminSummary {
  total: number;
  drafts: number;
  awaiting: number;
  confirmed: number;
  closed: number;
  noAttempts: number;
  notifications: AdminNotification[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
}
