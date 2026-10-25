# Entre Nós 💌
### Site Pessoal de Convites Românticos com Animações, Painel Central e Notificações

O **Entre Nós** é uma aplicação web pessoal projetada para fazer convites de encontro de forma delicada, memorável e acolhedora. Cada convite gera um link exclusivo, conta com uma tela interativa, escolha de horários e preferências, animações fluidas (chuva de pétalas e envio da carta com selo ao universo), painel administrativo protegido e notificações por e-mail via Resend.

---

## 1. Arquitetura e Decisões de Engenharia

| Camada | Tecnologia | Justificativa |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite + React Router | Single Page Application rápida, leve e responsiva. Zero bibliotecas pesadas de animação: efeitos em CSS puro / WAAPI de alta performance. |
| **Tipografia & Design** | `@fontsource` (Cormorant Garamond + Inter) | Fontes empacotadas no build (sem chamadas a Google Fonts). Design tokens com paleta champanhe, marfim, vinho terroso e rosa antigo. |
| **Backend & API** | Vercel Serverless Function (TypeScript) | **Um único handler catch-all (`api/[...path].ts`)**. Economiza invocações, elimina cold starts múltiplos e respeita o plano Hobby da Vercel. |
| **Banco de Dados** | PostgreSQL (Supabase) via pooler com TLS | O navegador **nunca** se conecta diretamente ao banco nem expõe chaves. Acesso somente servidor com o papel de privilégios mínimos `entre_nos_app`. |
| **Segurança & RLS** | Row Level Security (RLS) habilitada em 100% das tabelas | Nenhuma policy concedida aos papéis públicos (`anon`/`authenticated`). O schema é blindado contra vazamentos. |
| **Autenticação Admin** | JWT HS256 em cookie `HttpOnly; SameSite=Strict; Secure` + bcrypt | Sem cadastro público (administrador único). Throttling persistido no banco contra ataques de força bruta. |
| **Notificações** | Resend REST API | Disparadas atomicamente após gravação da resposta no banco, com estado rastreável (`pending`, `sending`, `sent`, `failed`, `skipped`). |
| **Testes Automatizados** | Vitest + Embedded PostgreSQL + Playwright | 66 testes unitários e de integração com PostgreSQL real + 18 testes E2E Playwright (Desktop e Mobile com toque). |

---

## 2. Estrutura de Diretórios

```
c:/node/convite/
├── api/
│   └── [...path].ts               # Ponto de entrada Serverless da Vercel (catch-all)
├── scripts/
│   ├── dev-server.ts              # Servidor HTTP local para desenvolvimento
│   ├── hash.ts                    # Utilitário CLI seguro para gerar hashes bcrypt
│   └── migrate.ts                 # Executor de migrations no banco de dados
├── server/
│   ├── app.ts                     # Roteador central da API com controle de acesso e CSRF
│   ├── auth.ts                    # Autenticação bcrypt, JWT, sessões e rate limiting
│   ├── config.ts                  # Validação estrita das variáveis de ambiente
│   ├── db.ts                      # Conexão com PostgreSQL e imposição de TLS
│   ├── email.ts                   # Montagem de e-mail HTML/texto e envio via Resend
│   ├── http.ts                    # Utilitários de requisição, cookies, leitura segura
│   ├── migrate.ts                 # Mecanismo de aplicação de migrations versionadas
│   ├── nodeAdapter.ts             # Adaptador de streaming Node <-> Request/Response Web
│   ├── photo.ts                   # Validador binário de imagens (JPEG, PNG, WebP)
│   ├── routes/
│   │   ├── admin.ts               # CRUD de convites, fotos, estatísticas e reenvio
│   │   ├── adminAuth.ts           # Login, logout, recuperação e troca de senha
│   │   └── public.ts              # Endpoints públicos por token (convite, foto, confirmação)
│   └── types.ts                   # Tipos de contexto do servidor
├── shared/
│   ├── contracts.ts               # Schemas Zod e tipos compartilhados front/back
│   ├── format.ts                  # Formatadores de texto e rótulos
│   └── time.ts                    # Conversão precisa de fusos (Brasília <-> UTC)
├── src/
│   ├── components/
│   │   ├── Button.tsx             # Botão reutilizável com estados e forwardRef
│   │   ├── icons.tsx              # Ícones SVG leves em traço fino e coração
│   │   ├── LetterAnimation.tsx    # Sequência visual da carta, envelope, coração e selo
│   │   └── Petals.tsx             # Animação de chuva de pétalas com CSS/GPU
│   ├── lib/
│   │   ├── api.ts                 # Cliente HTTP tipado com tratamento de erros
│   │   ├── attemptReporter.ts     # Fila idempotente de tentativas do botão Não
│   │   ├── noButton.ts            # Algoritmo de posicionamento dentro da viewport
│   │   └── useReducedMotion.ts    # Hook para acessibilidade de movimento reduzido
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── AdminLayout.tsx    # Layout administrativo com navegação e troca de senha
│   │   │   ├── DashboardPage.tsx  # Métricas e notificações de respostas recentes
│   │   │   ├── InvitationDetailPage.tsx # Detalhes da confirmação, e-mail e link
│   │   │   ├── InvitationFormPage.tsx   # Criação/edição com upload de foto e datas
│   │   │   ├── InvitationsListPage.tsx  # Listagem com cópia de link e status
│   │   │   ├── LoginPage.tsx      # Login administrativo com proteção contra força bruta
│   │   │   └── RecoverPage.tsx    # Recuperação via perguntas de segurança
│   │   └── public/
│   │       └── InvitePage.tsx     # Telas públicas: convite, botão evasivo, slots e sugestão
│   ├── styles/
│   │   ├── admin.css              # Estilos do painel administrativo
│   │   ├── animations.css         # Animações de pétalas, envelope e brilhos
│   │   ├── base.css               # Reset, tipografia e campos de formulário
│   │   ├── invite.css             # Estilos da experiência do convite (mobile-first)
│   │   └── tokens.css             # Paleta de cores e variáveis CSS
│   ├── App.tsx                    # Roteamento SPA
│   └── main.tsx                   # Ponto de entrada React
├── supabase/
│   └── migrations/
│       ├── 0001_init.sql          # Tabelas, restrições e funções atômicas
│       └── 0002_roles_rls.sql     # Papel de privilégios mínimos e políticas RLS
├── tests/
│   ├── e2e/
│   │   ├── app.spec.ts            # Testes ponta a ponta (Desktop, Mobile 320px, Mobile 390px)
│   │   └── server.ts              # Servidor de teste com PostgreSQL embutido
│   ├── helpers/
│   │   ├── harness.ts             # Harness de integração com mock do Resend
│   │   └── pg.ts                  # Provedor de PostgreSQL embutido
│   ├── integration/
│   │   ├── admin.test.ts          # Testes de autenticação, CRUD, CSRF e throttle
│   │   ├── database.test.ts       # Testes de migrations, permissões e RLS
│   │   └── public.test.ts         # Testes de confirmação, idempotência e e-mail
│   └── unit/
│       ├── attemptReporter.test.ts# Fila de tentativas e persistência
│       ├── noButton.test.ts       # Algoritmo de evasão do botão Não
│       ├── photo.test.ts          # Validação de integridade e dimensões de imagem
│       └── time.test.ts           # Conversão de fuso horário e validação de calendário
├── .env.example                   # Exemplo documentado de variáveis de ambiente
├── .gitignore                     # Proteção contra vazamento de segredos
├── index.html                     # HTML raiz da aplicação
├── package.json                   # Dependências e scripts
├── playwright.config.ts           # Configuração de testes E2E
├── tsconfig.json                  # Configuração TypeScript estrita
├── vercel.json                    # Roteamento e cabeçalhos de segurança na Vercel
└── vite.config.mts                # Configuração do Vite e Vitest
```

---

## 3. Passo a Passo de Instalação e Execução Local

### Pré-requisitos
- Node.js 22.x
- npm 10.x ou superior

### 1. Clonar e Instalar Dependências
```bash
git clone <url-do-repositorio> convite
cd convite
npm install
```

### 2. Configurar o `.env.local`
Copie o arquivo de exemplo:
```bash
cp .env.example .env.local
```

### 3. Gerar Hashes com o Script Local
O projeto inclui um utilitário CLI interativo para gerar hashes bcrypt com segurança (sem ecoar a digitação no terminal):

```bash
# Para gerar a senha inicial do administrador:
npm run hash

# Para gerar o hash das respostas das perguntas de recuperação:
npm run hash -- --answer
```
Copie os hashes gerados e preencha as variáveis `ADMIN_INITIAL_PASSWORD_HASH`, `ADMIN_RECOVERY_ANSWER_1_HASH` e `ADMIN_RECOVERY_ANSWER_2_HASH` no seu `.env.local`.

### 4. Executar em Modo de Desenvolvimento
Inicie a API local e o servidor Vite concorrentemente:
```bash
npm run dev
```
Acesse:
- **Área Pública**: `http://localhost:5173`
- **Painel Administrativo**: `http://localhost:5173/admin`

---

## 4. Configuração do Banco de Dados no Supabase (Plano Gratuito)

O Supabase oferece PostgreSQL hospedado gratuitamente. Siga estas etapas para criar e blindar o banco:

### 1. Criar o Projeto
1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Crie uma nova organização e um novo projeto (ex.: `entre-nos`).
3. Defina uma senha forte para o banco de dados e selecione a região mais próxima (ex.: `São Paulo (sa-east-1)`).

### 2. Aplicar as Migrations e Criar o Papel Restrito
No painel do Supabase, acesse **SQL Editor**:
1. Abra o arquivo `supabase/migrations/0001_init.sql` deste projeto, cole o conteúdo no editor SQL do Supabase e clique em **Run**.
2. Abra o arquivo `supabase/migrations/0002_roles_rls.sql`, cole o conteúdo e clique em **Run**.
3. Defina uma senha forte exclusiva para o papel de aplicação executando:
   ```sql
   alter role entre_nos_app with login password 'SUA_SENHA_MUITO_FORTE_AQUI';
   ```

### 3. Obter a String de Conexão com TLS
Acesse **Project Settings > Database > Connection Pooling**:
- Copie a string de conexão do **Pooler** (modo *Transaction* ou *Session*, porta `6543`).
- Substitua o usuário `postgres` por `entre_nos_app` e utilize a senha definida acima.
- Garanta que a string contenha `?sslmode=require`.
- Esta será a sua variável `DATABASE_URL`.

---

## 5. Configuração do Serviço de E-mail no Resend (Plano Gratuito)

O Resend fornece envio transacional confiável com 100 e-mails/dia e 3.000 e-mails/mês sem custo.

### 1. Criar Conta e Obter a API Key
1. Acesse [resend.com](https://resend.com) e crie uma conta gratuita.
2. No menu lateral, acesse **API Keys** e crie uma chave com nome "Entre Nós".
3. Copie a chave gerada (iniciada por `re_`). Esta será a sua variável `RESEND_API_KEY`.

### 2. Regras de Envio no Plano Gratuito
- **Sem Domínio Próprio (Modo de Testes):**
  - O remetente (`EMAIL_FROM`) **deve ser** `Entre Nós <onboarding@resend.dev>`.
  - O destinatário (`ADMIN_EMAIL`) **deve ser exatamente o mesmo e-mail** cadastrado na sua conta do Resend.
  - Tentativas de enviar para qualquer outro endereço resultarão em erro 403 retornado pelo provedor. O sistema trata isso e salva o estado como `failed`, permitindo reenvio.
- **Com Domínio Próprio Verificado (Recomendado se possuir domínio):**
  - Adicione seu domínio em **Domains > Add Domain** no Resend.
  - Insira os registros DNS informados (DKIM, SPF) no seu provedor de domínio.
  - Após verificado, altere `EMAIL_FROM` para `Entre Nós <contato@seudominio.com>` e você poderá receber em qualquer e-mail.

---

## 6. Implantação na Vercel (Hobby Tier — $0)

A Vercel hospeda o frontend estático e as funções Serverless sem custo no plano Hobby.

### 1. Criar o Projeto no GitHub
1. Crie um repositório privado no GitHub:
   ```bash
   git add .
   git commit -m "feat: Entre Nós - versão inicial completa"
   git remote add origin https://github.com/SEU_USUARIO/entre-nos.git
   git push -u origin main
   ```

### 2. Conectar à Vercel
1. Acesse [vercel.com](https://vercel.com) e conecte sua conta do GitHub.
2. Clique em **Add New > Project** e importe o repositório `entre-nos`.
3. Framework Preset: **Vite** (detectado automaticamente).
4. Em **Environment Variables**, cadastre as seguintes variáveis (valores de produção):
   - `DATABASE_URL`: String de conexão do Supabase com o usuário `entre_nos_app`.
   - `APP_URL`: URL final do projeto (ex.: `https://entre-nos.vercel.app`).
   - `ADMIN_EMAIL`: Seu e-mail de recebimento das confirmações.
   - `ADMIN_USERNAME`: Seu usuário administrativo.
   - `ADMIN_INITIAL_PASSWORD_HASH`: Hash bcrypt gerado com `npm run hash`.
   - `ADMIN_RECOVERY_QUESTION_1`: Pergunta de segurança 1.
   - `ADMIN_RECOVERY_ANSWER_1_HASH`: Hash da resposta 1 gerado com `npm run hash -- --answer`.
   - `ADMIN_RECOVERY_QUESTION_2`: Pergunta de segurança 2.
   - `ADMIN_RECOVERY_ANSWER_2_HASH`: Hash da resposta 2 gerado com `npm run hash -- --answer`.
   - `ADMIN_SESSION_SECRET`: String aleatória de 32+ caracteres.
   - `RESEND_API_KEY`: Chave da API do Resend.
   - `EMAIL_FROM`: `Entre Nós <onboarding@resend.dev>` ou seu domínio verificado.
5. Clique em **Deploy**.

---

## 7. Limites dos Planos Gratuitos e Prevenção de Cobranças

Todos os serviços escolhidos operam em planos 100% gratuitos, **sem necessidade de inserir cartão de crédito e sem cobrança automática**:

### 1. Supabase (Free Tier)
- **Limite de Armazenamento:** 500 MB de banco de dados (o banco deste projeto consome menos de 5 MB, incluindo fotos compactadas).
- **Regra de Inatividade:** Projetos gratuitos no Supabase são **pausados automaticamente após 7 dias seguidos sem nenhuma consulta**.
  - **O que acontece se pausar:** O banco para de responder e a API retorna erro amigável ao visitante. Nenhum dado é perdido.
  - **Como reativar:** Basta acessar o dashboard do Supabase e clicar em **Restore Project** (o restauro leva menos de 2 minutos).
  - **Como prevenir:** Acessar o painel administrativo (`/admin`) uma vez por semana gera atividade no banco e impede o desligamento.

### 2. Resend (Free Tier)
- **Limites:** 100 e-mails por dia e até 3.000 e-mails por mês.
- **Prevenção de Cobranças:** O plano gratuito bloqueia novos envios após o limite ser atingido, nunca cobrando excedentes sem autorização prévia.

### 3. Vercel (Hobby Tier)
- **Uso Pessoal:** O plano Hobby é gratuito para uso estritamente pessoal e não comercial (exatamente o propósito do Entre Nós).
- **Funções:** Limite de 100.000 invocações por mês e até 300 segundos de execução por requisição. Como o sistema utiliza um único handler catch-all otimizado, o consumo mensal estimado é inferior a 1% da cota.

---

## 8. Procedimento de Recuperação de Acesso Administrativo

Se você esquecer a senha de administrador:
1. Acesse a tela de login em `/admin/login`.
2. Clique no link **"Esqueceu a senha? Recuperar acesso"** ou navegue diretamente para `/admin/recover`.
3. O servidor carregará as duas perguntas de segurança configuradas nas variáveis de ambiente.
4. Digite a resposta exata para as duas perguntas (letras maiúsculas e minúsculas são consideradas; espaços acidentais no início ou no fim são automaticamente removidos).
5. Defina uma nova senha forte (mínimo de 12 caracteres).
6. Ao submeter com sucesso:
   - O novo hash bcrypt é gravado na tabela `admin_credentials` do banco de dados.
   - A versão da sessão (`session_version`) é incrementada, **invalidando imediatamente todos os cookies de sessões ativas anteriores**.
   - Você é redirecionado para o login para entrar com sua nova senha.

---

## 9. Boas Práticas de Segurança Aplicadas

- **TLS Obrigatório:** A aplicação recusa conexões com o banco de dados que utilizem `sslmode=disable` fora do localhost.
- **Princípio do Menor Privilégio:** O papel do banco (`entre_nos_app`) possui permissões restritas a `SELECT`, `INSERT`, `UPDATE` e `DELETE` nas tabelas necessárias. Não possui poderes de DDL (`CREATE`, `DROP`, `ALTER`) e não é superusuário.
- **RLS Ativada:** Todas as tabelas têm Row Level Security habilitada. Usuários não autenticados ou chaves públicas (`anon`) do Supabase não têm acesso a nenhuma linha.
- **Proteção contra Enumeração de Tokens:** Tokens inexistentes, rascunhos e convites fechados retornam exatamente o mesmo código HTTP 404 e o mesmo corpo de resposta.
- **Cookies Blindados:** Sessões armazenadas em cookies `HttpOnly; SameSite=Strict; Secure; Path=/` com nome `__Host-entre_nos_session` em produção.
- **Proteção CSRF Completa:** Todas as mutações (`POST`, `PUT`, `DELETE`) exigem verificação estrita de `Origin` e cabeçalho customizado `x-requested-with: entre-nos`.
- **Proteção contra Força Bruta:** Limite progressivo de tentativas de login e recuperação gravado no banco de dados (sem registrar IP, preservando privacidade).
- **Validação Binária Real de Imagens:** Fotos enviadas não dependem do cabeçalho `Content-Type` do cliente; o servidor analisa magic bytes, cabeçalhos IHDR/SOF0/VP8 e limites de dimensão (máximo 6000px e 700 KB).
- **Prevenção de XSS:** Renderização em React pura com escape automático de strings; cabeçalhos de segurança estritos (CSP, X-Content-Type-Options, frame-ancestors 'none').

---

## 10. Verificação e Diagnóstico de Testes

O projeto conta com automação de testes cobrindo toda a pilha.

### Executar Todos os Testes
```bash
# 1. Checagem estrita de tipos TypeScript
npm run typecheck

# 2. Testes unitários e de integração com PostgreSQL real (Vitest)
npm test

# 3. Testes End-to-End no navegador (Playwright - Desktop e Mobile)
npm run test:e2e

# 4. Pipeline completo
npm run test:all
```

### Diagnóstico de Execução Local
- **Testes Unitários:** 18 testes executados e aprovados (`noButton`, `attemptReporter`, `photo`, `time`).
- **Testes de Integração com Banco Real:** 48 testes executados e aprovados com PostgreSQL real embutido (`database.test.ts`, `public.test.ts`, `admin.test.ts`).
- **Testes E2E (Playwright):** 18 testes executados e aprovados em Chromium cobrindo Desktop (1280px), Celular Estreito (320px) e Celular Convencional (390px com toque).

> [!NOTE]
> **O que depende das suas credenciais externas:**
> Os testes automatizados locais utilizam um provedor simulado em memória para o Resend e uma instância local do PostgreSQL. A entrega efetiva de e-mails na sua caixa de entrada pessoal e a persistência na nuvem dependem do cadastro da sua conta no Supabase e no Resend conforme descrito nas seções 4 e 5.
