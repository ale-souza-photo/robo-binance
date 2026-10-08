# Widget do Trader Bit (iPhone, app Scriptable)

Mostra o mercado (BTC, ETH, BOVA11, IVVB11, dólar) e uma linha com o patrimônio da conta de teste. Dinheiro fictício.

## 1. Criar o token (uma vez, no PC)
No PowerShell:
```
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```
Copie o texto (40 letras e números) e guarde num bloco de notas. Não use o mesmo do `CRON_SECRET`.

Na Vercel: projeto `robo-binance` → Settings → Environment Variables → nome `WIDGET_TOKEN`, valor o texto → Save.
Depois: Deployments → três pontinhos do último → **Redeploy** (sem isso a variável nova não vale).

## 2. Instalar no iPhone
1. Instale o app **Scriptable** (App Store, grátis).
2. Abra, toque em **+** (novo script) e cole todo o conteúdo de `TraderBit.js`. Dê o nome "Trader Bit".
3. Toque em ▶ (executar). Ele pede o token: cole o texto do passo 1. O token fica só no chaveiro do iPhone.
4. Na tela inicial: segure em um espaço vazio → **+** → **Scriptable** → escolha o tamanho (médio ou grande) → toque no widget → **Script: Trader Bit**.

## Como funciona
- O widget chama `https://robo-binance-ten.vercel.app/api/widget` com o token. O servidor devolve os preços e o patrimônio já calculados.
- Cripto vem ao vivo (Binance); bolsa com atraso de ~30 min (brapi); dólar no último fechamento. O ponto verde é "ao vivo", o amarelo "com atraso" e o vazio "último fechamento".
- O iOS decide de quanto em quanto tempo atualiza o widget (costuma ser a cada 15 a 30 minutos). Para ver na hora, abra o script no app.
- Sem internet, o widget mostra o último dado salvo, marcado como OFFLINE.
- Tocar no widget abre a aba Mercado.

## Se algo der errado
- "Token recusado": o `WIDGET_TOKEN` na Vercel é diferente do que você colou, ou faltou o Redeploy. Rode o script no app e cole de novo.
- "Sem dados ainda": sem internet ou o site fora do ar. Tente de novo.
- Para trocar o token: crie um novo, atualize na Vercel (e Redeploy) e rode o script no app (ele pede de novo se o token for recusado).
