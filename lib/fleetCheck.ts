// Lógica compartida entre el refresh bajo demanda (POST /api/superadmin/fleet) y el cron
// (/api/cron/fleet-refresh): un chequeo completo de un restaurante → fila lista para sa_fleet_status.
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { getLatestDeployment } from '@/lib/vercelApi'
import { getLatestCommit } from '@/lib/githubApi'
import { PROVISIONING_SENTINEL } from '@/lib/mapRestaurant'

const HTTP_TIMEOUT_MS = 8000

type RestaurantRow = {
  id: string; product_id: string | null; deploy_url: string | null;
  vercel_project_id: string | null; repo_owner: string | null; repo_name: string | null; repo_branch: string | null;
}

export type ProductRow = {
  id: string; health_path: string | null;
}

async function healthCheckHttp(url: string) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  const start = Date.now()
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    return { status: res.status, ok: res.ok || (res.status >= 200 && res.status < 400), latencyMs: Date.now() - start, error: null as string | null }
  } catch (e) {
    return { status: null, ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : 'Error de red' }
  } finally {
    clearTimeout(t)
  }
}

// `product` es opcional: si no se pasa, se resuelve aquí (usado por el refresh de un solo
// restaurante bajo demanda). El cron SÍ lo precalcula una vez por producto y lo pasa — evita
// repetir la misma consulta a sa_products una vez por cada restaurante que comparte producto en
// el lote.
export async function checkOneRestaurant(
  restaurant: RestaurantRow,
  opts?: { product?: ProductRow | null }
) {
  const product = opts?.product !== undefined
    ? opts.product
    : restaurant.product_id
      ? (await supabase.from('sa_products').select('*').eq('id', restaurant.product_id).maybeSingle()).data
      : null

  const row: Record<string, unknown> = {
    restaurant_pk: restaurant.id,
    product_id: restaurant.product_id,
    checked_at: new Date().toISOString(),
  }

  // Las 3 fuentes (HTTP, Vercel, GitHub) son independientes entre sí — correrlas en paralelo
  // en vez de en secuencia evita que un restaurante con las 3 lentas/timeout sume sus timeouts
  // (8s × varias llamadas) y arriesgue tirar el límite de ejecución de la función serverless
  // a mitad de un lote de 25 en el cron.

  // 1. Health-check HTTP — siempre corre, no necesita ningún token.
  // health_path no tiene UI para editarlo (solo se toca a mano en sa_products vía SQL) — si algún
  // día se escribe sin "/" inicial o como cadena vacía, sin esto la URL concatenada queda mal
  // formada (ej. "https://x.vercel.apphealth") en vez de caer al "/" por defecto.
  const rawHealthPath = product?.health_path?.trim()
  const healthPath = rawHealthPath ? (rawHealthPath.startsWith('/') ? rawHealthPath : `/${rawHealthPath}`) : '/'
  // deploy_url puede valer el centinela de reserva (PROVISIONING_SENTINEL) mientras
  // provision-client está a medio "reanudar" — tratarlo como URL real generaba un fetch a
  // '__provisioning__/...' (URL inválida) y eso se reportaba como health:'error' ("Instancia
  // caída") para un restaurante que en realidad solo está siendo (re)aprovisionado, no caído.
  const hasRealDeployUrl = !!restaurant.deploy_url && restaurant.deploy_url !== PROVISIONING_SENTINEL
  const httpPromise = hasRealDeployUrl
    ? healthCheckHttp(restaurant.deploy_url!.replace(/\/$/, '') + healthPath)
    : Promise.resolve(null)

  // 2. Vercel — solo si hay project id y VERCEL_TOKEN configurado (degrada solo, no lanza).
  const vercelPromise = restaurant.vercel_project_id
    ? getLatestDeployment(restaurant.vercel_project_id)
    : Promise.resolve(null)

  // 3. GitHub — solo si hay repo del cliente y del producto base, y GITHUB_TOKEN configurado.
  // El commit del repo base (mismo para todos los restaurantes del mismo producto en un lote)
  // se resuelve una sola vez arriba y se pasa por `opts.baseCommit`; aquí solo se pide de nuevo
  // si el caller no lo precalculó.
  //
  // NO se llama a compareBranches(): los repos de cliente los crea provision-client vía
  // POST /repos/.../generate (GitHub "Template repository"), que a propósito genera una historia
  // de git limpia y SIN ancestro común con la plantilla — es justo lo que se quiere para un repo
  // de cliente nuevo, pero significa que /compare entre plantilla y cliente SIEMPRE devuelve 404
  // ("no common ancestor"), para todos los clientes, siempre. Pedirlo solo gastaría cuota de la
  // API para un dato que nunca puede llegar por esta vía — de ahí `commits_behind` queda `null`
  // (unknown) explícitamente en vez de intentar y fallar. La alternativa real (comparar por
  // versión vía un futuro `/api/health` en cada producto) no está implementada — ver
  // Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md §4.3.
  const hasGithubConfig = !!(restaurant.repo_owner && restaurant.repo_name)
  const githubPromise = hasGithubConfig
    ? getLatestCommit(restaurant.repo_owner!, restaurant.repo_name!, restaurant.repo_branch ?? 'main')
    : Promise.resolve(null)

  const [h, v, gh] = await Promise.all([httpPromise, vercelPromise, githubPromise])

  if (h) {
    row.http_status = h.status
    row.http_ok = h.ok
    row.http_latency_ms = h.latencyMs
    row.http_error = h.error
  } else {
    row.http_ok = null
    row.http_error = restaurant.deploy_url === PROVISIONING_SENTINEL ? 'Instancia en proceso de aprovisionamiento' : 'Sin deploy_url configurada'
  }

  if (v) {
    if (v.ok) {
      row.vercel_state = v.state ?? null
      row.vercel_deploy_id = v.id ?? null
      row.vercel_deploy_at = v.createdAt ?? null
      row.vercel_deploy_sha = v.commitSha ?? null
      row.vercel_error = null
    } else {
      row.vercel_state = null
      row.vercel_error = v.error
    }
  } else {
    row.vercel_state = null
    row.vercel_error = 'Sin vercel_project_id configurado'
  }

  // commits_behind/commits_ahead quedan siempre null — ver el comentario arriba sobre por qué
  // compareBranches() no se llama. No es "sin datos por error", es "esta señal no aplica a este
  // modelo de aprovisionamiento" — el semáforo de abajo ya trata null como "sin pendientes
  // detectados", no como advertencia.
  row.commits_behind = null
  row.commits_ahead = null
  if (gh) {
    if (gh.ok) { row.repo_head_sha = gh.sha ?? null; row.repo_head_at = gh.date ?? null; row.github_error = null }
    else { row.github_error = gh.error }
  } else {
    row.github_error = 'Sin repo_owner/repo_name configurado'
  }

  // 4. Semáforo derivado (ver Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md §4.5)
  // commits_behind ya no entra aquí — con el modelo de aprovisionamiento actual (generate desde
  // template) siempre es null, ver comentario arriba.
  const httpOk = row.http_ok as boolean | null
  const vercelState = row.vercel_state as string | null
  const httpLatency = row.http_latency_ms as number | null

  if (httpOk === null && vercelState === null) {
    row.health = 'unknown'
    row.health_reason = 'Sin URL ni proyecto Vercel configurados'
  } else if (httpOk === false || vercelState === 'ERROR') {
    row.health = 'error'
    row.health_reason = httpOk === false ? `No responde${row.http_error ? `: ${row.http_error}` : ''}` : 'Build falló'
  } else if (vercelState === 'BUILDING' || (httpLatency ?? 0) > 3000) {
    row.health = 'warn'
    row.health_reason = vercelState === 'BUILDING' ? 'Build en progreso' : `Lento (${(httpLatency! / 1000).toFixed(1)}s)`
  } else if (httpOk === true || vercelState === 'READY') {
    // httpOk===true es la señal fuerte; vercelState==='READY' solo, sin deploy_url configurada
    // (httpOk sigue null), también cuenta — antes se necesitaba SIEMPRE el HTTP check para
    // llegar a 'ok', así que un cliente monitoreado solo por Vercel nunca pasaba de 'unknown'
    // aunque el build estuviera perfecto.
    row.health = 'ok'
    row.health_reason = httpOk === true ? 'Al día' : 'Deploy listo (sin URL configurada para health-check)'
  } else {
    row.health = 'unknown'
    row.health_reason = 'Sin datos suficientes'
  }

  return row
}
