// Inserta una entrada en sa_audit_log. Antes cada endpoint del backend (upgrade-plan, su
// rollback, client-updates, el cron de flota) armaba el objeto a mano — fácil que se les fuera
// olvidando un campo (ej. `ip`) o que el `type` se eligiera ad hoc en cada sitio. Este helper es
// el único lugar que conoce la forma real de la tabla (ver Documentacion/sql/tablas.sql §sa_audit_log).
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'

export type AuditType = 'create' | 'update' | 'delete' | 'access' | 'billing'

// Devuelve si el insert funcionó — antes esto se ignoraba en todos los call sites, así que un
// fallo real (RLS, columna cambiada, etc.) quedaba invisible: la ruta de auditoría llegó a
// devolver 200 aunque la fila nunca se escribiera. Los call sites que no revisan el resultado
// (la mayoría, es fire-and-forget a propósito) al menos ahora dejan rastro en los logs del server.
export async function logAudit(entry: {
  user?: string
  restaurant?: string
  action: string
  details?: string
  type: AuditType
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('sa_audit_log').insert({
    user_name: entry.user ?? 'superadmin',
    restaurant: entry.restaurant ?? '—',
    action: entry.action,
    details: entry.details ?? '',
    type: entry.type,
  })
  if (error) console.error('[logAudit] insert falló:', error.message)
  return { ok: !error, error: error?.message }
}

export async function logAuditMany(entries: {
  user?: string
  restaurant?: string
  action: string
  details?: string
  type: AuditType
}[]): Promise<{ ok: boolean; error?: string }> {
  if (entries.length === 0) return { ok: true }
  const { error } = await supabase.from('sa_audit_log').insert(entries.map((e) => ({
    user_name: e.user ?? 'superadmin',
    restaurant: e.restaurant ?? '—',
    action: e.action,
    details: e.details ?? '',
    type: e.type,
  })))
  if (error) console.error('[logAuditMany] insert falló:', error.message)
  return { ok: !error, error: error?.message }
}
