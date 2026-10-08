export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, hora: new Date().toISOString(), regiao: process.env.VERCEL_REGION ?? "local" });
}
