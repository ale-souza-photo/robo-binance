"""Regras da Binance para o símbolo: valor mínimo e casas decimais.

A Binance rejeita ordens com quantidade/preço fora do passo permitido
(LOT_SIZE, PRICE_FILTER) ou de valor abaixo do mínimo (MIN_NOTIONAL).
Aqui usamos os filtros que o ccxt lê da própria Binance (load_markets).
"""


class RegrasBinance:
    def __init__(self, exchange, simbolo):
        self.exchange = exchange
        self.simbolo = simbolo
        if not getattr(exchange, "markets", None):
            exchange.load_markets()
        m = exchange.market(simbolo)
        limites = m.get("limits", {})
        self.qtd_min = (limites.get("amount") or {}).get("min") or 0.0
        self.valor_min = (limites.get("cost") or {}).get("min") or 0.0

    def quantidade(self, qtd):
        """Corta (nunca arredonda p/ cima) a quantidade para o passo permitido."""
        return float(self.exchange.amount_to_precision(self.simbolo, qtd))

    def preco(self, p):
        return float(self.exchange.price_to_precision(self.simbolo, p))

    def validar(self, qtd, preco):
        """Retorna None se a ordem é aceita, ou o motivo da recusa."""
        if qtd <= 0 or qtd < self.qtd_min:
            return f"quantidade {qtd} abaixo do mínimo {self.qtd_min}"
        valor = qtd * preco
        if valor < self.valor_min:
            return f"valor {valor:.4f} USDT abaixo do mínimo da Binance ({self.valor_min} USDT)"
        return None

    def resumo(self):
        return (f"{self.simbolo}: qtd mín {self.qtd_min}, valor mín {self.valor_min} USDT")
