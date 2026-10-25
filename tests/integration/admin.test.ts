import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, baseInvite, futureSlot, makeHarness, type Harness } from '../helpers/harness';
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

// --- imagens sintéticas estruturalmente válidas ---------------------------------
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
function jpeg(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, ...be16(h), ...be16(w), 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}
function png(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 2, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

describe('autenticação e autorização', () => {
  it('bloqueia toda rota privada sem sessão', async () => {
    const targets: [string, string][] = [
      ['GET', '/summary'],
      ['GET', '/invitations'],
      ['POST', '/invitations'],
      ['GET', '/invitations/00000000-0000-0000-0000-000000000000'],
      ['PUT', '/invitations/00000000-0000-0000-0000-000000000000/photo'],
      ['GET', '/invitations/00000000-0000-0000-0000-000000000000/photo'],
      ['POST', '/invitations/00000000-0000-0000-0000-000000000000/close'],
      ['POST', '/invitations/00000000-0000-0000-0000-000000000000/resend-email'],
    ];
    for (const [method, path] of targets) {
      const res = await h.call(method, `/admin${path}`, { body: method === 'POST' ? {} : undefined });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
    expect((await h.call('GET', '/admin/me')).status).toBe(401);
  });

  it('rejeita cookie adulterado, assinado com outro segredo ou de outro formato', async () => {
    const good = cookie.split('=')[1]!;
    const name = cookie.split('=')[0]!;
    const [hd, pl, sig] = good.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin', sv: 0, exp: 9_999_999_999 })).toString('base64url');
    for (const bad of [`${hd}.${forgedPayload}.${sig}`, 'abc', `${hd}.${pl}.`, `${good}x`]) {
      const res = await h.call('GET', '/admin/summary', { cookie: `${name}=${bad}` });
      expect(res.status, bad.slice(0, 12)).toBe(401);
    }
    expect((await h.call('GET', '/admin/summary', { cookie })).status).toBe(200);
  });

  it('exige cabeçalho CSRF e Origin do próprio site nas mutações', async () => {
    const body = baseInvite();
    expect((await h.call('POST', '/admin/invitations', { cookie, body, csrf: false })).status).toBe(403);
    expect((await h.call('POST', '/admin/invitations', { cookie, body, origin: null })).status).toBe(403);
    expect((await h.call('POST', '/admin/invitations', { cookie, body, origin: 'https://evil.example' })).status).toBe(403);
    expect((await h.call('POST', '/admin/invitations', { cookie, body })).status).toBe(201);
  });

  it('cookie de sessão: HttpOnly, Secure, SameSite=Strict, __Host-, com expiração', async () => {
    const res = await h.call('POST', '/admin/login', { body: { username: ADMIN.username, password: ADMIN.password } });
    const sc = res.headers.getSetCookie()[0]!;
    expect(sc).toMatch(/^__Host-entre_nos_session=/);
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/Secure/);
    expect(sc).toMatch(/SameSite=Strict/);
    expect(sc).toMatch(/Path=\//);
    expect(sc).toMatch(/Max-Age=43200/);
    expect(sc).not.toMatch(/Domain=/);
  });

  it('credenciais inválidas: mesma mensagem para usuário ou senha errados', async () => {
    const a = await h.call('POST', '/admin/login', { body: { username: 'outro', password: ADMIN.password } });
    const b = await h.call('POST', '/admin/login', { body: { username: ADMIN.username, password: 'errada-errada' } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.text()).toBe(await b.text());
    expect(a.headers.get('set-cookie')).toBeNull();
  });

  it('bloqueia após tentativas repetidas, mesmo com a senha certa durante o bloqueio', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await h.call('POST', '/admin/login', { body: { username: ADMIN.username, password: `errada-${i}` } });
      expect(r.status).toBe(401);
    }
    const locked = await h.call('POST', '/admin/login', { body: { username: ADMIN.username, password: ADMIN.password } });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(locked.headers.get('set-cookie')).toBeNull();
    // sessão já ativa continua funcionando
    expect((await h.call('GET', '/admin/summary', { cookie })).status).toBe(200);
    // simula o fim do bloqueio
    await pg.admin`update auth_throttle set locked_until = now() - interval '1 second'`;
    expect((await h.call('POST', '/admin/login', { body: { username: ADMIN.username, password: ADMIN.password } })).status).toBe(200);
  });

  it('logout limpa o cookie', async () => {
    const res = await h.call('POST', '/admin/logout', { cookie });
    expect(res.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);
  });

  describe('recuperação', () => {
    it('só expõe as perguntas, nunca as respostas ou hashes', async () => {
      const res = await h.call('GET', '/admin/recover/questions');
      const body = await h.json(res);
      expect(body).toEqual({ questions: [ADMIN.q1, ADMIN.q2] });
    });

    it('exige AS DUAS respostas exatas', async () => {
      const newPassword = 'nova-senha-super-forte';
      for (const [a1, a2] of [
        [ADMIN.a1, 'errada'],
        ['errada', ADMIN.a2],
        [ADMIN.a1.toLowerCase(), ADMIN.a2], // correspondência exata: maiúsculas importam
        [ADMIN.a1, ADMIN.a2.toLowerCase()],
      ] as const) {
        const res = await h.call('POST', '/admin/recover', { body: { answer1: a1, answer2: a2, newPassword } });
        expect(res.status).toBe(401);
      }
      // nada mudou
      expect((await h.call('POST', '/admin/login', { body: { username: ADMIN.username, password: newPassword } })).status).toBe(401);
      expect((await pg.admin`select count(*)::int as n from admin_credentials`)[0]!.n).toBe(0);
    });

    it('com as respostas certas troca a senha (hash), invalida sessões antigas e aceita só a nova', async () => {
      const newPassword = 'nova-senha-super-forte';
      const res = await h.call('POST', '/admin/recover', {
        body: { answer1: `  ${ADMIN.a1}  `, answer2: ADMIN.a2, newPassword }, // espaços nas pontas são ignorados
      });
      expect(res.status).toBe(200);

      const [row] = await pg.admin<{ password_hash: string }[]>`select password_hash from admin_credentials where id = 1`;
      expect(row!.password_hash).toMatch(/^\$2[aby]\$/);
      expect(row!.password_hash).not.toContain(newPassword);

      expect((await h.call('GET', '/admin/summary', { cookie })).status).toBe(401); // sessão antiga invalidada
      expect((await h.call('POST', '/admin/login', { body: { username: ADMIN.username, password: ADMIN.password } })).status).toBe(401);
      const fresh = await h.login(newPassword);
      expect((await h.call('GET', '/admin/summary', { cookie: fresh })).status).toBe(200);
    });

    it('limita tentativas de recuperação', async () => {
      for (let i = 0; i < 5; i++) {
        const r = await h.call('POST', '/admin/recover', {
          body: { answer1: 'x', answer2: 'y', newPassword: 'nova-senha-super-forte' },
        });
        expect(r.status).toBe(401);
      }
      const r = await h.call('POST', '/admin/recover', {
        body: { answer1: ADMIN.a1, answer2: ADMIN.a2, newPassword: 'nova-senha-super-forte' },
      });
      expect(r.status).toBe(429);
    });

    it('rejeita senha nova fraca', async () => {
      const r = await h.call('POST', '/admin/recover', { body: { answer1: ADMIN.a1, answer2: ADMIN.a2, newPassword: 'curta' } });
      expect(r.status).toBe(422);
    });
  });

  it('trocar a senha no painel exige a atual, invalida outras sessões e devolve nova sessão', async () => {
    const other = await h.login();
    const wrong = await h.call('POST', '/admin/password', { cookie, body: { currentPassword: 'x'.repeat(14), newPassword: 'outra-senha-bem-forte' } });
    expect(wrong.status).toBe(400);

    const ok = await h.call('POST', '/admin/password', { cookie, body: { currentPassword: ADMIN.password, newPassword: 'outra-senha-bem-forte' } });
    expect(ok.status).toBe(200);
    const fresh = ok.headers.getSetCookie()[0]!.split(';')[0]!;
    expect((await h.call('GET', '/admin/summary', { cookie: fresh })).status).toBe(200);
    expect((await h.call('GET', '/admin/summary', { cookie: other })).status).toBe(401);
    expect((await h.call('GET', '/admin/summary', { cookie })).status).toBe(401);
  });

  it('nenhuma resposta da API contém segredos, hashes ou o e-mail do administrador', async () => {
    const inv = await h.createInvite(cookie);
    const pub = await h.call('GET', `/invite/${inv.token}`);
    const pubText = await pub.clone().text();
    const responses = [
      await h.call('GET', '/admin/summary', { cookie }),
      await h.call('GET', '/admin/invitations', { cookie }),
      await h.call('GET', `/admin/invitations/${inv.id}`, { cookie }),
      await h.call('GET', '/admin/me', { cookie }),
      await h.call('GET', '/admin/recover/questions'),
      pub,
    ];
    const all = (await Promise.all(responses.map((r) => r.text()))).join('\n');
    const secrets = [
      ADMIN.sessionSecret,
      ADMIN.resendKey,
      ADMIN.password,
      ADMIN.a1,
      ADMIN.a2,
      h.cfg.adminInitialPasswordHash,
      ...h.cfg.recoveryAnswerHashes,
      pg.appUrl,
      'password_hash',
    ];
    for (const s of secrets) expect(all).not.toContain(s);
    // o e-mail do admin só pode aparecer em respostas autenticadas; nunca na pública
    expect(pubText).not.toContain(ADMIN.email);
  });

  it('erros internos não vazam detalhes', async () => {
    const orig = h.cfg.adminUsername;
    const res = await h.call('GET', '/invite/' + 'a'.repeat(43));
    expect(res.status).toBe(404);
    expect(orig).toBe(ADMIN.username);
    const bad = await h.call('GET', '/admin/invitations/not-a-uuid', { cookie });
    expect(bad.status).toBe(404);
    expect(await bad.text()).not.toMatch(/uuid|syntax|postgres|select/i);
  });
});

describe('painel: convites', () => {
  it('cria com token aleatório forte, link com APP_URL e valida entradas', async () => {
    const a = await h.createInvite(cookie);
    const b = await h.createInvite(cookie, { name: 'Bia' });
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.detail.link).toBe(`${ADMIN.appUrl}/c/${a.token}`);
    expect(a.token.toLowerCase()).not.toContain('marina');

    const bad = [
      { ...baseInvite(), name: '   ' },
      { ...baseInvite(), slots: [{ date: '2026-02-31', time: '19:00' }] },
      { ...baseInvite(), slots: [futureSlot(5, '19:00'), futureSlot(5, '19:00')] },
      { ...baseInvite(), slots: [{ date: '2020-01-01', time: '19:00' }] },
      { ...baseInvite(), suggestionMode: 'outro' },
      { ...baseInvite(), suggestionOptions: ['A', 'a'] },
      { ...baseInvite(), status: 'confirmed' },
    ];
    for (const body of bad) {
      const res = await h.admin('POST', '/invitations', cookie, body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(422);
    }
  });

  it('nome com HTML é armazenado como texto puro (a UI renderiza como texto)', async () => {
    const a = await h.createInvite(cookie, { name: '<b>Ana</b>' });
    const pub = await h.json(await h.call('GET', `/invite/${a.token}`));
    expect(pub.name).toBe('<b>Ana</b>');
  });

  it('lista e resumo refletem os estados', async () => {
    const active = await h.createInvite(cookie);
    const draft = await h.createInvite(cookie, { status: 'draft', name: 'Rascunho' });
    const closed = await h.createInvite(cookie, { name: 'Fechado' });
    const done = await h.createInvite(cookie, { name: 'Confirmado' });
    await h.admin('POST', `/invitations/${closed.id}/close`, cookie);
    await h.call('POST', `/invite/${done.token}/confirm`, { body: { slotId: done.slots[0]!.id, suggestionText: 'Café' }, origin: null, csrf: false });
    await h.flush();
    expect(active.id).toBeTruthy();
    expect(draft.id).toBeTruthy();

    const summary = await h.json(await h.admin('GET', '/summary', cookie));
    expect(summary).toMatchObject({ total: 4, drafts: 1, awaiting: 1, confirmed: 1, closed: 1 });
    expect(summary.notifications).toHaveLength(1);
    expect(summary.notifications[0]).toMatchObject({ name: 'Confirmado', seen: false, emailStatus: 'sent' });

    const list = await h.json(await h.admin('GET', '/invitations', cookie));
    const item = list.items.find((i: { name: string }) => i.name === 'Confirmado');
    expect(item).toMatchObject({ status: 'confirmed', hasResponse: true, unseenResponse: true });

    await h.admin('POST', `/invitations/${done.id}/seen`, cookie);
    const after = await h.json(await h.admin('GET', '/summary', cookie));
    expect(after.notifications[0].seen).toBe(true);
  });

  it('edita convite não respondido: adiciona/remove horários e muda configuração', async () => {
    const a = await h.createInvite(cookie);
    const keep = a.detail.slots[0]!;
    const res = await h.admin('PUT', `/invitations/${a.id}`, cookie, {
      ...baseInvite({ name: 'Marina S.', question: 'Qual comida?', suggestionMode: 'food', suggestionOptions: ['Pizza'] }),
      slots: [futureSlot(10, '15:00'), futureSlot(30, '10:00')],
    });
    expect(res.status).toBe(200);
    const d = await h.json(res);
    expect(d.name).toBe('Marina S.');
    expect(d.suggestionMode).toBe('food');
    expect(d.slots).toHaveLength(2);
    expect(d.slots.map((s: { id: string }) => s.id)).toContain(keep.id); // horário mantido preserva o id
  });

  it('convite confirmado: resposta preservada e só nome/mensagem/foto podem mudar', async () => {
    const a = await h.createInvite(cookie);
    await h.call('POST', `/invite/${a.token}/confirm`, { body: { slotId: a.slots[0]!.id, suggestionText: 'Café' }, origin: null, csrf: false });
    const res = await h.admin('PUT', `/invitations/${a.id}`, cookie, {
      ...baseInvite({ name: 'Novo Nome', question: 'Outra pergunta', status: 'draft' }),
      slots: [futureSlot(40, '09:00')],
    });
    expect(res.status).toBe(200);
    const d = await h.json(res);
    expect(d.name).toBe('Novo Nome');
    expect(d.locked).toBe(true);
    expect(d.status).toBe('confirmed');
    expect(d.question).toBe(baseInvite().question);
    expect(d.slots.map((s: { id: string }) => s.id).sort()).toEqual(a.slots.map((s: { id: string }) => s.id).sort());
    expect(d.response.suggestionText).toBe('Café');
    // não pode ser encerrado sem reabrir
    expect((await h.admin('POST', `/invitations/${a.id}/close`, cookie)).status).toBe(409);
  });

  it('desativar, reativar e reabrir (arquiva a resposta anterior, permite nova)', async () => {
    const a = await h.createInvite(cookie);
    const closed = await h.json(await h.admin('POST', `/invitations/${a.id}/close`, cookie));
    expect(closed.status).toBe('closed');
    const active = await h.json(await h.admin('POST', `/invitations/${a.id}/activate`, cookie));
    expect(active.status).toBe('active');

    const first = await h.call('POST', `/invite/${a.token}/confirm`, { body: { slotId: a.slots[0]!.id, suggestionText: 'Café' }, origin: null, csrf: false });
    expect(first.status).toBe(201);
    const reopened = await h.json(await h.admin('POST', `/invitations/${a.id}/reopen`, cookie));
    expect(reopened.status).toBe('active');
    expect(reopened.response).toBeNull();
    expect(reopened.archivedResponses).toHaveLength(1);
    expect(reopened.archivedResponses[0].suggestionText).toBe('Café');

    const second = await h.call('POST', `/invite/${a.token}/confirm`, { body: { slotId: a.slots[1]!.id, suggestionText: 'Cinema' }, origin: null, csrf: false });
    expect(second.status).toBe(201);
    const d = await h.json(await h.admin('GET', `/invitations/${a.id}`, cookie));
    expect(d.response.suggestionText).toBe('Cinema');
    expect(d.archivedResponses).toHaveLength(1);
    await h.flush();
    expect(h.emails).toHaveLength(2);
  });
});

describe('painel: foto', () => {
  const put = (id: string, bytes: Uint8Array, type = 'image/jpeg') =>
    h.call('PUT', `/admin/invitations/${id}/photo`, { cookie, rawBody: bytes, contentType: type });

  it('aceita JPEG e PNG válidos e serve ao convite só quando habilitada', async () => {
    const a = await h.createInvite(cookie, { photoEnabled: true });
    expect((await put(a.id, jpeg(800, 1000))).status).toBe(200);
    let pub = await h.json(await h.call('GET', `/invite/${a.token}`));
    expect(pub.photoUrl).toMatch(new RegExp(`^/api/invite/${a.token}/photo\\?v=\\d+$`));

    const img = await h.call('GET', `/invite/${a.token}/photo`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(img.headers.get('x-content-type-options')).toBe('nosniff');
    expect(img.headers.get('content-security-policy')).toContain('sandbox');
    expect((await img.arrayBuffer()).byteLength).toBe(jpeg(800, 1000).byteLength);

    expect((await put(a.id, png(600, 600), 'image/png')).status).toBe(200);
    expect((await h.call('GET', `/invite/${a.token}/photo`)).headers.get('content-type')).toBe('image/png');

    // desabilitada: o convite não mostra nem serve a foto
    await h.admin('PUT', `/invitations/${a.id}`, cookie, { ...baseInvite({ photoEnabled: false }), slots: a.detail.slots.map((s: { startsAt: string }) => futureSlotFrom(s.startsAt)) });
    pub = await h.json(await h.call('GET', `/invite/${a.token}`));
    expect(pub.photoUrl).toBeNull();
    expect((await h.call('GET', `/invite/${a.token}/photo`)).status).toBe(404);
  });

  it('valida o conteúdo real: ignora o Content-Type declarado', async () => {
    const a = await h.createInvite(cookie);
    const cases: [string, Uint8Array][] = [
      ['texto', new TextEncoder().encode('<script>alert(1)</script>')],
      ['html com tipo jpeg', new TextEncoder().encode('<!doctype html><html></html>')],
      ['svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
      ['jpeg truncado (sem EOI)', jpeg(100, 100).slice(0, -2)],
      ['aleatório', crypto.getRandomValues(new Uint8Array(500))],
      ['jpeg com dimensões absurdas', jpeg(20000, 20000)],
      ['vazio', new Uint8Array(0)],
    ];
    for (const [name, bytes] of cases) {
      const res = await put(a.id, bytes, 'image/jpeg');
      expect([400, 413], name).toContain(res.status);
    }
    expect((await h.json(await h.admin('GET', `/invitations/${a.id}`, cookie))).hasPhoto).toBe(false);
  });

  it('limita o tamanho (700 KB)', async () => {
    const a = await h.createInvite(cookie);
    const big = new Uint8Array(800 * 1024);
    big.set(jpeg(100, 100));
    const res = await put(a.id, big);
    expect(res.status).toBe(413);
  });

  it('permite remover e pré-visualizar (autenticado)', async () => {
    const a = await h.createInvite(cookie);
    await put(a.id, jpeg(300, 400));
    expect((await h.call('GET', `/admin/invitations/${a.id}/photo`)).status).toBe(401);
    const prev = await h.call('GET', `/admin/invitations/${a.id}/photo`, { cookie });
    expect(prev.status).toBe(200);
    const del = await h.json(await h.admin('DELETE', `/invitations/${a.id}/photo`, cookie));
    expect(del.hasPhoto).toBe(false);
  });
});

// reaproveita data/hora de Brasília de um instante ISO ao reenviar o formulário de edição
import { utcToBrasiliaFields } from '../../shared/time';
function futureSlotFrom(iso: string) {
  return utcToBrasiliaFields(iso);
}

