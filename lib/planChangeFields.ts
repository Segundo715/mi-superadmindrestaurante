// Columnas de sa_restaurants que un cambio de plan/producto escribe (upgrade-plan/route.ts) y que
// su rollback debe restaurar (upgrade-plan/rollback/route.ts) desde el snapshot en
// sa_migrations.payload_before. Un solo lugar para esta lista: si mañana el POST empieza a
// escribir una columna más, el rollback la restaura automáticamente sin tener que acordarse de
// tocar los dos archivos por separado.
export const PLAN_CHANGE_COLUMNS = [
  'plan', 'product_id', 'billing_mode', 'max_users', 'previous_plan',
  'plan_changed_at', 'subscription_status', 'updates_until', 'support_until',
] as const

export function pickPlanChangeFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of PLAN_CHANGE_COLUMNS) out[col] = row[col] ?? null
  return out
}
