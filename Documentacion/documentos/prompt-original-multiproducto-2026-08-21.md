# Prompt original — catálogo multi-producto y flota

> Este es el prompt detallado que dio origen al trabajo de esta sesión (guardado el 2026-08-21
> a solicitud del usuario; originalmente solo existía como texto en el chat, no como archivo).
> El resultado de este prompt es `Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md`
> (diseño) y su implementación en código (ver `CLAUDE.md` sección "Catálogo multi-producto, flota y parches").

```
Necesito diseñar e implementar la arquitectura de gestión multi-producto, multi-modalidad de pago
y monitoreo de flota para la plataforma NICHO, gobernada desde mi-superadmindrestaurante.

## CONTEXTO DEL NEGOCIO

La plataforma NICHO ofrece 3 productos independientes a restaurantes clientes:

1. **mi-menu** — menú digital + cartas (producto intermedio)
2. **mi-card** — solo cartas digitales (producto básico)
3. **mi-proyecto** — plataforma completa (menú, cartas, pedidos, empleados, fidelización, etc.)

Cada producto se puede contratar bajo 2 modalidades de pago, dando 6 combinaciones de plan:

| Producto | Modalidad | Ejemplo de precio |
|---|---|---|
| mi-menu + cartas | Mensual (suscripción) | $15/mes |
| mi-card (solo cartas) | Mensual (suscripción) | $15/mes |
| mi-proyecto completo | Mensual (suscripción) | $20/mes |
| mi-menu + cartas | Pago único (instalación) | $15 único |
| mi-card (solo cartas) | Pago único (instalación) | $15 único |
| mi-proyecto completo | Pago único (instalación) | $20 único |

Cada restaurante cliente corre sobre UNA instancia desplegada de UNO de estos 3 proyectos (repos
separados en GitHub, cada uno con su propio deploy en Vercel y su propia base de datos/instancia
Supabase o registros con su `restaurant_id`).

## PROBLEMA A RESOLVER

Necesito que el superadmin (este proyecto, mi-superadmindrestaurante) sea el panel de control
central para gestionar todo esto a escala (pensar en el caso de 100 clientes nuevos entrando a la
vez, con mezcla arbitraria de los 6 planes). Concretamente necesito diseñar:

### 1. Modelo de datos de planes y suscripciones por cliente

- Extender (o crear si no existe) el catálogo de planes en `sa_plans` para representar las 6
  combinaciones producto × modalidad, con su precio, periodicidad (`mensual` | `unico`) y qué
  producto/repo despliega (`mi-menu` | `mi-card` | `mi-proyecto`).
- Cada restaurante en `sa_restaurants` debe registrar: producto actual, modalidad de pago, fecha
  de alta, estado de suscripción (activo/vencido/cancelado — solo aplica a mensual), y URL del
  repo/deploy específico de ese cliente si cada cliente tiene su propio fork/instancia.
- Un pago único no debe tratarse como "gratis para siempre": definir si incluye actualizaciones
  futuras gratis o si mejoras/soporte adicional se cobran aparte. Dejar esto como campo explícito
  del plan (`incluye_actualizaciones: boolean`).

### 2. Migración/upgrade entre productos (ej. mi-menu → mi-proyecto completo)

Un cliente que empezó en mi-menu (solo menú+cartas) puede querer subir a mi-proyecto completo.
Diseñar el flujo de migración de datos:

- Qué tablas/datos existen en mi-menu (menu_items, recipes, cartas, config de branding) y cómo se
  mapean 1:1 a las tablas equivalentes de mi-proyecto (que tiene además empleados, pedidos,
  clientes, fidelización, etc. que mi-menu no tiene).
- Estrategia de migración: ¿mismo `restaurant_id` reutilizado en la BD principal (solo se
  "activan" tablas/módulos nuevos vía feature flags), o hay que mover filas entre proyectos/BDs
  distintas? Definir un script o endpoint `POST /api/superadmin/upgrade-plan` que:
  a) valide el plan destino,
  b) copie/migre los datos existentes sin pérdida,
  c) active los feature flags correspondientes al nuevo producto,
  d) actualice `sa_restaurants` con el nuevo producto/plan,
  e) registre la operación en `sa_audit_log`.
- Contemplar el caso inverso (downgrade) y el caso de mi-card → mi-proyecto (aún menos datos que
  migrar que desde mi-menu).

### 3. Monitoreo de salud/errores de todos los proyectos desplegados

El superadmin debe poder revisar el estado de las instancias de los clientes (sin importar si
corren mi-menu, mi-card o mi-proyecto) y detectar errores:

- Definir qué se monitorea por cliente: build/deploy status (Vercel API), health-check HTTP del
  dominio del cliente, errores recientes (si hay logging/Sentry), y última fecha de sync con el
  repo base de NICHO.
- Diseñar una vista `sa_fleet_status` o similar en el superadmin que liste todos los clientes con
  semáforo de estado (OK / desactualizado / con errores / caído) y filtros por producto y plan.
- Definir cómo el superadmin "arregla" un error de forma centralizada: ¿aplica un patch al repo
  base y lo propaga via GitHub Actions (similar al sync ya existente
  `mi-proyecto/.github/workflows/sync-portales.yml`) a los repos/forks de los clientes afectados?

### 4. Historial de actualizaciones/parches por cliente

Cuando el superadmin corrige un error y sube el cambio al GitHub del cliente, debe quedar
registro consultable de qué clientes están al día y cuáles no:

- Tabla nueva `sa_client_updates` (o extender `sa_audit_log`) con: restaurant_id, producto,
  commit hash aplicado, fecha, descripción del fix/parche, resultado del deploy (éxito/fallo),
  quién lo aplicó (jesus/eloy).
- Vista en el dashboard: por cada cliente, mostrar su versión/commit actual vs. la versión más
  reciente del repo base, con badge "actualizado" / "pendiente de actualización" / "con error".
- Considerar guardar también qué versión de mi-menu/mi-card/mi-proyecto usa cada cliente (por si
  hay múltiples versiones activas en producción simultáneamente).

## RESTRICCIONES Y CONTEXTO TÉCNICO EXISTENTE

- Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase dual
  (BD principal `zxynrlqubdlrwcfoewdv` + BD portales `qmtsetcqnovcahuimkvg`).
- El superadmin ya tiene: `sa_restaurants`, `sa_audit_log`, `sa_plans`, `sa_discounts`,
  `sa_requests`, `sa_security`, `sa_tickets`, sistema de feature flags por módulo/rol
  (`/api/save-flags`), y ya llama `POST /api/audit` tras cada mutación importante.
- Todas las tablas multi-tenant usan `restaurant_id`; si falta la env var
  `NEXT_PUBLIC_RESTAURANT_ID` al crear datos, quedan con `restaurant_id='default'` (ya ha pasado).
- El dashboard es un componente monolítico `SuperAdmin.tsx` (~2242 líneas) — no fragmentar sin
  razón; cualquier vista nueva debe agregarse al union type `View` y al sidebar.
- Autenticación hardcodeada solo para jesus/eloy vía `verifySaSession()`.
- Sync entre proyectos ya existe como GitHub Actions con exclusiones de archivos de branding
  (colores #E8912A portales vs #B90F45 NICHO) — usar como referencia/base para el mecanismo de
  propagación de parches a clientes.

## ENTREGABLE ESPERADO

1. Propuesta de esquema de BD (tablas nuevas/campos nuevos) para planes, suscripciones,
   producto por cliente y modalidad de pago.
2. Diseño del flujo de migración de datos entre productos (mi-menu/mi-card → mi-proyecto).
3. Diseño de la vista de monitoreo de flota (salud de instancias de clientes).
4. Diseño de la vista de historial de actualizaciones/parches por cliente.
5. Plan de implementación paso a paso, priorizado, compatible con la arquitectura actual descrita
   arriba, sin romper lo ya construido (feature flags, auditoría, tickets duales).

Documenta todo en español, con tablas para los campos de BD y endpoints nuevos.
```

## Qué salió de este prompt

1. **Diseño** → `Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md` (exploración exhaustiva del código real, con hallazgos de esquema desincronizado y bugs de persistencia).
2. **Migración SQL** → `Documentacion/sql/migraciones/2026-08-21-multiproducto-y-flota.sql` (pendiente de correr en Supabase si aún no se hizo).
3. **Implementación en código**: catálogo multi-producto, historial de parches, monitoreo de flota, endpoint de upgrade/downgrade — resumido en `CLAUDE.md`.
