import "./superadmin.css";
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata = {
  title: "Super Admin — NICHO",
  description: "Panel de control para administradores de plataforma",
};

const SESSION_KEY = 'sa_session'
const SESSION_VALUE = 'nicho_sa_authenticated_2024'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const session = jar.get(SESSION_KEY)?.value

  // Permitir acceso a /superadmin/login sin autenticación
  if (session !== SESSION_VALUE) {
    redirect('/sa-login')
  }

  return <>{children}</>
}
