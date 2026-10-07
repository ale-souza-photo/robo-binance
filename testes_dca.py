"""Testes do DCA. Rode: python -m unittest testes_dca -v"""
import os
import shutil
import tempfile
import time
import unittest
from datetime import datetime

import config
import dca


class FakeEx:
    """Exchange falsa: registra as ordens enviadas."""
    def __init__(self, precos=None, minimo=5.0, falha_na_ordem=False, taxa_base=0.001):
        self.precos = precos or {"BTC/USDT": 100000.0, "ETH/USDT": 4000.0}
        self.minimo, self.falha, self.taxa_base = minimo, falha_na_ordem, taxa_base
        self.ordens = []
        self.desvio = 1.0

    def market(self, s):
        if s not in self.precos:
            raise KeyError(s)
        return {"limits": {"cost": {"min": self.minimo}}}

    def fetch_ticker(self, s):
        return {"last": self.precos[s] * self.desvio}

    def fetch_ohlcv(self, s, tf, limit=2):
        return [[0, 1, 1, 1, self.precos[s], 1]] * 2

    def create_market_buy_order_with_cost(self, s, custo):
        if self.falha:
            raise RuntimeError("timeout de rede")
        self.ordens.append((s, custo))
        preco = self.precos[s]
        qtd = custo / preco
        taxa = qtd * self.taxa_base
        return {"filled": qtd, "cost": custo, "average": preco,
                "fees": [{"currency": s.split("/")[0], "cost": taxa}]}


def quando(ano, mes, dia, hora=12):
    return datetime(ano, mes, dia, hora).timestamp()


class Base(unittest.TestCase):
    CAMPOS = ("DCA_ATIVOS", "DCA_VALOR_POR_RODADA", "DCA_FREQUENCIA", "DCA_DIA", "DCA_TETO_MENSAL",
              "DCA_MAX_DESVIO_PRECO", "ARQUIVO_TRAVA", "ARQUIVO_PARADA")

    def setUp(self):
        self._orig = {c: getattr(config, c) for c in self.CAMPOS}
        self.pasta = tempfile.mkdtemp()
        config.ARQUIVO_TRAVA = os.path.join(self.pasta, "TRAVA.txt")
        config.ARQUIVO_PARADA = os.path.join(self.pasta, "PARAR.txt")
        config.DCA_ATIVOS = {"BTC/USDT": 0.7, "ETH/USDT": 0.3}
        config.DCA_VALOR_POR_RODADA, config.DCA_FREQUENCIA, config.DCA_DIA = 10.0, "mensal", 5
        config.DCA_TETO_MENSAL, config.DCA_MAX_DESVIO_PRECO = 25.0, 0.05

    def tearDown(self):
        for c, v in self._orig.items():
            setattr(config, c, v)
        shutil.rmtree(self.pasta, ignore_errors=True)

    def novo(self, ex, modo="TESTNET"):
        return dca.Dca(ex, modo, arquivo_estado=os.path.join(self.pasta, "estado.json"),
                       arquivo_log=os.path.join(self.pasta, "log.csv"))


class Regras(unittest.TestCase):
    def test_periodo_e_hora(self):
        d = datetime(2026, 10, 4)
        self.assertEqual(dca.periodo_id(d, "mensal"), "2026-10")
        self.assertEqual(dca.periodo_id(d, "diaria"), "2026-10-04")
        self.assertTrue(dca.periodo_id(d, "semanal").startswith("2026-S"))
        self.assertFalse(dca.esta_na_hora(datetime(2026, 10, 4), "mensal", 5))
        self.assertTrue(dca.esta_na_hora(datetime(2026, 10, 5), "mensal", 5))
        self.assertTrue(dca.esta_na_hora(datetime(2026, 10, 20), "mensal", 5))
        self.assertTrue(dca.esta_na_hora(datetime(2026, 10, 7), "semanal", 0))

    def test_rodizio_alterna_conforme_a_meta(self):
        pesos, ativos, sequencia = {"BTC/USDT": 0.7, "ETH/USDT": 0.3}, {}, []
        for _ in range(10):
            s = dca.escolher_ativo(pesos, ativos, 10.0)
            sequencia.append(s)
            ativos.setdefault(s, {"custo": 0.0})["custo"] += 10.0
        self.assertEqual(sequencia[0], "BTC/USDT")
        self.assertEqual(sequencia.count("BTC/USDT"), 7)  # 70% das 10 compras
        self.assertEqual(sequencia.count("ETH/USDT"), 3)

    def test_validar_config(self):
        orig = (config.DCA_ATIVOS, config.DCA_VALOR_POR_RODADA, config.DCA_FREQUENCIA, config.DCA_TETO_MENSAL)
        try:
            self.assertEqual(dca.validar_config(), [])
            config.DCA_ATIVOS = {"BTC/USDT": 0.5, "ETH/USDT": 0.3}
            self.assertTrue(any("somam" in p for p in dca.validar_config()))
            config.DCA_ATIVOS = {"BTC/USDT": 1.0}
            config.DCA_FREQUENCIA = "quinzenal"
            self.assertTrue(any("DCA_FREQUENCIA" in p for p in dca.validar_config()))
            config.DCA_FREQUENCIA, config.DCA_TETO_MENSAL = "mensal", 5.0
            self.assertTrue(any("TETO" in p for p in dca.validar_config()))
        finally:
            config.DCA_ATIVOS, config.DCA_VALOR_POR_RODADA, config.DCA_FREQUENCIA, config.DCA_TETO_MENSAL = orig

    def test_real_exige_confirmacao(self):
        self.assertIsNotNone(dca.exigir_confirmacao_real("REAL", []))
        self.assertIsNone(dca.exigir_confirmacao_real("REAL", ["--real-confirmo"]))
        self.assertIsNone(dca.exigir_confirmacao_real("TESTNET", []))
        self.assertIsNone(dca.exigir_confirmacao_real("SIMULADO", []))


class Rodada(Base):
    def test_simulado_nao_envia_ordem_e_registra(self):
        ex = FakeEx()
        d = self.novo(ex, "SIMULADO")
        r = d.rodada(agora=quando(2026, 10, 6))
        self.assertEqual(r["codigo"], "COMPRA")
        self.assertEqual(ex.ordens, [])
        self.assertAlmostEqual(d.estado["ativos"]["BTC/USDT"]["custo"], 10.0)

    def test_testnet_compra_uma_vez_e_desconta_taxa_em_moeda_comprada(self):
        ex = FakeEx(taxa_base=0.001)
        d = self.novo(ex)
        r = d.rodada(agora=quando(2026, 10, 6))
        self.assertEqual(r["codigo"], "COMPRA")
        self.assertEqual(ex.ordens, [("BTC/USDT", 10.0)])
        self.assertAlmostEqual(d.estado["ativos"]["BTC/USDT"]["qtd"], 0.0001 * 0.999)

    def test_nunca_compra_duas_vezes_no_mesmo_periodo(self):
        ex = FakeEx()
        d = self.novo(ex)
        d.rodada(agora=quando(2026, 10, 6))
        r = d.rodada(agora=quando(2026, 10, 20))
        self.assertEqual(r["codigo"], "JA_FEITA")
        d2 = self.novo(ex)  # reiniciar o programa também não pode comprar de novo
        self.assertEqual(d2.rodada(agora=quando(2026, 10, 28))["codigo"], "JA_FEITA")
        self.assertEqual(len(ex.ordens), 1)

    def test_aguarda_antes_do_dia_e_forcar_compra(self):
        ex = FakeEx()
        d = self.novo(ex)
        self.assertEqual(d.rodada(agora=quando(2026, 10, 2))["codigo"], "AGUARDANDO")
        self.assertEqual(ex.ordens, [])
        self.assertEqual(d.rodada(forcar=True, agora=quando(2026, 10, 2))["codigo"], "COMPRA")

    def test_proximo_mes_compra_de_novo_e_alterna_ativo(self):
        ex = FakeEx()
        d = self.novo(ex)
        d.rodada(agora=quando(2026, 10, 6))
        d.rodada(agora=quando(2026, 11, 6))
        self.assertEqual([o[0] for o in ex.ordens], ["BTC/USDT", "ETH/USDT"])

    def test_falha_na_ordem_deixa_pendente_e_nao_repete(self):
        ex = FakeEx(falha_na_ordem=True)
        d = self.novo(ex)
        r = d.rodada(agora=quando(2026, 10, 6))
        self.assertEqual(r["codigo"], "ERRO")
        self.assertEqual(d.estado["periodos"]["2026-10"]["status"], "pendente")
        ex.falha = False  # mesmo com a rede boa de novo, não pode tentar sozinho
        r2 = self.novo(ex).rodada(agora=quando(2026, 10, 6, 13))
        self.assertEqual(r2["codigo"], "PENDENTE")
        self.assertEqual(ex.ordens, [])
        self.assertEqual(d.estado["ativos"], {})

    def test_teto_mensal(self):
        config.DCA_FREQUENCIA, config.DCA_TETO_MENSAL, config.DCA_DIA = "semanal", 15.0, 0
        ex = FakeEx()
        d = self.novo(ex)
        self.assertEqual(d.rodada(agora=quando(2026, 10, 6))["codigo"], "COMPRA")
        r = d.rodada(agora=quando(2026, 10, 13))  # outra semana, mesmo mês: 10 + 10 > 15
        self.assertEqual(r["codigo"], "TETO")
        self.assertEqual(len(ex.ordens), 1)

    def test_abaixo_do_minimo_recusa_sem_registrar(self):
        ex = FakeEx(minimo=20.0)
        d = self.novo(ex)
        r = d.rodada(agora=quando(2026, 10, 6))
        self.assertEqual(r["codigo"], "RECUSADA")
        self.assertEqual(ex.ordens, [])
        self.assertEqual(d.estado["periodos"], {})  # pode tentar de novo depois de ajustar

    def test_par_inexistente_recusa(self):
        config.DCA_ATIVOS = {"BTC/BRL": 1.0}
        r = self.novo(FakeEx()).rodada(agora=quando(2026, 10, 6))
        self.assertEqual(r["codigo"], "RECUSADA")

    def test_preco_estranho_nao_compra(self):
        ex = FakeEx()
        ex.desvio = 1.20  # ticker 20% acima do último candle
        r = self.novo(ex).rodada(agora=quando(2026, 10, 6))
        self.assertEqual(r["codigo"], "DADOS")
        self.assertEqual(ex.ordens, [])

    def test_trava_e_parar_bloqueiam(self):
        open(config.ARQUIVO_PARADA, "w").close()
        ex = FakeEx()
        self.assertEqual(self.novo(ex).rodada(agora=quando(2026, 10, 6))["codigo"], "TRAVADO")
        os.remove(config.ARQUIVO_PARADA)
        open(config.ARQUIVO_TRAVA, "w").close()
        self.assertEqual(self.novo(ex).rodada(agora=quando(2026, 10, 6))["codigo"], "TRAVADO")
        self.assertEqual(ex.ordens, [])

    def test_status_mostra_preco_medio_e_resultado(self):
        ex = FakeEx()
        d = self.novo(ex, "SIMULADO")
        d.rodada(agora=quando(2026, 10, 6))
        ex.precos["BTC/USDT"] = 110000.0
        texto = d.status()
        self.assertIn("BTC/USDT", texto)
        self.assertIn("+9.", texto)  # subiu ~10% menos a taxa simulada


if __name__ == "__main__":
    unittest.main()
