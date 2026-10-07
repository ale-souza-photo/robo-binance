"""Testes automáticos. Rode: python -m unittest testes -v

Os mais importantes:
- nenhuma estratégia olha o futuro (o sinal de um candle não muda se o futuro for cortado);
- o motor é conservador (stop com salto, stop antes do alvo, taxas, travas);
- as travas do robô ao vivo (kill_switch) fazem o que prometem.
"""
import random
import unittest

import config
import estrategias as E
import motor
from kill_switch import KillSwitch


def serie(n=900, seed=3, vol=0.01, drift=0.0003):
    """Preços sintéticos com tendência e ruído, só para testar a mecânica."""
    r, p, t, saida = random.Random(seed), 100.0, 1_600_000_000_000, []
    for i in range(n):
        o = p
        p *= 1 + drift + r.gauss(0, vol)
        saida.append({"tempo": t + i * 3_600_000, "abertura": o, "maxima": max(o, p) * (1 + abs(r.gauss(0, vol / 3))),
                      "minima": min(o, p) * (1 - abs(r.gauss(0, vol / 3))), "fechamento": p, "volume": 1.0})
    return saida


def candle(o, h, l, c, i=0):
    return {"tempo": i * 3_600_000, "abertura": o, "maxima": h, "minima": l, "fechamento": c, "volume": 1.0}


def plano_simples(n, entrada_em, **kw):
    ent = [False] * n
    for i in entrada_em:
        ent[i] = True
    base = {"entrada": ent, "saida": None, "stop": 0.05, "alvo": None, "trailing": None, "tempo_max": None, "guardas": None}
    base.update(kw)
    return base


class SemOlharOFuturo(unittest.TestCase):
    def test_sinais_nao_mudam_se_o_futuro_for_cortado(self):
        c = serie()
        corte = 600
        for nome, (fn, _) in E.ESTRATEGIAS.items():
            cheio, parcial = fn(c), fn(c[:corte])
            for campo in ("entrada", "saida"):
                if cheio[campo] is None:
                    continue
                self.assertEqual(cheio[campo][:corte], parcial[campo], f"{nome}: '{campo}' depende do futuro")


class Indicadores(unittest.TestCase):
    def test_sma(self):
        self.assertEqual(E.sma([1, 2, 3, 4], 2), [None, 1.5, 2.5, 3.5])

    def test_rsi_entre_0_e_100_e_extremos(self):
        sobe = E.rsi([float(i) for i in range(1, 60)], 14)
        self.assertEqual(sobe[-1], 100.0)
        desce = E.rsi([float(100 - i) for i in range(60)], 14)
        self.assertEqual(desce[-1], 0.0)
        for x in E.rsi([c["fechamento"] for c in serie()], 14):
            self.assertTrue(x is None or 0 <= x <= 100)

    def test_adx_entre_0_e_100(self):
        for x in E.adx(serie(), 14):
            self.assertTrue(x is None or 0 <= x <= 100.0001)

    def test_atr_positivo(self):
        for x in E.atr(serie(), 14):
            self.assertTrue(x is None or x > 0)

    def test_maxima_anterior_nao_inclui_o_candle_atual(self):
        self.assertEqual(E.maxima_anterior([1, 5, 2, 9], 2), [None, None, 5, 5])


class Motor(unittest.TestCase):
    def rodar(self, candles, plano, **kw):
        return motor.simular(candles, plano, inicio=1, taxa=kw.pop("taxa", 0.0), slippage=kw.pop("slippage", 0.0), **kw)

    def test_stop_com_salto_sai_na_abertura_e_nao_no_stop(self):
        c = [candle(100, 100, 100, 100), candle(100, 100, 100, 100), candle(90, 91, 89, 90)]  # abre 10% abaixo
        t = self.rodar(c, plano_simples(3, [1], stop=0.05))
        self.assertEqual(len(t), 1)
        self.assertEqual(t[0]["motivo"], "stop")
        self.assertAlmostEqual(t[0]["saida"], 90.0)  # pior que o stop (95)

    def test_stop_e_alvo_no_mesmo_candle_vale_o_stop(self):
        c = [candle(100, 100, 100, 100), candle(100, 100, 100, 100), candle(100, 120, 90, 100)]
        t = self.rodar(c, plano_simples(3, [1], stop=0.05, alvo=0.10))
        self.assertEqual(t[0]["motivo"], "stop")

    def test_alvo(self):
        c = [candle(100, 100, 100, 100), candle(100, 100, 100, 100), candle(100, 112, 99, 111)]
        t = self.rodar(c, plano_simples(3, [1], stop=0.05, alvo=0.10))
        self.assertEqual(t[0]["motivo"], "alvo")
        self.assertAlmostEqual(t[0]["saida"], 110.0)

    def test_taxas_e_slippage_tornam_trade_parado_em_prejuizo(self):
        c = [candle(100, 100, 100, 100)] * 4
        t = self.rodar(c, plano_simples(4, [1], stop=0.05, saida=[False, False, True, False]), taxa=0.001, slippage=0.0005)
        self.assertLess(t[0]["pnl"], 0)

    def test_trailing_sobe_e_nunca_desce(self):
        # compra a 100, sobe a 120 (máxima), depois cai: stop móvel de 5% deve sair perto de 114, acima da entrada
        c = [candle(100, 100, 100, 100), candle(100, 100, 100, 100), candle(100, 120, 100, 118),
             candle(118, 119, 110, 112), candle(112, 113, 100, 105)]
        t = self.rodar(c, plano_simples(5, [1], stop=0.10, trailing=0.05))
        self.assertEqual(t[0]["motivo"], "stop")
        self.assertAlmostEqual(t[0]["saida"], 114.0)  # 120 x 0,95
        self.assertGreater(t[0]["pnl"], 0)

    def test_nao_recompra_no_mesmo_candle_da_saida(self):
        c = [candle(100, 100, 100, 100)] * 6
        ent = [False, True, True, True, True, True]
        t = self.rodar(c, {**plano_simples(6, []), "entrada": ent, "saida": [False, False, True, False, False, False]})
        self.assertTrue(all(t[i]["i_ent"] > t[i - 1]["i_sai"] for i in range(1, len(t))))

    @staticmethod
    def calmo_e_despenca(pares):
        """candle 0 base; depois, alternando: calmo (índice ímpar) e queda de 10% (índice par)."""
        c = [candle(100, 100, 100, 100)]
        for _ in range(pares):
            c += [candle(100, 100, 100, 100), candle(100, 100, 90, 92)]
        return c

    def test_esfriar_depois_de_perda_bloqueia_recompra(self):
        c = self.calmo_e_despenca(10)
        n = len(c)
        sem = self.rodar(c, plano_simples(n, range(1, n), stop=0.03))
        com = self.rodar(c, plano_simples(n, range(1, n), stop=0.03, guardas={"esfriar": 3}))
        self.assertGreater(len(sem), 0)
        self.assertGreater(len(sem), len(com))

    def test_pausa_depois_de_perdas_seguidas(self):
        c = self.calmo_e_despenca(15)
        n = len(c)
        g = {"max_perdas_seguidas": 2, "pausa_perdas": 10}
        sem = self.rodar(c, plano_simples(n, range(1, n), stop=0.03))
        com = self.rodar(c, plano_simples(n, range(1, n), stop=0.03, guardas=g))
        self.assertLess(sem[2]["i_ent"] - sem[1]["i_sai"], 10)       # sem a trava, recompra logo
        self.assertGreaterEqual(com[2]["i_ent"] - com[1]["i_sai"], 10)  # com a trava, espera a pausa

    def test_disjuntor_de_queda_acumulada_pausa(self):
        c = self.calmo_e_despenca(15)
        n = len(c)
        # cada perda custa ~3% de 10 = 0,3 USDT; limite de queda de 0,5 estoura na 2ª perda
        g = {"dd_max_frac": 0.05, "pausa_dd": 10}
        sem = self.rodar(c, plano_simples(n, range(1, n), stop=0.03), valor=10.0)
        com = self.rodar(c, plano_simples(n, range(1, n), stop=0.03, guardas=g), valor=10.0)
        self.assertGreater(len(sem), len(com))

    def test_sem_stop_calculado_nao_entra(self):
        c = [candle(100, 100, 100, 100)] * 4
        t = self.rodar(c, plano_simples(4, [1], stop=[None, None, None, None]))
        self.assertEqual(t, [])


class Confluencia(unittest.TestCase):
    def test_segura_nunca_tem_mais_entradas_que_sem_travas(self):
        c = serie(n=1500, seed=11, drift=0.0004)
        sem, seg = E.confluencia(c, segura=False), E.confluencia(c, segura=True)
        self.assertLessEqual(sum(seg["entrada"]), sum(sem["entrada"]))
        self.assertIsNotNone(seg["guardas"])
        self.assertIsNone(sem["guardas"])


class TravasAoVivo(unittest.TestCase):
    CAMPOS = ("MAX_PERDAS_SEGUIDAS", "PAUSA_APOS_PERDAS_MIN", "ESFRIAR_APOS_PERDA_MIN", "MAX_TRADES_POR_DIA",
              "PERDA_MAXIMA_TOTAL_USDT", "PERDA_MAXIMA_DIARIA_USDT", "ARQUIVO_TRAVA", "ARQUIVO_PARADA")

    def setUp(self):
        import os
        import tempfile
        self._orig = {c: getattr(config, c) for c in self.CAMPOS}
        self.pasta = tempfile.mkdtemp()  # funciona em Windows, Mac e Linux
        config.ARQUIVO_TRAVA = os.path.join(self.pasta, "TRAVA.txt")
        config.ARQUIVO_PARADA = os.path.join(self.pasta, "PARAR.txt")

    def tearDown(self):
        import shutil
        for c, v in self._orig.items():
            setattr(config, c, v)
        shutil.rmtree(self.pasta, ignore_errors=True)

    def test_esfria_depois_de_perda(self):
        config.ESFRIAR_APOS_PERDA_MIN, config.MAX_PERDAS_SEGUIDAS = 15, 99
        k = KillSwitch()
        k.registrar_resultado(-0.1, agora=1000)
        self.assertFalse(k.pode_operar(0, agora=1000 + 60))
        self.assertTrue(k.pode_operar(0, agora=1000 + 16 * 60))

    def test_pausa_depois_de_perdas_seguidas_e_volta(self):
        config.ESFRIAR_APOS_PERDA_MIN, config.MAX_PERDAS_SEGUIDAS, config.PAUSA_APOS_PERDAS_MIN = 0, 3, 60
        config.PERDA_MAXIMA_DIARIA_USDT = config.PERDA_MAXIMA_TOTAL_USDT = 99
        k = KillSwitch()
        msg = [k.registrar_resultado(-0.1, agora=0), k.registrar_resultado(-0.1, agora=10), k.registrar_resultado(-0.1, agora=20)]
        self.assertIsNone(msg[0])
        self.assertIn("pausa", msg[2].lower())
        self.assertFalse(k.pode_operar(0, agora=30 * 60))
        self.assertFalse(k.travado)
        self.assertTrue(k.pode_operar(0, agora=82 * 60))

    def test_ganho_zera_a_contagem_de_perdas(self):
        config.ESFRIAR_APOS_PERDA_MIN, config.MAX_PERDAS_SEGUIDAS = 0, 3
        config.PERDA_MAXIMA_DIARIA_USDT = config.PERDA_MAXIMA_TOTAL_USDT = 99
        k = KillSwitch()
        for pnl in (-0.1, -0.1, 0.2, -0.1, -0.1):
            self.assertIsNone(k.registrar_resultado(pnl, agora=0))

    def test_limite_de_trades_por_dia(self):
        config.MAX_TRADES_POR_DIA = 2
        k = KillSwitch()
        k.registrar_compra(agora=100); k.registrar_compra(agora=200)
        self.assertFalse(k.pode_operar(0, agora=300))
        self.assertTrue(k.pode_operar(0, agora=300 + 86400))  # dia seguinte

    def test_perda_total_trava_e_cria_arquivo(self):
        import os
        config.PERDA_MAXIMA_TOTAL_USDT, config.PERDA_MAXIMA_DIARIA_USDT = 3.0, 99
        k = KillSwitch()
        k.registrar_resultado(-3.5, agora=0)
        self.assertFalse(k.pode_operar(0, agora=1))
        self.assertTrue(k.travado)
        self.assertTrue(os.path.exists(config.ARQUIVO_TRAVA))

    def test_avisa_quando_nao_consegue_gravar_a_trava(self):
        import os
        config.ARQUIVO_TRAVA = os.path.join(self.pasta, "pasta_que_nao_existe", "TRAVA.txt")
        config.PERDA_MAXIMA_TOTAL_USDT, config.PERDA_MAXIMA_DIARIA_USDT = 3.0, 99
        k = KillSwitch()
        k.registrar_resultado(-3.5, agora=0)
        self.assertTrue(k.travado)
        self.assertFalse(k.trava_gravada)
        self.assertIn("ATENÇÃO", k.motivo)

    def test_parar_txt_trava(self):
        open(config.ARQUIVO_PARADA, "w").close()
        k = KillSwitch()
        self.assertFalse(k.pode_operar(0, agora=0))
        self.assertTrue(k.travado)

    def test_perda_diaria_continua_valendo(self):
        config.PERDA_MAXIMA_DIARIA_USDT, config.PERDA_MAXIMA_TOTAL_USDT = 2.0, 99
        k = KillSwitch()
        k.registrar_resultado(-2.1, agora=0)
        self.assertFalse(k.pode_operar(0, agora=1))


if __name__ == "__main__":
    unittest.main()
