"""Kill switch: decide se o robô pode continuar operando."""
import os
import config


class KillSwitch:
    def __init__(self):
        self.pnl_dia = 0.0
        self.travado = False
        self.motivo = ""

    def registrar_resultado(self, pnl):
        self.pnl_dia += pnl

    def pode_operar(self, posicoes_abertas):
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
        return True

    def _travar(self, motivo):
        self.travado = True
        self.motivo = motivo
