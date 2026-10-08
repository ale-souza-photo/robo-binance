"""Bloco 3 - Executor: envia ordens à Binance (ou simula).

Com MODO_SIMULADO = True nenhuma ordem real é enviada.
"""
import config


class Executor:
    def __init__(self, exchange, regras=None):
        self.exchange = exchange
        self.regras = regras

    def comprar(self, ordem):
        if config.MODO_SIMULADO:
            return {"id": "SIMULADO", "preco": ordem["preco"], "quantidade": ordem["quantidade"]}
        r = self.exchange.create_market_buy_order(config.SIMBOLO, ordem["quantidade"])
        preco = r.get("average") or r.get("price") or ordem["preco"]
        return {"id": r["id"], "preco": preco, "quantidade": self._quantidade_liquida(r, ordem)}

    def _quantidade_liquida(self, resposta, ordem):
        """A Binance desconta a taxa da própria moeda comprada (ex.: BTC).
        Se vendermos a quantidade cheia, falta saldo. Usa o que realmente sobrou."""
        qtd = resposta.get("filled") or ordem["quantidade"]
        base = config.SIMBOLO.split("/")[0]
        taxas = [resposta.get("fee")] + list(resposta.get("fees") or [])
        for f in taxas:
            if f and f.get("currency") == base and f.get("cost"):
                qtd -= f["cost"]
                break  # 'fee' e 'fees' repetem a mesma taxa; conta uma vez
        return self.regras.quantidade(qtd) if self.regras else qtd

    def vender(self, quantidade, preco_atual):
        if config.MODO_SIMULADO:
            return {"id": "SIMULADO", "preco": preco_atual}
        r = self.exchange.create_market_sell_order(config.SIMBOLO, quantidade)
        preco = r.get("average") or r.get("price") or preco_atual
        return {"id": r["id"], "preco": preco}
