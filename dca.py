"""DCA: compra periódica (aporte fixo, sem tentar acertar o preço).

Uso (na pasta do robô):
    python dca.py                  # compra SE já for a hora do período e ainda não comprou nele
    python dca.py --status         # mostra o que já foi comprado, preço médio e resultado
    python dca.py --forcar         # compra agora, mesmo antes do dia do período (continua 1 por período)
    python dca.py --loop           # fica ligado e confere a cada 30 min (para deixar o PC ligado)
    python dca.py --real-confirmo  # OBRIGATÓRIO a cada execução no modo REAL

Modo (config.py): MODO_SIMULADO=True não envia ordem; MODO_SIMULADO=False + TESTNET=True usa dinheiro
de mentira; os dois em False = REAL.

Como o dinheiro é protegido:
- Uma compra por período (dia, semana ou mês). Rodar de novo no mesmo período não compra nada.
- Teto de gasto por mês. Valor da compra nunca passa do configurado.
- A ordem é marcada como PENDENTE antes de ser enviada. Se algo falhar no meio, o programa trava
  aquele período e pede para você conferir na Binance, em vez de arriscar comprar em dobro.
- Recusa comprar se o preço estiver estranho (diferente demais do último candle) ou abaixo do valor mínimo.
- Respeita PARAR.txt e TRAVA.txt. O modo REAL exige --real-confirmo.
- Com pouco dinheiro, não divide a compra: compra UM ativo por vez, o mais abaixo da meta (rodízio).

Cada modo tem seu próprio arquivo de estado (dca_estado_<MODO>.json) e o registro vai para dca_registro.csv.
"""
import argparse
import calendar
import csv
import json
import os
import sys
import time
from datetime import date, datetime, timedelta

import config
import scanner

FREQUENCIAS = ("diaria", "semanal", "mensal")


# --------------------------------------------------------------------- regras
def modo_atual():
    if config.MODO_SIMULADO:
        return "SIMULADO"
    return "TESTNET" if config.TESTNET else "REAL"


def validar_config():
    """Lista de problemas na configuração (vazia = tudo certo)."""
    p = []
    if not config.DCA_ATIVOS:
        p.append("DCA_ATIVOS está vazio")
    elif abs(sum(config.DCA_ATIVOS.values()) - 1.0) > 1e-6:
        p.append(f"as proporções de DCA_ATIVOS somam {sum(config.DCA_ATIVOS.values()):.2f}, e deveriam somar 1")
    if config.DCA_VALOR_POR_RODADA <= 0:
        p.append("DCA_VALOR_POR_RODADA precisa ser maior que zero")
    if config.DCA_FREQUENCIA not in FREQUENCIAS:
        p.append(f"DCA_FREQUENCIA deve ser uma de {FREQUENCIAS}")
    if config.DCA_TETO_MENSAL < config.DCA_VALOR_POR_RODADA:
        p.append("DCA_TETO_MENSAL é menor que o valor de uma compra: nunca compraria nada")
    return p


def periodo_id(dt, freq):
    if freq == "diaria":
        return dt.strftime("%Y-%m-%d")
    if freq == "semanal":
        ano, semana, _ = dt.isocalendar()
        return f"{ano}-S{semana:02d}"
    return dt.strftime("%Y-%m")


def esta_na_hora(dt, freq, dia):
    if freq == "diaria":
        return True
    if freq == "semanal":
        return dt.weekday() >= dia
    return dt.day >= dia


def escolher_ativo(pesos, ativos, valor):
    """O ativo mais abaixo da proporção-meta, contando o que vai ser gasto agora."""
    total = sum(a.get("custo", 0.0) for a in ativos.values()) + valor
    return max(pesos, key=lambda s: pesos[s] * total - ativos.get(s, {}).get("custo", 0.0))


def gasto_no_mes(estado, dt):
    mes = dt.strftime("%Y-%m")
    return sum(p["custo"] for p in estado["periodos"].values() if p.get("status") == "ok" and p.get("mes") == mes)


class DadoRuim(Exception):
    pass


# --------------------------------------------------------------------- arquivos
def caminho_estado(modo):
    return f"dca_estado_{modo}.json"


def carregar_estado(caminho, modo):
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"modo": modo, "periodos": {}, "ativos": {}}


def salvar_estado(caminho, estado):
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, indent=1)
    os.replace(tmp, caminho)


CAMPOS_LOG = ["data_hora", "evento", "ativo", "preco", "quantidade", "custo", "detalhe"]


def registrar(caminho, evento, ativo="", preco="", qtd="", custo="", detalhe=""):
    novo = not os.path.exists(caminho)
    with open(caminho, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if novo:
            w.writerow(CAMPOS_LOG)
        w.writerow([datetime.now().isoformat(timespec="seconds"), evento, ativo, preco, qtd, custo, detalhe])


# ------------------------------------------------------------------------ DCA
class Dca:
    def __init__(self, exchange, modo, arquivo_estado=None, arquivo_log="dca_registro.csv"):
        self.exchange, self.modo = exchange, modo
        self.arquivo_estado = arquivo_estado or caminho_estado(modo)
        self.arquivo_log = arquivo_log
        self.estado = carregar_estado(self.arquivo_estado, modo)

    def _resultado(self, codigo, msg, **dados):
        return {"codigo": codigo, "msg": msg, **dados}

    def rodada(self, forcar=False, agora=None):
        """Faz, no máximo, UMA compra do período. Retorna {'codigo', 'msg', ...}."""
        dt = datetime.fromtimestamp(time.time() if agora is None else agora)
        freq = config.DCA_FREQUENCIA
        pid = periodo_id(dt, freq)

        anterior = self.estado["periodos"].get(pid)
        if anterior and anterior["status"] == "ok":
            return self._resultado("JA_FEITA", f"Período {pid} já teve a compra ({anterior['ativo']}).")
        if anterior and anterior["status"] == "pendente":
            return self._resultado(
                "PENDENTE", f"O período {pid} ficou PENDENTE: uma ordem pode ter sido enviada e o resultado não foi "
                f"confirmado. Confira o histórico de ordens na Binance. Se NÃO houve compra, apague o período "
                f"'{pid}' do arquivo {self.arquivo_estado}; se houve, registre-a e deixe como está.")
        if not forcar and not esta_na_hora(dt, freq, config.DCA_DIA):
            return self._resultado("AGUARDANDO", f"Ainda não é a hora do período {pid} (a partir do dia {config.DCA_DIA}).")
        if os.path.exists(config.ARQUIVO_TRAVA) or os.path.exists(config.ARQUIVO_PARADA):
            return self._resultado("TRAVADO", f"{config.ARQUIVO_TRAVA} ou {config.ARQUIVO_PARADA} existe: nada será comprado.")

        valor = config.DCA_VALOR_POR_RODADA
        gasto = gasto_no_mes(self.estado, dt)
        if gasto + valor > config.DCA_TETO_MENSAL + 1e-9:
            return self._resultado("TETO", f"Teto mensal: já gastou {gasto:.2f} e a compra de {valor:.2f} passaria de "
                                   f"{config.DCA_TETO_MENSAL:.2f}. Nada foi comprado.")

        simbolo = escolher_ativo(config.DCA_ATIVOS, self.estado["ativos"], valor)
        try:
            minimo = ((self.exchange.market(simbolo).get("limits") or {}).get("cost") or {}).get("min") or 0.0
        except Exception:
            return self._resultado("RECUSADA", f"O par {simbolo} não existe nesta exchange/modo (a testnet, por exemplo, "
                                   "não tem pares em reais). Ajuste DCA_ATIVOS.")
        if valor < minimo:
            return self._resultado("RECUSADA", f"{simbolo}: a compra de {valor:.2f} é menor que o mínimo da Binance "
                                   f"({minimo}). Aumente DCA_VALOR_POR_RODADA.")
        try:
            preco = self._preco_confiavel(simbolo)
        except DadoRuim as erro:
            return self._resultado("DADOS", f"{simbolo}: {erro}. Nada foi comprado; tente de novo mais tarde.")

        base = simbolo.split("/")[0]
        if self.modo == "SIMULADO":
            qtd, custo, preco_med = valor / preco * (1 - config.TAXA), valor, preco
        else:
            self.estado["periodos"][pid] = {"status": "pendente", "ativo": simbolo, "custo": 0.0, "qtd": 0.0,
                                            "preco": preco, "t": int(time.time() * 1000), "mes": dt.strftime("%Y-%m")}
            salvar_estado(self.arquivo_estado, self.estado)  # marca ANTES de enviar
            try:
                resposta = self._comprar(simbolo, valor, preco)
                qtd, custo, preco_med = self._ler_ordem(resposta, preco, base)
            except Exception as erro:
                registrar(self.arquivo_log, "ERRO", simbolo, preco, "", valor, f"{type(erro).__name__}: {erro}")
                return self._resultado(
                    "ERRO", f"Falha ao comprar {simbolo}: {erro}. Não sei se a ordem foi enviada, então este período "
                    f"ficou PENDENTE e o programa não tentará de novo sozinho. Confira na Binance.")
            if qtd <= 0:
                registrar(self.arquivo_log, "ERRO", simbolo, preco, "", valor, "ordem sem quantidade preenchida")
                return self._resultado("ERRO", f"A ordem de {simbolo} voltou sem quantidade preenchida. O período ficou "
                                       "PENDENTE: confira na Binance.")

        self.estado["periodos"][pid] = {"status": "ok", "ativo": simbolo, "custo": custo, "qtd": qtd, "preco": preco_med,
                                        "t": int(time.time() * 1000), "mes": dt.strftime("%Y-%m")}
        a = self.estado["ativos"].setdefault(simbolo, {"custo": 0.0, "qtd": 0.0})
        a["custo"] += custo
        a["qtd"] += qtd
        salvar_estado(self.arquivo_estado, self.estado)
        registrar(self.arquivo_log, "COMPRA" if self.modo != "SIMULADO" else "COMPRA_SIMULADA",
                  simbolo, round(preco_med, 8), round(qtd, 8), round(custo, 4), f"período {pid}, modo {self.modo}")
        return self._resultado("COMPRA", f"Comprou {qtd:.8f} {base} por {custo:.2f} (preço {preco_med:,.2f}) [{self.modo}].",
                               ativo=simbolo, qtd=qtd, custo=custo, preco=preco_med)

    # ------------------------------------------------------------- internos
    def _preco_confiavel(self, simbolo):
        tk = self.exchange.fetch_ticker(simbolo)
        preco = tk.get("last") or tk.get("close")
        if not preco or preco <= 0:
            raise DadoRuim("preço inválido")
        velas = self.exchange.fetch_ohlcv(simbolo, "1h", limit=2)
        if velas:
            ref = velas[-1][4]
            if ref and abs(preco / ref - 1) > config.DCA_MAX_DESVIO_PRECO:
                raise DadoRuim(f"preço {preco:,.2f} difere {abs(preco / ref - 1):.1%} do último candle ({ref:,.2f})")
        return preco

    def _comprar(self, simbolo, valor, preco):
        com_custo = getattr(self.exchange, "create_market_buy_order_with_cost", None)
        if com_custo:
            return com_custo(simbolo, valor)
        qtd = float(self.exchange.amount_to_precision(simbolo, valor / preco))
        return self.exchange.create_market_buy_order(simbolo, qtd)

    @staticmethod
    def _ler_ordem(r, preco, base):
        """(quantidade líquida, custo, preço médio). A Binance cobra a taxa na moeda comprada."""
        preenchido = r.get("filled") or 0.0
        custo = r.get("cost") or preenchido * (r.get("average") or preco)
        taxas = r.get("fees") or ([r["fee"]] if r.get("fee") else [])
        liquida = preenchido - sum(f["cost"] for f in taxas if f and f.get("currency") == base and f.get("cost"))
        medio = r.get("average") or (custo / preenchido if preenchido else preco)
        return liquida, custo, medio

    # -------------------------------------------------------------- relatório
    def status(self):
        linhas = [f"DCA [{self.modo}] | {config.DCA_FREQUENCIA}, {config.DCA_VALOR_POR_RODADA:.2f} por compra, "
                  f"teto {config.DCA_TETO_MENSAL:.2f}/mês"]
        total_custo = total_valor = 0.0
        for simbolo, meta in config.DCA_ATIVOS.items():
            a = self.estado["ativos"].get(simbolo, {"custo": 0.0, "qtd": 0.0})
            try:
                atual = self.exchange.fetch_ticker(simbolo).get("last") or 0.0
            except Exception:
                atual = 0.0
            valor = a["qtd"] * atual
            medio = a["custo"] / a["qtd"] if a["qtd"] else 0.0
            res = f"{100 * (valor / a['custo'] - 1):+.1f}%" if a["custo"] and atual else "—"
            linhas.append(f"  {simbolo:10} meta {meta:.0%} | quantidade {a['qtd']:.8f} | investido {a['custo']:.2f} | "
                          f"preço médio {medio:,.2f} | agora {atual:,.2f} | valor {valor:.2f} | resultado {res}")
            total_custo += a["custo"]
            total_valor += valor
        if total_custo:
            linhas.append(f"  TOTAL investido {total_custo:.2f} | valor atual {total_valor:.2f} | "
                          f"resultado {100 * (total_valor / total_custo - 1):+.1f}%")
        compras = sorted(self.estado["periodos"].items())[-5:]
        if compras:
            linhas.append("  últimas compras: " + " | ".join(f"{k}: {v['ativo']} {v['custo']:.2f} ({v['status']})" for k, v in compras))
        return "\n".join(linhas)


# ------------------------------------------------------------- dados do painel
def proxima_data(dt, freq, dia, estado):
    """Quando acontece (ou aconteceu) a próxima compra. Retorna (data, situacao).
    situacao: 'pode_agora' (já é a hora e ainda não comprou), 'aguardando' (ainda não chegou o dia),
    'feita' (o período atual já teve a compra; a data é a do próximo período)."""
    hoje = dt.date()
    pid = periodo_id(dt, freq)
    feita = estado["periodos"].get(pid, {}).get("status") in ("ok", "pendente")

    def dia_do_mes(ano, mes):
        return date(ano, mes, min(max(int(dia), 1), calendar.monthrange(ano, mes)[1]))

    if not feita:
        if esta_na_hora(dt, freq, dia):
            return hoje, "pode_agora"
        if freq == "mensal":
            return dia_do_mes(hoje.year, hoje.month), "aguardando"
        return hoje + timedelta(days=int(dia) - hoje.weekday()), "aguardando"  # semanal
    if freq == "diaria":
        return hoje + timedelta(days=1), "feita"
    if freq == "semanal":
        segunda = hoje - timedelta(days=hoje.weekday()) + timedelta(days=7)
        return segunda + timedelta(days=int(dia)), "feita"
    ano, mes = (hoje.year + 1, 1) if hoje.month == 12 else (hoje.year, hoje.month + 1)
    return dia_do_mes(ano, mes), "feita"


def dados_painel(estado, modo, precos, agora=None):
    """Tudo o que a tela do DCA mostra, em um dicionário simples (sem acesso à rede)."""
    dt = datetime.fromtimestamp(time.time() if agora is None else agora)
    freq = config.DCA_FREQUENCIA
    pesos = config.DCA_ATIVOS
    moeda = next(iter(pesos)).split("/")[1] if pesos else ""
    total_custo = sum(a.get("custo", 0.0) for a in estado["ativos"].values())
    ativos, total_valor = [], 0.0
    for simbolo, meta in pesos.items():
        a = estado["ativos"].get(simbolo, {"custo": 0.0, "qtd": 0.0})
        preco = precos.get(simbolo)
        valor = a["qtd"] * preco if preco else None
        total_valor += valor or 0.0
        ativos.append({"simbolo": simbolo, "meta": meta, "qtd": a["qtd"], "custo": a["custo"],
                       "medio": a["custo"] / a["qtd"] if a["qtd"] else None, "preco": preco, "valor": valor,
                       "resultado_pct": 100 * (valor / a["custo"] - 1) if (valor is not None and a["custo"]) else None,
                       "peso_real": a["custo"] / total_custo if total_custo else 0.0})
    pid = periodo_id(dt, freq)
    atual = estado["periodos"].get(pid)
    data, situacao = proxima_data(dt, freq, config.DCA_DIA, estado)
    compras = sorted(({"periodo": k, **v} for k, v in estado["periodos"].items()), key=lambda x: x.get("t", 0))
    alerta = None
    if any(c.get("status") == "pendente" for c in compras):
        alerta = ("Há uma compra PENDENTE: uma ordem pode ter sido enviada sem confirmação. Confira o histórico "
                  "de ordens na Binance antes de rodar o DCA de novo.")
    return {
        "modo": modo, "moeda": moeda,
        "config": {"frequencia": freq, "dia": config.DCA_DIA, "valor": config.DCA_VALOR_POR_RODADA,
                   "teto": config.DCA_TETO_MENSAL, "ativos": pesos},
        "ativos": ativos,
        "total": {"custo": total_custo, "valor": total_valor if any(x["preco"] for x in ativos) else None,
                  "resultado_pct": (100 * (total_valor / total_custo - 1)
                                    if total_custo and any(x["preco"] for x in ativos) else None)},
        "periodo": {"id": pid, "status": (atual or {}).get("status"), "ativo": (atual or {}).get("ativo")},
        "proxima": {"data": data.isoformat(), "dias": (data - dt.date()).days, "situacao": situacao,
                    "ativo_sugerido": escolher_ativo(pesos, estado["ativos"], config.DCA_VALOR_POR_RODADA) if pesos else None},
        "mes": {"gasto": gasto_no_mes(estado, dt), "teto": config.DCA_TETO_MENSAL},
        "compras": compras[-12:], "alerta": alerta,
    }


# ------------------------------------------------------------------ programa
def exigir_confirmacao_real(modo, argv):
    """No modo REAL, só segue com --real-confirmo. Retorna mensagem de erro ou None."""
    if modo == "REAL" and "--real-confirmo" not in argv:
        return ("Modo REAL: dinheiro de verdade. Para confirmar que é isso mesmo, rode com --real-confirmo "
                "(a cada execução). Para testar sem risco, use MODO_SIMULADO = True ou TESTNET = True.")
    return None


def principal(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    p = argparse.ArgumentParser(description="Compra periódica (DCA)")
    p.add_argument("--status", action="store_true")
    p.add_argument("--forcar", action="store_true", help="compra agora, mesmo antes do dia do período")
    p.add_argument("--loop", action="store_true", help="fica ligado e confere a cada 30 min")
    p.add_argument("--real-confirmo", action="store_true", help="obrigatório no modo REAL")
    a = p.parse_args(argv)

    problemas = validar_config()
    if problemas:
        raise SystemExit("Configuração do DCA com problema:\n  - " + "\n  - ".join(problemas))
    modo = modo_atual()
    erro = exigir_confirmacao_real(modo, argv)
    if erro:
        raise SystemExit(erro)
    if modo != "SIMULADO" and not (config.API_KEY and config.API_SECRET):
        nome = "BINANCE_TESTNET_API_KEY/SECRET" if config.TESTNET else "BINANCE_API_KEY/SECRET"
        raise SystemExit(f"Modo {modo} precisa das variáveis de ambiente {nome}.")

    exchange = scanner.criar_exchange("" if modo == "SIMULADO" else config.API_KEY,
                                      "" if modo == "SIMULADO" else config.API_SECRET, testnet=(modo == "TESTNET"))
    exchange.load_markets()
    dca = Dca(exchange, modo)

    if a.status:
        print(dca.status())
        return
    ultimo = None
    while True:
        r = dca.rodada(forcar=a.forcar)
        if r["codigo"] != ultimo or not a.loop:
            print(f"[{r['codigo']}] {r['msg']}")
        ultimo = r["codigo"]
        if not a.loop:
            break
        time.sleep(1800)


if __name__ == "__main__":
    principal()
