// Proxy server-side para la página /superadmin/demo.
// Las llamadas directas desde el browser a mi-proyecto.vercel.app fallan por CORS.
// Este handler las reenvía desde el servidor (sin restricciones de origen).
export const dynamic = 'force-dynamic'

const RESTO_URL = 'https://mi-proyecto-phi-ecru.vercel.app'

export async function POST(req: Request) {
  const { path, body } = await req.json()

  if (!path || typeof path !== 'string' || !path.startsWith('/api/')) {
    return Response.json({ error: 'path inválido' }, { status: 400 })
  }

  const upstream = await fetch(`${RESTO_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

  const data = await upstream.json().catch(() => ({}))
  return Response.json(data, { status: upstream.status })
}
