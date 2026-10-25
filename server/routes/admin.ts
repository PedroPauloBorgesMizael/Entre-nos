import { randomBytes } from 'node:crypto';
import {
  invitationInputSchema,
  type AdminInvitationDetail,
  type AdminInvitationListItem,
  type AdminNotification,
  type AdminResponse,
  type AdminSummary,
  type EmailStatus,
  type InvitationInput,
  type InvitationStatus,
  type SuggestionMode,
} from '../../shared/contracts';
import { brasiliaToUtc } from '../../shared/time';
import { sendResponseNotification } from '../email';
import { HttpError, json, readBody, readJson, validate } from '../http';
import { MAX_PHOTO_BYTES, inspectImage } from '../photo';
import type { Sql } from '../db';
import type { Ctx, RouteHandler } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new HttpError(404, 'not_found', 'Convite não encontrado.');
const linkFor = (ctx: Ctx, token: string) => `${ctx.cfg.appUrl}/c/${token}`;

interface InvRow {
  id: string;
  token: string;
  name: string;
  opening_message: string;
  photo_enabled: boolean;
  status: InvitationStatus;
  question: string;
  suggestion_mode: SuggestionMode;
  suggestion_options: string[];
  no_attempts: number;
  created_at: Date;
  updated_at: Date;
}

interface RespRow {
  id: string;
  slot_starts_at: Date;
  suggestion_type: SuggestionMode;
  selected_option: string | null;
  suggestion_text: string | null;
  confirmed_at: Date;
  state: 'confirmed' | 'archived';
  email_status: EmailStatus;
  email_attempts: number;
  email_error: string | null;
  email_sent_at: Date | null;
  seen_at: Date | null;
}

async function loadInvitation(sql: Sql, id: string): Promise<InvRow> {
  if (!UUID_RE.test(id)) throw notFound();
  const rows = await sql<InvRow[]>`select * from invitations where id = ${id}`;
  if (!rows[0]) throw notFound();
  return rows[0];
}

const toAdminResponse = (r: RespRow): AdminResponse => ({
  id: r.id,
  startsAt: r.slot_starts_at.toISOString(),
  suggestionType: r.suggestion_type,
  selectedOption: r.selected_option,
  suggestionText: r.suggestion_text,
  confirmedAt: r.confirmed_at.toISOString(),
  state: r.state,
  emailStatus: r.email_status,
  emailAttempts: r.email_attempts,
  emailError: r.email_error,
  emailSentAt: r.email_sent_at?.toISOString() ?? null,
  seen: r.seen_at !== null,
});

async function buildDetail(ctx: Ctx, inv: InvRow): Promise<AdminInvitationDetail> {
  const { sql } = ctx;
  const [slots, responses, photo] = await Promise.all([
    sql<{ id: string; starts_at: Date }[]>`
      select id, starts_at from availability_slots where invitation_id = ${inv.id} order by starts_at`,
    sql<RespRow[]>`select * from responses where invitation_id = ${inv.id} order by confirmed_at desc`,
    sql<{ updated_at: Date }[]>`select updated_at from invitation_photos where invitation_id = ${inv.id}`,
  ]);
  const current = responses.find((r) => r.state === 'confirmed') ?? null;
  return {
    id: inv.id,
    name: inv.name,
    openingMessage: inv.opening_message,
    photoEnabled: inv.photo_enabled,
    hasPhoto: photo.length > 0,
    photoVersion: photo[0] ? String(photo[0].updated_at.getTime()) : null,
    status: inv.status,
    question: inv.question,
    suggestionMode: inv.suggestion_mode,
    suggestionOptions: inv.suggestion_options,
    slots: slots.map((s) => ({ id: s.id, startsAt: s.starts_at.toISOString() })),
    noAttempts: inv.no_attempts,
    createdAt: inv.created_at.toISOString(),
    updatedAt: inv.updated_at.toISOString(),
    link: linkFor(ctx, inv.token),
    response: current ? toAdminResponse(current) : null,
    archivedResponses: responses.filter((r) => r.state === 'archived').map(toAdminResponse),
    locked: inv.status === 'confirmed',
  };
}

// ---------------------------------------------------------------------------
// Resumo e lista
// ---------------------------------------------------------------------------

export const getSummary: RouteHandler = async ({ sql }) => {
  const [counts] = await sql<
    { total: number; drafts: number; awaiting: number; confirmed: number; closed: number; attempts: number }[]
  >`
    select count(*)::int as total,
           count(*) filter (where status = 'draft')::int as drafts,
           count(*) filter (where status = 'active')::int as awaiting,
           count(*) filter (where status = 'confirmed')::int as confirmed,
           count(*) filter (where status = 'closed')::int as closed,
           coalesce(sum(no_attempts), 0)::int as attempts
      from invitations`;
  const notes = await sql<
    { invitation_id: string; name: string; slot_starts_at: Date; confirmed_at: Date; seen_at: Date | null; email_status: EmailStatus }[]
  >`
    select r.invitation_id, i.name, r.slot_starts_at, r.confirmed_at, r.seen_at, r.email_status
      from responses r join invitations i on i.id = r.invitation_id
     where r.state = 'confirmed'
     order by r.confirmed_at desc limit 8`;
  const notifications: AdminNotification[] = notes.map((n) => ({
    invitationId: n.invitation_id,
    name: n.name,
    startsAt: n.slot_starts_at.toISOString(),
    confirmedAt: n.confirmed_at.toISOString(),
    seen: n.seen_at !== null,
    emailStatus: n.email_status,
  }));
  const body: AdminSummary = {
    total: counts!.total,
    drafts: counts!.drafts,
    awaiting: counts!.awaiting,
    confirmed: counts!.confirmed,
    closed: counts!.closed,
    noAttempts: counts!.attempts,
    notifications,
  };
  return json(body);
};

export const listInvitations: RouteHandler = async (ctx) => {
  const rows = await ctx.sql<(InvRow & { has_response: boolean; unseen: boolean })[]>`
    select i.*,
           exists (select 1 from responses r where r.invitation_id = i.id and r.state = 'confirmed') as has_response,
           exists (select 1 from responses r where r.invitation_id = i.id and r.state = 'confirmed' and r.seen_at is null) as unseen
      from invitations i order by i.created_at desc`;
  const items: AdminInvitationListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    noAttempts: r.no_attempts,
    hasResponse: r.has_response,
    unseenResponse: r.unseen,
    link: linkFor(ctx, r.token),
  }));
  return json({ items });
};

// ---------------------------------------------------------------------------
// Criar / editar
// ---------------------------------------------------------------------------

function resolveSlots(input: InvitationInput): Date[] {
  const seen = new Set<number>();
  const out: Date[] = [];
  input.slots.forEach((s, i) => {
    const d = brasiliaToUtc(s.date, s.time);
    if (!d) {
      throw new HttpError(422, 'validation_error', 'Há uma data ou horário inválido.', {
        fieldErrors: { [`slots.${i}`]: 'Data ou horário inválido.' },
      });
    }
    if (seen.has(d.getTime())) {
      throw new HttpError(422, 'validation_error', 'Há horários repetidos.', {
        fieldErrors: { [`slots.${i}`]: 'Esse horário está repetido.' },
      });
    }
    seen.add(d.getTime());
    out.push(d);
  });
  return out;
}

function assertFuture(slots: Date[], input: InvitationInput, onlyNew?: Set<number>) {
  slots.forEach((d, i) => {
    if (onlyNew && !onlyNew.has(d.getTime())) return;
    if (d.getTime() <= Date.now()) {
      throw new HttpError(422, 'validation_error', 'Os horários precisam estar no futuro.', {
        fieldErrors: { [`slots.${i}`]: 'Escolha um horário no futuro.' },
      });
    }
  });
  void input;
}

export const createInvitation: RouteHandler = async (ctx) => {
  const input = validate(invitationInputSchema, await readJson(ctx.request));
  const slots = resolveSlots(input);
  assertFuture(slots, input);
  const token = randomBytes(32).toString('base64url');

  const id = await ctx.sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into invitations (token, name, opening_message, photo_enabled, status, question, suggestion_mode, suggestion_options)
      values (${token}, ${input.name}, ${input.openingMessage}, ${input.photoEnabled}, ${input.status},
              ${input.question}, ${input.suggestionMode}, ${tx.array(input.suggestionOptions, 1009)})
      returning id`;
    if (slots.length > 0) {
      const values = slots.map((d) => ({ invitation_id: row!.id, starts_at: d }));
      await tx`insert into availability_slots ${tx(values, 'invitation_id', 'starts_at')}`;
    }
    return row!.id;
  });

  const inv = await loadInvitation(ctx.sql, id);
  return json(await buildDetail(ctx, inv), { status: 201 });
};

export const getInvitation: RouteHandler = async (ctx, [id]) => {
  const inv = await loadInvitation(ctx.sql, id!);
  return json(await buildDetail(ctx, inv));
};

export const updateInvitation: RouteHandler = async (ctx, [id]) => {
  const input = validate(invitationInputSchema, await readJson(ctx.request));
  const current = await loadInvitation(ctx.sql, id!);

  // Convite confirmado: a resposta original é preservada — só nome, mensagem e foto mudam.
  if (current.status === 'confirmed') {
    await ctx.sql`
      update invitations
         set name = ${input.name}, opening_message = ${input.openingMessage},
             photo_enabled = ${input.photoEnabled}, updated_at = now()
       where id = ${current.id}`;
    return json(await buildDetail(ctx, await loadInvitation(ctx.sql, current.id)));
  }

  const desired = resolveSlots(input);
  await ctx.sql.begin(async (tx) => {
    const [locked] = await tx<{ status: InvitationStatus }[]>`select status from invitations where id = ${current.id} for update`;
    if (locked?.status === 'confirmed') {
      throw new HttpError(409, 'already_confirmed', 'Este convite acabou de ser confirmado e não pode mais ser alterado.');
    }
    const existing = await tx<{ id: string; starts_at: Date }[]>`
      select id, starts_at from availability_slots where invitation_id = ${current.id}`;
    const have = new Set(existing.map((s) => s.starts_at.getTime()));
    const want = new Set(desired.map((d) => d.getTime()));
    assertFuture(desired, input, new Set(desired.filter((d) => !have.has(d.getTime())).map((d) => d.getTime())));

    const removeIds = existing.filter((s) => !want.has(s.starts_at.getTime())).map((s) => s.id);
    if (removeIds.length > 0) {
      await tx`delete from availability_slots where invitation_id = ${current.id} and id in ${tx(removeIds)}`;
    }
    const toAdd = desired.filter((d) => !have.has(d.getTime())).map((d) => ({ invitation_id: current.id, starts_at: d }));
    if (toAdd.length > 0) {
      await tx`insert into availability_slots ${tx(toAdd, 'invitation_id', 'starts_at')}`;
    }
    await tx`
      update invitations
         set name = ${input.name}, opening_message = ${input.openingMessage}, photo_enabled = ${input.photoEnabled},
             status = ${input.status}, question = ${input.question}, suggestion_mode = ${input.suggestionMode},
             suggestion_options = ${tx.array(input.suggestionOptions, 1009)}, updated_at = now()
       where id = ${current.id}`;
  });
  return json(await buildDetail(ctx, await loadInvitation(ctx.sql, current.id)));
};

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export const closeInvitation: RouteHandler = async (ctx, [id]) => {
  const inv = await loadInvitation(ctx.sql, id!);
  if (inv.status === 'confirmed') {
    throw new HttpError(409, 'already_confirmed', 'Este convite já foi confirmado. Reabra-o antes de encerrar.');
  }
  // UPDATE condicional evita corrida com uma confirmação simultânea
  await ctx.sql`update invitations set status = 'closed', updated_at = now() where id = ${inv.id} and status in ('draft', 'active', 'closed')`;
  return json(await buildDetail(ctx, await loadInvitation(ctx.sql, inv.id)));
};

export const activateInvitation: RouteHandler = async (ctx, [id]) => {
  const inv = await loadInvitation(ctx.sql, id!);
  if (inv.status === 'confirmed') throw new HttpError(409, 'already_confirmed', 'Este convite já foi confirmado.');
  await ctx.sql`update invitations set status = 'active', updated_at = now() where id = ${inv.id} and status in ('draft', 'closed', 'active')`;
  return json(await buildDetail(ctx, await loadInvitation(ctx.sql, inv.id)));
};

/** Reabrir é a única forma de permitir uma nova resposta: a anterior é arquivada, não apagada. */
export const reopenInvitation: RouteHandler = async (ctx, [id]) => {
  const inv = await loadInvitation(ctx.sql, id!);
  await ctx.sql.begin(async (tx) => {
    await tx`select 1 from invitations where id = ${inv.id} for update`;
    await tx`update responses set state = 'archived' where invitation_id = ${inv.id} and state = 'confirmed'`;
    await tx`update invitations set status = 'active', updated_at = now() where id = ${inv.id}`;
  });
  return json(await buildDetail(ctx, await loadInvitation(ctx.sql, inv.id)));
};

export const markSeen: RouteHandler = async (ctx, [id]) => {
  const inv = await loadInvitation(ctx.sql, id!);
  await ctx.sql`update responses set seen_at = now() where invitation_id = ${inv.id} and state = 'confirmed' and seen_at is null`;
  return json({ ok: true });
};

export const resendEmail: RouteHandler = async (ctx, [id]) => {
  const inv = await loadInvitation(ctx.sql, id!);
  const [resp] = await ctx.sql<{ id: string; email_status: EmailStatus }[]>`
    select id, email_status from responses where invitation_id = ${inv.id} and state = 'confirmed'`;
  if (!resp) throw new HttpError(404, 'no_response', 'Este convite ainda não tem resposta.');
  if (resp.email_status === 'sent' || resp.email_status === 'sending') {
    throw new HttpError(409, 'email_not_resendable', 'A notificação já foi enviada ao provedor.');
  }
  await sendResponseNotification(ctx.sql, ctx.cfg, resp.id, ctx.fetchImpl);
  return json(await buildDetail(ctx, await loadInvitation(ctx.sql, inv.id)));
};

// ---------------------------------------------------------------------------
// Foto
// ---------------------------------------------------------------------------

export const putPhoto: RouteHandler = async (ctx, [id]) => {
  const inv = await loadInvitation(ctx.sql, id!);
  const bytes = await readBody(ctx.request, MAX_PHOTO_BYTES + 1);
  const info = inspectImage(bytes);
  await ctx.sql`
    insert into invitation_photos (invitation_id, mime, data, width, height)
    values (${inv.id}, ${info.mime}, ${Buffer.from(bytes)}, ${info.width}, ${info.height})
    on conflict (invitation_id) do update
      set mime = excluded.mime, data = excluded.data, width = excluded.width, height = excluded.height, updated_at = now()`;
  await ctx.sql`update invitations set updated_at = now() where id = ${inv.id}`;
  return json(await buildDetail(ctx, await loadInvitation(ctx.sql, inv.id)));
};

export const deletePhoto: RouteHandler = async (ctx, [id]) => {
  const inv = await loadInvitation(ctx.sql, id!);
  await ctx.sql`delete from invitation_photos where invitation_id = ${inv.id}`;
  return json(await buildDetail(ctx, await loadInvitation(ctx.sql, inv.id)));
};

/** Pré-visualização para o administrador (autenticada), independente do status do convite. */
export const getAdminPhoto: RouteHandler = async (ctx, [id]) => {
  const inv = await loadInvitation(ctx.sql, id!);
  const rows = await ctx.sql<{ mime: string; data: Buffer }[]>`select mime, data from invitation_photos where invitation_id = ${inv.id}`;
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Sem foto.');
  return new Response(new Uint8Array(rows[0].data), {
    headers: {
      'content-type': rows[0].mime,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
};

