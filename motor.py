"""Motor de simulação do comparar.py.

Roda UM plano (ver estrategias.py) sobre candles e devolve os trades. Regras de execução,
todas no sentido CONSERVADOR (quando há dúvida, o resultado sai pior, nunca melhor):
- Entrada no fechamento do candle do sinal, mais slippage.
- Stop com salto: se o candle ABRE abaixo do stop, a saída é na abertura (pior que o stop).
- Stop e alvo no mesmo candle: vale o stop.
- Stop móvel (trailing): sobe com a máxima já atingida; só usa máximas de candles ANTERIORES.
- Taxa nas duas pontas e slippage na saída a mercado.
- Depois de sair, não compra de novo no mesmo candle.

Travas opcionais (dict "guardas" no plano):
    esfriar              candles sem comprar depois de uma perda
    max_perdas_seguidas  quantas perdas seguidas disparam a pausa
    pausa_perdas         candles de pausa depois dessas perdas
    dd_max_frac          queda máxima desde o pico, em fração do valor da ordem
    pausa_dd             candles de pausa quando a queda estoura (e o pico é zerado)
"""

AQUECIMENTO = 210  # candles iniciais ignorados: os indicadores precisam de histórico


def _valor(x, i):
    return x[i] if isinstance(x, list) else x


def simular(candles, plano, valor=10.0, taxa=0.001, slippage=0.0005, inicio=AQUECIMENTO):
    """Retorna lista de trades (dicts). pnl em USDT para uma ordem de `valor` USDT."""
    n = len(candles)
    g = plano.get("guardas") or {}
    entrada, saida = plano["entrada"], plano.get("saida")
    trades, pos = [], None
    bloqueado_ate = -1
    perdas_seguidas, equidade, pico = 0, 0.0, 0.0

    for j in range(inicio, n):
        k = candles[j]
        if pos:
            stop_px = pos["stop_px"]
            if pos["trail"] is not None:
                stop_px = max(stop_px, pos["max_alta"] * (1 - pos["trail"]))
            preco = motivo = None
            if stop_px and k["abertura"] <= stop_px:
                preco, motivo = k["abertura"] * (1 - slippage), "stop"
            elif stop_px and k["minima"] <= stop_px:
                preco, motivo = stop_px * (1 - slippage), "stop"
            elif pos["alvo_px"] and k["maxima"] >= pos["alvo_px"]:
                preco, motivo = pos["alvo_px"], "alvo"
            elif saida and saida[j]:
                preco, motivo = k["fechamento"] * (1 - slippage), "sinal"
            elif plano.get("tempo_max") and j - pos["i"] >= plano["tempo_max"]:
                preco, motivo = k["fechamento"] * (1 - slippage), "tempo"
            if motivo:
                qtd = pos["qtd"]
                pnl = (preco - pos["preco"]) * qtd - taxa * qtd * (pos["preco"] + preco)
                trades.append({"i_ent": pos["i"], "i_sai": j, "t_ent": candles[pos["i"]]["tempo"],
                               "t_sai": k["tempo"], "entrada": pos["preco"], "saida": preco,
                               "pnl": pnl, "motivo": motivo})
                pos = None
                equidade += pnl
                pico = max(pico, equidade)
                if pnl < 0:
                    perdas_seguidas += 1
                    bloqueado_ate = max(bloqueado_ate, j + g.get("esfriar", 0))
                    if g.get("max_perdas_seguidas") and perdas_seguidas >= g["max_perdas_seguidas"]:
                        bloqueado_ate = max(bloqueado_ate, j + g.get("pausa_perdas", 0))
                        perdas_seguidas = 0
                else:
                    perdas_seguidas = 0
                if g.get("dd_max_frac") and pico - equidade > g["dd_max_frac"] * valor:
                    bloqueado_ate = max(bloqueado_ate, j + g.get("pausa_dd", 0))
                    pico = equidade  # recomeça a contar a queda a partir daqui
                continue
            pos["max_alta"] = max(pos["max_alta"], k["maxima"])
            continue

        if j <= bloqueado_ate or not entrada[j]:
            continue
        sf = _valor(plano.get("stop"), j) if plano.get("stop") is not None else None
        if sf is None:
            continue  # sem distância de stop calculada (indicador ainda sem dados): não entra
        preco = k["fechamento"] * (1 + slippage)
        tr = _valor(plano.get("trailing"), j) if plano.get("trailing") is not None else None
        al = plano.get("alvo")
        pos = {"i": j, "preco": preco, "qtd": valor / preco, "stop_px": preco * (1 - sf),
               "trail": tr, "alvo_px": preco * (1 + al) if al else None, "max_alta": preco}
    return trades


# ------------------------------------------------------------------ métricas
def metricas(trades, n_candles, inicio=AQUECIMENTO, n_blocos=6):
    """Resumo de uma lista de trades de UM par. Os blocos dividem o período em partes iguais."""
    pnls = [t["pnl"] for t in trades]
    ganhos = sum(x for x in pnls if x > 0)
    perdas = -sum(x for x in pnls if x <= 0)
    acum = pico = dd = 0.0
    seq = pior_seq = 0
    for x in pnls:
        acum += x
        pico = max(pico, acum)
        dd = max(dd, pico - acum)
        seq = seq + 1 if x <= 0 else 0
        pior_seq = max(pior_seq, seq)
    passo = max(1, (n_candles - inicio) // n_blocos)
    blocos = {}
    for t in trades:
        b = min(n_blocos - 1, (t["i_sai"] - inicio) // passo)
        blocos[b] = blocos.get(b, 0.0) + t["pnl"]
    barras = sum(t["i_sai"] - t["i_ent"] for t in trades)
    return {"trades": len(pnls), "vitorias": sum(1 for x in pnls if x > 0), "pnl": sum(pnls),
            "ganhos": ganhos, "perdas": perdas, "dd": dd, "pior_seq": pior_seq,
            "blocos": list(blocos.values()), "mercado": barras / max(1, n_candles - inicio)}


def comprar_e_segurar(candles, inicio=AQUECIMENTO):
    """Retorno (%) e pior queda (%) de simplesmente comprar no começo e segurar."""
    f = [c["fechamento"] for c in candles[inicio:]]
    if len(f) < 2:
        return 0.0, 0.0
    pico, dd = f[0], 0.0
    for x in f:
        pico = max(pico, x)
        dd = max(dd, 1 - x / pico)
    return 100 * (f[-1] / f[0] - 1), 100 * dd
