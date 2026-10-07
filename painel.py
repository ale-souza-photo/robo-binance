"""Painel gráfico do robô: abre no navegador, atualiza sozinho.

Uso (na MESMA pasta do main.py, em outro terminal):
    python painel.py                 # mostra o robô que está rodando
    python painel.py --demo          # dados fictícios, para ver a tela sem o robô
    python painel.py --demo --modo REAL     # pré-visualiza o visual do modo real

Só usa a biblioteca padrão do Python. Segurança:
- Escuta APENAS em 127.0.0.1 (nada de rede/Wi-Fi) e recusa outros nomes de host.
- Não envia ordens e não vê suas chaves. O único botão de ação cria/apaga o PARAR.txt.
"""
import argparse
import csv
import json
import os
import random
import threading
import time
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import config

PASTA_WEB = Path(__file__).resolve().parent / "painel"
HOSTS_OK = {"127.0.0.1", "localhost"}


# ------------------------------------------------------------- dados reais
def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


_cache = {"chave": None, "linhas": []}


def ler_registro():
    """Lê registro.csv (com cache por tamanho/data). Retorna lista de eventos."""
    try:
        st = os.stat(config.ARQUIVO_LOG)
    except OSError:
        return []
    chave = (st.st_mtime_ns, st.st_size)
    if _cache["chave"] == chave:
        return _cache["linhas"]
    linhas = []
    try:
        with open(config.ARQUIVO_LOG, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                try:
                    t = int(datetime.fromisoformat(r["data_hora"]).timestamp() * 1000)
                except (KeyError, ValueError):
                    continue
                linhas.append({"t": t, "evento": r.get("evento", ""), "preco": _num(r.get("preco")),
                               "quantidade": _num(r.get("quantidade")), "pnl": _num(r.get("pnl")),
                               "detalhe": r.get("detalhe", "")})
    except OSError:
        return _cache["linhas"]
    _cache.update(chave=chave, linhas=linhas)
    return linhas


def resumir(eventos):
    vendas = [e["pnl"] for e in eventos if e["evento"] == "VENDA" and e["pnl"] is not None]
    ganhos = sum(x for x in vendas if x > 0)
    perdas = -sum(x for x in vendas if x <= 0)
    curva, acum = [], 0.0
    for x in vendas:
        acum += x
        curva.append(round(acum, 4))
    return {"trades": len(vendas), "vitorias": sum(1 for x in vendas if x > 0),
            "pnl_total": round(sum(vendas), 4),
            "fator": round(ganhos / perdas, 2) if perdas > 0 else None, "curva": curva[-200:]}


def carregar_estado():
    try:
        with open(config.ARQUIVO_ESTADO, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def montar_resposta(demo=None):
    agora = int(time.time() * 1000)
    if demo:
        estado, eventos = demo.passo()
    else:
        estado, eventos = carregar_estado(), ler_registro()
    limite = max(120_000, (estado or {}).get("intervalo", 30) * 4000)
    return {"agora": agora, "demo": bool(demo), "estado": estado,
            "vivo": bool(estado) and agora - estado.get("atualizado", 0) < limite,
            "parar_ativo": os.path.exists(config.ARQUIVO_PARADA),
            "eventos": eventos[-80:], "resumo": resumir(eventos)}


# --------------------------------------------------------------------- demo
class Demo:
    """Gera um robô fictício (preço aleatório, cruzamentos, compras e vendas)."""
    STOP, ALVO = 0.004, 0.006  # apertados de propósito, para a demo andar rápido

    def __init__(self, modo):
        self.modo, self.lock = modo, threading.Lock()
        self.rnd = random.Random(7)
        self.preco = 67000.0
        agora = int(time.time() * 1000)
        self.candles = []
        for i in range(100):
            self.preco *= 1 + self.rnd.gauss(0, 0.0007)
            self.candles.append([agora - (100 - i) * 2000, self.preco])
        self.eventos, self.pnl_dia, self.posicao, self.parado = [], 0.0, None, False
        self._historico_falso(agora)
        self.posicao = self._nova_posicao(self.preco * 0.9985)
        self.eventos.append(self._ev(agora - 4000, "COMPRA", self.posicao["preco"],
                                     self.posicao["quantidade"], None, "média rápida cruzou para cima"))

    def _ev(self, t, evento, preco=None, qtd=None, pnl=None, detalhe=""):
        return {"t": t, "evento": evento, "preco": preco, "quantidade": qtd, "pnl": pnl, "detalhe": detalhe}

    def _nova_posicao(self, preco):
        return {"preco": preco, "quantidade": round(10 / preco, 5),
                "stop": round(preco * (1 - self.STOP), 2), "alvo": round(preco * (1 + self.ALVO), 2)}

    def _historico_falso(self, agora):
        self.eventos += [self._ev(agora - 3_600_000, "INICIO", detalhe=f"modo {self.modo}"),
                         self._ev(agora - 3_599_000, "REGRAS", detalhe="BTC/USDT: qtd mín 1e-05, valor mín 5.0 USDT")]
        t = agora - 3_400_000
        for ganhou in (True, False, True, True, False, True, False):
            preco = 66500 + self.rnd.random() * 900
            qtd = round(10 / preco, 5)
            pnl = round((0.0035 if ganhou else -0.0045) * 10 + self.rnd.gauss(0, 0.004), 4)
            self.eventos.append(self._ev(t, "COMPRA", preco, qtd, None, "média rápida cruzou para cima"))
            self.eventos.append(self._ev(t + 240_000, "VENDA", preco, qtd, pnl, "alvo" if ganhou else "stop"))
            self.pnl_dia += pnl
            t += 420_000

    def passo(self):
        with self.lock:
            agora = int(time.time() * 1000)
            if not self.parado:
                self.preco *= 1 + self.rnd.gauss(0.00005, 0.0008)
                self.candles = self.candles[-99:] + [[agora, self.preco]]
                self._decidir(agora)
            fechos = [c[1] for c in self.candles]
            sinal, motivo = ("COMPRA", "média rápida cruzou para cima") if self._cruzou(fechos) \
                else ("NADA", "sem cruzamento")
            estado = {"modo": self.modo, "simbolo": "BTC/USDT", "timeframe": "demo", "intervalo": 2,
                      "valor_por_ordem": 10.0, "taxa": config.TAXA, "perda_max": config.PERDA_MAXIMA_DIARIA_USDT,
                      "pnl_dia": round(self.pnl_dia, 4), "preco": self.preco, "candles": self.candles,
                      "posicao": self.posicao, "sinal": sinal, "motivo": motivo, "parado": self.parado,
                      "motivo_parada": "perda diária máxima atingida" if self.parado else "",
                      "erro": None, "atualizado": agora}
            return estado, list(self.eventos)

    @staticmethod
    def _sma(v, n):
        return sum(v[-n:]) / n

    def _cruzou(self, f):
        return (len(f) > 22 and self._sma(f[:-1], 9) <= self._sma(f[:-1], 21)
                and self._sma(f, 9) > self._sma(f, 21))

    def _decidir(self, agora):
        f = [c[1] for c in self.candles]
        p = self.posicao
        if p and (self.preco <= p["stop"] or self.preco >= p["alvo"]):
            pnl = round((self.preco - p["preco"]) * p["quantidade"]
                        - 2 * config.TAXA * p["preco"] * p["quantidade"], 4)
            self.pnl_dia += pnl
            self.eventos.append(self._ev(agora, "VENDA", self.preco, p["quantidade"], pnl,
                                         "stop" if self.preco <= p["stop"] else "alvo"))
            self.posicao = None
            if self.pnl_dia <= -config.PERDA_MAXIMA_DIARIA_USDT:
                self.parado = True
                self.eventos.append(self._ev(agora, "PARADO", detalhe="perda diária máxima atingida"))
        elif not p and self._cruzou(f):
            self.posicao = self._nova_posicao(self.preco)
            self.eventos.append(self._ev(agora, "COMPRA", self.preco, self.posicao["quantidade"], None,
                                         "média rápida cruzou para cima"))


# ------------------------------------------------------------------ servidor
def criar_handler(demo):
    class H(BaseHTTPRequestHandler):
        server_version = "PainelTrader"

        def log_message(self, *a):  # silencioso
            pass

        def _host_ok(self):
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
            return host in HOSTS_OK

        def _enviar(self, codigo, corpo=b"", tipo="application/json; charset=utf-8"):
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(corpo)

        def do_GET(self):
            if not self._host_ok():
                return self._enviar(403)
            if self.path.split("?")[0] == "/api/estado":
                return self._enviar(200, json.dumps(montar_resposta(demo), allow_nan=False).encode())
            if self.path.split("?")[0] in ("/", "/index.html"):
                try:
                    return self._enviar(200, (PASTA_WEB / "index.html").read_bytes(), "text/html; charset=utf-8")
                except OSError:
                    return self._enviar(500, "painel/index.html não encontrado".encode(), "text/plain; charset=utf-8")
            self._enviar(204 if self.path == "/favicon.ico" else 404)

        def do_POST(self):
            # O cabeçalho personalizado impede que outro site dispare o botão às escondidas.
            if not self._host_ok() or self.headers.get("X-Painel") != "1":
                return self._enviar(403)
            caminho = self.path.split("?")[0]
            if caminho == "/api/parar":
                if demo:
                    with demo.lock:
                        demo.parado = True
                else:
                    Path(config.ARQUIVO_PARADA).write_text("parado pelo painel\n", encoding="utf-8")
            elif caminho == "/api/retomar":
                if demo:
                    with demo.lock:
                        demo.parado, demo.pnl_dia = False, 0.0
                else:
                    try:
                        os.remove(config.ARQUIVO_PARADA)
                    except OSError:
                        pass
            else:
                return self._enviar(404)
            self._enviar(200, b'{"ok":true}')

    return H


def principal():
    p = argparse.ArgumentParser(description="Painel gráfico do robô")
    p.add_argument("--porta", type=int, default=8765)
    p.add_argument("--demo", action="store_true", help="dados fictícios, sem o robô")
    p.add_argument("--modo", default="TESTNET", choices=["SIMULADO", "TESTNET", "REAL"],
                   help="só para --demo: modo exibido")
    p.add_argument("--sem-navegador", action="store_true")
    a = p.parse_args()

    demo = Demo(a.modo) if a.demo else None
    try:
        servidor = ThreadingHTTPServer(("127.0.0.1", a.porta), criar_handler(demo))
    except OSError:
        raise SystemExit(f"A porta {a.porta} já está em uso. Feche o outro painel ou use --porta 8766.")
    url = f"http://localhost:{a.porta}"
    print(f"Painel no ar: {url}   (Ctrl+C para fechar)" + ("  [DEMONSTRAÇÃO]" if demo else ""))
    if not a.sem_navegador:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nPainel fechado.")


if __name__ == "__main__":
    principal()
