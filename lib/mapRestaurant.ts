// Mapper compartido snake_case (fila de sa_restaurants) → camelCase (shape que consume el front).
// Antes vivía duplicado en restaurants/route.ts y restaurants/[id]/route.ts — con 25+ columnas
// y creciendo, duplicarlo es la forma más rápida de que los dos endpoints empiecen a devolver
// formas distintas del mismo restaurante.
export function toRestaurant(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    plan: r.plan,
    status: r.status,
    users: r.users,
    maxUsers: r.max_users,
    registeredAt: r.registered_at,
    balance: r.balance,
    nextPayment: r.next_payment,
    lastPayment: r.last_payment,
    email: r.email,
    notes: r.notes,
    apiToken: r.api_token,
    lastActive: r.last_active,
    loginCount: r.login_count,
    // multi-producto / flota (2026-08-21)
    restaurantId: r.restaurant_id,
    productId: r.product_id,
    billingMode: r.billing_mode,
    subscriptionStatus: r.subscription_status,
    updatesUntil: r.updates_until,
    supportUntil: r.support_until,
    repoOwner: r.repo_owner,
    repoName: r.repo_name,
    repoBranch: r.repo_branch,
    repoUrl: r.repo_url,
    deployUrl: r.deploy_url,
    vercelProjectId: r.vercel_project_id,
    vercelTeamId: r.vercel_team_id,
    previousPlan: r.previous_plan,
    planChangedAt: r.plan_changed_at,
  }
}
