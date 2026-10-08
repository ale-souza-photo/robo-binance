"""Testes da análise de ativos. Rode: python -m unittest testes_analise -v"""
import json
import os
import shutil
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone

import analise_ativos as A


def serie_diaria(inicio, n, f):
    return [(inicio + timedelta(days=i), f(i)) for i in range(n)]


class Leitores(unittest.TestCase):
    def test_parse_bcb(self):
        texto = json.dumps([{"data": "02/01/2025", "valor": "0.043739"}, {"data": "03/01/2025", "valor": "0.0437"},
                            {"data": "04/01/2025", "valor": ""}])
        self.assertEqual(A.parse_bcb(texto), [(date(2025, 1, 2), 0.043739), (date(2025, 1, 3), 0.0437)])

    def test_baixar_bcb_pagina_em_janelas_e_nao_repete_dias(self):
        urls = []

        def falso(url):
            urls.append(url)
            return json.dumps([{"data": "01/06/2024", "valor": "5.0"}])  # mesmo ponto em todas as janelas
        pts = A.baixar_bcb(1, date(2018, 1, 1), date(2025, 1, 1), http=falso)
        self.assertGreaterEqual(len(urls), 3)           # 7 anos em janelas de 3
        self.assertIn("bcdata.sgs.1/", urls[0])
        self.assertEqual(pts, [(date(2024, 6, 1), 5.0)])  # duplicados saem

    def test_indice_cdi_acumula(self):
        idx = A.indice_cdi([(date(2025, 1, 2), 1.0), (date(2025, 1, 3), 1.0)])
        self.assertAlmostEqual(idx[-1][1], 1.01 * 1.01)

    def test_parse_yahoo_prefere_ajustado_e_pula_nulos(self):
        t0 = int(datetime(2025, 1, 2, 13, tzinfo=timezone.utc).timestamp())
        obj = {"chart": {"result": [{"timestamp": [t0, t0 + 86400, t0 + 2 * 86400],
                                     "indicators": {"quote": [{"close": [10, 11, 12]},],
                                                    "adjclose": [{"adjclose": [9.5, None, 11.5]}]}}]}}
        self.assertEqual(A.parse_yahoo(obj), [(date(2025, 1, 2), 9.5), (date(2025, 1, 4), 11.5)])
        sem_adj = {"chart": {"result": [{"timestamp": [t0], "indicators": {"quote": [{"close": [10]}]}}]}}
        self.assertEqual(A.parse_yahoo(sem_adj), [(date(2025, 1, 2), 10.0)])

    def test_cache_ida_e_volta(self):
        pasta = tempfile.mkdtemp()
        orig = A.PASTA_CACHE
        try:
            A.PASTA_CACHE = pasta
            s = [(date(2025, 1, 1), 1.5), (date(2025, 1, 2), 2.5)]
            A.salvar_cache("X", s)
            self.assertEqual(A.ler_cache("X"), s)
            self.assertIsNone(A.ler_cache("NAO_EXISTE"))
        finally:
            A.PASTA_CACHE = orig
            shutil.rmtree(pasta, ignore_errors=True)


class Contas(unittest.TestCase):
    def test_alinhar_preenche_fim_de_semana_e_corta_no_periodo_comum(self):
        a = [(date(2025, 1, 1), 10.0), (date(2025, 1, 4), 12.0)]
        b = [(date(2024, 12, 20), 1.0), (date(2025, 1, 6), 2.0)]
        datas, v = A.alinhar({"A": a, "B": b})
        self.assertEqual(datas[0], date(2025, 1, 1))
        self.assertEqual(datas[-1], date(2025, 1, 4))     # termina onde a primeira série termina
        self.assertEqual(v["A"], [10.0, 10.0, 10.0, 12.0])
        self.assertEqual(v["B"], [1.0, 1.0, 1.0, 1.0])
        with self.assertRaises(ValueError):
            A.alinhar({"A": [(date(2020, 1, 1), 1.0), (date(2020, 2, 1), 1.0)], "B": [(date(2021, 1, 1), 1.0), (date(2021, 2, 1), 1.0)]})

    def test_estatisticas_dobrou_em_um_ano(self):
        n = 366
        dobra = [100 * 2 ** (i / 365) for i in range(n)]
        datas = [date(2024, 1, 1) + timedelta(days=i) for i in range(n)]
        s = A.estatisticas(datas, dobra)
        self.assertAlmostEqual(s["cagr"], 1.0, places=2)
        self.assertAlmostEqual(s["retorno_total"], 1.0, places=2)
        self.assertEqual(s["pior_queda"], 0.0)
        self.assertEqual(s["pos_12m"], 1.0)

    def test_pior_queda_e_janelas_de_12_meses(self):
        n = 800
        datas = [date(2023, 1, 1) + timedelta(days=i) for i in range(n)]
        v = [100.0] * 300 + [50.0] * 200 + [100.0] * 300      # cai 50% e volta
        s = A.estatisticas(datas, v)
        self.assertAlmostEqual(s["pior_queda"], 0.5)
        self.assertAlmostEqual(s["pior_12m"], -0.5)
        self.assertLess(s["pos_12m"], 1.0)

    def test_retorno_por_ano_calendario(self):
        datas = [date(2023, 12, 31) + timedelta(days=i) for i in range(400)]
        v = [100.0 * (1 + i / 1000) for i in range(400)]
        anos = A.estatisticas(datas, v)["por_ano"]
        self.assertEqual(sorted(anos), [2023, 2024, 2025])

    def test_correlacao(self):
        import random
        r = random.Random(1)
        base = [100.0]
        for _ in range(400):
            base.append(base[-1] * (1 + r.gauss(0, .02)))
        oposto = [10000 / x for x in base]
        constante = [1.0] * len(base)
        nomes, c = A.correlacoes({"X": base, "Y": [2 * x for x in base], "Z": oposto, "CDI": constante})
        self.assertNotIn("CDI", nomes)             # sem variação não entra
        self.assertAlmostEqual(c["X"]["Y"], 1.0, places=3)
        self.assertLess(c["X"]["Z"], -0.9)

    def test_tir_anual(self):
        d0 = date(2024, 1, 1)
        self.assertAlmostEqual(A.tir_anual([(d0, 100.0)], d0 + timedelta(days=365), 110.0), 0.10, places=3)
        self.assertAlmostEqual(A.tir_anual([(d0, 100.0)], d0 + timedelta(days=365), 90.0), -0.10, places=3)

    def test_dca_preco_constante_nao_ganha_nem_perde(self):
        datas = [date(2024, 1, 1) + timedelta(days=i) for i in range(365)]
        m = A.simular_dca(datas, {"X": [10.0] * 365}, {"X": 1.0}, 100.0, 50.0, 5)
        self.assertAlmostEqual(m["valor_final"], m["aportado"])
        self.assertAlmostEqual(m["aportado"], 100 + 50 * 11)      # inicial + 11 meses seguintes (fev a dez)
        self.assertEqual(m["pior_queda_no_papel"], 0.0)
        self.assertAlmostEqual(m["tir"], 0.0, places=3)

    def test_dca_reparte_pelos_pesos_e_mostra_prejuizo_no_papel(self):
        datas = [date(2024, 1, 1) + timedelta(days=i) for i in range(120)]
        cai = [100.0] * 60 + [50.0] * 60
        m = A.simular_dca(datas, {"A": cai, "B": [1.0] * 120}, {"A": 0.5, "B": 0.5}, 1000.0, 0.0, 5)
        self.assertAlmostEqual(m["aportado"], 1000.0)
        self.assertAlmostEqual(m["valor_final"], 500 * 0.5 + 500)   # metade em A (caiu 50%), metade em B
        self.assertAlmostEqual(m["pior_queda_no_papel"], 0.25)
        self.assertAlmostEqual(m["pct_no_prejuizo"], 0.5)

    def test_ler_carteira(self):
        n, p = A.ler_carteira("Minha:BTC=0.3,ivvb11=0.3,CDI=0.4")
        self.assertEqual((n, p), ("Minha", {"BTC": 0.3, "IVVB11": 0.3, "CDI": 0.4}))
        self.assertEqual(A.ler_carteira("BTC=0.5,CDI=0.5")[0], "BTC=0.5,CDI=0.5")
        with self.assertRaises(ValueError):
            A.ler_carteira("X:BTC=0.5,CDI=0.4")

    def test_queda_sem_menos_zero(self):
        self.assertEqual(A.queda_txt(0.0), "0%")
        self.assertEqual(A.queda_txt(0.523), "-52%")


class Relatorio(unittest.TestCase):
    def test_demo_de_ponta_a_ponta_gera_texto_e_html(self):
        pasta = tempfile.mkdtemp()
        antigo = os.getcwd()
        try:
            os.chdir(pasta)
            import contextlib
            import io
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                A.principal(["--demo", "--anos", "3", "--html", "r.html"])
            texto = saida.getvalue()
            self.assertIn("DEMONSTRAÇÃO", texto)
            self.assertIn("LEITURA RÁPIDA", texto)
            self.assertIn("CDI", texto)
            html = open("r.html", encoding="utf-8").read()
            self.assertIn("ANÁLISE DE ATIVOS", html)
            self.assertIn('"demo": true', html)
            dados = json.loads(html.split("const D = ")[1].split(";\nconst $ =")[0])
            self.assertTrue(dados["carteiras"])
            self.assertEqual(len(dados["datas"]), len(dados["ativos"][0]["serie"]))
            self.assertFalse(os.path.exists(A.PASTA_CACHE))     # a demo não grava cache
        finally:
            os.chdir(antigo)
            shutil.rmtree(pasta, ignore_errors=True)

    def test_leitura_rapida_aponta_ativos_abaixo_do_cdi(self):
        datas = [date(2023, 1, 1) + timedelta(days=i) for i in range(800)]
        vals = {"CDI": [100 * 1.0004 ** i for i in range(800)], "RUIM": [100.0] * 800, "BOM": [100 * 1.002 ** i for i in range(800)]}
        stats = {k: A.estatisticas(datas, v) for k, v in vals.items()}
        nomes, corr = A.correlacoes(vals)
        frases = A.leitura_rapida(stats, nomes, corr, {})
        self.assertTrue(any("abaixo dele" in f and "RUIM" in f for f in frases))
        self.assertIn("PASSADO", frases[-1])


if __name__ == "__main__":
    unittest.main()
