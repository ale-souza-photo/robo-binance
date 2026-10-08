"""Loop principal: Scanner -> Risco -> Executor, com Kill switch e Registro."""
import os
import time
import config
import scanner
import risco
from regras_binance import RegrasBinance
import registro
import estado
from executor import Executor
from kill_switch import KillSwitch


def dado_invalido(candles, tf_ms, agora_ms):
    """Motivo (texto) se os candles não servem (vazios, velhos ou preço inválido); senão None."""
    if not candles:
        return "a Binance não devolveu candles"
    if agora_ms - candles[-1]["tempo"] > tf_ms * config.IDADE_MAX_CANDLE:
        return "dados velhos: o último candle é muito antigo"
    if not candles[-1]["fechamento"] or candles[-1]["fechamento"] <= 0:
        return "preço inválido"
    return None


def salto_suspeito(preco, preco_anterior):
    """Texto se o preço pulou demais de um ciclo para o outro; senão None."""
    if preco_anterior and abs(preco / preco_anterior - 1) > config.MAX_SALTO_PRECO:
        return f"preço pulou {abs(preco / preco_anterior - 1):.1%} de um ciclo para o outro"
    return None


def main():
    if os.path.exists(config.ARQUIVO_TRAVA):
        with open(config.ARQUIVO_TRAVA, encoding="utf-8") as f:
            detalhe = f.read().strip()
        raise SystemExit(f"Trava de segurança ativa ({config.ARQUIVO_TRAVA}):\n{detalhe}\n"
                         "Entenda o que aconteceu e só então apague o arquivo para voltar a operar.")
    if config.MODO_SIMULADO:
        modo = "SIMULADO"
    else:
        modo = "TESTNET" if config.TESTNET else "REAL"
        if not (config.API_KEY and config.API_SECRET):
            nome = "BINANCE_TESTNET_API_KEY/SECRET" if config.TESTNET else "BINANCE_API_KEY/SECRET"
            raise SystemExit(f"Modo {modo} precisa das variáveis de ambiente {nome}.")
    registro.registrar("INICIO", detalhe=f"modo {modo}")

    # Ordens vão para a testnet (se ligada); os candles vêm SEMPRE do mercado real,
    # porque os preços da testnet são artificiais e distorceriam a estratégia.
    usar_testnet = config.TESTNET and not config.MODO_SIMULADO
    exchange = scanner.criar_exchange(config.API_KEY, config.API_SECRET, testnet=usar_testnet)
    mercado = scanner.criar_exchange() if usar_testnet else exchange
    regras = RegrasBinance(exchange, config.SIMBOLO)  # lê mínimos e casas da Binance
    registro.registrar("REGRAS", detalhe=regras.resumo())
    executor = Executor(exchange, regras)
    kill = KillSwitch()
    posicao = None  # só uma por vez
    candles, preco, analise = [], None, {}
    tf_ms = mercado.parse_timeframe(config.TIMEFRAME) * 1000
    preco_anterior, saltos, aviso_dados = None, 0, None

    def publicar(erro=None):
        """Grava o instantâneo que o painel (painel.py) mostra na tela."""
        estado.salvar(
            modo=modo, simbolo=config.SIMBOLO, timeframe=config.TIMEFRAME,
            intervalo=config.INTERVALO_SEGUNDOS, valor_por_ordem=config.VALOR_POR_ORDEM_USDT,
            perda_max=config.PERDA_MAXIMA_DIARIA_USDT, taxa=config.TAXA, pnl_dia=round(kill.pnl_dia, 4),
            pausa_ate=int(max(kill.pausado_ate, kill.esfriar_ate) * 1000), trades_hoje=kill.trades_hoje,
            preco=preco, candles=[[c["tempo"], c["fechamento"]] for c in candles[-100:]],
            posicao=posicao, sinal=analise.get("sinal"), motivo=analise.get("motivo"),
            parado=kill.travado, motivo_parada=kill.motivo, erro=erro)

    publicar()

    while True:
        try:
            candles = scanner.buscar_candles(mercado, config.SIMBOLO, config.TIMEFRAME)

            # Dado suspeito (vazio, velho ou salto de preço)? Não decide nada neste ciclo.
            problema = dado_invalido(candles, tf_ms, time.time() * 1000)
            if not problema:
                problema = salto_suspeito(candles[-1]["fechamento"], preco_anterior)
                saltos = saltos + 1 if problema else 0
                if problema and saltos >= 2:  # o mesmo preço novo em 2 ciclos seguidos: aceita
                    problema, saltos = None, 0
            if problema:
                if problema != aviso_dados:
                    registro.registrar("DADOS", detalhe=problema + "; ciclo ignorado")
                aviso_dados = problema
                publicar(erro=problema)
                time.sleep(config.INTERVALO_SEGUNDOS)
                continue
            analise = scanner.analisar(candles)
            preco = analise["preco"]
            aviso_dados, preco_anterior = None, preco

            if posicao:
                if preco <= posicao["stop"] or preco >= posicao["alvo"]:
                    saida = executor.vender(posicao["quantidade"], preco)
                    bruto = (saida["preco"] - posicao["preco"]) * posicao["quantidade"]
                    taxas = 2 * config.TAXA * posicao["preco"] * posicao["quantidade"]
                    pnl = round(bruto - taxas, 4)
                    aviso = kill.registrar_resultado(pnl)
                    registro.registrar("VENDA", saida["preco"], posicao["quantidade"], pnl,
                                       "stop" if preco <= posicao["stop"] else "alvo")
                    if aviso:
                        registro.registrar("PAUSA", detalhe=aviso)
                    posicao = None
            elif kill.pode_operar(posicoes_abertas=0) and analise["sinal"] == "COMPRA":
                ordem = risco.calcular_ordem(preco, regras)
                if "recusada" in ordem:
                    registro.registrar("RECUSADA", preco, detalhe=ordem["recusada"])
                else:
                    entrada = executor.comprar(ordem)
                    kill.registrar_compra()
                    posicao = {**ordem, "preco": entrada["preco"],
                               "quantidade": entrada["quantidade"]}
                    registro.registrar("COMPRA", entrada["preco"], entrada["quantidade"],
                                       detalhe=analise["motivo"])

            publicar()
            if kill.travado and not posicao:
                registro.registrar("PARADO", detalhe=kill.motivo)
                break

        except Exception as erro:  # nunca deixa o robô cair sem registrar
            registro.registrar("ERRO", detalhe=str(erro))
            publicar(erro=str(erro))

        time.sleep(config.INTERVALO_SEGUNDOS)


if __name__ == "__main__":
    main()
