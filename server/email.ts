import type { EmailStatus, SuggestionMode } from '../shared/contracts';
import { suggestionLabel, suggestionValue } from '../shared/format';
import { formatSlot } from '../shared/time';
import type { Config } from './config';
import type { Sql } from './db';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const oneLine = (s: string) => s.replace(/[\r\n\u2028\u2029]+/g, ' ').trim();

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EmailInput {
  name: string;
  startsAt: Date;
  suggestionType: SuggestionMode;
  selectedOption: string | null;
  suggestionText: string | null;
  panelUrl: string;
}

export function buildEmail(input: EmailInput): EmailContent {
  const name = oneLine(input.name);
  const slot = formatSlot(input.startsAt);
  const dateLine = `${slot.weekday}, ${slot.date}`;
  const label = suggestionLabel(input.suggestionType);
  const value = suggestionValue(input.selectedOption, input.suggestionText);
  const subject = `O encontro com ${name} foi marcado 💌`;

  const text = [
    'Olá!',
    '',
    `O encontro com ${name} foi marcado.`,
    '',
    `Data: ${dateLine}`,
    `Horário: ${slot.time}`,
    `${label}: ${value}`,
    '',
    'Acesse o painel central para consultar os detalhes da confirmação.',
    `Abrir painel de encontros: ${input.panelUrl}`,
    '',
    'Entre Nós',
  ].join('\n');

  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#79685B;font-size:14px;vertical-align:top;">${esc(k)}</td>` +
    `<td style="padding:6px 0;color:#3B302A;font-size:16px;">${esc(v)}</td></tr>`;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F3EBDD;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EBDD;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFCF6;border:1px solid #E6DACC;border-radius:16px;">
<tr><td style="padding:36px 32px;font-family:Georgia,'Times New Roman',serif;color:#3B302A;">
<p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#B39A68;">Entre Nós</p>
<h1 style="margin:0 0 20px;font-size:26px;font-weight:normal;line-height:1.3;">Olá!<br>O encontro com ${esc(name)} foi marcado.</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;margin:0 0 24px;">
${row('Data', dateLine)}${row('Horário', slot.time)}${row(label, value)}
</table>
<p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#79685B;">Acesse o painel central para consultar os detalhes da confirmação.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#783F43;border-radius:12px;">
<a href="${esc(input.panelUrl)}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#FFFCF6;text-decoration:none;">Abrir painel de encontros</a>
</td></tr></table>
<p style="margin:32px 0 0;font-size:15px;color:#79685B;font-style:italic;">Entre Nós</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

export type FetchLike = typeof fetch;

interface ClaimedRow {
  id: string;
  name: string;
  slot_starts_at: Date;
  suggestion_type: SuggestionMode;
  selected_option: string | null;
  suggestion_text: string | null;
  email_attempts: number;
}

const shortError = (s: string) => s.replace(/\s+/g, ' ').slice(0, 300);

/**
 * Envia a notificação de UMA resposta já gravada. A "reivindicação" atômica (UPDATE ... RETURNING)
 * impede disparos duplicados por cliques repetidos ou chamadas concorrentes.
 * Nunca lança: o resultado fica registrado em responses.email_status.
 */
export async function sendResponseNotification(
  sql: Sql,
  cfg: Config,
  responseId: string,
  fetchImpl: FetchLike = fetch,
): Promise<EmailStatus> {
  const claimed = await sql<ClaimedRow[]>`
    with c as (
      update responses
         set email_status = 'sending', email_attempts = email_attempts + 1, email_updated_at = now()
       where id = ${responseId}
         and state = 'confirmed'
         and (email_status in ('pending', 'failed', 'skipped')
              or (email_status = 'sending' and email_updated_at < now() - interval '5 minutes'))
      returning id, invitation_id, slot_starts_at, suggestion_type, selected_option, suggestion_text, email_attempts
    )
    select c.id, i.name, c.slot_starts_at, c.suggestion_type, c.selected_option, c.suggestion_text, c.email_attempts
      from c join invitations i on i.id = c.invitation_id`;
  const row = claimed[0];
  if (!row) {
    const [cur] = await sql<{ email_status: EmailStatus }[]>`select email_status from responses where id = ${responseId}`;
    return cur?.email_status ?? 'failed';
  }

  const finish = async (status: EmailStatus, error: string | null, providerId: string | null = null) => {
    await sql`
      update responses
         set email_status = ${status}, email_error = ${error}, email_provider_id = ${providerId},
             email_updated_at = now(), email_sent_at = ${status === 'sent' ? sql`now()` : null}
       where id = ${row.id}`;
    return status;
  };

  if (!cfg.resendApiKey) {
    return finish('skipped', 'RESEND_API_KEY não configurada: a resposta foi salva, mas nenhum e-mail foi enviado.');
  }

  try {
    const content = buildEmail({
      name: row.name,
      startsAt: row.slot_starts_at,
      suggestionType: row.suggestion_type,
      selectedOption: row.selected_option,
      suggestionText: row.suggestion_text,
      panelUrl: `${cfg.appUrl}/admin`,
    });
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.resendApiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `entre-nos-${row.id}-${row.email_attempts}`,
      },
      body: JSON.stringify({
        from: cfg.emailFrom,
        to: [cfg.adminEmail],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      return finish('failed', shortError(`Resend ${res.status}: ${body.message ?? body.name ?? 'erro desconhecido'}`));
    }
    return finish('sent', null, body.id ?? null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro de rede';
    return finish('failed', shortError(`Falha ao contatar o provedor: ${msg}`));
  }
}
