# Plataforma Trader Bit

Plataforma web de testes de investimento (dinheiro fictício). Veja `PLANO.md` para as decisões e as fases.

## O que já funciona (fase 1–3)
- Login só para o dono (link por e-mail).
- Cadastro de ativos (cripto, BDR, ação, ETF) e conjunto padrão.
- Análise automática às 08:00 e 18:00 (Brasília) + botão "Rodar análise agora".
- Histórico de análises; leitura rápida, estatísticas e carteiras com aportes.

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
