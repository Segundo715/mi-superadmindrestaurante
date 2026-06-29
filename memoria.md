# Memoria del Proyecto NICHO

> Archivo de referencia rápida para sesiones futuras con Claude. Actualizado: 2026-06-28.

---

## Ecosistema completo

| Proyecto | Repositorio | URL | BD |
|----------|-------------|-----|----|
| NICHO (mi-proyecto) | Segundo715/mi-proyecto | mi-proyecto-phi-ecru.vercel.app | Principal (zxynrlqubdlrwcfoewdv) |
| Portales (mi-restauranteportales) | Segundo715/mi-restauranteportales | Vercel manual (no auto-deploy) | Portales (qmtsetcqnovcahuimkvg) en prod |
| Super Admin (mi-superadmindrestaurante) | Segundo715/mi-superadmindrestaurante | mi-superadmindrestaurante.vercel.app | Ambas BDs |

**Propietarios:** Jesús Segundo + Eloy. Credenciales super admin: solo `jesus` y `eloy` (hash SHA-256 hardcodeado).

---

## Lo más crítico: restaurant_id

Todas las tablas tienen `restaurant_id TEXT DEFAULT 'default'`.

- **NICHO/Chubis:** `restaurant_id = 'default'`
- **Portales:** `restaurant_id = 'portales'`

Si los datos se crearon sin `NEXT_PUBLIC_RESTAURANT_ID`, tienen `'default'`. Cuando la var se configura, la app no los encuentra. **Solución:** PATCH masivo por Supabase REST.

---

## Branding por restaurante

| Restaurante | Color | Logo |
|-------------|-------|------|
| NICHO | `#B90F45` (rosa) | /logo.png |
| Los Portales | `#E8912A` (naranja) | /logo-portales.svg |

El sync GitHub Actions tiene ~20 exclusiones para proteger el branding de portales. Si se agrega un archivo nuevo con colores hardcodeados en portales, añadir a `.github/workflows/sync-portales.yml`.

---

## Tabla settings (compartida, sin restaurant_id)

Usa prefijo de clave:
- NICHO: `restaurant_name`, `feature_flags`, etc. (sin prefijo)
- Portales: `portales:restaurant_name`, etc.
- Feature flags para portales: `feature_flags_portales` (guardado en BD portales por el superadmin)

---

## Flujo de deploy portales

1. Editar en `mi-restauranteportales/`
2. `git push` → GitHub Actions sync desde mi-proyecto (si aplica)
3. `vercel --prod --token $VERCEL_TOKEN` en mi-restauranteportales/ ← **paso manual obligatorio**

---

## Documentación técnica detallada

- [mi-proyecto docs](../mi-proyecto/Documentacion/documentos/documentacion-completa-2026-06-28.md)
- [mi-superadmindrestaurante docs](Documentacion/documentos/documentacion-completa-2026-06-28.md)

---

## Errores frecuentes y soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| "No hay elementos" en menú/recetas | restaurant_id='default' en datos viejos | PATCH masivo en Supabase |
| "Nombre o contraseña incorrectos" | admins/employees con restaurant_id='default' | PATCH admins+employees |
| Seed no aparece en producción | .env.local → BD principal, prod usa BD portales | Usar .env.prod.local |
| Vercel no actualiza portales | No está conectado a GitHub | vercel --prod manual |
| Cannot find package '@supabase/supabase-js' | Script fuera del directorio del proyecto | Mover script a mi-restauranteportales/ |

---

## Superadmin — riesgos conocidos

- Cookie `sa_session` es valor fijo público — falsificable si alguien conoce el código
- `/api/save-flags` no tiene autenticación — cualquiera puede leer/escribir feature flags
- `ADMIN_SECRET` puede ser `''` en demo-proxy si no está la env var

---

## Conexiones entre proyectos

```
mi-proyecto ──────────────────────────────────────────── BD principal
     │                                                        │
     │  llama /api/public/register (auto-registro)            │ sa_restaurants, sa_audit_log,
     │                                                        │ sa_tickets, settings, orders
     ▼                                                        │
mi-superadmindrestaurante ──────────────────────────────── BD portales
     │  lee/escribe feature flags de portales          sa_tickets, settings, orders
     │  (vía supabasePortales)
     │
     └──▶ demo-proxy → mi-proyecto (inserta datos de demo, firmando cookie HMAC)

mi-restauranteportales ─────────────────────────────────── BD portales (prod)
     │  lee feature flags, permisos de settings
     │  envía tickets de soporte a sa_tickets de BD portales
```
