"""Teste de robustez do rompimento Donchian.

Pergunta: o lucro do Donchian é uma propriedade real da estratégia, ou um acaso dos números
exatos (55 e 20), dos custos assumidos, de um período bom ou de um único par/trade de sorte?

Cinco testes, com critérios definidos ANTES de ver o resultado:
  1. Vizinhança de parâmetros   Se mudar um pouco os números o lucro some, era pico por acaso.
                                Critério: >= 70% das combinações vizinhas com lucro e fator mediano >= 1,2.
  2. Estresse de custos         Taxas e slippage piores que o assumido.
                                Critério: continua com lucro com taxa 0,15% e slippage 0,10%.
  3. Estabilidade no tempo      Lucro por metade do período e por ano.
                                Critério: as duas metades com lucro.
  4. Dependência de sorte       Sem o melhor par; sem os 3 melhores trades.
                                Critério: continua com lucro nos dois casos.
  5. Queda em %, vs comprar e segurar (informativo, não aprova nem reprova).

Uso (mesmos dados do comparar.py, só dados públicos):
    python robustez.py                 # Donchian em 4h e 1d, BTC/ETH/SOL/BNB
    python robustez.py --tf 4h
"""
import argparse
from datetime import datetime, timezone
from statistics import median

import comparar
import config
import estrategias
import motor

ENTRADAS = [30, 40, 55, 70, 90]
SAIDAS = [10, 15, 20, 30, 40]
ATR_MULTS = [1.5, 2.0, 3.0, 4.0]
CUSTOS = [(0.001, 0.0005, "base (o que o comparar usa)"), (0.001, 0.001, "slippage dobrado"),
          (0.001, 0.002, "slippage 4x"), (0.0015, 0.001, "taxa 0,15% e slippage 0,10%"),
          (0.002, 0.002, "taxa 0,20% e slippage 0,20%")]
CRITERIO_CUSTO = (0.0015, 0.001)


# ------------------------------------------------------------------ utilidades
def rodar(candles, taxa=config.TAXA, slip=0.0005, **params):
    """Trades por par, para uma combinação de parâmetros e custos."""
    return {s: motor.simular(c, estrategias.donchian(c, **params), valor=config.VALOR_POR_ORDEM_USDT,
                             taxa=taxa, slippage=slip) for s, c in candles.items()}


def somar(trades_por_par):
    pnls = [t["pnl"] for ts in trades_por_par.values() for t in ts]
    ganhos, perdas = sum(x for x in pnls if x > 0), -sum(x for x in pnls if x <= 0)
    return sum(pnls), (ganhos / perdas if perdas > 0 else float("inf") if ganhos else 0.0), len(pnls)


def curva_equidade(candles, trades, taxa, inicio=motor.AQUECIMENTO):
    """Patrimônio candle a candle (começa em 1,0): 100% investido durante cada trade, reinvestindo,
    com a taxa nas duas pontas. Marca a mercado, então mostra a queda de verdade no meio do trade."""
    n = len(candles)
    eq, e0, idx = [1.0] * n, 1.0, inicio
    for t in sorted(trades, key=lambda x: x["i_ent"]):
        for j in range(idx, t["i_ent"]):
            eq[j] = e0
        base = e0 * (1 - taxa) / t["entrada"]
        for j in range(t["i_ent"], t["i_sai"]):
            eq[j] = base * candles[j]["fechamento"]
        e0 = base * t["saida"] * (1 - taxa)
        eq[t["i_sai"]] = e0
        idx = t["i_sai"] + 1
    for j in range(idx, n):
        eq[j] = e0
    return eq[inicio:]


def retorno_e_queda(eq):
    pico, dd = eq[0], 0.0
    for x in eq:
        pico = max(pico, x)
        dd = max(dd, 1 - x / pico)
    return 100 * (eq[-1] / eq[0] - 1), 100 * dd


def fmt_fator(x):
    return "inf" if x == float("inf") else f"{x:.2f}"


# --------------------------------------------------------------------- testes
def teste_vizinhanca(candles):
    print("\n1) VIZINHANÇA DE PARÂMETROS  (lucro em USDT, 4 pares somados; [ ] = os clássicos 55/20)")
    print("   linhas: candles do rompimento de ENTRADA | colunas: candles da mínima de SAÍDA")
    print("        " + "".join(f"{sd:>9}" for sd in SAIDAS))
    celulas = []
    for en in ENTRADAS:
        linha = f"   {en:>4} "
        for sd in SAIDAS:
            if sd > en:
                linha += f"{'-':>9}"
                continue
            pnl, fator, n = somar(rodar(candles, n_entrada=en, n_saida=sd))
            celulas.append((pnl, fator))
            marca = f"[{pnl:+.1f}]" if (en, sd) == (55, 20) else f"{pnl:+.1f}"
            linha += f"{marca:>9}"
        print(linha)
    print("   multiplicador do stop inicial (ATR):  " + "  ".join(
        f"{m}x: {somar(rodar(candles, atr_mult=m))[0]:+.1f}" for m in ATR_MULTS))
    pos = sum(1 for p, _ in celulas if p > 0) / len(celulas)
    fm = median(f for _, f in celulas)
    ok = pos >= 0.7 and fm >= 1.2
    print(f"   {pos:.0%} das combinações com lucro; fator de lucro mediano {fmt_fator(fm)}  ->  "
          f"{'OK' if ok else 'FALHOU'}")
    return ok


def teste_custos(candles):
    print("\n2) ESTRESSE DE CUSTOS")
    ok = True
    for taxa, slip, nome in CUSTOS:
        pnl, fator, n = somar(rodar(candles, taxa=taxa, slip=slip))
        marca = ""
        if (taxa, slip) == CRITERIO_CUSTO:
            ok = pnl > 0
            marca = "   <- critério"
        print(f"   {nome:34} lucro {pnl:+8.2f}  fator {fmt_fator(fator):>5}{marca}")
    print(f"   Lucro com taxa 0,15% e slippage 0,10%?  ->  {'OK' if ok else 'FALHOU'}")
    return ok


def teste_tempo(candles, base):
    print("\n3) ESTABILIDADE NO TEMPO")
    metade = {s: motor.AQUECIMENTO + (len(c) - motor.AQUECIMENTO) // 2 for s, c in candles.items()}
    h1, h2, anos = {}, {}, {}
    for s, ts in base.items():
        h1[s] = sum(t["pnl"] for t in ts if t["i_sai"] < metade[s])
        h2[s] = sum(t["pnl"] for t in ts if t["i_sai"] >= metade[s])
        for t in ts:
            ano = datetime.fromtimestamp(t["t_sai"] / 1000, timezone.utc).year
            anos.setdefault(ano, {}).setdefault(s, [0.0, 0])
            anos[ano][s][0] += t["pnl"]
            anos[ano][s][1] += 1
    pares = list(base)
    print("   metades (USDT):         " + "".join(f"{comparar.abrev(s):>9}" for s in pares) + f"{'total':>9}")
    print("   1ª metade               " + "".join(f"{h1[s]:+9.2f}" for s in pares) + f"{sum(h1.values()):+9.2f}")
    print("   2ª metade               " + "".join(f"{h2[s]:+9.2f}" for s in pares) + f"{sum(h2.values()):+9.2f}")
    print("   por ano (saída do trade):")
    for ano in sorted(anos):
        tot = sum(v[0] for v in anos[ano].values())
        nt = sum(v[1] for v in anos[ano].values())
        det = "".join(f"{anos[ano].get(s, [0.0, 0])[0]:+9.2f}" for s in pares)
        print(f"     {ano}                 {det}{tot:+9.2f}   ({nt} trades)")
    ok = sum(h1.values()) > 0 and sum(h2.values()) > 0
    print(f"   As duas metades com lucro?  ->  {'OK' if ok else 'FALHOU'}")
    return ok


def teste_sorte(base):
    print("\n4) DEPENDÊNCIA DE SORTE")
    pnl_total = sum(t["pnl"] for ts in base.values() for t in ts)
    sem_par = {s: pnl_total - sum(t["pnl"] for t in base[s]) for s in base}
    pior_sem = min(sem_par.values())
    for s, v in sem_par.items():
        print(f"   sem {comparar.abrev(s):5} o lucro dos outros fica em {v:+8.2f}")
    todos = sorted((t["pnl"] for ts in base.values() for t in ts), reverse=True)
    sem3 = sum(todos[3:])
    peso = (f" = {100 * sum(todos[:3]) / pnl_total:.0f}% do lucro total; o melhor sozinho "
            f"{100 * todos[0] / pnl_total:.0f}%") if pnl_total > 0 else ""
    print(f"   sem os 3 melhores trades: lucro {sem3:+.2f}  (os 3 melhores somam {sum(todos[:3]):+.2f}{peso})")
    ok = pior_sem > 0 and sem3 > 0
    print(f"   Lucro sem o melhor par e sem os 3 melhores trades?  ->  {'OK' if ok else 'FALHOU'}")
    return ok


def teste_queda(candles, base, taxa):
    print("\n5) QUEDA EM %, vs COMPRAR E SEGURAR  (informativo)")
    print("   Donchian: 100% do dinheiro dentro durante cada trade, reinvestindo, fora nos demais momentos.")
    print(f"   {'par':5} {'retorno':>9} {'queda máx.':>11} {'no mercado':>11}   | {'retorno':>9} {'queda máx.':>11}")
    print(f"   {'':5} {'Donchian':>9} {'Donchian':>11} {'':>11}   | {'comprar e segurar':>21}")
    somas = [0.0, 0.0, 0.0, 0.0]
    for s, c in candles.items():
        eq = curva_equidade(c, base[s], taxa)
        r, d = retorno_e_queda(eq)
        mercado = 100 * sum(t["i_sai"] - t["i_ent"] for t in base[s]) / max(1, len(c) - motor.AQUECIMENTO)
        rb, db = motor.comprar_e_segurar(c)
        print(f"   {comparar.abrev(s):5} {r:+8.0f}% {d:10.0f}% {mercado:10.0f}%   | {rb:+8.0f}% {db:10.0f}%")
        for k, v in enumerate((r, d, rb, db)):
            somas[k] += v
    n = len(candles)
    print(f"   média {somas[0] / n:+8.0f}% {somas[1] / n:10.0f}% {'':>11}   | {somas[2] / n:+8.0f}% {somas[3] / n:10.0f}%")
    if somas[1] and somas[3]:
        print(f"   Retorno por ponto de queda: Donchian {somas[0] / max(somas[1], 1e-9):.1f} | "
              f"comprar e segurar {somas[2] / max(somas[3], 1e-9):.1f}")


# ------------------------------------------------------------------ principal
def principal():
    p = argparse.ArgumentParser(description="Teste de robustez do Donchian")
    p.add_argument("--simbolos", default=comparar.SIMBOLOS_PADRAO)
    p.add_argument("--dias", type=int, default=1500)
    p.add_argument("--tf", default="4h,1d", help="timeframes separados por vírgula (4h, 1d)")
    a = p.parse_args()
    simbolos = [s.strip().upper() for s in a.simbolos.split(",") if s.strip()]

    print(f"Dados ({a.dias} dias):")
    bases = {}
    for s in simbolos:
        try:
            bases[s] = comparar.obter_candles_1h(s, a.dias)
        except Exception as erro:
            print(f"  {s}: não consegui baixar ({erro}). Pulando.")
    if not bases:
        raise SystemExit("Nenhum par com dados.")

    veredito = {}
    for tf in [x.strip() for x in a.tf.split(",") if x.strip()]:
        if tf not in comparar.TF_MIN:
            raise SystemExit(f"Timeframe inválido: {tf}")
        candles = {s: comparar.reamostrar(b, comparar.TF_MIN[tf], 60) for s, b in bases.items()}
        print(f"\n{'=' * 100}\nROBUSTEZ DO DONCHIAN {tf}  |  pares: {', '.join(comparar.abrev(s) for s in candles)}\n{'=' * 100}")
        base = rodar(candles)
        pnl, fator, n = somar(base)
        print(f"Base (55/20, taxa {config.TAXA:.2%}, slippage 0,05%): lucro {pnl:+.2f} USDT, fator {fmt_fator(fator)}, {n} trades")
        veredito[tf] = {"parâmetros vizinhos": teste_vizinhanca(candles), "custos mais altos": teste_custos(candles),
                        "estabilidade no tempo": teste_tempo(candles, base), "sem sorte": teste_sorte(base)}
        teste_queda(candles, base, config.TAXA)

    print(f"\n{'=' * 100}\nVEREDITO\n{'=' * 100}")
    for tf, testes in veredito.items():
        falhas = [nome for nome, ok in testes.items() if not ok]
        print(f"Donchian {tf}: " + ("passou nos 4 testes de robustez." if not falhas else
              "FALHOU em: " + ", ".join(falhas) + "."))
    print("\nPassar aqui NÃO prova que dá dinheiro: só indica que o resultado não é um acaso óbvio.\n"
          "O período tem um único ciclo de alta e os pares andam juntos. O teste final é a simulação ao vivo.")


if __name__ == "__main__":
    principal()
