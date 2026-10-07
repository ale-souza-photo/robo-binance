"""Comparador de estratégias com validação "andando para frente" (walk-forward).

Testa várias estratégias x timeframes x níveis de stop/alvo, com as MESMAS taxas e
slippage do backtest.py, e diz com honestidade se alguma passou ou não.

Como evita se enganar:
- O período é dividido em blocos (padrão 6). Para cada bloco, a configuração de
  stop/alvo é ESCOLHIDA olhando só os blocos anteriores e TESTADA no bloco seguinte,
  sem ver o futuro. A tabela principal usa só esses resultados "fora da amostra".
- A coluna "enganoso" mostra o melhor resultado olhando o passado todo: serve para
  você ver o quanto isso inflaciona o número.
- Testar muitas combinações faz alguma parecer boa por pura sorte. Por isso o
  veredito exige critérios mínimos, e quem passar deve ser re-testado em outro
  período e em outro par (--simbolo ETH/USDT) antes de qualquer confiança.

Uso (só dados públicos, sem chave):
    python comparar.py                     # BTC/USDT, 180 dias
    python comparar.py --dias 365
    python comparar.py --base 1m --csv dados_BTCUSDT_1m_180d.csv   # reaproveita o que já baixou
    python comparar.py --simbolo ETH/USDT
"""
import argparse
import glob
import os
from datetime import datetime, timezone

import backtest
import config

TIMEFRAMES = {"5m": 5, "15m": 15, "1h": 60}          # em minutos, a partir do candle de 1m
RISCOS = [(0.01, 0.015), (0.02, 0.03), (0.03, 0.06)]  # (stop, alvo)
AQUECIMENTO = 210                                     # candles ignorados p/ os indicadores
MIN_TRADES = 40
MIN_FATOR_LUCRO = 1.2
MIN_BLOCOS_POSITIVOS = 0.6


# ----------------------------------------------------------------- dados
def reamostrar(candles_base, minutos, base_min):
    """Junta candles base (ex.: 5m) em candles de `minutos` (descarta o último, incompleto)."""
    if minutos == base_min:
        return candles_base
    ms = minutos * 60_000
    grupos, ordem = {}, []
    for c in candles_base:
        k = c["tempo"] // ms
        if k not in grupos:
            grupos[k] = []
            ordem.append(k)
        grupos[k].append(c)
    saida = []
    for k in ordem[:-1]:
        g = grupos[k]
        saida.append({"tempo": k * ms, "abertura": g[0]["abertura"],
                      "maxima": max(x["maxima"] for x in g),
                      "minima": min(x["minima"] for x in g),
                      "fechamento": g[-1]["fechamento"],
                      "volume": sum(x["volume"] for x in g)})
    return saida


def obter_candles(simbolo, dias, base, caminho_csv):
    if caminho_csv:
        return backtest.ler_csv(caminho_csv)
    padrao = f"dados_{simbolo.replace('/', '')}_{base}_{dias}d.csv"
    if os.path.exists(padrao):
        print(f"Usando {padrao} (já baixado)")
        return backtest.ler_csv(padrao)
    print(f"Baixando {dias} dias de {simbolo} em candles de {base}...")
    candles = backtest.baixar_historico(simbolo, base, dias)
    backtest.salvar_csv(candles, padrao)
    return candles


# ----------------------------------------------------------- indicadores
def sma(v, n):
    saida, soma = [None] * len(v), 0.0
    for i, x in enumerate(v):
        soma += x
        if i >= n:
            soma -= v[i - n]
        if i >= n - 1:
            saida[i] = soma / n
    return saida


def rsi(v, n=14):
    saida = [None] * len(v)
    if len(v) <= n:
        return saida
    ganho = perda = 0.0
    for i in range(1, n + 1):
        d = v[i] - v[i - 1]
        ganho += max(d, 0)
        perda += max(-d, 0)
    ganho, perda = ganho / n, perda / n
    saida[n] = 100.0 if perda == 0 else 100 - 100 / (1 + ganho / perda)
    for i in range(n + 1, len(v)):
        d = v[i] - v[i - 1]
        ganho = (ganho * (n - 1) + max(d, 0)) / n
        perda = (perda * (n - 1) + max(-d, 0)) / n
        saida[i] = 100.0 if perda == 0 else 100 - 100 / (1 + ganho / perda)
    return saida


# ------------------------------------------------------------ estratégias
# Cada uma recebe os candles e devolve uma lista de bool (comprar no fechamento i).
# O sinal em i usa só dados até i (sem olhar o futuro).
def est_cruzamento(candles):
    """Baseline: a estratégia atual do robô (média 9 cruza acima da 21)."""
    f = [c["fechamento"] for c in candles]
    r, l = sma(f, 9), sma(f, 21)
    return [i > 21 and r[i - 1] <= l[i - 1] and r[i] > l[i] for i in range(len(f))]


def est_tendencia(candles):
    """Cruzamento 20/50 para cima, só quando o preço está acima da média de 200."""
    f = [c["fechamento"] for c in candles]
    r, l, t = sma(f, 20), sma(f, 50), sma(f, 200)
    return [i > 200 and r[i - 1] <= l[i - 1] and r[i] > l[i] and f[i] > t[i]
            for i in range(len(f))]


def est_rompimento(candles, janela=20):
    """Rompimento: fecha acima da máxima dos 20 candles anteriores, em tendência de alta."""
    f = [c["fechamento"] for c in candles]
    mx = [c["maxima"] for c in candles]
    t = sma(f, 200)
    return [i > 200 and f[i] > max(mx[i - janela:i]) and f[i - 1] <= max(mx[i - 1 - janela:i - 1])
            and f[i] > t[i] for i in range(len(f))]


def est_rsi(candles):
    """Reversão: RSI(14) sai da zona de sobrevenda (cruza 30 para cima)."""
    f = [c["fechamento"] for c in candles]
    r = rsi(f, 14)
    return [i > 14 and r[i - 1] is not None and r[i - 1] < 30 <= r[i] for i in range(len(f))]


ESTRATEGIAS = {
    "cruzamento 9/21 (atual)": est_cruzamento,
    "tendência 20/50 + SMA200": est_tendencia,
    "rompimento 20 + SMA200": est_rompimento,
    "reversão RSI<30": est_rsi,
}


# --------------------------------------------------------- walk-forward
def pnl_por_bloco(candles, sinais, risco, slippage, limites):
    """Simula cada bloco separadamente. Retorna lista de listas de pnl por trade."""
    stop, alvo = risco
    saida = []
    for a, b in limites:
        trades, _ = backtest.simular(candles[a:b], stop=stop, alvo=alvo, slippage=slippage,
                                     sinais=sinais[a:b], janela=0)
        saida.append([t["pnl"] for t in trades])
    return saida


def avaliar(candles, sinais, slippage, n_blocos):
    n = len(candles)
    passo = (n - AQUECIMENTO) // n_blocos
    limites = [(AQUECIMENTO + k * passo, AQUECIMENTO + (k + 1) * passo) for k in range(n_blocos)]
    por_risco = {r: pnl_por_bloco(candles, sinais, r, slippage, limites) for r in RISCOS}

    oos, escolhas, blocos_oos = [], [], []
    for k in range(1, n_blocos):
        melhor = max(RISCOS, key=lambda r: sum(sum(b) for b in por_risco[r][:k]))
        escolhas.append(melhor)
        oos.extend(por_risco[melhor][k])
        blocos_oos.append(sum(por_risco[melhor][k]))

    enganoso = max(sum(sum(b) for b in por_risco[r]) for r in RISCOS)
    ganhos = sum(x for x in oos if x > 0)
    perdas = -sum(x for x in oos if x <= 0)
    return {
        "trades": len(oos),
        "acerto": 100 * sum(1 for x in oos if x > 0) / len(oos) if oos else 0.0,
        "pnl": sum(oos),
        "fator": (ganhos / perdas) if perdas > 0 else (float("inf") if ganhos else 0.0),
        "blocos_pos": sum(1 for x in blocos_oos if x > 0) / len(blocos_oos),
        "enganoso": enganoso,
        "risco": max(set(escolhas), key=escolhas.count),
        "buy_hold": 100 * (candles[limites[-1][1] - 1]["fechamento"]
                           / candles[limites[0][1] - 1]["fechamento"] - 1),
    }


def passou(m):
    return (m["trades"] >= MIN_TRADES and m["pnl"] > 0 and m["fator"] >= MIN_FATOR_LUCRO
            and m["blocos_pos"] >= MIN_BLOCOS_POSITIVOS)


def principal():
    p = argparse.ArgumentParser(description="Compara estratégias com walk-forward")
    p.add_argument("--simbolo", default=config.SIMBOLO)
    p.add_argument("--dias", type=int, default=180)
    p.add_argument("--base", default="5m", choices=["1m", "5m"],
                   help="candle a baixar (5m é 5x mais rápido e basta p/ 5m/15m/1h)")
    p.add_argument("--csv", help="CSV de candles já baixado (informe --base igual ao do arquivo)")
    p.add_argument("--blocos", type=int, default=6)
    p.add_argument("--slippage", type=float, default=0.0005)
    a = p.parse_args()

    base_min = int(a.base[:-1])
    base = obter_candles(a.simbolo, a.dias, a.base, a.csv)
    ini = datetime.fromtimestamp(base[0]["tempo"] / 1000, timezone.utc)
    fim = datetime.fromtimestamp(base[-1]["tempo"] / 1000, timezone.utc)
    print(f"\n{a.simbolo}: {len(base)} candles de {a.base}, {ini:%Y-%m-%d} a {fim:%Y-%m-%d} | "
          f"taxa {config.TAXA:.2%}/lado, slippage {a.slippage:.2%}, {a.blocos} blocos "
          f"(o 1º só treina; PnL em USDT por ordem de US$ {config.VALOR_POR_ORDEM_USDT:.0f})\n")

    linhas, bh = [], None
    for tf, minutos in TIMEFRAMES.items():
        if minutos % base_min:
            continue
        candles = reamostrar(base, minutos, base_min)
        if len(candles) < AQUECIMENTO + a.blocos * 30:
            print(f"(pulando {tf}: poucos candles)")
            continue
        for nome, fn in ESTRATEGIAS.items():
            m = avaliar(candles, fn(candles), a.slippage, a.blocos)
            m["nome"], m["tf"] = nome, tf
            linhas.append(m)
            bh = m["buy_hold"]
        print(f"  {tf} pronto")

    linhas.sort(key=lambda m: m["pnl"], reverse=True)
    cab = f"{'estratégia':26} {'tf':>4} {'trades':>6} {'acerto':>7} {'PnL fora':>9} " \
          f"{'fator':>6} {'blocos+':>8} {'stop/alvo':>10} {'enganoso':>9}  veredito"
    print("\n" + cab + "\n" + "-" * len(cab))
    for m in linhas:
        fator = "  inf" if m["fator"] == float("inf") else f"{m['fator']:6.2f}"
        r = f"{m['risco'][0]:.0%}/{m['risco'][1]:.1%}"
        print(f"{m['nome']:26} {m['tf']:>4} {m['trades']:6d} {m['acerto']:6.1f}% "
              f"{m['pnl']:+9.2f} {fator} {m['blocos_pos']:7.0%} {r:>10} "
              f"{m['enganoso']:+9.2f}  {'PASSOU' if passou(m) else 'reprovou'}")

    print(f"\nPnL fora = resultado em blocos NÃO vistos na escolha (o que vale). "
          f"'enganoso' = melhor config olhando o passado todo.\n"
          f"Comprar e segurar nos mesmos blocos: {bh:+.1f}%.")
    ok = [m for m in linhas if passou(m)]
    print(f"\nCritérios p/ passar: >= {MIN_TRADES} trades fora da amostra, PnL > 0, fator de "
          f"lucro >= {MIN_FATOR_LUCRO}, >= {MIN_BLOCOS_POSITIVOS:.0%} dos blocos positivos.")
    if not ok:
        print("RESULTADO: NENHUMA estratégia passou. Operar com elas, hoje, perderia dinheiro "
              "após taxas. Não ligue o modo real.")
    else:
        print(f"RESULTADO: {len(ok)} passaram, de {len(linhas)} combinações testadas. Com tantas "
              f"combinações, algumas passam por sorte. Antes de confiar: re-teste em outro "
              f"período (--dias 365) e em outro par (--simbolo ETH/USDT), e só então simule ao vivo.")


if __name__ == "__main__":
    principal()
