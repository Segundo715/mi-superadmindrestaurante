// Verifica la cookie sa_session en API routes del SuperAdmin (distinta de admin_session y resta3_session).
import { cookies } from 'next/headers'

const SESSION_VALUE = 'nicho_sa_authenticated_2024'

export async function verifySaSession(): Promise<boolean> {
  const jar = await cookies()
  return jar.get('sa_session')?.value === SESSION_VALUE
}
