// Inserta una entrada en sa_audit_log. Antes cada endpoint del backend (upgrade-plan, su
// rollback, client-updates, el cron de flota) armaba el objeto a mano — fácil que se les fuera
// olvidando un campo (ej. `ip`) o que el `type` se eligiera ad hoc en cada sitio. Este helper es
// el único lugar que conoce la forma real de la tabla (ver Documentacion/sql/tablas.sql §sa_audit_log).
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'

export type AuditType = 'create' | 'update' | 'delete' | 'access' | 'billing'

export async function logAudit(entry: {
  user?: string
  restaurant?: string
  action: string
  details?: string
  type: AuditType
}) {
  await supabase.from('sa_audit_log').insert({
    user_name: entry.user ?? 'superadmin',
    restaurant: entry.restaurant ?? '—',
    action: entry.action,
    details: entry.details ?? '',
    type: entry.type,
  })
}

export async function logAuditMany(entries: {
  user?: string
  restaurant?: string
  action: string
  details?: string
  type: AuditType
}[]) {
  if (entries.length === 0) return
  await supabase.from('sa_audit_log').insert(entries.map((e) => ({
    user_name: e.user ?? 'superadmin',
    restaurant: e.restaurant ?? '—',
    action: e.action,
    details: e.details ?? '',
    type: e.type,
  })))
}
