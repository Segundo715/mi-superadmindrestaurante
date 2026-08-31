// Aprovisiona la instancia real de un cliente: genera su repo en GitHub (a partir del repo
// plantilla del producto — los 3 están marcados "Template repository", ver sesión 2026-08-24) y
// crea su proyecto en Vercel conectado a ese repo. Con dryRun:true (default) no toca nada, solo
// valida y muestra qué se crearía.
//
// Variables de entorno del deploy nuevo — CONFIRMADAS leyendo el código real de cada repo
// (mi-proyecto/lib/supabase.ts, auth.ts, db.ts · mi-card/lib/supabase.ts, auth.ts, db.ts), no
// adivinadas:
//   mi-proyecto / mi-menu (mismo código): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//     ADMIN_SECRET, NEXT_PUBLIC_RESTAURANT_ID
//   mi-card: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (secret, no anon — el código de mi-card
//     usa la secret key server-side), ADMIN_SECRET, NEXT_PUBLIC_RESTAURANT_ID
//
// Hueco conocido: no tenemos guardada la ANON/publishable key de los proyectos Supabase de
// mi-menu ni de mi-card (solo las secret keys, MIMENU_SERVICE_KEY/MICARD_SERVICE_KEY) — mi-menu
// SÍ la necesita (su código usa la anon key, no la secret). Sin ella, el deploy de un cliente de
// mi-menu queda creado pero no podrá leer Supabase hasta que se agregue esa variable a mano en
// Vercel. Se reporta como advertencia explícita, no se inventa un valor.
import { NextRequest } from 'next/server'
import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { createClientRepo } from '@/lib/githubProvision'
import { createClientProject } from '@/lib/vercelProvision'
import { logAudit } from '@/lib/audit'

const TEMPLATE_OWNER = 'Segundo715'

function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos (rango de diacríticos Unicode)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'cliente'
}

type EnvBuild = { vars: { key: string; value: string }[]; warnings: string[] }

function buildEnvVars(productId: string, restaurantId: string): EnvBuild {
  const adminSecret = process.env.ADMIN_SECRET
  const warnings: string[] = []
  if (!adminSecret) warnings.push('ADMIN_SECRET no está configurado en el superadmin — el deploy nuevo quedará con el valor por defecto inseguro del código (dev-secret) hasta que se agregue a mano.')

  if (productId === 'mi-card') {
    const url = process.env.MICARD_SUPABASE_URL
    const key = process.env.MICARD_SERVICE_KEY
    if (!url || !key) warnings.push('MICARD_SUPABASE_URL/MICARD_SERVICE_KEY no están configuradas — el deploy de mi-card no podrá leer su base de datos hasta que se agreguen.')
    return {
      vars: [
        { key: 'NEXT_PUBLIC_SUPABASE_URL', value: url ?? '' },
        { key: 'SUPABASE_SECRET_KEY', value: key ?? '' },
        { key: 'ADMIN_SECRET', value: adminSecret ?? '' },
        { key: 'NEXT_PUBLIC_RESTAURANT_ID', value: restaurantId },
      ],
      warnings,
    }
  }

  // mi-menu y mi-proyecto comparten el mismo código (mi-menu se generó copiando mi-proyecto el
  // 2026-08-24) — mismas variables, distinta Supabase. mi-menu usa MIMENU_SUPABASE_ANON_KEY si está
  // configurada (falta agregarla — ver CLAUDE.md); NO se puede "crear igual y avisar" como se pensó
  // antes: createClient(url, '') lanza igual que createClient('',''), verificado en tiempo de
  // ejecución — un deploy sin esta key truena al arrancar, no queda simplemente degradado.
  const url = productId === 'mi-menu' ? process.env.MIMENU_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = productId === 'mi-menu' ? process.env.MIMENU_SUPABASE_ANON_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) warnings.push(`Falta la URL de Supabase de ${productId} — el deploy no podrá conectarse a su base de datos hasta que se agregue.`)
  if (!anonKey) warnings.push(`Falta la ANON key de Supabase de ${productId} — sin ella el deploy truena al arrancar (createClient con key vacía lanza), así que el aprovisionamiento se bloquea hasta que se agregue.`)

  return {
    vars: [
      { key: 'NEXT_PUBLIC_SUPABASE_URL', value: url ?? '' },
      { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: anonKey ?? '' },
      { key: 'ADMIN_SECRET', value: adminSecret ?? '' },
      { key: 'NEXT_PUBLIC_RESTAURANT_ID', value: restaurantId },
    ],
    warnings,
  }
}

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const { restaurantId: restaurantPk, dryRun = true } = body
  if (!restaurantPk) return Response.json({ error: 'Falta restaurantId' }, { status: 400 })

  const { data: restaurant, error: rErr } = await supabase.from('sa_restaurants').select('*').eq('id', restaurantPk).single()
  if (rErr || !restaurant) return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
  if (restaurant.repo_name) {
    return Response.json({ error: `Este restaurante ya tiene una instancia aprovisionada (${restaurant.repo_owner}/${restaurant.repo_name})` }, { status: 400 })
  }
  if (!restaurant.product_id) return Response.json({ error: 'El restaurante no tiene producto asignado — asígnale un plan primero' }, { status: 400 })

  const { data: product } = await supabase.from('sa_products').select('*').eq('id', restaurant.product_id).maybeSingle()
  if (!product) return Response.json({ error: `Producto "${restaurant.product_id}" no está en el catálogo` }, { status: 400 })

  // El restaurant_id real: si ya tiene uno (poco probable en un alta nueva), se reutiliza;
  // si no, se genera del nombre. Único por construcción de slugify + sufijo corto del PK.
  const restaurantId = restaurant.restaurant_id ?? `${slugify(restaurant.name)}-${restaurantPk.slice(0, 6)}`
  // El sufijo del PK también va en el nombre del repo: dos restaurantes con el mismo nombre
  // (dos franquicias distintas, o "Café José" vs "Cafe Jose" que slugifican igual) generarían
  // el mismo repoName sin esto, y GitHub /generate rechaza con 422 "name already exists".
  const repoName = `${product.id}-${slugify(restaurant.name)}-${restaurantPk.slice(0, 6)}`
  const { vars: envVars, warnings: envWarnings } = buildEnvVars(product.id, restaurantId)

  const preview = {
    ok: true,
    dryRun: true,
    template: `${product.repo_base_owner}/${product.repo_base_name}`,
    newRepo: `${TEMPLATE_OWNER}/${repoName}`,
    restaurantId,
    envVarsToSet: envVars.map((v) => v.key), // no se exponen valores, ni siquiera en dry-run
    githubTokenConfigured: !!process.env.GITHUB_TOKEN,
    vercelTokenConfigured: !!process.env.VERCEL_TOKEN,
    warnings: envWarnings,
  }

  if (dryRun) return Response.json(preview)

  if (!process.env.GITHUB_TOKEN) return Response.json({ error: 'GITHUB_TOKEN no configurado (necesita permiso de escritura: Contents + Administration)' }, { status: 400 })
  if (!process.env.VERCEL_TOKEN) return Response.json({ error: 'VERCEL_TOKEN no configurado (necesita permiso de crear proyectos)' }, { status: 400 })
  // No crear un deploy real con NEXT_PUBLIC_SUPABASE_URL="" (o su clave vacía) — la app del
  // cliente truena al arrancar exactamente igual que este mismo repo (createClient('','') lanza
  // de forma síncrona, confirmado en tiempo de ejecución). Mejor rechazar aquí con un mensaje
  // claro que crear una instancia rota que nadie va a poder diagnosticar desde el otro lado.
  const missingCritical = envVars.filter((v) => v.value === '' && v.key !== 'ADMIN_SECRET')
  if (missingCritical.length > 0) {
    return Response.json({
      error: `Faltan variables sin las que la instancia no arranca: ${missingCritical.map((v) => v.key).join(', ')}. Configúralas primero (ver advertencias) y vuelve a intentar.`,
      warnings: envWarnings,
    }, { status: 400 })
  }

  const repoResult = await createClientRepo({
    templateOwner: product.repo_base_owner,
    templateRepo: product.repo_base_name,
    newOwner: TEMPLATE_OWNER,
    newName: repoName,
    description: `Instancia de ${restaurant.name} — ${product.id}`,
  })
  if (!repoResult.ok) return Response.json({ error: `No se pudo crear el repo: ${repoResult.error}` }, { status: 502 })

  const projectResult = await createClientProject({
    projectName: repoName,
    githubRepoFullName: repoResult.fullName,
    envVars,
  })
  if (!projectResult.ok) {
    // El repo ya se creó — se deja así (no se borra solo) y se reporta para que se revise a mano;
    // reintentar solo la parte de Vercel más adelante es más seguro que borrar infraestructura sola.
    return Response.json({
      error: `Repo creado (${repoResult.htmlUrl}) pero falló crear el proyecto en Vercel: ${projectResult.error}`,
      repoCreated: repoResult.htmlUrl,
    }, { status: 502 })
  }

  const { error: uErr } = await supabase.from('sa_restaurants').update({
    restaurant_id: restaurantId,
    repo_owner: TEMPLATE_OWNER,
    repo_name: repoName,
    repo_branch: repoResult.defaultBranch,
    repo_url: repoResult.htmlUrl,
    deploy_url: projectResult.deployUrl,
    vercel_project_id: projectResult.projectId,
  }).eq('id', restaurantPk)
  if (uErr) return Response.json({ error: `Repo y proyecto creados, pero no se pudo actualizar sa_restaurants: ${uErr.message}`, repoCreated: repoResult.htmlUrl, projectCreated: projectResult.deployUrl }, { status: 500 })

  await logAudit({
    restaurant: restaurant.name,
    action: 'Instancia aprovisionada',
    details: `${repoResult.fullName} → ${projectResult.deployUrl}`,
    type: 'create',
  })

  return Response.json({
    ok: true,
    dryRun: false,
    repoUrl: repoResult.htmlUrl,
    deployUrl: projectResult.deployUrl,
    restaurantId,
    warnings: envWarnings,
  }, { status: 201 })
}
