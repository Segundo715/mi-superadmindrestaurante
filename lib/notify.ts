// Alertas por correo al superadmin (Jesús/Eloy) — vía Gmail SMTP con una "contraseña de
// aplicación" (no la contraseña real de la cuenta), usando nodemailer. Se eligió sobre un
// proveedor transaccional (Resend, etc.) porque no requiere dar de alta una cuenta nueva — solo
// una contraseña de aplicación sobre una cuenta de Gmail que ya existe.
// Tolerante a fallos: si GMAIL_USER/GMAIL_APP_PASSWORD/ALERT_EMAILS no están configuradas o el
// envío falla, no lanza — el cron/endpoint que llama a esto no debe caerse por un correo que no salió.
import nodemailer from 'nodemailer'

const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD

function getRecipients(): string[] {
  return (process.env.ALERT_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
}

// El transporter se crea una sola vez por instancia de función serverless (no en cada llamada) —
// nodemailer reutiliza la conexión SMTP entre envíos dentro del mismo proceso.
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null
function getTransporter() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    })
  }
  return transporter
}

export async function sendAlertEmail(subject: string, bodyHtml: string): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter()
  if (!t) return { ok: false, error: 'GMAIL_USER/GMAIL_APP_PASSWORD no configuradas' }
  const to = getRecipients()
  if (to.length === 0) return { ok: false, error: 'ALERT_EMAILS no configurada (sin destinatarios)' }

  try {
    await t.sendMail({ from: `"NICHO Alertas" <${GMAIL_USER}>`, to: to.join(', '), subject, html: bodyHtml })
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Error desconocido enviando correo'
    console.error('[notify] no se pudo enviar el correo de alerta:', error)
    return { ok: false, error }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Plantilla simple compartida — cada caller solo arma la lista de filas (nombre + detalle).
export function alertEmailHtml(title: string, intro: string, items: { name: string; detail: string }[]): string {
  const rows = items.map((i) => `<li><strong>${escapeHtml(i.name)}</strong> — ${escapeHtml(i.detail)}</li>`).join('')
  return `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(intro)}</p><ul>${rows}</ul><p style="color:#888;font-size:12px">NICHO Super Admin — mi-superadmindrestaurante.vercel.app</p>`
}
