"""Estratégias candidatas, para o comparar.py.

Cada estratégia recebe a lista de candles de um timeframe e devolve um "plano":
    entrada   lista de bool   comprar no FECHAMENTO deste candle
    saida     lista de bool   vender no fechamento deste candle (ou None)
    stop      float ou lista  distância do stop inicial, em fração do preço (ou None)
    alvo      float           alvo fixo em fração (ou None)
    trailing  float ou lista  stop que SOBE com o preço, em fração (ou None)
    tempo_max int             sai depois de N candles (ou None)
    guardas   dict            travas do motor (ver motor.py) ou None

Regras que valem para todas:
- O sinal do candle i usa só dados até o candle i (nada de olhar o futuro). O testes.py confere.
- Os parâmetros são os clássicos, definidos ANTES de ver resultados. Nenhum foi ajustado para
  "ficar bonito" no histórico.
"""


# ---------------------------------------------------------------- indicadores
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


def _tr(c):
    tr = [c[0]["maxima"] - c[0]["minima"]]
    for i in range(1, len(c)):
        pc = c[i - 1]["fechamento"]
        tr.append(max(c[i]["maxima"] - c[i]["minima"], abs(c[i]["maxima"] - pc), abs(c[i]["minima"] - pc)))
    return tr


def atr(c, n=14):
    """Amplitude média verdadeira (quanto o preço costuma andar por candle)."""
    tr, saida = _tr(c), [None] * len(c)
    if len(c) <= n:
        return saida
    saida[n] = sum(tr[1:n + 1]) / n
    for i in range(n + 1, len(c)):
        saida[i] = (saida[i - 1] * (n - 1) + tr[i]) / n
    return saida


def adx(c, n=14):
    """Força da tendência (0 a 100). Abaixo de ~20 = mercado lateral."""
    m = len(c)
    saida = [None] * m
    if m < 2 * n + 1:
        return saida
    tr, pdm, mdm = _tr(c), [0.0] * m, [0.0] * m
    for i in range(1, m):
        cima = c[i]["maxima"] - c[i - 1]["maxima"]
        baixo = c[i - 1]["minima"] - c[i]["minima"]
        pdm[i] = cima if (cima > baixo and cima > 0) else 0.0
        mdm[i] = baixo if (baixo > cima and baixo > 0) else 0.0
    s_tr, s_p, s_m = sum(tr[1:n + 1]), sum(pdm[1:n + 1]), sum(mdm[1:n + 1])
    dx = [None] * m

    def calc(i):
        if s_tr == 0:
            return 0.0
        pi, mi = 100 * s_p / s_tr, 100 * s_m / s_tr
        return 0.0 if pi + mi == 0 else 100 * abs(pi - mi) / (pi + mi)

    dx[n] = calc(n)
    for i in range(n + 1, m):
        s_tr += tr[i] - s_tr / n
        s_p += pdm[i] - s_p / n
        s_m += mdm[i] - s_m / n
        dx[i] = calc(i)
    saida[2 * n - 1] = sum(dx[n:2 * n]) / n
    for i in range(2 * n, m):
        saida[i] = (saida[i - 1] * (n - 1) + dx[i]) / n
    return saida


def bollinger(v, n=20, k=2.0):
    meio, sup, inf = sma(v, n), [None] * len(v), [None] * len(v)
    for i in range(n - 1, len(v)):
        janela = v[i - n + 1:i + 1]
        dp = (sum((x - meio[i]) ** 2 for x in janela) / n) ** 0.5
        sup[i], inf[i] = meio[i] + k * dp, meio[i] - k * dp
    return meio, sup, inf


def maxima_anterior(v, n):
    """Maior valor dos n candles ANTERIORES (não inclui o atual)."""
    return [max(v[i - n:i]) if i >= n else None for i in range(len(v))]


def minima_anterior(v, n):
    return [min(v[i - n:i]) if i >= n else None for i in range(len(v))]


# ----------------------------------------------------------------- utilidades
def _plano(entrada, saida=None, stop=None, alvo=None, trailing=None, tempo_max=None, guardas=None):
    return {"entrada": entrada, "saida": saida, "stop": stop, "alvo": alvo,
            "trailing": trailing, "tempo_max": tempo_max, "guardas": guardas}


def _fracao_atr(c, a, mult, minimo, maximo):
    """Distância (fração do preço) = mult x ATR, limitada entre minimo e maximo."""
    return [None if a[i] is None else min(maximo, max(minimo, mult * a[i] / c[i]["fechamento"]))
            for i in range(len(c))]


def _maquina(entrada, saida, tempo_max=None):
    """Transforma 'sinais de entrada e saída' em 'estaria comprado neste candle?'."""
    estado, dentro, desde = [False] * len(entrada), False, 0
    for i in range(len(entrada)):
        if dentro and (saida[i] or (tempo_max and i - desde >= tempo_max)):
            dentro = False
        if not dentro and entrada[i]:
            dentro, desde = True, i
        estado[i] = dentro
    return estado


# ----------------------------------------------------------------- estratégias
def cruzamento_atual(c):
    """O que o robô usa hoje (média 9 cruza acima da 21), com stop 1% e alvo 1,5%. É a referência."""
    f = [x["fechamento"] for x in c]
    r, l = sma(f, 9), sma(f, 21)
    ent = [False] * len(f)
    for i in range(22, len(f)):
        ent[i] = r[i - 1] <= l[i - 1] and r[i] > l[i]
    return _plano(ent, stop=0.01, alvo=0.015)


def tendencia(c):
    """Seguidor de tendência: comprado enquanto preço > média 50 > média 200. Sai abaixo da média 50."""
    f = [x["fechamento"] for x in c]
    s50, s200, a = sma(f, 50), sma(f, 200), atr(c, 14)
    ent = [s200[i] is not None and f[i] > s50[i] > s200[i] for i in range(len(f))]
    sai = [s50[i] is not None and f[i] < s50[i] for i in range(len(f))]
    return _plano(ent, sai, stop=_fracao_atr(c, a, 3, .02, .15), trailing=_fracao_atr(c, a, 3, .02, .15))


def donchian(c, n_entrada=55, n_saida=20, atr_mult=2.0):
    """Rompimento lento: compra ao fechar acima da máxima de 55 candles; sai abaixo da mínima de 20.
    Stop inicial de 2 ATR. Os números padrão são os clássicos; robustez.py varia para testar."""
    f = [x["fechamento"] for x in c]
    alta = maxima_anterior([x["maxima"] for x in c], n_entrada)
    baixa = minima_anterior([x["minima"] for x in c], n_saida)
    a = atr(c, 20)
    ent = [alta[i] is not None and f[i] > alta[i] for i in range(len(f))]
    sai = [baixa[i] is not None and f[i] < baixa[i] for i in range(len(f))]
    return _plano(ent, sai, stop=_fracao_atr(c, a, atr_mult, .02, .15))


def recuo(c):
    """Recuo dentro da alta: só com preço > média 200 e média 50 > 200; compra quando o RSI volta
    a subir de baixo de 40; sai com RSI > 60. Stop 3%, no máximo 30 candles."""
    f = [x["fechamento"] for x in c]
    s50, s200, r = sma(f, 50), sma(f, 200), rsi(f, 14)
    ent = [False] * len(f)
    for i in range(1, len(f)):
        if s200[i] is not None and r[i - 1] is not None and f[i] > s200[i] and s50[i] > s200[i]:
            ent[i] = r[i - 1] < 40 <= r[i]
    sai = [r[i] is not None and r[i] > 60 for i in range(len(f))]
    return _plano(ent, sai, stop=0.03, tempo_max=30)


def reversao(c):
    """Reversão só em mercado lateral: ADX < 20 e preço abaixo da banda inferior de Bollinger.
    Sai ao voltar à média. Stop 2,5%, no máximo 24 candles."""
    f = [x["fechamento"] for x in c]
    meio, _, inf = bollinger(f, 20, 2.0)
    forca = adx(c, 14)
    ent = [forca[i] is not None and inf[i] is not None and forca[i] < 20 and f[i] < inf[i]
           for i in range(len(f))]
    sai = [meio[i] is not None and f[i] >= meio[i] for i in range(len(f))]
    return _plano(ent, sai, stop=0.025, tempo_max=24)


GUARDAS_SEGURAS = {
    "esfriar": 3,              # depois de uma perda, não recompra por 3 candles
    "max_perdas_seguidas": 3,  # 3 perdas seguidas...
    "pausa_perdas": 10,        # ...pausa de 10 candles
    "dd_max_frac": 0.10,       # se a queda desde o pico passar de 10% do valor da ordem...
    "pausa_dd": 20,            # ...pausa de 20 candles (e recomeça a contar do zero)
}


def confluencia(c, segura=True):
    """Média das quatro: cada uma vira um "voto" (estaria comprada ou não). Compra quando, pela
    primeira vez, pelo menos 2 das 4 votam comprado; sai quando sobram menos de 2.

    segura=False: só isso, com stop inicial de 2,5 ATR.
    segura=True: soma as travas, todas pensadas para evitar entrar errado e para limitar perdas:
      - regime: preço acima da média 200, e a média 200 não está caindo;
      - volatilidade: não entra se a oscilação está 2,5x acima do normal (dia de pânico);
      - queda livre: não entra se o preço está mais de 15% abaixo da máxima dos últimos 100 candles;
      - sai também se o preço fechar abaixo da média 200;
      - stop inicial de 2,5 ATR e stop móvel de 3 ATR que só sobe;
      - esfriamento após perda, pausa após 3 perdas seguidas e disjuntor de queda acumulada.
    """
    n = len(c)
    f = [x["fechamento"] for x in c]
    pt, pd, pr, pv = tendencia(c), donchian(c), recuo(c), reversao(c)
    votos = [_maquina(pt["entrada"], pt["saida"]), _maquina(pd["entrada"], pd["saida"]),
             _maquina(pr["entrada"], pr["saida"], 30), _maquina(pv["entrada"], pv["saida"], 24)]
    placar = [sum(v[i] for v in votos) for i in range(n)]
    s200, a = sma(f, 200), atr(c, 14)
    atrp = [None if a[i] is None else a[i] / f[i] for i in range(n)]
    ent, sai = [False] * n, [False] * n
    for i in range(1, n):
        sai[i] = placar[i] <= 1
        evento = placar[i] >= 2 and placar[i - 1] < 2
        if not evento:
            continue
        if not segura:
            ent[i] = True
            continue
        if i < 100 or s200[i] is None or s200[i - 20] is None or atrp[i] is None:
            continue
        regime = f[i] > s200[i] and s200[i] >= s200[i - 20]
        normais = [x for x in atrp[i - 100:i] if x is not None]
        calmo = bool(normais) and atrp[i] <= 2.5 * (sum(normais) / len(normais))
        sem_queda_livre = f[i] >= 0.85 * max(f[i - 100:i])
        ent[i] = regime and calmo and sem_queda_livre
    if segura:
        for i in range(1, n):
            if s200[i] is not None and f[i] < s200[i]:
                sai[i] = True
    return _plano(ent, sai, stop=_fracao_atr(c, a, 2.5, .02, .12),
                  trailing=_fracao_atr(c, a, 3, .025, .15) if segura else None,
                  guardas=dict(GUARDAS_SEGURAS) if segura else None)


# nome -> (função, timeframes onde faz sentido testar)
ESTRATEGIAS = {
    "cruzamento 9/21 (robô atual)": (cruzamento_atual, ["1h"]),
    "tendência 50/200": (tendencia, ["1d"]),
    "rompimento Donchian 55/20": (donchian, ["4h", "1d"]),
    "recuo na alta (RSI)": (recuo, ["1h", "4h"]),
    "reversão lateral (Bollinger+ADX)": (reversao, ["1h", "4h"]),
    "confluência SEM travas": (lambda c: confluencia(c, segura=False), ["4h", "1d"]),
    "CONFLUÊNCIA SEGURA": (lambda c: confluencia(c, segura=True), ["4h", "1d"]),
}
