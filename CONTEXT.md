# Contexto — mi-superadmindrestaurante (NICHO Super Admin)

## ¿Qué es este proyecto?

Panel de control global de la plataforma **NICHO**. Desde aquí el Super Admin (Jesús o Eloy) gestiona todos los restaurantes clientes: activa/desactiva módulos, administra planes y pagos, controla permisos por rol, revisa auditoría y configura seguridad.

> ⚠️ **Desactualizado (corregido 2026-08-26):** este archivo decía "solo existe un restaurante real, el resto es seed en memoria" y "sin persistencia de restaurants/billing" — ninguna de las dos es cierta desde hace tiempo. Los restaurantes, planes, pagos y todo lo demás **sí persisten en Supabase** (tabla `sa_restaurants` y las demás `sa_*`), y hay varios restaurantes reales en producción, no solo `r1`. Ver `CLAUDE.md` para el estado real y actualizado — es la fuente de verdad, este archivo puede seguir teniendo otras cosas desactualizadas que no se revisaron línea por línea.
>
> **2026-08-28:** el aprovisionamiento automático de instancias (repo + deploy por cliente) ya está verificado funcionando en producción con un cliente real. Hay trabajo de arquitectura pendiente y solo explorado (no implementado) para que los clientes de plan `mensual` no reciban una copia completa sino solo una URL sobre un deploy compartido — ver la sección "Pendiente: URL compartida para clientes mensuales" en `CLAUDE.md`.
>
> **2026-08-31:** revisión completa de código con 12 correcciones aplicadas (incluye un hallazgo crítico de seguridad en `/api/demo-proxy`, ya corregido) y nuevo botón "Ver panel del cliente" en el detalle de un restaurante — ver `CLAUDE.md` para el detalle completo.
>
> **2026-08-31 (cont.):** iconos SVG planos en `/sa-login` (ya no quedan emojis en el dashboard) y un fix de rendimiento en `/card` de **mi-card** (repo hermano) — el logo del negocio ya no tarda en aparecer. Aplicado en la plantilla y en la instancia real ya provisionada; detalle completo en `CLAUDE.md`.
>
> **2026-09-01 (cont.):** cuarta revisión de código (más fixes) y un hallazgo de infraestructura sin resolver: `tickets`/`revenue` tardan ~7-8s en producción por un probable desajuste de región entre Vercel y el proyecto de Supabase de Portales — documentado en `CLAUDE.md`, no se tocó nada de infraestructura por decisión del usuario.
>
> **2026-09-01 (cont. 2):** se corrigieron las 5 variantes de tarjeta restantes de mi-card (mismo fix de precarga de marca que `/card`), y se confirmó el estado de los 3 repos plantilla (mi-card, mi-menu, mi-proyecto) en GitHub — mi-card al día, mi-menu/mi-proyecto sin commits nuevos desde 2026-07-20 pero sin nada atascado a medio fusionar. Detalle completo en `CLAUDE.md`.
>
> **2026-09-03:** primera feature nueva de la lista de mejoras: alertas por correo (Gmail SMTP vía `lib/notify.ts`) cuando una instancia de la flota cae — ver `CLAUDE.md` para el detalle y las variables de entorno pendientes de Vercel.
>
> **2026-09-01:** tercera revisión de código (10 fixes más) — incluye un hueco de seguridad más (`GET /api/save-flags` sin sesión), repos de cliente que se creaban públicos por accidente, y aprovisionamiento que ya puede reanudarse si falla a medias. También quedó documentado que **los flags/permisos por restaurante individual nunca funcionaron de verdad** (seleccionar un restaurante y togglear algo no tenía efecto real, solo parecía guardarse) — ahora se avisa en vez de fingir éxito, pero implementarlo de verdad sigue pendiente. Detalle completo en `CLAUDE.md`.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.2.4 — App Router |
| UI | React 19.2.4 + TypeScript |
| Estilos | Tailwind CSS 4 + CSS custom (dark theme, prefijo `.sa-*`) |
| Base de datos | Supabase (misma instancia que mi-proyecto) |
| Auth | SHA-256 hardcoded (sin JWT ni Supabase Auth) |
| Deploy | Vercel — URL: `https://mi-superadmindrestaurante.vercel.app` |

---

## Usuarios con acceso

Solo dos usuarios hardcodeados en el código fuente:

| Usuario | Contraseña (hash SHA-256 con salt `nicho_superadmin_2024`) |
|---------|----------------------------------------------------------|
| `jesus` | `2e961f146826f84c98a94cb1cc4ba036a108c975a4f5dd9319af6dd9c46d383a` |
| `eloy` | `dc2ee564bcfdbe759de3e6ad2a23a177cf96d4790bd7aa2e5fb9b9730618d1b8` |

---

## Autenticación

- **Cookie**: `sa_session` — HttpOnly, Secure, SameSite=Strict, MaxAge = 8 horas
- **Valor de sesión**: string fijo `nicho_sa_authenticated_2024`
- **localStorage**: `sa_user` — guarda el nombre del usuario para mostrarlo en el sidebar (no es seguro, solo es display)
- El `layout.tsx` de `/superadmin` verifica la cookie en cada carga de página y redirige a `/sa-login` si no es válida.

---

## Estructura de archivos

```
mi-superadmindrestaurante/
├── app/
│   ├── layout.tsx                          # Root layout (Geist fonts, español)
│   ├── page.tsx                            # Redirect a /sa-login
│   ├── globals.css                         # Tailwind v4 + @theme inline
│   │
│   ├── sa-login/
│   │   └── page.tsx                        # Formulario de login (jesus / eloy)
│   │
│   ├── superadmin/
│   │   ├── layout.tsx                      # Verifica sa_session, redirige si no válida
│   │   ├── page.tsx                        # Renderiza el componente SuperAdmin
│   │   ├── superadmin.css                  # Estilos del dashboard (CSS variables dark theme)
│   │   └── components/
│   │       └── SuperAdmin.tsx              # Panel completo (~2080 líneas, 15 secciones)
│   │
│   └── api/
│       ├── superadmin/auth/route.ts        # POST login / DELETE logout
│       └── save-flags/route.ts             # POST — persiste flags/permisos en Supabase
│
├── lib/
│   └── supabase.ts                         # Cliente Supabase (anon key)
│
├── next.config.ts                          # allowedDevOrigins: *.ngrok-free.app
├── .env.local                              # NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
├── CLAUDE.md / AGENTS.md                  # Instrucciones para el agente IA
└── Excalidraw/                             # Mockups de diseño
```

---

## Rutas

### Páginas
| Ruta | Acceso | Descripción |
|------|--------|-------------|
| `/` | Público | Redirige a `/sa-login` |
| `/sa-login` | Público | Login del Super Admin |
| `/superadmin` | Protegido (sa_session) | Dashboard principal |

### API Routes
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/auth` | `POST` | Login: valida usuario/contraseña, crea cookie |
| `/api/superadmin/auth` | `DELETE` | Logout: borra cookie sa_session |
| `/api/save-flags` | `POST` | Guarda flags/permisos en tabla `settings` de Supabase |

---

## Componente SuperAdmin.tsx — secciones

Todo el dashboard vive en un único componente de ~2080 líneas con 15 vistas intercambiables:

| Vista | Descripción |
|-------|-------------|
| `overview` | KPIs globales: restaurantes activos, MRR, morosidad, usuarios |
| `activity` | Salud y actividad de cada restaurante (score 0-100) |
| `restaurants` | Tabla de todos los restaurantes con búsqueda/filtro; suspender/activar |
| `flags` | Feature Flags: activar/desactivar módulos por restaurante y por rol |
| `permisos` | Permisos de módulos para empleados y usuarios/clientes |
| `solicitudes` | Aprobar/rechazar solicitudes de acceso de los admins |
| `seguridad` | Duración de sesión, intentos fallidos, PIN, horario, whitelist IP |
| `billing` | Registrar pagos, cambiar planes, ver deudas |
| `audit` | Log de auditoría con filtros y exportación CSV |
| `plans` | Editar precio/usuarios/características de los planes Trial/Básico/Premium |
| `discounts` | Generar y gestionar códigos de descuento |
| `maintenance` | Activar/desactivar modo mantenimiento por restaurante |
| `notifications` | Configurar canales y disparadores de alertas (stub de UI) |

---

## Feature Flags — flujo de sincronización

```
SuperAdmin abre "Feature Flags"
    ↓
Carga flags actuales desde mi-proyecto:
    GET https://mi-proyecto-phi-ecru.vercel.app/api/features         (Nicho r1)
    GET https://mi-proyecto-phi-ecru.vercel.app/api/resta3/features  (Resta3)
    ↓
Admin cambia un toggle
    ↓
POST /api/save-flags (local)
    ↓
Upsert en tabla `settings` de Supabase (key: feature_flags / feature_flags_resta3)
    ↓
mi-proyecto lee esos flags en tiempo real
```

### Claves en Supabase `settings`
| key | Qué contiene |
|-----|-------------|
| `feature_flags` | Módulos del admin principal de Nicho |
| `feature_flags_resta3` | Módulos de Resta3 (prefijo `r3_`) |
| `employee_permissions` | Permisos del empleado |
| `user_permissions` | Permisos del cliente/usuario |

### Sincronización r1 ↔ Global
Nicho Restaurant (`r1`) y la selección "Global" comparten la misma fuente de verdad en Supabase. Cuando se toca un flag en uno, se refleja automáticamente en el otro en el estado local.

---

## Planes

| Plan | Precio | Máx usuarios |
|------|--------|-------------|
| Trial | Gratis | 3 |
| Básico | $799/mes | 5 |
| Premium | $2,499/mes | 20 |

---

## Datos de demostración (seed data)

Todos los datos excepto los flags reales están en memoria (no en Supabase):

- **6 restaurantes**: Nicho, La Trattoria, Sushi Zen, Taco Express, El Rincón Grill, Café Patio
- **3 planes** con sus características
- **7 entradas de auditoría** de ejemplo
- **3 códigos de descuento** (NICHO30, BASIC200, TRIAL60)
- **4 solicitudes de acceso** (pending/approved/rejected)
- **9 módulos de empleado** y **6 módulos de usuario**
- **Configuración de seguridad** por restaurante (8h sesión, 5 intentos, 07:00-23:00)

---

## Variables de entorno

Lista completa y actualizada en `CLAUDE.md` (§ "Variables de entorno críticas") — son muchas más
de las 2 de aquí abajo (Supabase principal + portales + mi-menu + mi-card, tokens de GitHub/Vercel
para flota y aprovisionamiento, `ADMIN_SECRET`, etc.). No duplicar la lista aquí para no
desincronizarla otra vez.

La autenticación del login SÍ usa SHA-256 con salt hardcodeado (eso sigue siendo cierto), pero
`ADMIN_SECRET` **sí existe** en este proyecto — lo usa el proxy de demo, compartido con mi-proyecto.

---

## Estilos (superadmin.css)

Dark theme con CSS variables. Todas las clases usan el prefijo `.sa-`:

| Variable | Uso |
|----------|-----|
| `--accent` | Verde NICHO (`#00e676`) |
| `--bg-body` | Fondo principal oscuro |
| `--bg-card` | Fondo de tarjetas |
| `--bg-elevated` | Elementos elevados |
| `--danger` | Rojo para errores/suspensión |
| `--warning` | Amarillo para alertas |
| `--border` | Bordes sutiles |
| `--text-primary/secondary/muted` | Jerarquía de texto |

---

## Notas de arquitectura

- **Sin Redux/Zustand**: todo el estado es React hooks (`useState`, `useCallback`, `useEffect`)
- **Componente monolítico**: 16 vistas en un solo archivo (`SuperAdmin.tsx`, ~3100 líneas) — a propósito, ver CLAUDE.md ("no fragmentar sin razón")
- **Todo persiste en Supabase**: restaurantes, planes, pagos, flags, permisos, auditoría, flota, parches — no solo flags/permisos como decía antes esta línea. Cada vista hace `fetch`/`PATCH` a su endpoint en `/api/superadmin/*`.
- **ngrok habilitado** en `next.config.ts` para desarrollo local con túnel
