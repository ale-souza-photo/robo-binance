import os

# Segurança: começa SEMPRE em modo simulado (não envia ordem real)
MODO_SIMULADO = True

# Testnet da Binance (dinheiro de mentira). Só vale com MODO_SIMULADO = False.
#   MODO_SIMULADO=True                  -> nada é enviado a lugar nenhum
#   MODO_SIMULADO=False + TESTNET=True  -> ordens na testnet (sem risco)
#   MODO_SIMULADO=False + TESTNET=False -> ORDENS REAIS, dinheiro de verdade
TESTNET = True

SIMBOLO = "BTC/USDT"
TIMEFRAME = "5m"
INTERVALO_SEGUNDOS = 30

# Risco
VALOR_POR_ORDEM_USDT = 10.0       # teste inicial com valor mínimo
PERDA_MAXIMA_DIARIA_USDT = 2.0    # kill switch: passou disso, para tudo
MAX_POSICOES_ABERTAS = 1          # só uma posição por vez
STOP_PERCENT = 0.01               # stop de 1%
ALVO_PERCENT = 0.015              # alvo de 1,5%
TAXA = 0.001                      # taxa estimada por lado (0,1%)

# Chaves: NUNCA escreva no código. Use variáveis de ambiente.
# Testnet e conta real usam chaves DIFERENTES, em variáveis separadas.
if TESTNET:
    API_KEY = os.getenv("BINANCE_TESTNET_API_KEY", "")
    API_SECRET = os.getenv("BINANCE_TESTNET_API_SECRET", "")
else:
    API_KEY = os.getenv("BINANCE_API_KEY", "")
    API_SECRET = os.getenv("BINANCE_API_SECRET", "")

# Travas extras: protegem de erros e de sequências ruins (o robô NÃO opera nestas situações)
ESFRIAR_APOS_PERDA_MIN = 15       # depois de uma perda, não recompra por 15 minutos
MAX_PERDAS_SEGUIDAS = 3           # 3 perdas seguidas...
PAUSA_APOS_PERDAS_MIN = 60        # ...pausa de 60 minutos (o robô continua ligado)
MAX_TRADES_POR_DIA = 10           # limite de compras por dia (evita descontrole)
PERDA_MAXIMA_TOTAL_USDT = 5.0     # perda acumulada na sessão: trava e cria TRAVA.txt
ARQUIVO_TRAVA = "TRAVA.txt"       # enquanto existir, o robô se recusa a iniciar. Apague só depois de entender o que houve
MAX_SALTO_PRECO = 0.05            # preço pulou mais de 5% entre ciclos? Desconfia do dado e espera confirmar
IDADE_MAX_CANDLE = 3              # dado velho: último candle mais antigo que 3 timeframes

# ---- DCA: compra periódica (python dca.py). Usa o mesmo MODO_SIMULADO/TESTNET acima ----
DCA_ATIVOS = {"BTC/USDT": 0.7, "ETH/USDT": 0.3}  # proporção-meta de cada ativo (a soma tem que dar 1)
                                  # no modo REAL com Pix, use pares em reais: {"BTC/BRL": 0.7, "ETH/BRL": 0.3}
DCA_VALOR_POR_RODADA = 10.0       # quanto gastar por compra, na moeda do par (USDT na testnet; R$ em /BRL)
DCA_FREQUENCIA = "mensal"         # "diaria", "semanal" ou "mensal": uma compra por período, nunca duas
DCA_DIA = 5                       # mensal: a partir do dia do mês | semanal: a partir do dia da semana (0=segunda)
DCA_TETO_MENSAL = 25.0            # trava: gasto máximo por mês, na moeda do par
DCA_MAX_DESVIO_PRECO = 0.05       # trava: recusa comprar se o preço atual difere mais de 5% do último candle de 1h

ARQUIVO_PARADA = "PARAR.txt"      # crie esse arquivo para parar o robô na hora
ARQUIVO_LOG = "registro.csv"
ARQUIVO_ESTADO = "estado.json"   # instantâneo ao vivo, lido pelo painel.py
