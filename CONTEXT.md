# Contexto — mi-superadmindrestaurante (NICHO Super Admin)

## ¿Qué es este proyecto?

Panel de control global de la plataforma **NICHO**. Desde aquí el Super Admin (Jesús o Eloy) gestiona todos los restaurantes clientes: activa/desactiva módulos, administra planes y pagos, controla permisos por rol, revisa auditoría y configura seguridad.

Solo existe **un restaurante real conectado**: `r1 = Nicho Restaurant`, que tiene su app real en `mi-proyecto`. Los demás restaurantes en la UI son datos de demostración (seed data en memoria).

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

```
NEXT_PUBLIC_SUPABASE_URL=       # URL del proyecto Supabase (misma que mi-proyecto)
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Clave anónima de Supabase
```

No hay `ADMIN_SECRET` aquí — la autenticación usa SHA-256 puro con salt hardcodeado.

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
- **Componente monolítico**: las 15 vistas están en un solo archivo para facilitar el desarrollo inicial; candidato a refactorizar
- **Sin persistencia de restaurants/billing**: los cambios a restaurantes, planes y pagos solo existen en memoria durante la sesión
- **Solo flags y permisos persisten** en Supabase vía `/api/save-flags`
- **ngrok habilitado** en `next.config.ts` para desarrollo local con túnel
