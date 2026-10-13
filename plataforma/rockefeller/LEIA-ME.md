# Bloco "Minhas caixinhas" no Rockefeller

Mostra, na aba **Investir**, um painel só com as suas caixinhas: total guardado, rendimento estimado por mês e por ano,
% do CDI médio e uma barra por caixinha. Os dados vêm do Trader Bit (tabela `rockefeller_parecer`, que o Rockefeller já lê).
O bloco **só lê**; não grava nada no Rockefeller.

## Como colocar (uma vez só)
1. Abra o `index.html` do Rockefeller no GitHub (ou no seu editor).
2. Procure a linha `<section class="tab" id="invest">`.
3. Cole **todo** o conteúdo de `caixinhas-bloco.html` logo abaixo dessa linha.
4. Salve/commite. Depois do deploy, abra o Rockefeller, entre, vá em **Investir** e dê Ctrl+F5.

## Quando atualiza
- O parecer é recalculado todo dia às 10:00 (Brasília). Se você mudar uma caixinha no Trader Bit, o painel muda no dia seguinte.
- Sem caixinhas cadastradas, o painel some sozinho.

## Se não aparecer
- Confira se a sua sessão no Rockefeller está entrada (a mesma do botão de sincronizar).
- O bloco usa `token()`, `SB` e `SBK` do Rockefeller (os mesmos da sincronização). Se você renomeou algum deles, me avise.
