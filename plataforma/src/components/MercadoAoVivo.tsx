"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { caminhoLinha, idadeTexto, lerMensagem, lerTicker24h, urlStream, urlTicker24h, variacao } from "@/core/ao-vivo";
import { avaliar, type Estado } from "@/core/paper";
import { dataBr, nf, pct, reais } from "@/lib/format";

export type ItemMercado = {
  id: string;
  nome: string;
  /** ws = cripto em tempo real; brapi = bolsa com atraso; estatico = só o último fechamento (ex.: dólar) */
  modo: "ws" | "brapi" | "estatico";
  simbolo: string | null;
  fechamento: number | null;
  fechamentoData: string | null;
  historico: number[];
};
export type ContaMercado = {
  nome: string;
  caixa: number;
  aportado: number;
  posicoes: { ativoId: string; quantidade: number; custoTotal: number }[];
} | null;

type Preco = { preco: number; abertura: number | null; em: number; hora?: string | null };
type Status = "conectando" | "ao vivo" | "reserva" | "offline";

const BRAPI_MS = 5 * 60_000;
const RESERVA_MS = 5_000;

export default function MercadoAoVivo({ itens, conta }: { itens: ItemMercado[]; conta: ContaMercado }) {
  const [precos, setPrecos] = useState<Record<string, Preco>>({});
  const [status, setStatus] = useState<Status>("conectando");
  const [erroBolsa, setErroBolsa] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const ws = useMemo(() => itens.filter((i) => i.modo === "ws" && i.simbolo), [itens]);
  const bolsa = useMemo(() => itens.filter((i) => i.modo === "brapi"), [itens]);
  const porSimbolo = useMemo(() => Object.fromEntries(ws.map((i) => [i.simbolo as string, i.id])), [ws]);
  const chaveWs = ws.map((i) => i.simbolo).join(",");
  const chaveBolsa = bolsa.map((i) => i.id).join(",");

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- cripto: WebSocket da Binance (e, se não conectar, consulta a cada 5 s) ----
  useEffect(() => {
    if (!chaveWs) {
      setStatus("offline");
      return;
    }
    const simbolos = chaveWs.split(",");
    let fechado = false;
    let socket: WebSocket | null = null;
    let tentativas = 0;
    let recebeu = false;
    let timerReconexao: ReturnType<typeof setTimeout> | undefined;
    let timerReserva: ReturnType<typeof setInterval> | undefined;

    const aplicar = (ticks: { simbolo: string; preco: number; abertura: number | null }[]) => {
      const agoraMs = Date.now();
      setPrecos((p) => {
        const n = { ...p };
        for (const t of ticks) {
          const id = porSimbolo[t.simbolo];
          if (id) n[id] = { preco: t.preco, abertura: t.abertura ?? p[id]?.abertura ?? null, em: agoraMs };
        }
        return n;
      });
    };

    const pararReserva = () => {
      if (timerReserva) clearInterval(timerReserva);
      timerReserva = undefined;
    };
    const iniciarReserva = () => {
      if (timerReserva || fechado) return;
      const buscar = async () => {
        try {
          const r = await fetch(urlTicker24h(simbolos));
          if (!r.ok) throw new Error(String(r.status));
          const ticks = lerTicker24h(await r.json());
          if (!ticks.length) throw new Error("vazio");
          aplicar(ticks);
          setStatus((s) => (s === "ao vivo" ? s : "reserva"));
        } catch {
          setStatus("offline");
        }
      };
      void buscar();
      timerReserva = setInterval(buscar, RESERVA_MS);
    };

    const conectar = () => {
      if (fechado) return;
      try {
        socket = new WebSocket(urlStream(simbolos));
      } catch {
        tentativas += 1;
        iniciarReserva();
        return;
      }
      socket.onmessage = (ev) => {
        try {
          const t = lerMensagem(JSON.parse(String(ev.data)));
          if (!t) return;
          if (!recebeu) {
            recebeu = true;
            tentativas = 0;
            pararReserva();
            setStatus("ao vivo");
          }
          aplicar([t]);
        } catch {
          /* mensagem ilegível: ignora */
        }
      };
      socket.onclose = () => {
        if (fechado) return;
        recebeu = false;
        tentativas += 1;
        if (tentativas >= 3) iniciarReserva();
        else setStatus("conectando");
        timerReconexao = setTimeout(conectar, Math.min(15_000, 1000 * 2 ** tentativas));
      };
      socket.onerror = () => socket?.close();
    };

    conectar();
    return () => {
      fechado = true;
      if (timerReconexao) clearTimeout(timerReconexao);
      pararReserva();
      socket?.close();
    };
  }, [chaveWs, porSimbolo]);

  // ---- bolsa: cotação com atraso, buscada pelo servidor (cache de 5 min) ----
  useEffect(() => {
    if (!chaveBolsa) return;
    let fechado = false;
    const buscar = async () => {
      try {
        const r = await fetch(`/api/cotacao?t=${chaveBolsa}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { cotacoes: { id: string; ok: boolean; preco?: number; hora?: string | null; buscadoEm?: string; erro?: string }[] };
        if (fechado) return;
        const erros = j.cotacoes.filter((c) => !c.ok).map((c) => `${c.id}: ${c.erro}`);
        setErroBolsa(erros.length ? erros.join(" | ") : null);
        setPrecos((p) => {
          const n = { ...p };
          for (const c of j.cotacoes) if (c.ok && c.preco) n[c.id] = { preco: c.preco, abertura: null, em: Date.parse(c.buscadoEm ?? "") || Date.now(), hora: c.hora };
          return n;
        });
      } catch (e) {
        if (!fechado) setErroBolsa(e instanceof Error ? e.message : "falha ao buscar as cotações da bolsa");
      }
    };
    void buscar();
    const t = setInterval(buscar, BRAPI_MS);
    return () => {
      fechado = true;
      clearInterval(t);
    };
  }, [chaveBolsa]);

  // ---- patrimônio da conta de teste, recalculado a cada preço novo ----
  const aval = useMemo(() => {
    if (!conta) return null;
    const est: Estado = {
      caixa: conta.caixa, aportado: conta.aportado, taxasPagas: 0,
      posicoes: Object.fromEntries(conta.posicoes.map((p) => [p.ativoId, { ativoId: p.ativoId, quantidade: p.quantidade, custoTotal: p.custoTotal, precoMedio: p.quantidade > 0 ? p.custoTotal / p.quantidade : 0 }])),
    };
    const mapa: Record<string, number | null> = {};
    for (const i of itens) mapa[i.id] = precos[i.id]?.preco ?? i.fechamento;
    return avaliar(est, mapa);
  }, [conta, itens, precos]);

  const rotulo: Record<Status, string> = { conectando: "CONECTANDO…", "ao vivo": "AO VIVO", reserva: "ATUALIZA A CADA 5 s", offline: "SEM CONEXÃO" };

  return (
    <>
      <div className="linha" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className={`chip ${status === "ao vivo" ? "ok" : status === "offline" ? "erro" : "parcial"}`}>
          <span className={status === "ao vivo" ? "pulso" : ""}>●</span> CRIPTO: {rotulo[status]}
        </span>
        {erroBolsa && <span className="chip parcial" title={erroBolsa}>BOLSA: cotação indisponível, mostrando o último fechamento</span>}
      </div>

      {aval && conta && (
        <div className="kpis">
          <div className="kpi"><span>PATRIMÔNIO · {conta.nome.toUpperCase()}</span><b>{reais(aval.patrimonio, 2)}</b></div>
          <div className="kpi"><span>CAIXA</span><b>{reais(aval.caixa, 2)}</b></div>
          <div className="kpi"><span>EM POSIÇÕES</span><b>{reais(aval.valorPosicoes, 2)}</b></div>
          <div className="kpi"><span>RESULTADO</span><b className={aval.resultado >= 0 ? "pos" : "neg"}>{reais(aval.resultado, 2)} <small>{pct(aval.retorno)}</small></b></div>
        </div>
      )}

      <div className="tiles">
        {itens.map((i) => (
          <Tile key={i.id} item={i} preco={precos[i.id]} agora={agora} />
        ))}
      </div>
      <p className="sub">
        Cripto: preço em tempo real direto da Binance (última negociação; variação em 24 h). Bolsa: cotação com atraso de cerca de 30 min, atualizada a cada 5 min;
        fora do pregão vale o último preço. Dólar: último fechamento do Banco Central. Nada aqui é recomendação de investimento.
      </p>
    </>
  );
}

function Tile({ item, preco, agora }: { item: ItemMercado; preco: Preco | undefined; agora: number }) {
  const atual = preco?.preco ?? item.fechamento;
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const anterior = useRef<number | null>(null);

  useEffect(() => {
    const ant = anterior.current;
    anterior.current = atual ?? null;
    if (ant == null || atual == null || ant === atual) return;
    setFlash(atual > ant ? "up" : "down");
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [atual]);

  const serie = atual != null ? [...item.historico, atual] : item.historico;
  const sobe = serie.length > 1 ? serie[serie.length - 1] >= serie[0] : true;
  const v24 = preco ? variacao(preco.preco, preco.abertura) : null;
  const caminho = caminhoLinha(serie, 140, 40);

  let rodape: string;
  if (item.modo === "ws") rodape = preco ? `Binance · ${idadeTexto(agora - preco.em)}` : item.fechamentoData ? `Último fechamento ${dataBr(item.fechamentoData)}` : "aguardando…";
  else if (item.modo === "brapi") rodape = preco ? `Atraso ~30 min · buscado ${idadeTexto(agora - preco.em)}` : item.fechamentoData ? `Fechamento ${dataBr(item.fechamentoData)}` : "sem preço";
  else rodape = item.fechamentoData ? `Fechamento ${dataBr(item.fechamentoData)}` : "sem preço";

  return (
    <div className={`tile ${flash ? `flash-${flash}` : ""}`}>
      <div className="tile-topo">
        <b>{item.id}</b>
        <span className="mut">{item.nome}</span>
      </div>
      <div className="tile-preco">{atual == null ? "—" : reais(atual, atual < 10 ? 4 : 2)}</div>
      <div className="tile-linha">
        {v24 != null ? <span className={v24 >= 0 ? "pos" : "neg"}>{pct(v24, 2)} <small className="mut">24 h</small></span> : <span className="mut">{item.historico.length ? `${nf(item.historico.length, 0)} dias de histórico` : ""}</span>}
      </div>
      <svg viewBox="0 0 140 40" className="spark" aria-hidden="true">
        {caminho && <path d={caminho} fill="none" stroke={sobe ? "var(--up)" : "var(--down)"} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
      <div className="tile-rodape mut">{rodape}</div>
    </div>
  );
}
