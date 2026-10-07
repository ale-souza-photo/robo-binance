"""Loop principal: Scanner -> Risco -> Executor, com Kill switch e Registro."""
import time
import config
import scanner
import risco
from regras_binance import RegrasBinance
import registro
from executor import Executor
from kill_switch import KillSwitch


def main():
    modo = "SIMULADO" if config.MODO_SIMULADO else "REAL"
    registro.registrar("INICIO", detalhe=f"modo {modo}")

    exchange = scanner.criar_exchange(config.API_KEY, config.API_SECRET)
    regras = RegrasBinance(exchange, config.SIMBOLO)  # lê mínimos e casas da Binance
    registro.registrar("REGRAS", detalhe=regras.resumo())
    executor = Executor(exchange, regras)
    kill = KillSwitch()
    posicao = None  # só uma por vez

    while True:
        try:
            candles = scanner.buscar_candles(exchange, config.SIMBOLO, config.TIMEFRAME)
            analise = scanner.analisar(candles)
            preco = analise["preco"]

            if posicao:
                if preco <= posicao["stop"] or preco >= posicao["alvo"]:
                    saida = executor.vender(posicao["quantidade"], preco)
                    bruto = (saida["preco"] - posicao["preco"]) * posicao["quantidade"]
                    taxas = 2 * config.TAXA * posicao["preco"] * posicao["quantidade"]
                    pnl = round(bruto - taxas, 4)
                    kill.registrar_resultado(pnl)
                    registro.registrar("VENDA", saida["preco"], posicao["quantidade"], pnl,
                                       "stop" if preco <= posicao["stop"] else "alvo")
                    posicao = None
            elif kill.pode_operar(posicoes_abertas=0) and analise["sinal"] == "COMPRA":
                ordem = risco.calcular_ordem(preco, regras)
                if "recusada" in ordem:
                    registro.registrar("RECUSADA", preco, detalhe=ordem["recusada"])
                else:
                    entrada = executor.comprar(ordem)
                    posicao = {**ordem, "preco": entrada["preco"],
                               "quantidade": entrada["quantidade"]}
                    registro.registrar("COMPRA", entrada["preco"], entrada["quantidade"],
                                       detalhe=analise["motivo"])

            if kill.travado and not posicao:
                registro.registrar("PARADO", detalhe=kill.motivo)
                break

        except Exception as erro:  # nunca deixa o robô cair sem registrar
            registro.registrar("ERRO", detalhe=str(erro))

        time.sleep(config.INTERVALO_SEGUNDOS)


if __name__ == "__main__":
    main()
