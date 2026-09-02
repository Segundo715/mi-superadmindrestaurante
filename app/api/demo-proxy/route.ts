// Proxy server-side para la página /superadmin/demo.
// Las llamadas directas desde el browser a mi-proyecto.vercel.app fallan por CORS.
// Este handler las reenvía desde el servidor (server→server, sin restricciones de origen)
// y adjunta un cookie admin_session firmado con el mismo ADMIN_SECRET que usa mi-proyecto.
import { createHmac } from 'node:crypto'
import { verifySaSession } from '@/lib/saAuth'

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
  if (!await verifySaSession())
    return Response.json({ error: 'No autorizado' }, { status: 401 })

  const { path, body } = await req.json()

  if (!path || typeof path !== 'string' || !path.startsWith('/api/')) {
    return Response.json({ error: 'path inválido' }, { status: 400 })
  }

  const sessionToken = makeSession('superadmin-demo')

  // Único fetch saliente del repo sin timeout (lib/externalFetch.ts ya centraliza este patrón
  // para vercelApi/githubApi/*Provision, con 8s por defecto) — no se reusa tal cual porque este
  // endpoint necesita reenviar el status/body crudo de mi-proyecto al navegador, no normalizarlo
  // a {ok,data}. Si mi-proyecto (el demo real) se cuelga, esto se quedaba esperando indefinidamente.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  let upstream: Response
  try {
    upstream = await fetch(`${RESTO_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Cookie admin_session válida para los routes que requieren verifySession()
        'Cookie': `admin_session=${sessionToken}`,
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    })
  } catch (e) {
    const isAbort = e instanceof Error && e.name === 'AbortError'
    return Response.json({ error: isAbort ? 'El demo no respondió a tiempo' : 'Error de conexión con el demo' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }

  const data = await upstream.json().catch(() => ({}))
  return Response.json(data, { status: upstream.status })
}
