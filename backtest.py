"""Backtest: roda a estratégia do scanner.py sobre candles históricos.

Usa as MESMAS regras do robô (config.py): stop, alvo, taxa, valor por ordem,
uma posição por vez e perda máxima diária.

Uso:
    python backtest.py                          # 90 dias, símbolo/timeframe do config.py
    python backtest.py --dias 180
    python backtest.py --simbolo ETH/USDT --timeframe 15m
    python backtest.py --csv meus_candles.csv   # usa um CSV em vez de baixar

Só lê dados PÚBLICOS da Binance: não precisa de chave de API.

Premissas (conservadoras):
- Entrada no fechamento do candle do sinal (+ slippage).
- Se no mesmo candle toca stop e alvo, considera que o STOP veio primeiro.
- Saída no stop/alvo exato (stop com slippage contra você).
- Taxa de 0,1% por lado (config.TAXA).
"""
import argparse
import csv
import os
import time
from collections import defaultdict
from datetime import datetime, timezone

import config
import scanner

JANELA = 30  # candles passados ao scanner.analisar (ele precisa de pelo menos 22)


# ---------------------------------------------------------------- dados
def baixar_historico(simbolo, timeframe, dias, exchange=None):
    """Baixa candles públicos da Binance, paginando de 1000 em 1000."""
    exchange = exchange or scanner.criar_exchange()
    ms_candle = exchange.parse_timeframe(timeframe) * 1000
    fim = exchange.milliseconds()
    desde = fim - dias * 24 * 3600 * 1000
    candles, cursor = [], desde
    ultimo_aviso = -1
    while cursor < fim:
        lote = exchange.fetch_ohlcv(simbolo, timeframe=timeframe, since=cursor, limit=1000)
        if not lote:
            break
        candles.extend(lote)
        proximo = lote[-1][0] + ms_candle
        if proximo <= cursor:
            break
        cursor = proximo
        pct = min(100, int(100 * (cursor - desde) / (fim - desde)))
        if pct // 10 != ultimo_aviso:
            ultimo_aviso = pct // 10
            print(f"  baixando... {pct}%  ({len(candles)} candles)", flush=True)
    return _normalizar(candles)


def _normalizar(linhas):
    vistos, saida = set(), []
    for d in sorted(linhas, key=lambda x: x[0]):
        if d[0] in vistos:
            continue
        vistos.add(d[0])
        saida.append({"tempo": int(d[0]), "abertura": float(d[1]), "maxima": float(d[2]),
                      "minima": float(d[3]), "fechamento": float(d[4]), "volume": float(d[5])})
    return saida


def salvar_csv(candles, caminho):
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["tempo", "abertura", "maxima", "minima", "fechamento", "volume"])
        for c in candles:
            w.writerow([c["tempo"], c["abertura"], c["maxima"], c["minima"],
                        c["fechamento"], c["volume"]])


def ler_csv(caminho):
    with open(caminho, newline="", encoding="utf-8") as f:
        linhas = [[r["tempo"], r["abertura"], r["maxima"], r["minima"],
                   r["fechamento"], r["volume"]] for r in csv.DictReader(f)]
    return _normalizar(linhas)


# ------------------------------------------------------------ simulação
def simular(candles, valor=None, stop=None, alvo=None, taxa=None,
            perda_max_dia=None, slippage=0.0, analisar=None, sinais=None, janela=None):
    """Simula a estratégia. Retorna (lista_de_trades, curva_de_pnl_acumulado).

    `sinais` (opcional): lista de bool, um por candle (True = comprar no fechamento
    dele). Usado pelo comparar.py. `janela`: primeiro candle simulado."""
    valor = config.VALOR_POR_ORDEM_USDT if valor is None else valor
    stop = config.STOP_PERCENT if stop is None else stop
    alvo = config.ALVO_PERCENT if alvo is None else alvo
    taxa = config.TAXA if taxa is None else taxa
    perda_max_dia = config.PERDA_MAXIMA_DIARIA_USDT if perda_max_dia is None else perda_max_dia
    analisar = analisar or scanner.analisar

    trades, pnl_acum, curva = [], 0.0, []
    posicao = None
    pnl_dia = defaultdict(float)

    inicio = JANELA if janela is None else janela
    for i in range(inicio, len(candles)):
        c = candles[i]
        dia = datetime.fromtimestamp(c["tempo"] / 1000, timezone.utc).date()

        if posicao:
            bateu_stop = c["minima"] <= posicao["stop"]
            bateu_alvo = c["maxima"] >= posicao["alvo"]
            if bateu_stop or bateu_alvo:
                if bateu_stop:  # conservador: stop vence se tocou os dois
                    saida, motivo = posicao["stop"] * (1 - slippage), "stop"
                else:
                    saida, motivo = posicao["alvo"], "alvo"
                qtd = posicao["quantidade"]
                bruto = (saida - posicao["preco"]) * qtd
                taxas = taxa * qtd * (posicao["preco"] + saida)
                pnl = bruto - taxas
                pnl_acum += pnl
                pnl_dia[posicao["dia"]] += pnl
                trades.append({"entrada_tempo": posicao["tempo"], "saida_tempo": c["tempo"],
                               "entrada": posicao["preco"], "saida": saida, "pnl": pnl,
                               "motivo": motivo})
                posicao = None
            curva.append(pnl_acum)
            continue

        curva.append(pnl_acum)
        if pnl_dia[dia] <= -perda_max_dia:  # kill switch diário
            continue
        if sinais is not None:
            comprar = sinais[i]
        else:
            comprar = analisar(candles[i - JANELA + 1:i + 1])["sinal"] == "COMPRA"
        if comprar:
            preco = c["fechamento"] * (1 + slippage)
            posicao = {"preco": preco, "quantidade": valor / preco,
                       "stop": preco * (1 - stop), "alvo": preco * (1 + alvo),
                       "tempo": c["tempo"], "dia": dia}

    return trades, curva


# -------------------------------------------------------------- métricas
def metricas(trades, curva, candles):
    n = len(trades)
    ganhos = [t["pnl"] for t in trades if t["pnl"] > 0]
    perdas = [t["pnl"] for t in trades if t["pnl"] <= 0]
    total = sum(t["pnl"] for t in trades)
    pico, dd = 0.0, 0.0
    for v in curva:
        pico = max(pico, v)
        dd = max(dd, pico - v)
    soma_perdas = -sum(perdas)
    c0, c1 = candles[JANELA]["fechamento"], candles[-1]["fechamento"]
    return {
        "trades": n,
        "acerto_pct": 100 * len(ganhos) / n if n else 0.0,
        "pnl_total": total,
        "pnl_medio": total / n if n else 0.0,
        "fator_lucro": (sum(ganhos) / soma_perdas) if soma_perdas > 0 else float("inf") if ganhos else 0.0,
        "max_drawdown": dd,
        "stops": sum(1 for t in trades if t["motivo"] == "stop"),
        "alvos": sum(1 for t in trades if t["motivo"] == "alvo"),
        "buy_hold_pct": 100 * (c1 / c0 - 1),
        "retorno_pct": 100 * total / config.VALOR_POR_ORDEM_USDT,
    }


def imprimir(titulo, m):
    fl = "∞" if m["fator_lucro"] == float("inf") else f"{m['fator_lucro']:.2f}"
    print(f"\n--- {titulo} ---")
    print(f"Trades: {m['trades']}  (alvos: {m['alvos']}, stops: {m['stops']})")
    print(f"Taxa de acerto: {m['acerto_pct']:.1f}%")
    print(f"PnL total: {m['pnl_total']:+.2f} USDT  "
          f"({m['retorno_pct']:+.1f}% sobre os US$ {config.VALOR_POR_ORDEM_USDT:.0f} da ordem)")
    print(f"PnL médio por trade: {m['pnl_medio']:+.4f} USDT")
    print(f"Fator de lucro: {fl}  (>1 = ganhou mais do que perdeu)")
    print(f"Maior queda (drawdown): {m['max_drawdown']:.2f} USDT")
    print(f"Comprar e segurar no período: {m['buy_hold_pct']:+.1f}%")


def executar(candles, slippage):
    if len(candles) < JANELA + 50:
        raise SystemExit(f"Poucos candles ({len(candles)}). Aumente --dias.")
    ini = datetime.fromtimestamp(candles[0]["tempo"] / 1000, timezone.utc)
    fim = datetime.fromtimestamp(candles[-1]["tempo"] / 1000, timezone.utc)
    print(f"{len(candles)} candles de {ini:%Y-%m-%d} a {fim:%Y-%m-%d}  "
          f"| stop {config.STOP_PERCENT:.1%}, alvo {config.ALVO_PERCENT:.1%}, "
          f"taxa {config.TAXA:.2%}/lado, slippage {slippage:.2%}")

    trades, curva = simular(candles, slippage=slippage)
    imprimir("PERÍODO COMPLETO", metricas(trades, curva, candles))

    # Divisão treino/teste: se só funciona no pedaço "treino", provável sorte.
    corte = int(len(candles) * 0.7)
    for nome, parte in (("PRIMEIROS 70% (treino)", candles[:corte]),
                        ("ÚLTIMOS 30% (teste, dados 'novos')", candles[corte:])):
        if len(parte) > JANELA + 20:
            t, cv = simular(parte, slippage=slippage)
            imprimir(nome, metricas(t, cv, parte))

    print("\nAviso: passado não garante futuro. Poucos trades = resultado pouco confiável "
          "(busque 100+). Só pense em modo real depois de simulação ao vivo coerente com isto.")
    return trades


def principal():
    p = argparse.ArgumentParser(description="Backtest do robô Binance")
    p.add_argument("--simbolo", default=config.SIMBOLO)
    p.add_argument("--timeframe", default=config.TIMEFRAME)
    p.add_argument("--dias", type=int, default=90)
    p.add_argument("--slippage", type=float, default=0.0005,
                   help="derrapagem por ordem a mercado, em fração (0.0005 = 0,05%%)")
    p.add_argument("--csv", help="usar este CSV de candles em vez de baixar")
    p.add_argument("--salvar-trades", help="grava os trades simulados neste CSV")
    a = p.parse_args()

    if a.csv:
        candles = ler_csv(a.csv)
    else:
        cache = f"dados_{a.simbolo.replace('/', '')}_{a.timeframe}_{a.dias}d.csv"
        if os.path.exists(cache) and time.time() - os.path.getmtime(cache) < 6 * 3600:
            print(f"Usando cache {cache}")
            candles = ler_csv(cache)
        else:
            print(f"Baixando {a.dias} dias de {a.simbolo} {a.timeframe}...")
            candles = baixar_historico(a.simbolo, a.timeframe, a.dias)
            salvar_csv(candles, cache)

    trades = executar(candles, a.slippage)
    if a.salvar_trades:
        with open(a.salvar_trades, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["entrada_tempo", "saida_tempo", "entrada",
                                              "saida", "pnl", "motivo"])
            w.writeheader()
            w.writerows(trades)


if __name__ == "__main__":
    principal()
