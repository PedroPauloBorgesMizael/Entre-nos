import { test, expect } from '@playwright/test';
import { startE2EServer, E2E_ADMIN, type E2ETestServer } from './server';
import { randomBytes } from 'node:crypto';

let server: E2ETestServer;
let testToken: string;

test.beforeAll(async () => {
  server = await startE2EServer(8899);

  // Cria um convite para os testes
  testToken = randomBytes(32).toString('base64url');
  const [inv] = await server.sql<{ id: string }[]>`
    insert into invitations (token, name, opening_message, status, question, suggestion_mode, suggestion_options)
    values (${testToken}, 'Beatriz', 'Tenho um convite muito especial para você.', 'active',
            'O que você gostaria de comer?', 'food', ${server.sql.array(['Comida Japonesa', 'Massa Italiana', 'Hambúrguer'], 1009)})
    returning id`;

  const future1 = new Date(Date.now() + 5 * 86400000);
  const future2 = new Date(Date.now() + 6 * 86400000);
  await server.sql`
    insert into availability_slots (invitation_id, starts_at)
    values (${inv!.id}, ${future1}), (${inv!.id}, ${future2})`;
});

test.afterAll(async () => {
  await server?.stop();
});

test.describe('Fluxo Público do Convite (Entre Nós)', () => {
  test('abre convite válido, exibe nome e mensagem personalizados', async ({ page }) => {
    await page.goto(`/c/${testToken}`);
    await expect(page.locator('.invite-title')).toHaveText('Gostaria de sair comigo?');
    await expect(page.locator('.invite-header-badge')).toContainText('Beatriz');
    await expect(page.locator('.invite-message')).toContainText('Tenho um convite muito especial');
    await expect(page.getByTestId('btn-yes')).toBeVisible();
    await expect(page.getByTestId('btn-no')).toBeVisible();
  });

  test('botão "Não" foge para nova posição dentro da tela e registra tentativas', async ({ page }) => {
    await page.goto(`/c/${testToken}`);
    const noBtn = page.getByTestId('btn-no');

    const initialBox = await noBtn.boundingBox();
    expect(initialBox).not.toBeNull();

    // Clica no botão Não (1ª tentativa)
    await noBtn.click();
    await page.waitForTimeout(300);

    const newBox1 = await noBtn.boundingBox();
    expect(newBox1).not.toBeNull();

    // A posição mudou
    expect(newBox1!.x !== initialBox!.x || newBox1!.y !== initialBox!.y).toBe(true);

    // Botão permanece 100% dentro da janela visível
    const vp = page.viewportSize();
    if (vp) {
      expect(newBox1!.x).toBeGreaterThanOrEqual(0);
      expect(newBox1!.x + newBox1!.width).toBeLessThanOrEqual(vp.width);
      expect(newBox1!.y).toBeGreaterThanOrEqual(0);
      expect(newBox1!.y + newBox1!.height).toBeLessThanOrEqual(vp.height);
    }

    // Clica no botão Não novamente (2ª tentativa)
    await noBtn.click();
    await page.waitForTimeout(300);

    const newBox2 = await noBtn.boundingBox();
    expect(newBox2!.x !== newBox1!.x || newBox2!.y !== newBox1!.y).toBe(true);

    // O contador de tentativas permanece oculto para a convidada (visível apenas no painel admin)
    await expect(page.locator('text=Tentativas no botão "Não"')).not.toBeVisible();
  });

  test('fluxo completo: Sim -> Pétalas -> Escolha de Data -> Sugestão -> Animação da Carta -> Resumo', async ({ page }) => {
    await page.goto(`/c/${testToken}`);

    // 1. Clica no Sim
    await page.getByTestId('btn-yes').click();

    // 2. Transição para Tela 2 (pétalas e escolha de data)
    await expect(page.locator('.invite-title')).toHaveText('Que dia combina com você?');
    const slotCards = page.locator('.slot-card');
    await expect(slotCards).toHaveCount(2);

    // 3. Seleciona o primeiro slot disponível
    await slotCards.first().click();
    await expect(slotCards.first()).toHaveClass(/is-selected/);

    // 4. Continua para a Tela 3
    const continueBtn = page.getByTestId('btn-choose-slot');
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // 5. Tela 3: Sugestão do que fazer
    await expect(page.locator('.invite-title')).toHaveText('E o que você gostaria de fazer?');
    await expect(page.locator('text=O que você gostaria de comer?')).toBeVisible();

    // Seleciona um chip predefinido
    const chip = page.locator('.option-chip', { hasText: 'Comida Japonesa' });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(chip).toHaveClass(/is-selected/);

    // Adiciona uma observação no campo de texto
    await page.locator('#suggestion-input').fill('Adoro um sushi fresco em um lugar tranquilo.');

    // 6. Botão de confirmação com texto exato
    const confirmBtn = page.getByTestId('btn-confirm-date');
    await expect(confirmBtn).toHaveText('Mandar nosso date para o universo 💌');
    await confirmBtn.click();

    // 7. Tela de animação da carta e coração
    await expect(page.locator('.letter-stage')).toBeVisible();

    // 8. Tela final de sucesso e resumo
    await expect(page.locator('.invite-title')).toHaveText('Nosso encontro foi para o universo 💌', {
      timeout: 15_000,
    });
    await expect(page.locator('.invite-message')).toContainText('Agora é só preparar esse momento especial.');

    // Resumo com os dados escolhidos
    const summary = page.getByTestId('summary-box');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Comida Japonesa');
    await expect(summary).toContainText('Adoro um sushi fresco');

    // 9. Recarregar a página mantém o estado respondido persistido
    await page.reload();
    await expect(page.locator('.invite-title')).toHaveText('Nosso encontro foi para o universo 💌');
    await expect(page.getByTestId('summary-box')).toBeVisible();
  });
});

test.describe('Painel Administrativo Privado', () => {
  test('bloqueia acesso direto a /admin sem login e redireciona', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL('**/admin/login');
    await expect(page.locator('.invite-title')).toHaveText('Painel Central');
  });

  test('login com credenciais inválidas exibe mensagem de erro', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('#username').fill('usuario-errado');
    await page.locator('#password').fill('senha-errada-1234');
    await page.getByTestId('btn-login').click();
    await expect(page.locator('[role="alert"]')).toContainText('Usuário ou senha incorretos');
  });

  test('login válido concede acesso ao painel e permite navegar pelas métricas', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('#username').fill(E2E_ADMIN.username);
    await page.locator('#password').fill(E2E_ADMIN.password);
    await page.getByTestId('btn-login').click();

    await page.waitForURL('**/admin');
    await expect(page.locator('h1')).toHaveText('Visão Geral');
    await expect(page.locator('.stat-card')).toHaveCount(5);

    // Navega para a lista de convites
    await page.click('text=Convites');
    await page.waitForURL('**/admin/invitations');
    await expect(page.locator('h1')).toHaveText('Convites Cadastrados');
    await expect(page.locator('.invites-table')).toBeVisible();
  });
});
