// Proxy server-side para la página /superadmin/demo.
// Las llamadas directas desde el browser a mi-proyecto.vercel.app fallan por CORS.
// Este handler las reenvía desde el servidor (server→server, sin restricciones de origen)
// y adjunta un cookie admin_session firmado con el mismo ADMIN_SECRET que usa mi-proyecto.
import { createHmac } from 'node:crypto'

export const dynamic = 'force-dynamic'

const RESTO_URL    = 'https://mi-proyecto-phi-ecru.vercel.app'
// En Vercel de mi-proyecto ADMIN_SECRET está vacío (""); usamos el mismo valor para que el HMAC coincida.
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? ''

// Genera el mismo token que usa mi-proyecto/lib/auth.ts — así los routes lo validan sin cambios.
function makeSession(adminId: string): string {
  const sig = createHmac('sha256', ADMIN_SECRET).update(adminId).digest('hex')
  return `${adminId}.${sig}`
}

export async function POST(req: Request) {
  const { path, body } = await req.json()

  if (!path || typeof path !== 'string' || !path.startsWith('/api/')) {
    return Response.json({ error: 'path inválido' }, { status: 400 })
  }

  const sessionToken = makeSession('superadmin-demo')

  const upstream = await fetch(`${RESTO_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Cookie admin_session válida para los routes que requieren verifySession()
      'Cookie': `admin_session=${sessionToken}`,
    },
    body: JSON.stringify(body ?? {}),
  })

  const data = await upstream.json().catch(() => ({}))
  return Response.json(data, { status: upstream.status })
}
