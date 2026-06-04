import { createHash } from 'crypto'
import { cookies } from 'next/headers'

const SALT = 'nicho_superadmin_2024'
const SESSION_KEY = 'sa_session'
const SESSION_VALUE = 'nicho_sa_authenticated_2024'

const USERS: Record<string, string> = {
  jesus: '2e961f146826f84c98a94cb1cc4ba036a108c975a4f5dd9319af6dd9c46d383a',
  eloy:  'dc2ee564bcfdbe759de3e6ad2a23a177cf96d4790bd7aa2e5fb9b9730618d1b8',
}

export async function POST(req: Request) {
  const { username, password } = await req.json()
  const hash = createHash('sha256').update(SALT + password).digest('hex')
  const stored = USERS[username?.toLowerCase()]

  if (!stored || stored !== hash) {
    return Response.json({ error: 'Credenciales incorrectas' }, { status: 401 })
  }

  const jar = await cookies()
  jar.set(SESSION_KEY, SESSION_VALUE, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 8, // 8 horas
    path: '/',
  })

  return Response.json({ ok: true, user: username.toLowerCase() })
}

export async function DELETE() {
  const jar = await cookies()
  jar.delete(SESSION_KEY)
  return Response.json({ ok: true })
}

export function verifySession(sessionValue?: string): boolean {
  return sessionValue === SESSION_VALUE
}
