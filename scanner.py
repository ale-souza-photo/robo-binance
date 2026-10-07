"""Bloco 1 - Scanner: lê o mercado e diz se há sinal de compra.

Estratégia PLACEHOLDER (cruzamento de médias móveis). Troque pela estratégia
que for validada no backtest. O resto do robô não muda.
"""
import ccxt


def criar_exchange(api_key="", api_secret="", testnet=False):
    exchange = ccxt.binance({
        "apiKey": api_key,
        "secret": api_secret,
        "enableRateLimit": True,
    })
    if testnet:
        exchange.set_sandbox_mode(True)  # aponta para testnet.binance.vision
    return exchange


def buscar_candles(exchange, simbolo, timeframe, limite=100):
    dados = exchange.fetch_ohlcv(simbolo, timeframe=timeframe, limit=limite)
    return [{"tempo": d[0], "abertura": d[1], "maxima": d[2],
             "minima": d[3], "fechamento": d[4], "volume": d[5]} for d in dados]


def media(valores):
    return sum(valores) / len(valores)


def analisar(candles):
    """Retorna dict com 'sinal' ('COMPRA' ou 'NADA'), 'preco' e 'motivo'."""
    fechamentos = [c["fechamento"] for c in candles]
    preco = fechamentos[-1]
    if len(fechamentos) < 22:
        return {"sinal": "NADA", "preco": preco, "motivo": "poucos dados"}

    rapida_agora = media(fechamentos[-9:])
    lenta_agora = media(fechamentos[-21:])
    rapida_antes = media(fechamentos[-10:-1])
    lenta_antes = media(fechamentos[-22:-1])

    if rapida_antes <= lenta_antes and rapida_agora > lenta_agora:
        return {"sinal": "COMPRA", "preco": preco, "motivo": "média rápida cruzou para cima"}
    return {"sinal": "NADA", "preco": preco, "motivo": "sem cruzamento"}
