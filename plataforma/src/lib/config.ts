/** Lê variáveis de ambiente. Nunca devolve nem registra o VALOR dos segredos. */
export const supabaseConfigurado = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`A variável de ambiente ${nome} não está configurada.`);
  return v;
}

export const donoEmail = (): string | null => process.env.DONO_EMAIL?.trim().toLowerCase() || null;

export const ehDono = (email?: string | null): boolean => {
  const dono = donoEmail();
  return Boolean(dono && email && email.trim().toLowerCase() === dono);
};

/** Quais variáveis estão preenchidas (só sim/não, nunca o valor). */
export const statusEnv = () =>
  Object.fromEntries(
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DONO_EMAIL", "BRAPI_TOKEN", "CRON_SECRET"].map((n) => [
      n,
      Boolean(process.env[n]),
    ]),
  );

/** Padrões da simulação de aportes (o seu caso: R$ 100 no início e R$ 50 por mês, dia 5). */
export const PADROES_ANALISE = { inicial: 100, mensal: 50, dia: 5, anos: 5 };
