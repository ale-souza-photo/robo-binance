"""Kill switch e travas: decide se o robô pode continuar operando.

Travas (todas ajustáveis no config.py):
- PARAR.txt: você manda parar (trava).
- Perda do dia (calendário) acima do limite: para o robô (trava).
- Perda total da sessão acima do limite: para o robô e cria TRAVA.txt, que impede reiniciar
  sem você olhar (trava grave).
- Perdas seguidas: pausa temporária (o robô continua ligado, só não compra).
- Esfriamento após uma perda: não recompra logo em seguida.
- Máximo de compras por dia.
- Só uma posição aberta por vez.
"""
import os
import time
from datetime import datetime

import config


class KillSwitch:
    def __init__(self):
        self.pnl_dia = 0.0
        self.pnl_total = 0.0
        self.trades_hoje = 0
        self.perdas_seguidas = 0
        self.pausado_ate = 0.0
        self.esfriar_ate = 0.0
        self.travado = False
        self.motivo = ""
        self._dia = None

    # ---------------------------------------------------------------- eventos
    def registrar_compra(self, agora=None):
        self._virar_dia(agora)
        self.trades_hoje += 1

    def registrar_resultado(self, pnl, agora=None):
        """Registra o resultado de uma venda. Retorna um aviso (texto) se disparou pausa/trava."""
        agora = time.time() if agora is None else agora
        self._virar_dia(agora)
        self.pnl_dia += pnl
        self.pnl_total += pnl
        aviso = None
        if pnl < 0:
            self.perdas_seguidas += 1
            self.esfriar_ate = max(self.esfriar_ate, agora + config.ESFRIAR_APOS_PERDA_MIN * 60)
            if self.perdas_seguidas >= config.MAX_PERDAS_SEGUIDAS:
                self.pausado_ate = max(self.pausado_ate, agora + config.PAUSA_APOS_PERDAS_MIN * 60)
                aviso = (f"{self.perdas_seguidas} perdas seguidas: pausa de "
                         f"{config.PAUSA_APOS_PERDAS_MIN} min, sem novas compras")
                self.perdas_seguidas = 0
        else:
            self.perdas_seguidas = 0
        if self.pnl_total <= -config.PERDA_MAXIMA_TOTAL_USDT:
            self._travar(f"perda total da sessão atingida ({self.pnl_total:.2f} USDT)", grave=True)
        return aviso

    # ------------------------------------------------------------- decisão
    def pode_operar(self, posicoes_abertas, agora=None):
        agora = time.time() if agora is None else agora
        self._virar_dia(agora)
        if self.travado:
            return False
        if os.path.exists(config.ARQUIVO_PARADA):
            self._travar("arquivo PARAR.txt encontrado")
            return False
        if self.pnl_dia <= -config.PERDA_MAXIMA_DIARIA_USDT:
            self._travar(f"perda diária máxima atingida ({self.pnl_dia:.2f} USDT)")
            return False
        if posicoes_abertas >= config.MAX_POSICOES_ABERTAS:
            return False
        if agora < self.pausado_ate or agora < self.esfriar_ate:
            return False
        if self.trades_hoje >= config.MAX_TRADES_POR_DIA:
            return False
        return True

    # ---------------------------------------------------------------- internos
    def _virar_dia(self, agora):
        dia = datetime.fromtimestamp(time.time() if agora is None else agora).date()
        if self._dia != dia:
            self._dia = dia
            self.pnl_dia = 0.0
            self.trades_hoje = 0

    def _travar(self, motivo, grave=False):
        self.travado = True
        self.motivo = motivo
        if grave:
            try:
                with open(config.ARQUIVO_TRAVA, "w", encoding="utf-8") as f:
                    f.write(f"{datetime.now().isoformat(timespec='seconds')} {motivo}\n"
                            "Apague este arquivo so depois de entender o que aconteceu.\n")
            except OSError:
                pass
