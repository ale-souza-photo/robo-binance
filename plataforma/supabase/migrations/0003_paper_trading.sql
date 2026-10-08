-- Fase 4: paper trading (dinheiro FICTÍCIO). Contas de teste e livro de movimentos.
-- O caixa e as posições são derivados dos movimentos pelo código (src/core/paper.ts).

create table if not exists traderbit.contas_teste (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  saldo_inicial numeric(20, 6) not null check (saldo_inicial > 0),
  -- trava de perda: se o patrimônio cair esta fração abaixo do aportado, novas compras são bloqueadas
  trava_perda numeric(5, 4) not null default 0.2 check (trava_perda between 0.01 and 1),
  criado_em timestamptz not null default now()
);

create table if not exists traderbit.movimentos_teste (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references traderbit.contas_teste (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('deposito', 'compra', 'venda')),
  ativo_id text references traderbit.ativos (id) on delete restrict,
  quantidade numeric(28, 10),
  preco_exec numeric(28, 10),
  taxa numeric(20, 6) not null default 0 check (taxa >= 0),
  caixa_delta numeric(20, 6) not null,
  origem text not null default 'manual' check (origem in ('manual', 'dca')),
  periodo text check (periodo is null or periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  nota text,
  constraint mov_deposito check (tipo <> 'deposito' or (ativo_id is null and caixa_delta > 0)),
  constraint mov_compra check (tipo <> 'compra' or (ativo_id is not null and quantidade > 0 and preco_exec > 0 and caixa_delta < 0)),
  constraint mov_venda check (tipo <> 'venda' or (ativo_id is not null and quantidade > 0 and preco_exec > 0 and caixa_delta > 0))
);

create index if not exists mov_conta_idx on traderbit.movimentos_teste (conta_id, criado_em);

-- DCA idempotente: no máximo UMA compra de DCA por conta, ativo e mês (clicar duas vezes não duplica).
create unique index if not exists mov_dca_unico
  on traderbit.movimentos_teste (conta_id, ativo_id, periodo)
  where origem = 'dca' and tipo = 'compra';

alter table traderbit.contas_teste enable row level security;
alter table traderbit.movimentos_teste enable row level security;

drop policy if exists contas_dono on traderbit.contas_teste;
create policy contas_dono on traderbit.contas_teste for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- o movimento só pode ser gravado em conta do próprio dono
drop policy if exists mov_dono on traderbit.movimentos_teste;
create policy mov_dono on traderbit.movimentos_teste for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from traderbit.contas_teste c where c.id = conta_id and c.user_id = auth.uid())
  );

grant select, insert, update, delete on traderbit.contas_teste, traderbit.movimentos_teste to authenticated;
grant all on traderbit.contas_teste, traderbit.movimentos_teste to service_role;
