"""Painel gráfico do robô, versão "Wall Street" (preto e ouro).

Usa exatamente o mesmo servidor do painel.py (mesma API, mesmas travas de segurança:
só 127.0.0.1, não envia ordens, único botão = criar/apaga PARAR.txt). Só troca a página.

Uso (na MESMA pasta do main.py, em outro terminal):
    python painel_wallstreet.py            # mostra o robô que está rodando
    python painel_wallstreet.py --demo     # dados fictícios, para ver a tela
    python painel_wallstreet.py --demo --modo REAL
"""
from pathlib import Path

import painel

PASTA_SKIN = Path(__file__).resolve().parent / "painel_ws"
if (PASTA_SKIN / "index.html").exists():
    painel.PASTA_WEB = PASTA_SKIN
else:  # sem a pasta da tela, não quebra: cai no painel padrão e avisa
    print(f"Aviso: {PASTA_SKIN / 'index.html'} não encontrado; usando o painel padrão (painel/).")

if __name__ == "__main__":
    painel.principal()
