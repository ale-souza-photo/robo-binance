-- Parecer diário do "Analista" exibido na aba Investir do Rockefeller.
-- Escrito só pelo Trader Bit (service role, 10:00 BRT). O Rockefeller apenas lê (RLS: só o dono).
-- `rockefeller_data` NÃO é alterada.
create table if not exists public.rockefeller_parecer (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.rockefeller_parecer enable row level security;
drop policy if exists parecer_dono_le on public.rockefeller_parecer;
create policy parecer_dono_le on public.rockefeller_parecer for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.rockefeller_parecer from anon;
grant select on public.rockefeller_parecer to authenticated;
