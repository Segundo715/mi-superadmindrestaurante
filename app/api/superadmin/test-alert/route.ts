// Envía un correo de prueba usando lib/notify.ts — para verificar que GMAIL_USER/GMAIL_APP_PASSWORD/
// ALERT_EMAILS están bien configuradas sin tener que esperar a que el cron de flota detecte una caída real.
import { verifySaSession } from '@/lib/saAuth'
import { sendAlertEmail, alertEmailHtml } from '@/lib/notify'

export async function POST() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const result = await sendAlertEmail(
    '✅ Prueba de alertas — NICHO Super Admin',
    alertEmailHtml(
      'Correo de prueba',
      'Si estás leyendo esto, las alertas por correo ya están configuradas correctamente.',
      [{ name: 'Estado', detail: 'GMAIL_USER, GMAIL_APP_PASSWORD y ALERT_EMAILS funcionan bien' }],
    ),
  )
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 })
  return Response.json({ ok: true })
}
