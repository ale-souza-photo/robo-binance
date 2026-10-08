-- Conta de teste "espelhada" na reserva de emergência do Rockefeller (somente leitura de lá).
-- O saldo fictício acompanha o `reservaAtual`: subiu -> depósito; caiu -> retirada (só do caixa livre).

alter table traderbit.contas_teste drop constraint if exists contas_teste_saldo_inicial_check;
alter table traderbit.contas_teste add constraint contas_teste_saldo_inicial_check check (saldo_inicial >= 0);
alter table traderbit.contas_teste add column if not exists espelha_reserva boolean not null default false;
-- no máximo uma conta espelhada por usuário
create unique index if not exists contas_um_espelho on traderbit.contas_teste (user_id) where espelha_reserva;

alter table traderbit.movimentos_teste drop constraint if exists movimentos_teste_tipo_check;
alter table traderbit.movimentos_teste add constraint movimentos_teste_tipo_check check (tipo in ('deposito', 'compra', 'venda', 'retirada'));
alter table traderbit.movimentos_teste add constraint mov_retirada check (tipo <> 'retirada' or (ativo_id is null and caixa_delta < 0));
