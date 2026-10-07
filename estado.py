"""Estado ao vivo do robô, lido pelo painel (painel.py).

O main.py grava um instantâneo em estado.json a cada ciclo. A escrita é atômica
(arquivo temporário + troca) e NUNCA pode derrubar o robô: se falhar, ignora e
tenta de novo no próximo ciclo.
"""
import json
import os
import time

import config


def salvar(**campos):
    campos["atualizado"] = int(time.time() * 1000)
    tmp = config.ARQUIVO_ESTADO + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(campos, f)
        os.replace(tmp, config.ARQUIVO_ESTADO)
    except OSError:
        pass  # ex.: Windows com o arquivo aberto pelo painel; o próximo ciclo regrava
