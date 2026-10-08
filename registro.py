"""Registro: guarda cada decisão e resultado em CSV."""
import csv
import os
from datetime import datetime
import config

CAMPOS = ["data_hora", "evento", "preco", "quantidade", "pnl", "detalhe"]


def registrar(evento, preco="", quantidade="", pnl="", detalhe=""):
    novo = not os.path.exists(config.ARQUIVO_LOG)
    with open(config.ARQUIVO_LOG, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if novo:
            w.writerow(CAMPOS)
        w.writerow([datetime.now().isoformat(timespec="seconds"),
                    evento, preco, quantidade, pnl, detalhe])
    print(f"[{evento}] {detalhe} {preco}")
