"""Bloco 2 - Risco e tamanho: define quanto comprar, stop e alvo.

Com `regras` (RegrasBinance), quantidade e preços respeitam os passos da
Binance e a ordem é recusada (retorna None) se ficar abaixo do valor mínimo.
"""
import config


def calcular_ordem(preco, regras=None):
    quantidade = config.VALOR_POR_ORDEM_USDT / preco
    stop = preco * (1 - config.STOP_PERCENT)
    alvo = preco * (1 + config.ALVO_PERCENT)
    if regras:
        quantidade = regras.quantidade(quantidade)
        stop, alvo = regras.preco(stop), regras.preco(alvo)
        motivo = regras.validar(quantidade, preco)
        if motivo:
            return {"recusada": motivo}
    else:
        quantidade, stop, alvo = round(quantidade, 6), round(stop, 2), round(alvo, 2)
    return {"quantidade": quantidade, "preco": preco, "stop": stop, "alvo": alvo}
