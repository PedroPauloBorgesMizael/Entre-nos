-- Entre Nós — esquema inicial
-- Aplicado por `npm run db:migrate` (ou colado no SQL Editor do Supabase).

create table invitations (
  id                 uuid primary key default gen_random_uuid(),
  -- token público aleatório (32 bytes, base64url = 43 caracteres); único e imprevisível
  token              text not null unique check (char_length(token) between 32 and 64),
  name               text not null check (char_length(btrim(name)) between 1 and 80),
  opening_message    text not null check (char_length(btrim(opening_message)) between 1 and 600),
  photo_enabled      boolean not null default false,
  -- draft = ainda não liberado; active = aguardando resposta; confirmed = respondido; closed = desativado/encerrado
  status             text not null default 'draft' check (status in ('draft', 'active', 'confirmed', 'closed')),
  question           text not null check (char_length(btrim(question)) between 1 and 300),
  suggestion_mode    text not null default 'free' check (suggestion_mode in ('place', 'food', 'free')),
  suggestion_options text[] not null default '{}' check (cardinality(suggestion_options) <= 12),
  no_attempts        integer not null default 0 check (no_attempts >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index invitations_status_created_idx on invitations (status, created_at desc);

create table invitation_photos (
  invitation_id uuid primary key references invitations (id) on delete cascade,
  mime          text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data          bytea not null check (octet_length(data) between 1 and 716800),
  width         integer not null check (width between 1 and 6000),
  height        integer not null check (height between 1 and 6000),
  updated_at    timestamptz not null default now()
);

-- Cada opção é uma combinação data+horário já definida (instante único, em UTC).
create table availability_slots (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invitations (id) on delete cascade,
  starts_at     timestamptz not null,
  unique (invitation_id, starts_at)
);
create index availability_slots_invitation_idx on availability_slots (invitation_id, starts_at);

create table responses (
  id               uuid primary key default gen_random_uuid(),
  invitation_id    uuid not null references invitations (id) on delete cascade,
  slot_id          uuid references availability_slots (id) on delete set null,
  -- cópia do instante escolhido: preserva a resposta mesmo que o slot seja removido depois
  slot_starts_at   timestamptz not null,
  suggestion_type  text not null check (suggestion_type in ('place', 'food', 'free')),
  selected_option  text check (selected_option is null or char_length(selected_option) between 1 and 120),
  suggestion_text  text check (suggestion_text is null or char_length(suggestion_text) between 1 and 300),
  confirmed_at     timestamptz not null default now(),
  -- confirmed = resposta final válida; archived = substituída após o convite ser reaberto
  state            text not null default 'confirmed' check (state in ('confirmed', 'archived')),
  email_status     text not null default 'pending' check (email_status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  email_attempts   integer not null default 0,
  email_error      text,
  email_provider_id text,
  email_updated_at timestamptz,
  email_sent_at    timestamptz,
  seen_at          timestamptz,
  check (selected_option is not null or suggestion_text is not null)
);
-- No máximo UMA resposta final válida por convite (proteção contra confirmação duplicada).
create unique index responses_one_confirmed_per_invitation on responses (invitation_id) where state = 'confirmed';
create index responses_invitation_idx on responses (invitation_id, confirmed_at desc);
create index responses_unseen_idx on responses (confirmed_at desc) where state = 'confirmed' and seen_at is null;

-- Registro individual de cliques em "Não": a chave primária garante idempotência.
create table attempt_events (
  invitation_id   uuid not null references invitations (id) on delete cascade,
  client_event_id uuid not null,
  created_at      timestamptz not null default now(),
  primary key (invitation_id, client_event_id)
);
create index attempt_events_recent_idx on attempt_events (invitation_id, created_at desc);

-- Senha administrativa alterada/recuperada (sobrepõe o hash do ambiente). Linha única.
create table admin_credentials (
  id              smallint primary key check (id = 1),
  password_hash   text not null,
  -- incrementado a cada troca de senha: invalida todas as sessões emitidas antes
  session_version integer not null default 1,
  updated_at      timestamptz not null default now()
);

-- Limite de tentativas de login/recuperação. Há um único administrador, então o controle
-- é global (sem armazenar IP ou qualquer dado do visitante).
create table auth_throttle (
  scope           text primary key check (scope in ('login', 'recover')),
  failures        integer not null default 0,
  locked_until    timestamptz,
  last_failure_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Funções atômicas
-- ---------------------------------------------------------------------------

-- Registra um clique em "Não". Retorna: recorded | duplicate | limited | ignored
create function record_no_attempt(p_invitation_id uuid, p_event_id uuid)
returns text
language plpgsql
as $$
declare
  v_recent integer;
begin
  perform 1 from invitations where id = p_invitation_id and status = 'active';
  if not found then
    return 'ignored';
  end if;

  if exists (select 1 from attempt_events where invitation_id = p_invitation_id and client_event_id = p_event_id) then
    return 'duplicate';
  end if;

  select count(*) into v_recent
    from attempt_events
   where invitation_id = p_invitation_id and created_at > now() - interval '10 seconds';
  if v_recent >= 30 then
    return 'limited';
  end if;

  insert into attempt_events (invitation_id, client_event_id)
  values (p_invitation_id, p_event_id)
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;

  update invitations set no_attempts = no_attempts + 1 where id = p_invitation_id;
  return 'recorded';
end;
$$;

-- Confirma o encontro de forma transacional e idempotente.
-- Retorna: created | already_confirmed | unavailable | slot_unavailable | not_found
create function confirm_invitation(
  p_invitation_id uuid,
  p_slot_id       uuid,
  p_type          text,
  p_option        text,
  p_text          text
)
returns table (out_outcome text, out_response_id uuid)
language plpgsql
as $$
declare
  v_inv  invitations%rowtype;
  v_slot availability_slots%rowtype;
  v_resp uuid;
begin
  select * into v_inv from invitations where id = p_invitation_id for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select r.id into v_resp from responses r where r.invitation_id = p_invitation_id and r.state = 'confirmed';
  if found then
    return query select 'already_confirmed'::text, v_resp;
    return;
  end if;

  if v_inv.status <> 'active' then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  select * into v_slot from availability_slots s where s.id = p_slot_id and s.invitation_id = p_invitation_id;
  if not found or v_slot.starts_at <= now() then
    return query select 'slot_unavailable'::text, null::uuid;
    return;
  end if;

  insert into responses (invitation_id, slot_id, slot_starts_at, suggestion_type, selected_option, suggestion_text)
  values (p_invitation_id, v_slot.id, v_slot.starts_at, p_type, p_option, p_text)
  returning id into v_resp;

  update invitations set status = 'confirmed', updated_at = now() where id = p_invitation_id;

  return query select 'created'::text, v_resp;
end;
$$;
