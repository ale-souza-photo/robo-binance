"""Análise de ativos em REAIS: compara o que foi, no passado, cada opção para guardar dinheiro.

Compara BTC, ETH, dólar, CDI (renda fixa), Ibovespa (BOVA11), S&P 500 em reais (IVVB11) e as BDRs/ações
que você quiser, com dados PÚBLICOS (sem chave): Binance (cripto), Banco Central (dólar e CDI) e Yahoo
Finance (bolsa brasileira). Mostra retorno, risco (pior queda), o quanto os ativos andam juntos e simula
carteiras com aportes mensais como os seus.

Uso (na pasta do robô; precisa de internet e do ccxt, que o robô já usa):
    python analise_ativos.py                              # padrão: 5 anos, R$ 100 + R$ 50 por mês
    python analise_ativos.py --extras AAPL34.SA,NVDC34.SA # acrescenta BDRs/ações (nomes do Yahoo)
    python analise_ativos.py --anos 8 --inicial 100 --mensal 50
    python analise_ativos.py --carteira "Minha:BTC=0.3,IVVB11=0.3,CDI=0.4"   # (pode repetir)
    python analise_ativos.py --demo                       # dados FICTÍCIOS, para ver o relatório
Gera também o relatório visual analise_ativos.html.

IMPORTANTE: isto descreve o PASSADO. Não prevê o futuro e não é recomendação de investimento.
"""
import argparse
import csv
import json
import math
import os
import random
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from statistics import median, pstdev

PASTA_CACHE = "dados_analise"
CACHE_HORAS = 20
UA = "Mozilla/5.0 (compatible; analise-ativos/1.0)"

NOMES = {"BTC": "Bitcoin", "ETH": "Ethereum", "DOLAR": "Dólar", "CDI": "CDI (renda fixa)",
         "BOVA11": "Ibovespa (BOVA11)", "IVVB11": "S&P 500 em R$ (IVVB11)"}
# nome -> (fonte, referência)
ATIVOS_PADRAO = {"BTC": ("binance", "BTC/BRL"), "ETH": ("binance", "ETH/BRL"), "DOLAR": ("bcb_usd", 1),
                 "CDI": ("bcb_cdi", 12), "BOVA11": ("yahoo", "BOVA11.SA"), "IVVB11": ("yahoo", "IVVB11.SA")}
# carteiras de EXEMPLO (para comparar, não são recomendação)
CARTEIRAS_PADRAO = {
    "100% CDI (renda fixa)": {"CDI": 1.0},
    "100% Bitcoin": {"BTC": 1.0},
    "Cripto: 70% BTC + 30% ETH": {"BTC": 0.7, "ETH": 0.3},
    "Conservadora: 60% CDI, 20% S&P, 10% US$, 10% BTC": {"CDI": 0.6, "IVVB11": 0.2, "DOLAR": 0.1, "BTC": 0.1},
    "Equilibrada: 30% CDI, 20% S&P, 20% Ibov, 10% US$, 20% cripto":
        {"CDI": 0.3, "IVVB11": 0.2, "BOVA11": 0.2, "DOLAR": 0.1, "BTC": 0.15, "ETH": 0.05},
}


# ------------------------------------------------------------------- dados
def _http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def parse_bcb(texto):
    """JSON do Banco Central (SGS): [{'data': 'dd/mm/aaaa', 'valor': '0.04'}] -> [(data, valor)]."""
    return [(datetime.strptime(d["data"], "%d/%m/%Y").date(), float(d["valor"]))
            for d in json.loads(texto) if d.get("valor") not in (None, "")]


def baixar_bcb(serie, inicio, fim, http=_http_get):
    """Baixa uma série do Banco Central em janelas de 3 anos (a API limita o tamanho da consulta)."""
    pontos, atual = [], inicio
    while atual <= fim:
        fim_j = min(fim, atual + timedelta(days=365 * 3))
        url = (f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados?formato=json"
               f"&dataInicial={atual:%d/%m/%Y}&dataFinal={fim_j:%d/%m/%Y}")
        pontos += parse_bcb(http(url))
        atual = fim_j + timedelta(days=1)
    return sorted(set(pontos))


def indice_cdi(taxas_diarias):
    """Taxa diária do CDI (% ao dia) -> índice acumulado (1,0 no início)."""
    idx, saida = 1.0, []
    for d, v in taxas_diarias:
        idx *= 1 + v / 100
        saida.append((d, idx))
    return saida


def parse_yahoo(obj):
    """Resposta do Yahoo Finance (chart) -> [(data, preço)] usando o preço ajustado por dividendos."""
    res = obj["chart"]["result"][0]
    precos = None
    adj = (res["indicators"].get("adjclose") or [None])[0]
    if adj and adj.get("adjclose"):
        precos = adj["adjclose"]
    if precos is None:
        precos = res["indicators"]["quote"][0]["close"]
    return [(datetime.fromtimestamp(t, timezone.utc).date(), float(p))
            for t, p in zip(res["timestamp"], precos) if p is not None]


def baixar_yahoo(ticker, anos, http=_http_get):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range={max(1, int(anos) + 1)}y&interval=1d"
    return parse_yahoo(json.loads(http(url)))


def baixar_binance(simbolo, anos):
    import backtest  # reaproveita o download paginado do robô
    candles = backtest.baixar_historico(simbolo, "1d", int(anos * 365) + 30)
    return [(datetime.fromtimestamp(c["tempo"] / 1000, timezone.utc).date(), c["fechamento"]) for c in candles]


def _cache(nome):
    return os.path.join(PASTA_CACHE, f"{nome}.csv")


def ler_cache(nome):
    try:
        if (datetime.now().timestamp() - os.path.getmtime(_cache(nome))) > CACHE_HORAS * 3600:
            return None
        with open(_cache(nome), newline="", encoding="utf-8") as f:
            return [(date.fromisoformat(r["data"]), float(r["valor"])) for r in csv.DictReader(f)]
    except (OSError, ValueError, KeyError):
        return None


def salvar_cache(nome, serie):
    os.makedirs(PASTA_CACHE, exist_ok=True)
    with open(_cache(nome), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["data", "valor"])
        w.writerows((d.isoformat(), v) for d, v in serie)


def carregar(nome, fonte, ref, anos, atualizar=False):
    """Série de um ativo (cache de 20 h). Levanta exceção se não conseguir."""
    if not atualizar:
        c = ler_cache(nome)
        if c:
            print(f"  {nome}: usando dados salvos (menos de {CACHE_HORAS} h)")
            return c
    print(f"  {nome}: baixando ({fonte})...", flush=True)
    fim, inicio = date.today(), date.today() - timedelta(days=int(anos * 365) + 30)
    if fonte == "binance":
        serie = baixar_binance(ref, anos)
    elif fonte == "bcb_usd":
        serie = baixar_bcb(ref, inicio, fim)
    elif fonte == "bcb_cdi":
        serie = indice_cdi(baixar_bcb(ref, inicio, fim))
    else:
        serie = baixar_yahoo(ref, anos)
    if len(serie) < 60:
        raise ValueError(f"poucos dados ({len(serie)} pontos)")
    salvar_cache(nome, serie)
    return serie


# ------------------------------------------------------------- alinhamento
def alinhar(series, desde=None):
    """Põe todas as séries no mesmo calendário diário (preenchendo fins de semana e feriados com o
    último valor), apenas no período em que TODAS existem."""
    inicio = max(s[0][0] for s in series.values())
    fim = min(s[-1][0] for s in series.values())
    if desde:
        inicio = max(inicio, desde)
    if inicio >= fim:
        raise ValueError("Os ativos escolhidos não têm período em comum.")
    datas = [inicio + timedelta(days=k) for k in range((fim - inicio).days + 1)]
    saida = {}
    for nome, pts in series.items():
        valores, j, atual = [], 0, None
        for d in datas:
            while j < len(pts) and pts[j][0] <= d:
                atual = pts[j][1]
                j += 1
            valores.append(atual)
        saida[nome] = valores
    return datas, saida


# ------------------------------------------------------------ estatísticas
def estatisticas(datas, v):
    anos = max((datas[-1] - datas[0]).days / 365.25, 1e-9)
    rets = [v[i] / v[i - 1] - 1 for i in range(1, len(v))]
    pico, dd = v[0], 0.0
    for x in v:
        pico = max(pico, x)
        dd = max(dd, 1 - x / pico)
    cagr = (v[-1] / v[0]) ** (1 / anos) - 1
    # retorno por ano-calendário (último valor do ano anterior até o último do ano)
    por_ano, ult = {}, {}
    for d, x in zip(datas, v):
        ult[d.year] = x
    ano_ant = v[0]
    for ano in sorted(ult):
        por_ano[ano] = ult[ano] / ano_ant - 1
        ano_ant = ult[ano]
    jan = [v[i] / v[i - 365] - 1 for i in range(365, len(v))]
    return {"retorno_total": v[-1] / v[0] - 1, "cagr": cagr,
            "vol": pstdev(rets) * math.sqrt(365) if len(rets) > 1 else 0.0,
            "pior_queda": dd, "calmar": (cagr / dd) if dd > 1e-9 else None,
            "por_ano": por_ano, "anos": anos,
            "pos_12m": (sum(1 for x in jan if x > 0) / len(jan)) if jan else None,
            "pior_12m": min(jan) if jan else None, "melhor_12m": max(jan) if jan else None,
            "mediana_12m": median(jan) if jan else None}


def correlacoes(valores, passo=7):
    """Correlação dos retornos semanais entre os ativos (CDI fica de fora: quase não varia)."""
    rets = {}
    for n, v in valores.items():
        r = [v[i + passo] / v[i] - 1 for i in range(0, len(v) - passo, passo)]
        if len(r) > 10 and pstdev(r) > 1e-6:
            rets[n] = r
    nomes = list(rets)

    def pear(a, b):
        ma, mb = sum(a) / len(a), sum(b) / len(b)
        num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
        den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
        return num / den if den else 0.0
    return nomes, {a: {b: pear(rets[a], rets[b]) for b in nomes} for a in nomes}


# -------------------------------------------------------------- carteiras
def tir_anual(fluxos, data_final, valor_final):
    """Retorno anual do SEU dinheiro (TIR): considera quando cada aporte entrou."""
    d0 = fluxos[0][0]

    def vp(r):
        total = -sum(valor / (1 + r) ** ((d - d0).days / 365) for d, valor in fluxos)
        return total + valor_final / (1 + r) ** ((data_final - d0).days / 365)
    lo, hi = -0.95, 20.0
    if vp(lo) * vp(hi) > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        if vp(lo) * vp(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def simular_dca(datas, valores, pesos, inicial, mensal, dia):
    """Aporte inicial no primeiro dia e aporte mensal no primeiro dia a partir do `dia` de cada mês,
    repartido pelos pesos. Retorna métricas e as curvas (valor e total aportado)."""
    unidades = {n: 0.0 for n in pesos}
    aportado, fluxos, serie_v, serie_a = 0.0, [], [], []
    ultimo_mes = None
    for i, d in enumerate(datas):
        valor_aporte = 0.0
        if i == 0:
            valor_aporte, ultimo_mes = inicial, (d.year, d.month)
        elif (d.year, d.month) != ultimo_mes and d.day >= dia:
            valor_aporte, ultimo_mes = mensal, (d.year, d.month)
        if valor_aporte > 0:
            for n, p in pesos.items():
                unidades[n] += valor_aporte * p / valores[n][i]
            aportado += valor_aporte
            fluxos.append((d, valor_aporte))
        serie_v.append(sum(unidades[n] * valores[n][i] for n in pesos))
        serie_a.append(aportado)
    final = serie_v[-1]
    papel = [1 - serie_v[i] / serie_a[i] for i in range(len(datas)) if serie_a[i] > 0]
    return {"aportado": aportado, "valor_final": final, "ganho": final - aportado,
            "tir": tir_anual(fluxos, datas[-1], final) if fluxos else None,
            "pior_queda_no_papel": max(0.0, max(papel)) if papel else 0.0,
            "pct_no_prejuizo": (sum(1 for x in papel if x > 0) / len(papel)) if papel else 0.0,
            "valor": serie_v, "aportes": serie_a}


def ler_carteira(texto):
    """'Nome:BTC=0.5,CDI=0.5' ou 'BTC=0.5,CDI=0.5' -> (nome, {ativo: peso})."""
    nome, _, resto = texto.rpartition(":")
    if not nome:
        nome = resto
    pesos = {}
    for par in resto.split(","):
        k, _, v = par.partition("=")
        pesos[k.strip().upper()] = float(v)
    if abs(sum(pesos.values()) - 1) > 1e-6:
        raise ValueError(f"os pesos de '{nome}' somam {sum(pesos.values()):.2f}, e deveriam somar 1")
    return nome, pesos


# --------------------------------------------------------- leitura rápida
def pct(x, d=1):
    return "—" if x is None else f"{100 * x:+.{d}f}%".replace(".", ",")


def leitura_rapida(stats, nomes_corr, corr, carteiras):
    """Frases em português simples, geradas dos números. Descrevem o passado."""
    frases = []
    nome = lambda k: NOMES.get(k, k)
    cdi = stats.get("CDI")
    if cdi:
        abaixo = [nome(k) for k, s in stats.items() if k != "CDI" and s["cagr"] < cdi["cagr"]]
        frases.append(f"O CDI rendeu {pct(cdi['cagr'])} ao ano, quase sem oscilar. "
                      + (f"Ficaram abaixo dele no período: {', '.join(abaixo)}. Nesses casos, o risco não foi pago pelo retorno."
                         if abaixo else "Todos os outros ativos renderam mais que ele, mas com oscilação bem maior."))
    risco = {k: s for k, s in stats.items() if k != "CDI"}
    if risco:
        m = max(risco, key=lambda k: risco[k]["cagr"])
        frases.append(f"Maior retorno anual: {nome(m)} ({pct(risco[m]['cagr'])} ao ano), com pior queda de "
                      f"{100 * risco[m]['pior_queda']:.0f}%. Ou seja, em algum momento quem tinha esse ativo viu o valor cair quase "
                      f"{100 * risco[m]['pior_queda']:.0f}% antes de se recuperar.")
        c = [k for k in risco if risco[k]["calmar"] is not None]
        if c:
            b = max(c, key=lambda k: risco[k]["calmar"])
            frases.append(f"Melhor retorno por ponto de queda: {nome(b)} ({risco[b]['calmar']:.2f}). Quanto maior, mais retorno "
                          "você teve para cada ponto de risco que aguentou.")
        for k, s in risco.items():
            if s["pos_12m"] is not None and s["pos_12m"] < 0.75:
                frases.append(f"{nome(k)}: em {100 * (1 - s['pos_12m']):.0f}% das janelas de 12 meses o resultado foi NEGATIVO "
                              f"(pior janela: {pct(s['pior_12m'], 0)}). Quem precisasse do dinheiro nessa hora teria perdido.")
    pares = [(a, b, corr[a][b]) for i, a in enumerate(nomes_corr) for b in nomes_corr[i + 1:]]
    fmt = lambda a, b, c: f"{nome(a)} e {nome(b)} ({c:.2f})".replace(".", ",")
    juntos = [fmt(a, b, c) for a, b, c in sorted(pares, key=lambda x: -x[2]) if c >= 0.7][:4]
    soltos = [fmt(a, b, c) for a, b, c in sorted(pares, key=lambda x: abs(x[2])) if abs(c) <= 0.2][:4]
    if juntos:
        frases.append("Andam muito juntos (correlação alta): " + "; ".join(juntos) + ". Dividir dinheiro entre eles diversifica pouco.")
    if soltos:
        frases.append("Têm pouca relação entre si (os pares mais independentes): " + "; ".join(soltos)
                      + ". É aí que a diversificação ajuda mais.")
    if carteiras:
        melhor = max(carteiras, key=lambda n: carteiras[n]["valor_final"])
        menor = min(carteiras, key=lambda n: carteiras[n]["pior_queda_no_papel"])
        frases.append(f"Nas carteiras simuladas com os seus aportes, a que mais acumulou foi '{melhor}' e a que menos chegou a valer "
                      f"menos que o aportado foi '{menor}'. Em geral, quem mais ganha é quem mais oscila.")
    frases.append("Tudo isso é o PASSADO: o que veio antes não garante o que vem depois, e cada ativo pode ter um período futuro "
                  "muito diferente. Não é recomendação de investimento.")
    return frases


# --------------------------------------------------------------- demonstração
def dados_demo(anos=5, seed=11):
    """Séries FICTÍCIAS (só para ver o relatório): cripto volátil e correlacionada, bolsa moderada, CDI estável."""
    r = random.Random(seed)
    hoje = date.today()
    n = int(anos * 365)
    datas = [hoje - timedelta(days=n - i) for i in range(n + 1)]
    perfis = {"BTC": (0.0013, 0.036, 1.0), "ETH": (0.0011, 0.043, 1.0), "DOLAR": (0.0002, 0.0065, 0.0),
              "BOVA11": (0.0003, 0.012, 0.5), "IVVB11": (0.0006, 0.011, 0.4)}
    base_cripto = [r.gauss(0, 1) for _ in datas]
    base_bolsa = [r.gauss(0, 1) for _ in datas]
    series = {}
    for nome, (mu, sig, beta) in perfis.items():
        preco, pts = {"BTC": 80000, "ETH": 4000, "DOLAR": 5.0, "BOVA11": 100, "IVVB11": 250}[nome], []
        for i, d in enumerate(datas):
            fator = base_cripto[i] if nome in ("BTC", "ETH") else base_bolsa[i]
            z = 0.7 * fator + 0.3 * r.gauss(0, 1) if beta else r.gauss(0, 1)
            preco *= 1 + mu + sig * z
            pts.append((d, preco))
        series[nome] = pts
    idx, pts = 1.0, []
    for d in datas:
        idx *= 1 + 0.00041
        pts.append((d, idx))
    series["CDI"] = pts
    return series


# --------------------------------------------------------------- relatório (texto)
def _n(x, fmt):
    return "—" if x is None else format(x, fmt)


def queda_txt(q):
    """Pior queda como texto: '-52%' (e '0%' em vez de '-0%')."""
    return "0%" if q < 0.005 else "-%.0f%%" % (100 * q)


def tabela_ativos(stats):
    cab = (f"{'ativo':28} {'retorno/ano':>11} {'retorno total':>13} {'oscila':>7} {'pior queda':>10} {'ret./queda':>10} "
           f"{'12m positivos':>13} {'pior 12m':>9}")
    linhas = [cab, "-" * len(cab)]
    for k, s in sorted(stats.items(), key=lambda kv: kv[1]["cagr"], reverse=True):
        pos12 = "—" if s["pos_12m"] is None else "%.0f%%" % (100 * s["pos_12m"])
        linhas.append("%-28s %11s %13s %6.0f%% %10s %10s %13s %9s" % (
            NOMES.get(k, k), pct(s["cagr"]), pct(s["retorno_total"], 0), 100 * s["vol"], queda_txt(s["pior_queda"]),
            _n(s["calmar"], ".2f"), pos12, pct(s["pior_12m"], 0)))
    return "\n".join(linhas)


def tabela_corr(nomes, corr):
    cab = " " * 10 + "".join(f"{n[:7]:>8}" for n in nomes)
    return "\n".join([cab] + [f"{a[:9]:9} " + "".join(f"{corr[a][b]:8.2f}" for b in nomes) for a in nomes])


def tabela_carteiras(res):
    cab = (f"{'carteira (aportes simulados)':64} {'aportado':>9} {'valor final':>11} {'retorno/ano*':>12} "
           f"{'pior queda no papel':>19} {'% do tempo no prejuízo':>22}")
    linhas = [cab, "-" * len(cab)]
    for nome, m in sorted(res.items(), key=lambda kv: kv[1]["valor_final"], reverse=True):
        linhas.append(f"{nome[:64]:64} {m['aportado']:9.0f} {m['valor_final']:11.0f} {pct(m['tir']):>12} "
                      f"{queda_txt(m['pior_queda_no_papel']):>19} {100 * m['pct_no_prejuizo']:21.0f}%")
    linhas.append("* retorno anual do SEU dinheiro (TIR): leva em conta quando cada aporte entrou.")
    return "\n".join(linhas)


# ------------------------------------------------------------------- programa
def principal(argv=None):
    p = argparse.ArgumentParser(description="Análise de ativos em reais")
    p.add_argument("--anos", type=float, default=5)
    p.add_argument("--extras", default="", help="tickers do Yahoo separados por vírgula, ex.: AAPL34.SA,NVDC34.SA")
    p.add_argument("--inicial", type=float, default=100.0, help="aporte inicial (R$)")
    p.add_argument("--mensal", type=float, default=50.0, help="aporte mensal (R$)")
    p.add_argument("--dia", type=int, default=5, help="dia do mês do aporte")
    p.add_argument("--carteira", action="append", default=[], help="'Nome:ATIVO=peso,ATIVO=peso' (pode repetir)")
    p.add_argument("--demo", action="store_true", help="dados FICTÍCIOS, sem internet")
    p.add_argument("--atualizar", action="store_true", help="ignora os dados salvos")
    p.add_argument("--sem-html", action="store_true")
    p.add_argument("--html", default="analise_ativos.html")
    a = p.parse_args(argv)

    carteiras = {}
    try:
        for t in a.carteira:
            n, pesos = ler_carteira(t)
            carteiras[n] = pesos
    except ValueError as erro:
        raise SystemExit(f"--carteira inválida: {erro}")
    if not carteiras:
        carteiras = dict(CARTEIRAS_PADRAO)

    ativos = dict(ATIVOS_PADRAO)
    for t in [x.strip().upper() for x in a.extras.split(",") if x.strip()]:
        ativos[t.replace(".SA", "")] = ("yahoo", t if "." in t else t + ".SA")

    if a.demo:
        series = dados_demo(a.anos)
        print("\n*** DEMONSTRAÇÃO: os dados abaixo são FICTÍCIOS ***")
    else:
        print(f"\nBaixando dados ({a.anos:g} anos):")
        series = {}
        for nome, (fonte, ref) in ativos.items():
            try:
                series[nome] = carregar(nome, fonte, ref, a.anos, a.atualizar)
            except Exception as erro:
                print(f"  {nome}: NÃO consegui ({type(erro).__name__}: {str(erro)[:90]}). Seguindo sem ele.")
        if len(series) < 2:
            raise SystemExit("Preciso de pelo menos 2 ativos com dados. Confira a internet e tente de novo.")

    datas, valores = alinhar(series)
    stats = {n: estatisticas(datas, v) for n, v in valores.items()}
    nomes_corr, corr = correlacoes(valores)
    res = {}
    for nome, pesos in carteiras.items():
        faltam = [k for k in pesos if k not in valores]
        if faltam:
            print(f"(carteira '{nome[:40]}...' ignorada: faltam dados de {', '.join(faltam)})")
            continue
        res[nome] = simular_dca(datas, valores, pesos, a.inicial, a.mensal, a.dia)

    print(f"\nPeríodo comparado: {datas[0]:%d/%m/%Y} a {datas[-1]:%d/%m/%Y} ({stats[next(iter(stats))]['anos']:.1f} anos), tudo em reais.")
    print("\n1) OS ATIVOS (do melhor para o pior retorno anual)\n")
    print(tabela_ativos(stats))
    print("\n2) O QUANTO ANDAM JUNTOS (correlação dos retornos semanais: 1 = sempre juntos, 0 = sem relação)\n")
    print(tabela_corr(nomes_corr, corr))
    if res:
        print(f"\n3) CARTEIRAS DE EXEMPLO com aporte inicial de R$ {a.inicial:.0f} e R$ {a.mensal:.0f} por mês (dia {a.dia})\n")
        print(tabela_carteiras(res))
    frases = leitura_rapida(stats, nomes_corr, corr, res)
    print("\n4) LEITURA RÁPIDA\n")
    for f in frases:
        print("  - " + f)

    if not a.sem_html:
        import analise_relatorio
        analise_relatorio.gerar(a.html, datas, valores, stats, nomes_corr, corr, res, frases, a, demo=a.demo)
        print(f"\nRelatório visual salvo em {a.html}  (abra no navegador)")


if __name__ == "__main__":
    principal()
