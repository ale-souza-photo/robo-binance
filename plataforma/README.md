# Plataforma Trader Bit

Plataforma web de testes de investimento (dinheiro fictício). Veja `PLANO.md` para as decisões e as fases.

## O que já funciona (fases 1–6)
- Login só para o dono (link por e-mail).
- Cadastro de ativos (cripto, BDR, ação, ETF) e conjunto padrão.
- Análise automática às 08:00 e 18:00 (Brasília) + botão "Rodar análise agora".
- Histórico de análises; leitura rápida, estatísticas e carteiras com aportes.
- **Carteira de teste (dinheiro fictício):** contas, compra e venda simuladas com taxa e slippage, posições com custo médio,
  resultado, DCA do mês (um por ativo e mês) e travas (saldo, venda a descoberto, trava de perda).
- **Conta espelhada:** o saldo fictício acompanha a reserva de emergência do Rockefeller (somente leitura) pelo botão Sincronizar.
- Excluir conta (com confirmação) pela própria tela.
- **Mercado ao vivo (aba MERCADO):** cripto em tempo real direto da Binance (WebSocket, com reconexão e consulta de reserva a cada 5 s),
  bolsa com atraso de ~30 min via brapi (cache de 5 min), gráfico de 90 dias e o patrimônio da conta de teste recalculado a cada preço.
- **Sinais e protocolos (aba SINAIS):** quatro regras simples (média de 200 dias, cruzamento 50/200, momento de 90 dias, reversão pelo RSI) com o sinal de hoje
  e a evidência ao lado: teste histórico com custos contra comprar e manter, treino 70% / teste 30%, e um teste estatístico de "acerta o momento".
  O selo padrão é "sem vantagem comprovada"; o mais forte é "indício, não confirmado". O critério foi calibrado contra caminhos aleatórios
  (sem vantagem real, o indício aparece em ~0,1% dos casos) e essa calibração roda como teste automático.

## Rodar no seu PC
```
cd plataforma
npm install
copy .env.example .env.local     (preencha os valores)
npm run dev                      (abre em http://localhost:3000)
npm test                         (testes)
```

## Colocar online (uma vez só)
1. **Supabase**: as tabelas ficam no schema `traderbit` (pode ser um projeto compartilhado, ex.: o do Rockefeller).
   Aplique `supabase/migrations/0001_base.sql` (SQL Editor). Depois, em *Project Settings → API → Exposed schemas*,
   adicione `traderbit` e salve.
2. Em *Authentication → Users*, crie o seu usuário (seu e-mail). Em *Authentication → Providers → Email*,
   **desligue "Allow new users to sign up"**. Em *URL Configuration*, ponha a URL final do site em *Site URL*
   e `https://SEU-SITE/auth/callback` em *Redirect URLs*.
3. **brapi** (brapi.dev): crie conta grátis e copie o token.
4. **Vercel**: *Add New Project* → escolha este repositório → **Root Directory = `plataforma`**.
   Variáveis (veja `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (nunca em chat nem no navegador), `DONO_EMAIL`, `BRAPI_TOKEN`,
   `CRON_SECRET` (qualquer texto longo e aleatório).
5. Abra o site, entre, vá em **ATIVOS → Carregar conjunto padrão**, adicione sua BDR e clique em **Rodar análise agora**.
6. Abra `/api/diagnostico` para conferir se cada fonte de dados respondeu.

## Não verificado ainda (precisa de internet e contas reais)
Formato/limites da brapi, resposta da Binance/Banco Central a partir da Vercel e limites de cron do seu plano.
