import { attemptSchema, confirmSchema, type ConfirmResult, type PublicAnswer, type PublicInvite, type SuggestionMode } from '../../shared/contracts';
import { sendResponseNotification } from '../email';
import { HttpError, fieldErrorsFromZod, json, readJson } from '../http';
import type { Ctx, RouteHandler } from '../types';

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

interface InviteRow {
  id: string;
  name: string;
  opening_message: string;
  photo_enabled: boolean;
  status: 'draft' | 'active' | 'confirmed' | 'closed';
  question: string;
  suggestion_mode: SuggestionMode;
  suggestion_options: string[];
}

interface ResponseRow {
  slot_starts_at: Date;
  suggestion_type: SuggestionMode;
  selected_option: string | null;
  suggestion_text: string | null;
}

// Mensagem única para token desconhecido, rascunho ou encerrado: não revela quais convites existem.
const notFound = () => new HttpError(404, 'not_found', 'Este convite não está disponível.');

async function findInvite({ sql }: Ctx, token: string): Promise<InviteRow> {
  if (!TOKEN_RE.test(token)) throw notFound();
  const rows = await sql<InviteRow[]>`
    select id, name, opening_message, photo_enabled, status, question, suggestion_mode, suggestion_options
      from invitations where token = ${token}`;
  const inv = rows[0];
  if (!inv || inv.status === 'draft' || inv.status === 'closed') throw notFound();
  return inv;
}

const toAnswer = (r: ResponseRow): PublicAnswer => ({
  startsAt: r.slot_starts_at.toISOString(),
  suggestionType: r.suggestion_type,
  selectedOption: r.selected_option,
  suggestionText: r.suggestion_text,
});

async function confirmedAnswer({ sql }: Ctx, invitationId: string): Promise<PublicAnswer | null> {
  const rows = await sql<ResponseRow[]>`
    select slot_starts_at, suggestion_type, selected_option, suggestion_text
      from responses where invitation_id = ${invitationId} and state = 'confirmed'`;
  return rows[0] ? toAnswer(rows[0]) : null;
}

export const getInvite: RouteHandler = async (ctx, [token]) => {
  const inv = await findInvite(ctx, token!);
  const { sql } = ctx;
  const answer = await confirmedAnswer(ctx, inv.id);

  const slots = answer
    ? []
    : await sql<{ id: string; starts_at: Date }[]>`
        select id, starts_at from availability_slots
         where invitation_id = ${inv.id} and starts_at > now() order by starts_at`;

  let photoUrl: string | null = null;
  if (inv.photo_enabled) {
    const p = await sql<{ updated_at: Date }[]>`select updated_at from invitation_photos where invitation_id = ${inv.id}`;
    if (p[0]) photoUrl = `/api/invite/${token}/photo?v=${p[0].updated_at.getTime()}`;
  }

  const body: PublicInvite = {
    state: answer ? 'answered' : 'open',
    name: inv.name,
    openingMessage: inv.opening_message,
    photoUrl,
    question: inv.question,
    suggestionMode: inv.suggestion_mode,
    suggestionOptions: inv.suggestion_options,
    slots: slots.map((s) => ({ id: s.id, startsAt: s.starts_at.toISOString() })),
    answer,
  };
  return json(body);
};

export const getPhoto: RouteHandler = async (ctx, [token]) => {
  const inv = await findInvite(ctx, token!);
  if (!inv.photo_enabled) throw notFound();
  const rows = await ctx.sql<{ mime: string; data: Buffer }[]>`
    select mime, data from invitation_photos where invitation_id = ${inv.id}`;
  const photo = rows[0];
  if (!photo) throw notFound();
  return new Response(new Uint8Array(photo.data), {
    status: 200,
    headers: {
      'content-type': photo.mime,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-origin',
    },
  });
};

export const postAttempt: RouteHandler = async (ctx, [token]) => {
  const inv = await findInvite(ctx, token!);
  const parsed = attemptSchema.safeParse(await readJson(ctx.request));
  if (!parsed.success) throw new HttpError(422, 'validation_error', 'Requisição inválida.');
  const [row] = await ctx.sql<{ status: string }[]>`
    select record_no_attempt(${inv.id}, ${parsed.data.eventId}) as status`;
  return json({ status: row!.status }, { status: 202 });
};

const SUGGESTION_EMPTY: Record<SuggestionMode, string> = {
  place: 'Conte qual lugar você gostaria de conhecer.',
  food: 'Conte de que tipo de comida você está com vontade.',
  free: 'Escreva sua sugestão para o nosso encontro.',
};

export const postConfirm: RouteHandler = async (ctx, [token]) => {
  const inv = await findInvite(ctx, token!);
  const parsed = confirmSchema.safeParse(await readJson(ctx.request));
  if (!parsed.success) {
    throw new HttpError(422, 'validation_error', 'Confira os campos e tente novamente.', {
      fieldErrors: fieldErrorsFromZod(parsed.error.issues),
    });
  }
  const option = parsed.data.selectedOption ?? null;
  const text = parsed.data.suggestionText ?? null;

  if (option && !inv.suggestion_options.includes(option)) {
    throw new HttpError(422, 'validation_error', 'Escolha uma das opções disponíveis.', {
      fieldErrors: { selectedOption: 'Essa opção não está disponível.' },
    });
  }
  if (!option && !text) {
    const msg = inv.suggestion_options.length > 0 ? 'Escolha uma opção ou escreva sua sugestão.' : SUGGESTION_EMPTY[inv.suggestion_mode];
    throw new HttpError(422, 'validation_error', msg, { fieldErrors: { suggestion: msg } });
  }

  const [res] = await ctx.sql<{ out_outcome: string; out_response_id: string | null }[]>`
    select * from confirm_invitation(${inv.id}, ${parsed.data.slotId}, ${inv.suggestion_mode}, ${option}, ${text})`;
  const outcome = res!.out_outcome;

  if (outcome === 'unavailable' || outcome === 'not_found') throw notFound();
  if (outcome === 'slot_unavailable') {
    throw new HttpError(409, 'slot_unavailable', 'Essa opção não está mais disponível. Escolha outra data.');
  }

  const answer = await confirmedAnswer(ctx, inv.id);
  if (!answer) {
    throw new HttpError(503, 'service_unavailable', 'Não foi possível carregar a confirmação. Tente novamente em instantes.');
  }

  // A resposta JÁ está gravada e confirmada. Só agora disparamos o e-mail (uma única vez: apenas em 'created').
  if (outcome === 'created' && res!.out_response_id) {
    const responseId = res!.out_response_id;
    ctx.waitUntil(sendResponseNotification(ctx.sql, ctx.cfg, responseId, ctx.fetchImpl).catch(() => {}));
  }

  const result: ConfirmResult = { outcome: outcome === 'created' ? 'created' : 'already_confirmed', answer };
  return json(result, { status: outcome === 'created' ? 201 : 200 });
};
