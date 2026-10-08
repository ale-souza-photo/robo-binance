# Plataforma Trader Bit: plano

Plataforma web **de testes de investimento** (depois, real). Uma tela só, online, para o dono (um usuário),
com tudo que construímos no laboratório em Python: saldo fictício, ativos escolhidos por ele, análises
automáticas 2x ao dia, protocolos e modelos testados, indicações com a evidência ao lado e visão do mercado.

## Decisões já tomadas (conversa com o dono)
| Tema | Decisão |
|---|---|
| Integração com o Rockefeller | **App separado com link** (projeto próprio na Vercel; o Rockefeller aponta para ele) |
| Quem usa | **Só o dono** (login único, cadastro aberto desligado) |
| Cotações da bolsa brasileira (BDRs, ações, ETFs) | **brapi.dev** com token gratuito guardado no servidor |
| Hospedagem | **Vercel** (Next.js) + **Supabase** (banco e login) + tarefas agendadas da Vercel (cron) |
| Linguagem da plataforma | **TypeScript**. As contas validadas em Python são portadas e conferidas por testes de paridade |
| Dinheiro real | **Fora do escopo até a fase 8**, e só depois de tudo validado |

## Verdades que desenham o produto
1. **Tempo real só é grátis para cripto** (WebSocket da Binance direto no navegador). Bolsa brasileira gratuita tem atraso
   (~15 min). A tela sempre mostra a idade do dado.
2. **Indicações = sinais de regras com a evidência ao lado** (backtest, robustez, desempenho no paper) e selo
   "sem vantagem comprovada" quando for o caso. Nunca "compre agora". Nossos testes mostraram que as estratégias de
   trade testadas não superaram comprar e segurar. Se um dia isto for mostrado a terceiros, consultar advogado (CVM).
3. **Servidor fora dos EUA** (a Binance costuma recusar IPs de lá) e uso do endereço de dados públicos
   `data-api.binance.vision`. Funções na região de São Paulo (`gru1`).
4. **Cron:** duas tarefas diárias (manhã e tarde) cobrem "2x ao dia". Os limites do plano da Vercel precisam ser
   confirmados na conta antes de depender disso. O endpoint também pode ser disparado à mão.

## Arquitetura
```
Navegador ──► Next.js (Vercel, gru1) ──► Supabase (Postgres + Auth, RLS)
                 │  ▲
   Vercel Cron ──┘  └── fontes públicas: Binance (cripto), Banco Central (dólar, CDI), brapi (B3/BDR)
```
- `src/core/`: o motor puro (sem rede, sem banco): alinhar séries, estatísticas, correlação, TIR, simulação de DCA,
  leitura rápida. Testado contra o Python (`tests/paridade.test.ts`).
- `src/dados/`: leitores das fontes (URL + parser + paginação). A rede é injetada, então os testes não precisam dela.
- `src/lib/`: Supabase (cliente de navegador, de servidor e de serviço), configuração, formatação.
- `src/app/`: telas e rotas. `proxy.ts` protege tudo menos `/login`.
- `supabase/migrations/`: esquema do banco com RLS (cada linha pertence a um usuário).

## Fases (cada uma é utilizável)
1. **Base**: projeto, login (e-mail e senha), banco, visual Wall Street. ✅
2. **Dados**: ingestão de cripto, dólar, CDI e bolsa; tela para adicionar/remover ativos (inclui BDR). ✅ (histórico da bolsa via Yahoo: o plano grátis da brapi só dá 3 meses)
3. **Análises automáticas** 2x ao dia: o motor roda, grava no banco e mostra "o que mudou desde a última". ✅ botão manual; o cron depende da chave de serviço correta
4. **Paper trading**: contas de saldo fictício, ordens simuladas com taxa e slippage, posições, resultado, DCA simulado e travas. ✅ (aba CARTEIRA)
5. **Mercado ao vivo**: preços em tempo real (cripto), gráficos, lista de acompanhamento, alertas.
6. **Sinais e protocolos**: regras testadas com selo de evidência (e o robô de teste ao vivo em simulação).
7. **Deploy na Vercel** e link a partir do Rockefeller.
8. **Ponte para o real**: chaves só no servidor, confirmação a cada operação, limites duros. Só com tudo validado.

## Segurança (online muda tudo)
- Login obrigatório; cadastro público desligado no Supabase; e-mail do dono numa lista de permissão.
- RLS em todas as tabelas; escrita de preços e análises só com a chave de serviço (servidor).
- Chaves (Supabase service, brapi, Binance no futuro) **nunca** no navegador nem no repositório (`.env.local`, ignorado).
- Rotas de cron exigem `CRON_SECRET`.
- A tela só mostra e simula. Nenhuma ordem real sai da plataforma até a fase 8.

## Ainda NÃO verificado (depende de rodar com internet e contas reais)
- Formato e limites atuais da brapi (histórico, BDRs, plano gratuito).
- Resposta real da Binance (`data-api.binance.vision`), do Banco Central e do Yahoo (reserva) a partir do servidor.
- Limites do plano da Vercel para cron.
Por isso existe `/api/diagnostico`: testa cada fonte de verdade e mostra o resultado.
