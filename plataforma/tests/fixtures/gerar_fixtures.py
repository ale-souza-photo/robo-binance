"""Gera os dados de referência do teste de paridade, usando o Python JÁ VALIDADO (analise_ativos.py).

Rode a partir da pasta plataforma:   python tests/fixtures/gerar_fixtures.py
O teste tests/paridade.test.ts confere se o TypeScript dá os mesmos números.
"""
import json
import os
import sys
from datetime import timedelta

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, RAIZ)
import analise_ativos as A  # noqa: E402


def fim_de_semana(d):
    return d.weekday() >= 5


def main():
    demo = A.dados_demo(anos=2, seed=5)
    # calendários diferentes, como no mundo real: bolsa e CDI só em dias úteis; cripto todos os dias
    series = {}
    for nome, pts in demo.items():
        if nome in ("BOVA11", "IVVB11", "CDI"):
            pts = [(d, v) for d, v in pts if not fim_de_semana(d)]
        series[nome] = pts
    datas, valores = A.alinhar(series)
    stats = {n: A.estatisticas(datas, v) for n, v in valores.items()}
    nomes_corr, corr = A.correlacoes(valores)
    carteiras_def = {"CDI puro": {"CDI": 1.0}, "Cripto": {"BTC": 0.7, "ETH": 0.3},
                     "Mista": {"CDI": 0.4, "IVVB11": 0.2, "BOVA11": 0.1, "DOLAR": 0.1, "BTC": 0.15, "ETH": 0.05}}
    carteiras = {n: A.simular_dca(datas, valores, p, 100.0, 50.0, 5) for n, p in carteiras_def.items()}
    frases = A.leitura_rapida(stats, nomes_corr, corr, carteiras)

    def limpa_stats(s):
        s = dict(s)
        s["por_ano"] = {str(k): v for k, v in s["por_ano"].items()}
        return s

    saida = {
        "series": {n: [[d.isoformat(), v] for d, v in pts] for n, pts in series.items()},
        "esperado": {
            "datas_total": len(datas), "primeira": datas[0].isoformat(), "ultima": datas[-1].isoformat(),
            "amostra_valores": {n: {str(i): valores[n][i] for i in (0, 1, 2, 3, 7, 100, len(datas) - 1)} for n in valores},
            "stats": {n: limpa_stats(s) for n, s in stats.items()},
            "corr": {"nomes": nomes_corr, "matriz": corr},
            "carteiras_def": carteiras_def,
            "carteiras": {n: {k: v for k, v in m.items()} for n, m in carteiras.items()},
            "frases": frases,
        },
    }
    caminho = os.path.join(os.path.dirname(__file__), "paridade.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(saida, f)
    print(f"{caminho}: {os.path.getsize(caminho) / 1024:.0f} KB, {len(datas)} dias, {len(series)} ativos")


if __name__ == "__main__":
    main()
