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

ARQUIVO_PARADA = "PARAR.txt"      # crie esse arquivo para parar o robô na hora
ARQUIVO_LOG = "registro.csv"
