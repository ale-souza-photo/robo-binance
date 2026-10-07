"""Comparador de estratégias, em vários pares, com o mesmo rigor para todas.

Testa as estratégias de estrategias.py (a atual do robô, tendência, rompimento Donchian, recuo na
alta, reversão lateral, e a CONFLUÊNCIA, que combina as quatro) nos timeframes de 1h, 4h e 1d.

Como evita se enganar:
- Parâmetros FIXOS e clássicos, definidos antes de ver resultado. Nada é otimizado no passado.
- Mesmas taxas (0,1% por lado) e slippage para todas; execução conservadora (ver motor.py).
- Vários pares juntos: uma ideia que só funciona em UMA moeda, provavelmente é sorte.
- O período é dividido em blocos; ideia boa é positiva na maioria deles, não só num trecho.
- Mostra o "SEM travas" ao lado do "SEGURA", para você ver o que as travas realmente fazem.
- Compara com comprar e segurar, incluindo a pior queda.

Uso (só dados públicos, sem chave):
    python comparar.py                          # BTC, ETH, SOL e BNB, 1500 dias
    python comparar.py --simbolos BTC/USDT      # só um par
    python comparar.py --dias 2000
"""
import argparse
import os
from datetime import datetime, timezone

import backtest
import config
import estrategias
import motor

TF_MIN = {"1h": 60, "4h": 240, "1d": 1440}
SIMBOLOS_PADRAO = "BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT"
MIN_TRADES = 30
MIN_FATOR_LUCRO = 1.2
MIN_BLOCOS_POSITIVOS = 0.6


# ----------------------------------------------------------------------- dados
def reamostrar(candles_base, minutos, base_min):
    """Junta candles base (ex.: 1h) em candles de `minutos` (descarta o último, incompleto)."""
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
                      "maxima": max(x["maxima"] for x in g), "minima": min(x["minima"] for x in g),
                      "fechamento": g[-1]["fechamento"], "volume": sum(x["volume"] for x in g)})
    return saida


def obter_candles_1h(simbolo, dias):
    arquivo = f"dados_{simbolo.replace('/', '')}_1h_{dias}d.csv"
    if os.path.exists(arquivo):
        print(f"  {simbolo}: usando {arquivo} (já baixado)")
        return backtest.ler_csv(arquivo)
    print(f"  {simbolo}: baixando {dias} dias em candles de 1h...")
    candles = backtest.baixar_historico(simbolo, "1h", dias)
    backtest.salvar_csv(candles, arquivo)
    return candles


# ------------------------------------------------------------------ agregação
def juntar(por_par):
    """Soma os resultados de todos os pares para uma estratégia+timeframe."""
    ms = list(por_par.values())
    ganhos, perdas = sum(m["ganhos"] for m in ms), sum(m["perdas"] for m in ms)
    trades = sum(m["trades"] for m in ms)
    blocos = [b for m in ms for b in m["blocos"]]  # cada (par, bloco) com operação conta uma vez
    return {
        "trades": trades,
        "acerto": 100 * sum(m["vitorias"] for m in ms) / trades if trades else 0.0,
        "pnl": sum(m["pnl"] for m in ms),
        "fator": (ganhos / perdas) if perdas > 0 else (float("inf") if ganhos else 0.0),
        "dd": max(m["dd"] for m in ms), "pior_seq": max(m["pior_seq"] for m in ms),
        "blocos_pos": (sum(1 for b in blocos if b > 0) / len(blocos)) if blocos else 0.0,
        "mercado": 100 * sum(m["mercado"] for m in ms) / len(ms),
        "por_par": {s: (m["pnl"], m["trades"]) for s, m in por_par.items()},
    }


def passou(m):
    return (m["trades"] >= MIN_TRADES and m["pnl"] > 0 and m["fator"] >= MIN_FATOR_LUCRO
            and m["blocos_pos"] >= MIN_BLOCOS_POSITIVOS and m["pnl"] >= m["dd"])


def abrev(simbolo):
    return simbolo.split("/")[0]


# ------------------------------------------------------------------ principal
def principal():
    p = argparse.ArgumentParser(description="Compara estratégias em vários pares")
    p.add_argument("--simbolos", default=SIMBOLOS_PADRAO, help="separados por vírgula")
    p.add_argument("--dias", type=int, default=1500)
    p.add_argument("--slippage", type=float, default=0.0005)
    p.add_argument("--blocos", type=int, default=6)
    a = p.parse_args()
    simbolos = [s.strip().upper() for s in a.simbolos.split(",") if s.strip()]

    print(f"\nDados ({a.dias} dias, candles de 1h):")
    candles = {}  # (simbolo, tf) -> candles
    for s in simbolos:
        try:
            base = obter_candles_1h(s, a.dias)
        except Exception as erro:  # par sem histórico / bloqueio: segue com os outros
            print(f"  {s}: não consegui baixar ({erro}). Pulando.")
            continue
        if len(base) < 24 * 400:
            print(f"  {s}: histórico curto demais ({len(base)} candles). Pulando.")
            continue
        for tf, minutos in TF_MIN.items():
            candles[(s, tf)] = reamostrar(base, minutos, 60)
    pares = sorted({s for s, _ in candles})
    if not pares:
        raise SystemExit("Nenhum par com dados suficientes.")

    ini = datetime.fromtimestamp(candles[(pares[0], "1d")][0]["tempo"] / 1000, timezone.utc)
    fim = datetime.fromtimestamp(candles[(pares[0], "1d")][-1]["tempo"] / 1000, timezone.utc)
    print(f"\nPares: {', '.join(abrev(s) for s in pares)} | {ini:%Y-%m-%d} a {fim:%Y-%m-%d} | "
          f"taxa {config.TAXA:.2%}/lado, slippage {a.slippage:.2%} | PnL em USDT por ordem de "
          f"US$ {config.VALOR_POR_ORDEM_USDT:.0f}\nSimulando...", flush=True)

    linhas = []
    for nome, (fn, tfs) in estrategias.ESTRATEGIAS.items():
        for tf in tfs:
            por_par = {}
            for s in pares:
                c = candles[(s, tf)]
                trades = motor.simular(c, fn(c), valor=config.VALOR_POR_ORDEM_USDT,
                                       taxa=config.TAXA, slippage=a.slippage)
                por_par[s] = motor.metricas(trades, len(c), n_blocos=a.blocos)
            m = juntar(por_par)
            m["nome"], m["tf"] = nome, tf
            linhas.append(m)
    linhas.sort(key=lambda m: m["pnl"], reverse=True)

    cab = (f"{'estratégia':33} {'tf':>3} {'trades':>6} {'acerto':>7} {'PnL':>8} {'fator':>6} "
           f"{'pior queda':>10} {'seq.perd.':>9} {'blocos+':>8} {'no mercado':>10}  veredito")
    print("\n" + cab + "\n" + "-" * (len(cab) + 9))
    for m in linhas:
        fator = "   inf" if m["fator"] == float("inf") else f"{m['fator']:6.2f}"
        print(f"{m['nome']:33} {m['tf']:>3} {m['trades']:6d} {m['acerto']:6.1f}% {m['pnl']:+8.2f} {fator} "
              f"{m['dd']:10.2f} {m['pior_seq']:9d} {m['blocos_pos']:7.0%} {m['mercado']:9.0f}%  "
              f"{'PASSOU' if passou(m) else 'reprovou'}")

    print("\nResultado por par (PnL USDT / nº de trades):")
    for m in linhas:
        det = " | ".join(f"{abrev(s)} {v[0]:+.2f}/{v[1]}" for s, v in m["por_par"].items())
        print(f"  {m['nome']:33} {m['tf']:>3}  {det}")

    print("\nComprar e segurar (para comparar; retorno e pior queda no período dos testes de 1 dia):")
    for s in pares:
        r, dd = motor.comprar_e_segurar(candles[(s, "1d")])
        print(f"  {abrev(s):5} retorno {r:+7.1f}%   pior queda {dd:5.1f}%")

    print("\nO que as travas fizeram (confluência SEM travas -> SEGURA):")
    for tf in ("4h", "1d"):
        sem = next((m for m in linhas if m["nome"] == "confluência SEM travas" and m["tf"] == tf), None)
        com = next((m for m in linhas if m["nome"] == "CONFLUÊNCIA SEGURA" and m["tf"] == tf), None)
        if sem and com:
            print(f"  {tf}: trades {sem['trades']} -> {com['trades']} | PnL {sem['pnl']:+.2f} -> {com['pnl']:+.2f} | "
                  f"pior queda {sem['dd']:.2f} -> {com['dd']:.2f} | pior sequência de perdas "
                  f"{sem['pior_seq']} -> {com['pior_seq']}")

    ok = [m for m in linhas if passou(m)]
    print(f"\nCritérios p/ passar: >= {MIN_TRADES} trades (todos os pares somados), PnL > 0, fator de lucro "
          f">= {MIN_FATOR_LUCRO}, >= {MIN_BLOCOS_POSITIVOS:.0%} dos blocos positivos e lucro maior que a pior queda.")
    if not ok:
        print("RESULTADO: NENHUMA passou. Com estes critérios, nenhuma estratégia mostrou vantagem real "
              "depois das taxas. Não ligue o modo real.")
    else:
        print(f"RESULTADO: {len(ok)} de {len(linhas)} passaram: " + ", ".join(f"{m['nome']} ({m['tf']})" for m in ok) +
              ".\nCom poucos trades por ano, a confiança é limitada: antes de qualquer dinheiro, rode a "
              "simulação ao vivo por semanas (MODO_SIMULADO = True) e compare com este resultado.")


if __name__ == "__main__":
    principal()
