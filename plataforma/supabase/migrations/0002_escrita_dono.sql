-- App de um único dono: o próprio dono (autenticado) pode gravar seus preços e análises.
-- Assim o botão "Rodar análise agora" grava pela sessão do dono e NÃO depende da chave de serviço.
-- O cron continua usando a chave de serviço (service_role), que ignora o RLS.

drop policy if exists precos_escrita_dono on traderbit.precos_diarios;
create policy precos_escrita_dono on traderbit.precos_diarios for insert to authenticated
  with check (exists (select 1 from traderbit.ativos a where a.id = ativo_id and a.user_id = auth.uid()));

drop policy if exists precos_update_dono on traderbit.precos_diarios;
create policy precos_update_dono on traderbit.precos_diarios for update to authenticated
  using (exists (select 1 from traderbit.ativos a where a.id = ativo_id and a.user_id = auth.uid()))
  with check (exists (select 1 from traderbit.ativos a where a.id = ativo_id and a.user_id = auth.uid()));

drop policy if exists analises_escrita_dono on traderbit.analises;
create policy analises_escrita_dono on traderbit.analises for insert to authenticated
  with check (user_id = auth.uid());
