-- Destaques diários de BDRs (preenchido pelo cron com a chave de serviço) e caixinhas de renda fixa (digitadas pelo dono).
-- Nada aqui toca `rockefeller_data`. O Rockefeller só lê o resumo que o parecer diário publica.

create table if not exists traderbit.destaques_bdr (
  user_id uuid not null references auth.users(id) on delete cascade,
  data date not null,
  ticker text not null check (ticker ~ '^[A-Z0-9]{2,15}$'),
  posicao int not null check (posicao between 1 and 50),
  nome text not null,
  preco numeric(20, 6) not null,
  var_dia numeric(10, 6),
  volume numeric(24, 2),
  ret_30d numeric(10, 6) not null,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, data, ticker)
);
create index if not exists destaques_data_idx on traderbit.destaques_bdr (user_id, data desc, posicao);

create table if not exists traderbit.caixinhas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  pct_cdi numeric(6, 2) not null check (pct_cdi > 0 and pct_cdi <= 300),
  saldo numeric(20, 2) not null default 0 check (saldo >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table traderbit.destaques_bdr enable row level security;
alter table traderbit.caixinhas enable row level security;

-- destaques: o dono só LÊ (quem grava é o cron, com a chave de serviço)
drop policy if exists destaques_dono_le on traderbit.destaques_bdr;
create policy destaques_dono_le on traderbit.destaques_bdr for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists caixinhas_dono on traderbit.caixinhas;
create policy caixinhas_dono on traderbit.caixinhas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on traderbit.destaques_bdr, traderbit.caixinhas from anon;
grant select on traderbit.destaques_bdr to authenticated;
grant select, insert, update, delete on traderbit.caixinhas to authenticated;
grant all on traderbit.destaques_bdr, traderbit.caixinhas to service_role;
