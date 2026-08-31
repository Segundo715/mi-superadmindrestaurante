# Índice de Documentación — mi-superadmindrestaurante (SuperAdmin NICHO)

> Última actualización: 2026-08-31

---

## Archivos de instrucciones

| Archivo | Descripción |
|---------|-------------|
| [CLAUDE.md](../CLAUDE.md) | Instrucciones principales para Claude Code — stack, arquitectura, restricciones |
| [AGENTS.md](../AGENTS.md) | Advertencias sobre Next.js 16 — diferencias con versiones anteriores |
| [Memoria del proyecto](../../.claude/projects/c--Users-pepit-mi-superadmindrestaurante/memory/MEMORY.md) | Memoria persistente entre sesiones de Claude |

---

## Documentación técnica

| Archivo | Descripción |
|---------|-------------|
| [documentacion-markdown.md](documentacion-markdown/documentacion-markdown.md) | Documentación técnica completa del superadmin |
| [documentacion-completa-2026-06-28](documentos/documentacion-completa-2026-06-28.md) | Snapshot completo del sistema |
| [manual-tecnico-2026-06-28](documentos/manual-tecnico-2026-06-28.md) | Manual técnico para desarrolladores |
| [manual-usuario-2026-06-28](documentos/manual-usuario-2026-06-28.md) | Manual de uso para Jesús y Eloy |
| [plan-multiproducto-y-flota-2026-08-21](documentos/plan-multiproducto-y-flota-2026-08-21.md) | Diseño del catálogo multi-producto, monitoreo de flota, historial de parches y upgrade de plan — implementado el 2026-08-24/26 |
| [prompt-original-multiproducto-2026-08-21](documentos/prompt-original-multiproducto-2026-08-21.md) | El prompt original que dio origen al diseño de arriba |

---

## Sesiones de trabajo

| Archivo | Descripción |
|---------|-------------|
| [sesiones/sesiones.md](sesiones/sesiones.md) | Registro diario de sesiones — se actualiza automáticamente en cada commit |

---

## Base de datos

| Archivo | Descripción |
|---------|-------------|
| [sql/tablas.sql](sql/tablas.sql) | Definición SQL de todas las tablas sa_* del superadmin — generado desde el código real, no editar a mano sin volver a verificar |
| [sql/migraciones/2026-08-21-multiproducto-y-flota.sql](sql/migraciones/2026-08-21-multiproducto-y-flota.sql) | Migración del catálogo multi-producto, flota, parches y upgrade de plan — correr una vez en el SQL Editor de Supabase (BD principal) si no se ha hecho |
