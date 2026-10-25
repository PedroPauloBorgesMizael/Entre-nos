import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, futureSlot, makeHarness, type Harness } from '../helpers/harness';
import { startPostgres, type TestPostgres } from '../helpers/pg';

let pg: TestPostgres;
let h: Harness;
let cookie: string;

beforeAll(async () => {
  pg = await startPostgres();
  h = await makeHarness(pg);
});
afterAll(async () => {
  await h?.close();
  await pg?.stop();
});
beforeEach(async () => {
  await h.reset();
  cookie = await h.login();
});

const attempt = (token: string, eventId = crypto.randomUUID()) =>
  h.call('POST', `/invite/${token}/attempt`, { body: { eventId }, origin: null, csrf: false });
const confirm = (token: string, body: unknown) =>
  h.call('POST', `/invite/${token}/confirm`, { body, origin: null, csrf: false });
const getInvite = (token: string) => h.call('GET', `/invite/${token}`);
const noAttempts = async (id: string) =>
  (await h.sql<{ n: number }[]>`select no_attempts as n from invitations where id = ${id}`)[0]!.n;
const countResponses = async (id: string) =>
  (await h.sql<{ n: number }[]>`select count(*)::int as n from responses where invitation_id = ${id}`)[0]!.n;

describe('convite público', () => {
  it('mostra somente os dados daquele convite (e apenas as disponibilidades cadastradas)', async () => {
    const a = await h.createInvite(cookie, { name: 'Marina' });
    await h.createInvite(cookie, { name: 'Outra Pessoa', openingMessage: 'Segredo da outra' });

    const res = await getInvite(a.token);
    expect(res.status).toBe(200);
    const body = await h.json(res);
    expect(body.name).toBe('Marina');
    expect(body.state).toBe('open');
    expect(body.slots).toHaveLength(2);
    expect(body.slots.map((s: { id: string }) => s.id).sort()).toEqual(a.slots.map((s: { id: string }) => s.id).sort());

    const raw = JSON.stringify(body);
    for (const leak of ['Outra Pessoa', 'Segredo da outra', ADMIN.email, 'token', 'password', 'no_attempts', 'noAttempts']) {
      expect(raw, leak).not.toContain(leak);
    }
  });

  it('token inexistente, rascunho e encerrado devolvem exatamente a mesma resposta (sem enumeração)', async () => {
    const draft = await h.createInvite(cookie, { status: 'draft' });
    const closed = await h.createInvite(cookie);
    await h.admin('POST', `/invitations/${closed.id}/close`, cookie);

    const bodies: string[] = [];
    for (const token of [draft.token, closed.token, 'a'.repeat(43), 'curto', 'a%2F..%2Fb']) {
      const res = await getInvite(token);
      expect(res.status, token).toBe(404);
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('converte horários de Brasília para o instante correto (15h BRT = 18h UTC)', async () => {
    const a = await h.createInvite(cookie, { slots: [futureSlot(20, '15:00')] });
    const [row] = await h.sql<{ h: number }[]>`
      select extract(hour from starts_at at time zone 'UTC')::int as h from availability_slots where invitation_id = ${a.id}`;
    expect(row!.h).toBe(18);
  });

  describe('botão "Não"', () => {
    it('persiste cada tentativa no banco e o painel enxerga a contagem', async () => {
      const a = await h.createInvite(cookie);
      for (let i = 0; i < 3; i++) {
        const res = await attempt(a.token);
        expect(res.status).toBe(202);
        expect((await h.json(res)).status).toBe('recorded');
      }
      expect(await noAttempts(a.id)).toBe(3);

      const summary = await h.json(await h.admin('GET', '/summary', cookie));
      expect(summary.noAttempts).toBe(3);
      const list = await h.json(await h.admin('GET', '/invitations', cookie));
      expect(list.items[0].noAttempts).toBe(3);
    });

    it('é idempotente: repetir o mesmo evento (retry/mouse+toque) não duplica', async () => {
      const a = await h.createInvite(cookie);
      const eventId = crypto.randomUUID();
      const results = await Promise.all(Array.from({ length: 10 }, () => attempt(a.token, eventId)));
      const statuses = await Promise.all(results.map((r) => h.json(r).then((j) => j.status)));
      expect(statuses.filter((s) => s === 'recorded')).toHaveLength(1);
      expect(await noAttempts(a.id)).toBe(1);
      expect((await h.json(await attempt(a.token, eventId))).status).toBe('duplicate');
    });

    it('aplica limite de frequência sem impedir o uso normal', async () => {
      const a = await h.createInvite(cookie);
      const out: string[] = [];
      for (let i = 0; i < 40; i++) out.push((await h.json(await attempt(a.token))).status);
      expect(out.filter((s) => s === 'recorded')).toHaveLength(30);
      expect(out.filter((s) => s === 'limited')).toHaveLength(10);
      expect(await noAttempts(a.id)).toBe(30);
    });

    it('rejeita payload inválido e não conta tentativas em convite encerrado', async () => {
      const a = await h.createInvite(cookie);
      const bad = await h.call('POST', `/invite/${a.token}/attempt`, { body: { eventId: 'x' }, origin: null, csrf: false });
      expect(bad.status).toBe(422);
      await h.admin('POST', `/invitations/${a.id}/close`, cookie);
      expect((await attempt(a.token)).status).toBe(404);
      expect(await noAttempts(a.id)).toBe(0);
    });
  });

  describe('confirmação', () => {
    it('valida a sugestão antes de gravar e mantém mensagens amigáveis', async () => {
      const a = await h.createInvite(cookie, { suggestionMode: 'food' });
      const slot = a.slots[0]!.id;
      const res = await confirm(a.token, { slotId: slot, suggestionText: '   ' });
      expect(res.status).toBe(422);
      const body = await h.json(res);
      expect(body.fieldErrors.suggestion).toMatch(/comida/i);
      expect(await countResponses(a.id)).toBe(0);
    });

    it('com opções predefinidas: aceita só opções cadastradas e permite complementar', async () => {
      const a = await h.createInvite(cookie, { suggestionOptions: ['Italiano', 'Japonês'] });
      const slot = a.slots[0]!.id;
      expect((await confirm(a.token, { slotId: slot, selectedOption: 'Pizza do João' })).status).toBe(422);
      const ok = await confirm(a.token, { slotId: slot, selectedOption: 'Japonês', suggestionText: 'Gosto de lugares calmos' });
      expect(ok.status).toBe(201);
      const body = await h.json(ok);
      expect(body.answer.selectedOption).toBe('Japonês');
      expect(body.answer.suggestionText).toBe('Gosto de lugares calmos');
    });

    it('rejeita slot que pertence a outro convite (sem misturar data/horário)', async () => {
      const a = await h.createInvite(cookie);
      const b = await h.createInvite(cookie, { name: 'Bia' });
      const res = await confirm(a.token, { slotId: b.slots[0]!.id, suggestionText: 'Museu' });
      expect(res.status).toBe(409);
      expect(await countResponses(a.id)).toBe(0);
      expect(await countResponses(b.id)).toBe(0);
    });

    it('grava a resposta, só então envia UM e-mail com os dados corretos', async () => {
      const a = await h.createInvite(cookie, { name: 'Marina' });
      const slot = a.slots[0]!;
      const res = await confirm(a.token, { slotId: slot.id, suggestionText: 'Museu de Arte' });
      expect(res.status).toBe(201);
      const body = await h.json(res);
      expect(body.outcome).toBe('created');
      expect(body.answer.startsAt).toBe(slot.startsAt);

      // resposta persistida e convite confirmado
      const [row] = await h.sql<{ status: string; n: number }[]>`
        select i.status, (select count(*)::int from responses where invitation_id = i.id and state = 'confirmed') as n
          from invitations i where i.id = ${a.id}`;
      expect(row).toEqual({ status: 'confirmed', n: 1 });

      await h.flush();
      expect(h.emails).toHaveLength(1);
      const mail = h.emails[0]!;
      expect(mail.to).toEqual([ADMIN.email]);
      expect(mail.subject).toBe('O encontro com Marina foi marcado 💌');
      expect(mail.text).toContain('Local: Museu de Arte');
      expect(mail.text).toContain('15h');
      expect(mail.html).toContain(`href="${ADMIN.appUrl}/admin"`);
      // nenhum segredo/token no e-mail
      for (const secret of [a.token, ADMIN.sessionSecret, ADMIN.password, ADMIN.resendKey]) {
        expect(mail.html).not.toContain(secret);
        expect(mail.text).not.toContain(secret);
      }
      expect(mail.authorization).toBe(`Bearer ${ADMIN.resendKey}`);

      const detail = await h.json(await h.admin('GET', `/invitations/${a.id}`, cookie));
      expect(detail.response.emailStatus).toBe('sent');
      expect(detail.response.suggestionText).toBe('Museu de Arte');
    });

    it('confirmações simultâneas/duplicadas geram uma única resposta e um único e-mail', async () => {
      const a = await h.createInvite(cookie);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => confirm(a.token, { slotId: a.slots[i % 2]!.id, suggestionText: `Ideia ${i}` })),
      );
      const bodies = await Promise.all(results.map((r) => h.json(r)));
      expect(bodies.filter((b) => b.outcome === 'created')).toHaveLength(1);
      expect(bodies.filter((b) => b.outcome === 'already_confirmed')).toHaveLength(5);
      expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      expect(await countResponses(a.id)).toBe(1);
      // todas as respostas retornam o MESMO resumo (o que ficou gravado)
      expect(new Set(bodies.map((b) => JSON.stringify(b.answer))).size).toBe(1);
      await h.flush();
      expect(h.emails).toHaveLength(1);
    });

    it('após confirmar: recarregar mostra o estado persistido e novas confirmações não criam outra resposta', async () => {
      const a = await h.createInvite(cookie);
      await confirm(a.token, { slotId: a.slots[0]!.id, suggestionText: 'Café' });
      const body = await h.json(await getInvite(a.token));
      expect(body.state).toBe('answered');
      expect(body.answer.suggestionText).toBe('Café');
      expect(body.slots).toEqual([]);

      const again = await confirm(a.token, { slotId: a.slots[1]!.id, suggestionText: 'Outra coisa' });
      expect(again.status).toBe(200);
      expect((await h.json(again)).answer.suggestionText).toBe('Café');
      expect(await countResponses(a.id)).toBe(1);
      expect((await h.json(await attempt(a.token))).status).toBe('ignored');
    });

    it('convite desativado não aceita respostas', async () => {
      const a = await h.createInvite(cookie);
      await h.admin('POST', `/invitations/${a.id}/close`, cookie);
      const res = await confirm(a.token, { slotId: a.slots[0]!.id, suggestionText: 'Café' });
      expect(res.status).toBe(404);
      expect(await countResponses(a.id)).toBe(0);
      await h.flush();
      expect(h.emails).toHaveLength(0);
    });

    it('não aceita horário que já passou', async () => {
      const a = await h.createInvite(cookie);
      await h.sql`update availability_slots set starts_at = now() - interval '1 hour' where id = ${a.slots[0]!.id}`;
      const res = await confirm(a.token, { slotId: a.slots[0]!.id, suggestionText: 'Café' });
      expect(res.status).toBe(409);
      const body = await h.json(await getInvite(a.token));
      expect(body.slots).toHaveLength(1); // o passado deixa de ser oferecido
    });
  });

  describe('e-mail com falha ou sem configuração', () => {
    it('falha do provedor NÃO apaga a resposta; fica "failed" e pode ser reenviada', async () => {
      const a = await h.createInvite(cookie);
      h.setEmailMode('http-error');
      const res = await confirm(a.token, { slotId: a.slots[0]!.id, suggestionText: 'Café' });
      expect(res.status).toBe(201);
      await h.flush();
      expect(await countResponses(a.id)).toBe(1);
      let detail = await h.json(await h.admin('GET', `/invitations/${a.id}`, cookie));
      expect(detail.response.emailStatus).toBe('failed');
      expect(detail.response.emailError).toContain('403');
      expect(JSON.stringify(detail)).not.toContain(ADMIN.resendKey);

      h.setEmailMode('network-error');
      detail = await h.json(await h.admin('POST', `/invitations/${a.id}/resend-email`, cookie));
      expect(detail.response.emailStatus).toBe('failed');
      expect(detail.response.emailAttempts).toBe(3 - 1);

      h.setEmailMode('ok');
      detail = await h.json(await h.admin('POST', `/invitations/${a.id}/resend-email`, cookie));
      expect(detail.response.emailStatus).toBe('sent');
      expect(h.emails).toHaveLength(1);

      const again = await h.admin('POST', `/invitations/${a.id}/resend-email`, cookie);
      expect(again.status).toBe(409); // já aceito pelo provedor: não duplica
      expect(h.emails).toHaveLength(1);
    });

    it('sem RESEND_API_KEY: resposta salva, estado "skipped" explicando o motivo', async () => {
      const original = h.cfg.resendApiKey;
      h.cfg.resendApiKey = null;
      try {
        const a = await h.createInvite(cookie);
        expect((await confirm(a.token, { slotId: a.slots[0]!.id, suggestionText: 'Café' })).status).toBe(201);
        await h.flush();
        const detail = await h.json(await h.admin('GET', `/invitations/${a.id}`, cookie));
        expect(detail.response.emailStatus).toBe('skipped');
        expect(detail.response.emailError).toMatch(/RESEND_API_KEY/);
        expect(h.emails).toHaveLength(0);
      } finally {
        h.cfg.resendApiKey = original;
      }
    });

    it('escapa HTML do nome no e-mail', async () => {
      const a = await h.createInvite(cookie, { name: '<img src=x onerror=alert(1)>' });
      await confirm(a.token, { slotId: a.slots[0]!.id, suggestionText: '<script>alert(1)</script>' });
      await h.flush();
      expect(h.emails[0]!.html).not.toContain('<img src=x');
      expect(h.emails[0]!.html).not.toContain('<script>');
      expect(h.emails[0]!.html).toContain('&lt;script&gt;');
    });
  });
});


