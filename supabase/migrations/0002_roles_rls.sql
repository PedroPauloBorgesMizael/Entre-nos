-- Entre Nós — privilégios mínimos e Row Level Security

-- Papel dedicado ao servidor da aplicação: sem DDL, sem superusuário, sem BYPASSRLS.
-- Ele nasce NOLOGIN; você habilita o login com senha própria (veja o README):
--   alter role entre_nos_app with login password '<senha-forte-gerada-por-voce>';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'entre_nos_app') then
    create role entre_nos_app nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

-- Fecha o acesso padrão (PUBLIC) e, quando existirem (Supabase), anon/authenticated.
revoke all on all tables in schema public from public;
revoke all on all functions in schema public from public;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
    end if;
  end loop;
end
$$;

grant usage on schema public to entre_nos_app;
grant select, insert, update, delete on
  invitations, invitation_photos, availability_slots, responses,
  attempt_events, admin_credentials, auth_throttle
to entre_nos_app;
grant execute on function record_no_attempt(uuid, uuid) to entre_nos_app;
grant execute on function confirm_invitation(uuid, uuid, text, text, text) to entre_nos_app;

-- RLS ligada em todas as tabelas. A única policy existente é para o papel do servidor;
-- as chaves públicas do Supabase (anon/authenticated) não enxergam nada.
do $$
declare
  t text;
begin
  foreach t in array array[
    'invitations', 'invitation_photos', 'availability_slots', 'responses',
    'attempt_events', 'admin_credentials', 'auth_throttle'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy app_server_all on %I for all to entre_nos_app using (true) with check (true)', t);
  end loop;
end
$$;
