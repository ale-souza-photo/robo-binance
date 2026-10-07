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

## Comparar estratégias (novo)
`python comparar.py` testa 4 estratégias (cruzamento 9/21 atual, tendência 20/50 + SMA200,
rompimento + SMA200, reversão RSI) em 5m/15m/1h e 3 níveis de stop/alvo, com as mesmas taxas.
- Validação "andando para frente": a config é escolhida nos blocos anteriores e testada no
  seguinte. A coluna "PnL fora" é a que vale; "enganoso" mostra o quanto olhar o passado infla.
- Veredito: PASSOU exige >= 40 trades fora da amostra, PnL > 0, fator de lucro >= 1,2 e
  >= 60% dos blocos positivos. Se nenhuma passar, não ligue o modo real.
- Reaproveita `dados_BTCUSDT_1m_180d.csv` (use `--csv` para apontar outro). Outros pares:
  `--simbolo ETH/USDT`. Quem passar deve ser re-testado em outro período e outro par.

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
