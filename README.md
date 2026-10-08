# Robô Binance (esqueleto)

Plano: Scanner -> Risco e tamanho -> Executor, com Kill switch e Registro.
Roda no PC, começa em modo SIMULADO.

## Como rodar
1. Instale o Python 3.10+ e rode: `pip install -r requirements.txt`
2. Rode: `python main.py` (modo simulado, não envia ordem real)
3. Para parar na hora: crie um arquivo chamado `PARAR.txt` na pasta
4. Veja o histórico em `registro.csv`

## Backtest (novo)
Roda a estratégia do `scanner.py` em candles históricos reais, com as mesmas regras do robô
(stop, alvo, taxa, perda diária). Só usa dados públicos, não precisa de chave.
- `python backtest.py` (90 dias do símbolo/timeframe do `config.py`)
- `python backtest.py --dias 180 --simbolo ETH/USDT --timeframe 15m`
- Mostra período completo + 70% treino / 30% teste, para desconfiar de sorte.
- Premissas conservadoras: slippage 0,05%, e se stop e alvo tocam no mesmo candle, vale o stop.

## Regras da Binance (novo)
`regras_binance.py` lê da Binance o valor mínimo (MIN_NOTIONAL) e os passos de quantidade/preço.
A quantidade é cortada para baixo no passo permitido; ordem abaixo do mínimo é recusada e
registrada como `RECUSADA`. No modo real, a venda usa a quantidade líquida (a Binance desconta a
taxa em BTC na compra).

## DCA: compra periódica (novo)
`python dca.py` faz UMA compra por período (mensal por padrão, a partir do dia 5), sem tentar
adivinhar preço. Com pouco dinheiro compra um ativo por vez, o mais abaixo da proporção-meta.
- `python dca.py --status` mostra quantidade, preço médio e resultado. `--forcar` compra agora
  (ainda 1 por período). `--loop` fica ligado. No modo REAL é obrigatório `--real-confirmo`.
- Configuração no `config.py` (seção DCA): `DCA_ATIVOS`, `DCA_VALOR_POR_RODADA`, `DCA_FREQUENCIA`,
  `DCA_DIA`, `DCA_TETO_MENSAL`. Usa o mesmo `MODO_SIMULADO`/`TESTNET` do robô; cada modo tem o seu
  `dca_estado_<MODO>.json` e o registro vai para `dca_registro.csv`.
- Segurança: nunca compra duas vezes no período; teto mensal; recusa preço estranho ou valor abaixo do
  mínimo; se uma ordem falhar no meio, marca o período como PENDENTE e pede para você conferir na
  Binance (em vez de arriscar comprar em dobro); respeita PARAR.txt e TRAVA.txt.
- Real com Pix: deposite reais na Binance e troque os pares por `BTC/BRL` e `ETH/BRL` (a testnet não
  tem pares em reais). O valor mínimo da Binance é lido na hora; se for maior que o seu, ele recusa e avisa.
- Testes: `python -m unittest testes_dca -v`.

## Painel gráfico (novo)
Tela no navegador que atualiza sozinha. **O comando oficial é `python painel_wallstreet.py`** (visual
"Wall Street", preto e ouro). A versão colorida original continua disponível: `python painel.py`.
Mostra preço e gráfico com as médias, a pista da aposta (STOP/ALVO), o freio do dia, estatísticas, diário,
curva de resultado, candles, faixa de cotações e o aviso de modo (SIMULADO azul, TESTNET âmbar, REAL
vermelho com borda de alerta).
- Com o robô rodando (`python main.py`), abra OUTRO terminal na MESMA pasta e rode `python painel_wallstreet.py`.
  Abre sozinho em http://localhost:8765 (se não abrir, digite o endereço).
- `--demo` mostra dados fictícios, sem o robô. `--demo --modo REAL` mostra o visual do modo real.
- O robô grava `estado.json` a cada ciclo; o painel lê esse arquivo e o `registro.csv`.
- Segurança: escuta só em 127.0.0.1, não envia ordens e não vê suas chaves. O único botão cria/apaga
  o `PARAR.txt`. As duas versões usam o mesmo servidor (`painel.py`); a tela fica em `painel_ws/` e `painel/`.
- **Duas abas no topo:** *Robô de trade* e *DCA · compra periódica*. A aba DCA mostra quanto você investiu,
  o valor atual, o resultado, a carteira (meta contra real, preço médio de cada ativo), quando é a próxima
  compra, o gasto do mês contra o teto e o histórico de compras. Ela só LÊ o `dca_estado_<MODO>.json`: quem
  compra é o `python dca.py`. O "valor atual" usa preços de referência da API pública da Binance (mercado real).
  A aba escolhida é lembrada ao recarregar a página.

## Comparar estratégias (novo)
`python comparar.py` testa 7 estratégias (a atual do robô, tendência 50/200, rompimento Donchian
55/20, recuo na alta com RSI, reversão lateral com Bollinger+ADX e a CONFLUÊNCIA, que é a média
das quatro, com e sem travas) em 1h/4h/1d, em BTC, ETH, SOL e BNB juntos (1500 dias).
- Parâmetros FIXOS e clássicos, definidos antes de ver resultado (nada é otimizado no passado).
- Execução conservadora (`motor.py`): taxa nas duas pontas, slippage, stop com salto, stop antes do alvo.
- Veredito PASSOU exige: >= 30 trades somando os pares, PnL > 0, fator de lucro >= 1,2,
  >= 60% dos blocos positivos e lucro maior que a pior queda. Se nada passar, não ligue o real.
- Mostra "SEM travas" ao lado de "SEGURA" e compara com comprar e segurar.
- Opções: `--simbolos BTC/USDT,ETH/USDT`, `--dias 2000`. Candles ficam salvos em `dados_*_1h_*d.csv`.
- `python -m unittest testes -v` roda os testes (inclui a prova de que nenhuma estratégia olha o futuro).

## Teste de robustez (novo)
`python robustez.py` põe o Donchian à prova (4h e 1d, mesmos dados do comparar): (1) vizinhança de
parâmetros, (2) custos mais altos, (3) estabilidade por metade e por ano, (4) dependência de sorte
(sem o melhor par, sem os 3 melhores trades) e (5) queda em %, comparada com comprar e segurar.
Os critérios estão no topo do arquivo e foram definidos antes de ver o resultado. Passar não prova
lucro: só indica que não é um acaso óbvio. O teste final é a simulação ao vivo.

## Travas do robô (novo)
Todas no `config.py`: esfriamento depois de perda (15 min), pausa de 60 min depois de 3 perdas
seguidas, máximo de compras por dia, perda do dia (para), perda total da sessão (para e cria
`TRAVA.txt`: o robô se recusa a iniciar enquanto ele existir) e proteção contra dado ruim
(candle velho ou preço que pula mais de 5% entre ciclos: o ciclo é ignorado e registrado como `DADOS`).

## Testnet da Binance (dinheiro de mentira)
Valida ordens de verdade (mínimos, casas, taxa em BTC) sem risco. Os candles continuam vindo do
mercado real; só as ORDENS vão para a testnet.
1. Crie a chave em https://testnet.binance.vision (login com GitHub) -> *Gerar chave HMAC-SHA-256*.
   O secret só aparece uma vez. A testnet começa com saldo de teste (BTC, USDT etc.).
2. Defina no PC (nunca no código): `setx BINANCE_TESTNET_API_KEY "..."` e
   `setx BINANCE_TESTNET_API_SECRET "..."`, e reabra o terminal.
3. Em `config.py`: `TESTNET = True` e `MODO_SIMULADO = False`.
4. `python main.py` e acompanhe o `registro.csv` (o log diz `modo TESTNET`).
- Chaves da testnet e da conta real são DIFERENTES e usam variáveis diferentes.
- O robô se recusa a iniciar em TESTNET/REAL se faltarem as variáveis.

## Passar para o real (só depois de dias no simulado)
1. Crie uma chave de API na Binance com permissão SÓ de trade, SEM saque
2. Defina as variáveis `BINANCE_API_KEY` e `BINANCE_API_SECRET` no seu PC
3. Em `config.py`, troque `MODO_SIMULADO = False` **e `TESTNET = False`** (os dois!) e mantenha o valor em ~US$ 10

## Próximos passos
- Rodar o backtest com dados reais e decidir se a estratégia placeholder serve (ou trocar)
- Gravar a posição aberta em arquivo, para sobreviver a reinício do robô
- Painel simples de acompanhamento
