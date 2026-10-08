-- Trader Bit vive no schema próprio "traderbit" (o projeto Supabase é compartilhado com outros apps).
create schema if not exists traderbit;
grant usage on schema traderbit to anon, authenticated, service_role;
alter default privileges in schema traderbit grant all on tables to service_role;
alter default privileges in schema traderbit grant select, insert, update, delete on tables to authenticated;

-- Plataforma Trader Bit: base (fases 1 a 3). Aplique no SQL Editor do Supabase.
-- Segurança: RLS ligado em tudo. Só o dono lê e altera os próprios dados.
-- Preços e análises são escritos SOMENTE pelo servidor (chave de serviço, que ignora o RLS).
-- Observação: com um único usuário, `ativos.id` é global (ex.: BTC, BOVA11). Para vários usuários, mude a chave.

create table if not exists traderbit.ativos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('cripto', 'bdr', 'acao', 'etf', 'cambio', 'renda_fixa')),
  fonte text not null check (fonte in ('binance', 'bcb_usd', 'bcb_cdi', 'brapi', 'yahoo')),
  referencia text not null,
  fallback_fonte text check (fallback_fonte in ('binance', 'bcb_usd', 'bcb_cdi', 'brapi', 'yahoo')),
  fallback_referencia text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint ativos_id_formato check (id ~ '^[A-Z0-9]{2,15}$')
);

create table if not exists traderbit.precos_diarios (
  ativo_id text not null references traderbit.ativos (id) on delete cascade,
  data date not null,
  valor numeric(28, 10) not null check (valor > 0),
  fonte text,
  atualizado_em timestamptz not null default now(),
  primary key (ativo_id, data)
);

create table if not exists traderbit.carteiras_modelo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  pesos jsonb not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists traderbit.analises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  executado_em timestamptz not null default now(),
  gatilho text not null check (gatilho in ('cron_manha', 'cron_tarde', 'manual')),
  status text not null check (status in ('ok', 'parcial', 'erro')),
  periodo_ini date,
  periodo_fim date,
  ativos text[] not null default '{}',
  avisos jsonb not null default '[]'::jsonb,
  resultado jsonb
);
create index if not exists analises_executado_em_idx on traderbit.analises (user_id, executado_em desc);

alter table traderbit.ativos enable row level security;
alter table traderbit.precos_diarios enable row level security;
alter table traderbit.carteiras_modelo enable row level security;
alter table traderbit.analises enable row level security;

create policy ativos_dono on traderbit.ativos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy carteiras_dono on traderbit.carteiras_modelo for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy analises_leitura_dono on traderbit.analises for select to authenticated
  using (user_id = auth.uid());
-- preços: o dono só lê os preços dos SEUS ativos; ninguém escreve pelo navegador
create policy precos_leitura_dono on traderbit.precos_diarios for select to authenticated
  using (exists (select 1 from traderbit.ativos a where a.id = ativo_id and a.user_id = auth.uid()));

-- permissões nas tabelas já criadas (o RLS acima é quem restringe as linhas)
grant all on all tables in schema traderbit to service_role;
grant select, insert, update, delete on all tables in schema traderbit to authenticated;
