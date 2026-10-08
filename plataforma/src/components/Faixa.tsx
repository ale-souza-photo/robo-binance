"use client";
import { useEffect, useState } from "react";
import { lerTicker24h, urlTicker24h, variacao } from "@/core/ao-vivo";

const PARES = ["BTCBRL", "ETHBRL", "SOLBRL", "BNBBRL"];

type Item = { s: string; preco: number; v: number | null };

/** Faixa de cotações no topo (cripto, Binance 24h). Se a consulta falhar, mostra só "SIMULAÇÃO". */
export function Faixa() {
  const [itens, setItens] = useState<Item[]>([]);
  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      try {
        const r = await fetch(urlTicker24h(PARES));
        const t = lerTicker24h(await r.json());
        if (vivo && t.length) setItens(t.map((x) => ({ s: x.simbolo.replace("BRL", ""), preco: x.preco, v: variacao(x.preco, x.abertura) })));
      } catch {}
    };
    buscar();
    const id = setInterval(buscar, 15000);
    return () => { vivo = false; clearInterval(id); };
  }, []);
  const um = itens.length
    ? itens.map((i) => (
        <span className="ti" key={i.s}>
          <b>{i.s}</b>
          {i.preco.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
          {i.v != null && <span className={i.v >= 0 ? "pos" : "neg"}>{(i.v >= 0 ? "▲ " : "▼ ") + Math.abs(i.v * 100).toFixed(2).replace(".", ",") + "%"}</span>}
        </span>
      ))
    : [<span className="ti" key="x"><b>TRADER BIT</b>SIMULAÇÃO · DINHEIRO FICTÍCIO</span>];
  return (
    <div className="ticker" aria-hidden="true">
      <div className="track">{um}{um}{um}{um}</div>
    </div>
  );
}
