# Manual de Usuario — SuperAdmin NICHO

> Versión: 2026-06-28
> Dirigido a: Jesús y Eloy (dueños de la plataforma NICHO)
> Nivel: No técnico

---

## 1. Introducción

El **SuperAdmin de NICHO** es el panel de control central desde donde tú y Eloy gestionan **todos los restaurantes clientes** de la plataforma. Es como la "torre de control": desde aquí ves cuántos restaurantes hay, quién paga, quién debe, qué módulos tiene activado cada uno, quién pidió soporte, etc.

Con el panel puedes:

- Dar de alta restaurantes nuevos y cambiar su plan o su estado (activo / suspendido).
- Activar o desactivar funciones (módulos) por restaurante.
- Definir qué pueden ver y hacer los empleados y los clientes de cada restaurante.
- Aprobar o rechazar solicitudes de acceso a funciones.
- Registrar pagos y ver quién tiene deuda.
- Ver las ventas reales de cada restaurante conectado.
- Revisar el historial de todo lo que se ha hecho (auditoría).
- Atender los reportes de soporte (tickets) que mandan los restaurantes.

### URL de acceso

- **Login:** `https://[tu-dominio]/sa-login`
- **Panel:** `https://[tu-dominio]/superadmin`
- **Control de demo:** `https://[tu-dominio]/superadmin/demo`

Si entras a `/superadmin` sin haber iniciado sesión, el sistema te manda automáticamente a la pantalla de login.

---

## 2. Login (Cómo entrar)

1. Abre la dirección `/sa-login`.
2. Verás una pantalla oscura con un escudo 🛡️ y el título **"Super Admin"**.
3. En el campo **Usuario** escribe `jesus` o `eloy` (en minúsculas).
4. En el campo **Contraseña** escribe tu contraseña.
5. Pulsa **"Entrar al panel"**.

Si los datos son correctos, entras directamente al panel. Si no, aparece un mensaje rojo: **"Credenciales incorrectas"**.

### Notas importantes sobre el acceso

- **Solo existen dos usuarios:** `jesus` y `eloy`. Nadie más puede entrar.
- Las contraseñas están **fijas en el código del sistema** (no se guardan en una base de datos consultable). Esto se hizo a propósito para que el acceso funcione **incluso si la base de datos llega a fallar**.
- La sesión dura **8 horas**. Pasado ese tiempo tendrás que volver a iniciar sesión.
- Para **cerrar sesión**, usa el botón de encendido ⏻ que aparece abajo a la izquierda, junto a tu nombre.

### ¿Olvidaste la contraseña?

Como las contraseñas están escritas dentro del código (no hay un botón de "recuperar contraseña"), si la olvidas tendrás que pedir a quien tenga acceso al código fuente que la consulte o la cambie. **No existe recuperación automática por correo.** Guarda tu contraseña en un gestor seguro.

---

## 3. Vista general (Métricas globales / Overview)

Es la primera pantalla que ves al entrar. Da un resumen instantáneo de toda la plataforma. Arriba a la derecha verás un indicador **"EN VIVO"**.

Tiene **4 tarjetas (KPIs)** en la parte superior. Cada una es **clickeable** y te lleva a la sección relacionada:

| Tarjeta | Qué significa | Te lleva a |
|---------|---------------|------------|
| **Restaurantes activos** | Cuántos restaurantes están funcionando, de cuántos hay en total | Restaurantes |
| **Ingresos del mes (MRR)** | Dinero mensual que generan los planes activos (suma de los precios de planes Básico/Premium activos; el Trial no suma porque es gratis) | Cuentas y Pagos |
| **Tasa de morosidad** | Porcentaje de restaurantes con saldo pendiente. Se pone en rojo si hay deuda | Cuentas y Pagos |
| **Usuarios totales** | Suma de todos los usuarios de todos los restaurantes | — |

Debajo hay dos paneles:

- **Estado de restaurantes:** lista cada restaurante con sus usuarios, su plan y su estado (Activo / Suspendido / Mantenimiento). Si debe dinero, aparece la cantidad en rojo.
- **Distribución de planes:** barras que muestran cuántos restaurantes hay en cada plan (Premium, Básico, Trial) y, abajo, el **MRR estimado** (ingreso mensual recurrente).

---

## 4. Actividad

Aquí mides **qué tan "vivo" está cada restaurante** según cuántas veces inician sesión.

### Tarjetas superiores

- **Muy activos:** más de 200 inicios de sesión al mes.
- **Poco activos:** entre 1 y 50 inicios — son los que están en **riesgo de abandonar** (churn).
- **Sin actividad:** nunca han iniciado sesión.
- **Promedio de logins** por restaurante.

### Tabla "Saldo por restaurante"

Muestra, por cada restaurante: último acceso, logins totales, saldo y una barra de **salud** con color.

**Cómo interpretar el color de salud:**

| Etiqueta | Color | Significa |
|----------|-------|-----------|
| Suspendido | Rojo | Está bloqueado por falta de pago |
| Mantenimiento | Amarillo | Está temporalmente fuera de servicio |
| Sin actividad | Gris | Nunca lo han usado |
| Poco activo | Amarillo | Lo usan poco, vigílalo |
| Activo | Cian | Uso saludable (más de 50 logins) |
| Muy activo | Verde | Cliente muy comprometido (más de 200 logins) |

Abajo hay un panel de **Notas internas** donde se muestran comentarios privados sobre cada restaurante (si los hay).

---

## 5. Gestión de restaurantes

Sección **🏪 Restaurantes**. Aquí administras a tus clientes.

### Dar de alta un restaurante

1. Pulsa el botón **"+ Registrar restaurante"** (arriba a la derecha).
2. Se abre una ventana. Llena:
   - **Nombre del restaurante** (ej. "El Fogón").
   - **Correo del admin** (ej. `admin@restaurante.com`).
   - **Plan inicial:** Trial (30 días gratis), Básico ($799/mes) o Premium ($2,499/mes).
3. Pulsa **"✅ Registrar"**.

El restaurante aparece de inmediato en la tabla con un token de API generado automáticamente. Si dejas el nombre o el correo vacíos, te avisará en rojo.

### Buscar y filtrar

- Usa la **barra de búsqueda** 🔍 para encontrar un restaurante por nombre.
- Usa los **chips de filtro** (Todos / Trial / Básico / Premium) para ver solo cierto plan.

### Cambiar estado (Activar / Suspender)

En la columna **Acciones** de cada restaurante:

- Si está activo, verás el botón rojo **"Suspender"**. Al pulsarlo, el restaurante queda suspendido (sus usuarios no pueden entrar).
- Si está suspendido, verás **"Activar"** para reactivarlo.

> Nota: los restaurantes en **Mantenimiento** no muestran estos botones aquí; el mantenimiento se controla en su propia sección.

### Ver el detalle de un restaurante

Pulsa **"Ver"** en cualquier restaurante. Se abre una ventana con todos sus datos: plan, estado, correo, usuarios, saldo pendiente, próximo pago, último pago y fecha de registro. Desde ahí también puedes suspenderlo o reactivarlo.

---

## 6. Feature Flags (Activar/desactivar funciones)

Sección **🚩 Feature Flags**. Un "feature flag" es simplemente un **interruptor** que enciende o apaga un módulo (una función) de la plataforma.

### Cómo funciona el alcance (scope)

Arriba hay unos chips para elegir **a quién** afectan los cambios:

- **🌐 Global:** afecta a la configuración general de NICHO (lo que ve mi-proyecto).
- **Nombre de cada restaurante:** afecta solo a ese restaurante.
- **🏪 Portales:** afecta a la app de Portales (que tiene su propia base de datos).

Selecciona primero el alcance, **luego** enciende o apaga los interruptores.

### Cómo encender o apagar un módulo

1. Elige el alcance (Global, un restaurante o Portales).
2. Busca el módulo en la tabla (están agrupados por categoría: Core, Analytics, Menú, Clientes, etc.).
3. Pulsa el **interruptor (toggle)** en la columna "Activo".
4. Aparece un mensaje verde **"Flags guardados ✓"**. El cambio se guarda automáticamente.

### Diferencia entre módulos "admin" y módulos "RESTA3"

Hay **dos familias de módulos**:

- **Módulos del admin principal (Nicho):** Ventas, Operaciones, Configuración, Analytics, Reportes, Menú Inteligente, Producción, CRM, Clientes, Reservaciones, Reseñas, Pedidos, Fidelización, Favoritos, Pantallas Digitales, Marketing, Automatizaciones IA, Contenido, Cumpleaños.
- **Módulos RESTA3** (la versión económica, empiezan con "R3"): TPV/Caja, Mesas, Cocina, Inventario, Compras, Empleados, Reportes.

Cuando seleccionas **Global** o **Portales**, ves **todos** los módulos juntos. Los cambios se guardan en la base de datos correcta según el alcance que elegiste.

### Roles con acceso

En cada módulo hay tres chips: **admin**, **employee**, **user**. Sirven para indicar qué roles pueden ver ese módulo. Solo se pueden tocar si el módulo está encendido.

### Exportar la configuración

El botón **"⬇ Exportar JSON"** descarga un archivo con toda la configuración actual de flags (útil para respaldo).

### Aviso de módulos apagados

Si algún módulo está apagado en el alcance que estás viendo, aparece una **alerta naranja** indicando cuántos módulos están desactivados.

---

## 7. Permisos por rol

Sección **🔐 Permisos por rol**. Aquí decides **qué pueden hacer los empleados y los clientes** de cada restaurante.

### Pasos

1. Elige la pestaña: **👷 Empleado** o **📱 Usuario / Cliente**.
2. Elige el alcance con los chips (🌐 Global, un restaurante o 🏪 Portales).
3. Enciende o apaga el interruptor de cada módulo.

### Qué puede hacer cada rol

**Empleado** — módulos disponibles: Fidelización, Sellar visita, Pedidos, Menú (ver y editar), Recetario, Clientes (ver y editar), Pantalla TV.

**Usuario / Cliente** — módulos: Ver mi tarjeta, Canjear recompensas, Menú, Reseñas, Registro por QR, Historial de visitas.

### El candado 🔒

Algunos módulos tienen un candado 🔒. Significa que **requieren tu aprobación (Super Admin)** antes de que el admin del restaurante pueda activarlos. Los módulos sin candado los puede activar el admin por su cuenta.

### Jerarquía de permisos (cómo encaja todo)

1. **Tú (Super Admin)** controlas qué módulos existen en la plataforma.
2. **El admin del restaurante** solo puede activar lo que tú dejaste habilitado.
3. Los módulos con 🔒 necesitan tu aprobación explícita.
4. **Empleados y clientes** solo ven lo que ambos niveles superiores autorizaron.

---

## 8. Solicitudes de acceso

Sección **📬 Solicitudes**. Cuando un admin de restaurante quiere desbloquear una función con candado, te manda una **solicitud**. Aquí las revisas.

Hay tres pestañas: **⏳ Pendientes**, **✅ Aprobadas**, **❌ Rechazadas**. El número de pendientes aparece también como insignia en el menú lateral.

Cada solicitud muestra: el restaurante, la función que pide activar, la razón que escribió, quién la pidió y cuándo.

### Aprobar

Pulsa **"✅ Aprobar"**. La función queda autorizada y la solicitud pasa a "Aprobadas".

### Rechazar

1. Pulsa **"❌ Rechazar"**.
2. Se abre una ventana pidiendo el **motivo del rechazo** (ej. "Esta función no está incluida en su plan actual").
3. Escribe el motivo y pulsa **"Confirmar rechazo"**. El motivo se le mostrará al admin.

---

## 9. Seguridad

Sección **🛡️ Seguridad**. Configuras las reglas de acceso **por restaurante**.

### Pasos

1. Selecciona un restaurante con los chips de arriba.
2. Ajusta las opciones.
3. Pulsa **"💾 Guardar"** (arriba a la derecha).

### Opciones disponibles

**Sesión y acceso:**
- **Duración de sesión del empleado:** deslizador de 1 a 24 horas. Pasado ese tiempo, el empleado debe volver a entrar.
- **Intentos de login fallidos:** después de X intentos fallidos la cuenta se bloquea (1 a 10).
- **Requerir PIN para acciones sensibles:** activa un PIN para canjear recompensas, borrar clientes o exportar datos.

**Horario de acceso:**
- **Desde / Hasta:** define el rango horario en que los empleados pueden iniciar sesión. Fuera de ese horario, el acceso se bloquea.
- **Whitelist de IPs:** si la activas, solo se puede acceder desde direcciones IP registradas.

Abajo hay un **resumen visual** con tarjetas verdes (configuración segura) o amarillas (recomendable reforzar).

---

## 10. Facturación (Cuentas y Pagos)

Sección **💳 Cuentas y Pagos**. Aquí gestionas el dinero.

### Tarjetas superiores

- **Al corriente:** cuántos restaurantes no deben nada.
- **Deuda acumulada:** total que te deben (en rojo si hay deuda).
- **MRR activo:** ingreso mensual recurrente de los planes activos.

### Registrar un pago

En la tabla, cuando un restaurante tiene deuda aparece el botón verde **"💰 Liquidar"**. Al pulsarlo:
- El saldo se pone en cero.
- Se actualiza la fecha del último pago a hoy.
- Si el restaurante estaba **suspendido por falta de pago, se reactiva automáticamente**.

### Cambiar el plan

Pulsa **"Cambiar plan"** en cualquier restaurante. Elige el nuevo plan (Trial / Básico / Premium) y confirma. El límite de usuarios se ajusta automáticamente al del nuevo plan.

### Ver quién debe

Los restaurantes con deuda aparecen con la cantidad en rojo y la etiqueta **"Deuda pendiente"**. Además, cuando hay deudas aparece un **banner rojo de alerta** en la parte superior del panel (lo puedes cerrar con la ✕).

---

## 11. Ventas reales

Sección **💵 Ventas Reales**. Muestra los **ingresos reales** que registran los restaurantes conectados, en tiempo real.

Hay **tres fuentes**:
- **Nicho (mi-proyecto):** ventas del restaurante principal.
- **Portales:** ventas de la app de portales.
- **Resta3:** ventas de la versión económica.

### Qué ves

- **KPIs globales:** ventas de hoy (todas), ventas del mes, y una tarjeta por cada fuente.
- **Selector:** chips para elegir qué fuente quieres ver en detalle.
- **Desglose Hoy / Este mes:** separa las ventas por método de pago: 💵 Efectivo, 💳 Tarjeta, 📲 Transferencia y 🛵 Domicilio.
- **Últimos cortes de caja:** historial de cierres de turno, con quién lo entregó, número de pedidos y el desglose por método de pago.

Si un restaurante no ha registrado ventas, verás el mensaje "No hay datos de ventas disponibles".

---

## 12. Auditoría

Sección **🔍 Auditoría**. Es el **historial de todo lo que se hace** en el panel: quién hizo qué, sobre qué restaurante y cuándo.

### Filtrar

- **Barra de búsqueda:** escribe una acción, usuario o restaurante.
- **Pestañas de tipo:** Todos, Create (creaciones ➕), Update (cambios ✏️), Delete (borrados 🗑️), Access (accesos 👁️), Billing (pagos 💳).

Cada registro muestra: fecha/hora, tipo, usuario, restaurante, acción, detalles e IP.

### Exportar a CSV

Pulsa **"⬇ Exportar CSV"** para descargar todo el historial en un archivo que puedes abrir en Excel.

> Cada vez que registras un pago, cambias un plan, suspendes un restaurante o tocas un flag, queda registrado aquí automáticamente.

---

## 13. Planes

Sección **💎 Planes y niveles**. Aquí editas las características de cada plan (Trial, Básico, Premium).

### Editar un plan

1. Pulsa **"✏️ Editar plan"** en la tarjeta del plan.
2. En la ventana puedes cambiar:
   - **Nombre** y **color** del plan.
   - **Precio por mes.**
   - **Máximo de usuarios.**
   - **Días de prueba** (solo para Trial).
   - **Características:** lista de viñetas. Puedes agregar (➕), borrar (✕), editar el texto y marcar cada una como incluida o no (con la palomita verde).
3. Verás una **Vista previa** del plan abajo.
4. Pulsa **"💾 Guardar cambios"**.

### Asignar un plan a un restaurante

En la tabla "Asignar plan a restaurante", pulsa el botón con la flecha (→ Básico, → Premium, etc.) del plan al que quieres mover ese restaurante, y confirma. El máximo de usuarios se ajusta solo.

---

## 14. Descuentos

Sección **🎟️ Códigos de descuento**. Crea y gestiona cupones.

### Crear un código

1. Pulsa **"+ Nuevo código"**.
2. Llena:
   - **Código:** escríbelo tú o pulsa **"🎲 Auto"** para generar uno al azar (ej. `NICHOX5K2A`).
   - **Descuento** y **Tipo** (% o $).
   - **Máx usos:** cuántas veces se puede usar.
   - **Fecha de expiración** (obligatoria).
   - **Nota interna** (opcional, ej. "Campaña de mayo").
3. Pulsa **"✅ Crear código"**.

### Gestionar códigos

- **Tarjetas superiores:** códigos activos, usos totales y tasa de uso.
- En la tabla, cada código muestra el descuento, cuántas veces se ha usado (con barra de progreso), cuándo vence y su estado.
- Botón **"Desactivar" / "Activar"** para encender o apagar el código.
- El icono 📋 copia el código al portapapeles.

---

## 15. Mantenimiento

Sección **🔧 Modo mantenimiento**. Sirve para **bloquear temporalmente** un restaurante (por ejemplo, durante una actualización) sin afectar a los demás.

### Activar mantenimiento

1. Busca el restaurante en la lista.
2. Pulsa su **interruptor**. Queda en modo mantenimiento y aparece la etiqueta amarilla **"En mantenimiento"**.
3. Opcionalmente, escribe una **razón** en el campo de texto (ej. "Migración de base de datos").

Para sacarlo de mantenimiento, vuelve a pulsar el interruptor.

> Importante: el mantenimiento es independiente de la suspensión por falta de pago. Activar/quitar mantenimiento aquí **no** afecta a los restaurantes suspendidos.

---

## 16. Notificaciones / Tickets (Reportes de soporte)

Sección **🔔 Notificaciones**. Es la **bandeja de entrada de soporte**: los mensajes que mandan los empleados, los usuarios de Resta3 y los admins de los restaurantes.

El número de mensajes **sin leer** aparece como insignia roja en la campana 🔔 de la barra superior y en el menú.

### Qué ves en cada reporte

- Nombre del restaurante.
- Etiqueta de color según quién lo envió: **Empleado** (azul), **Resta3** (morado), **Admin** (naranja).
- El mensaje y la fecha/hora.
- Un punto rojo si está **sin leer**.

### Acciones

- **"✓ Leer":** marca un reporte como leído.
- **"✓ Marcar todos leídos":** marca todos de golpe.
- **"🗑":** elimina un reporte.
- **"↺ Actualizar":** recarga la lista para ver los nuevos.

> Los reportes llegan de **dos bases de datos** distintas (la principal y la de Portales) y se mezclan automáticamente en una sola lista ordenada por fecha.

---

## 17. Control de Demo

Página especial en `/superadmin/demo`. Sirve para **preparar una demostración en vivo** del restaurante de muestra (mi-proyecto), insertando datos de ejemplo con un clic.

### Cuándo usarlo

Cuando vas a enseñarle la plataforma a un cliente potencial y quieres que el restaurante demo tenga datos realistas (menú, pedidos, reseñas, clientes, etc.).

### Cómo funciona

Está organizado en secciones (Cliente, Empleado, Admin). Cada tarjeta tiene un botón **"⚡ Activar"** que inserta ciertos datos, y un botón **"Ver ↗"** que abre esa sección del restaurante demo en otra pestaña.

**Qué inserta cada botón:**

| Sección | Botón | Qué hace |
|---------|-------|----------|
| Cliente | Solo Menú / Menú+Tarjeta / Todo visible | Controla qué pestañas ve el cliente en su teléfono (presentación por fases) |
| Empleado | Menú | Inserta 4 platillos de demostración |
| Empleado | Recetas | Inserta 2 recetas con pasos (Hamburguesa, Pizza) |
| Empleado | Pedido activo | Crea un pedido de "Mesa 4" por $330 |
| Empleado | Lealtad | Crea una cliente demo (María García) |
| Admin | Reseñas | Inserta 1 reseña buena y 1 mala (dispara alerta roja) |
| Admin | Pantalla TV | Inserta 3 slides de ofertas |
| Admin | Dashboard | Solo abre el dashboard (no inserta datos) |

Si un dato ya existe, te avisará (ej. "Menú ya cargado"). Abajo hay accesos rápidos a todas las secciones del panel del restaurante demo.

---

## 18. Preguntas frecuentes

**No puedo entrar / dice "Credenciales incorrectas".**
Verifica que escribiste el usuario en minúsculas (`jesus` o `eloy`) y la contraseña correcta. Recuerda que solo existen esos dos usuarios.

**Me sacó del panel solo.**
La sesión dura 8 horas. Vuelve a iniciar sesión en `/sa-login`.

**Cambié un flag pero no veo el efecto en el restaurante.**
Asegúrate de haber seleccionado el **alcance correcto** (Global, el restaurante específico o Portales) antes de tocar el interruptor. Cada alcance se guarda en una base de datos distinta. Espera el mensaje verde "Flags guardados ✓".

**No aparecen restaurantes / ventas / tickets.**
Puede ser un problema temporal de conexión con la base de datos. Pulsa "↺ Actualizar" donde esté disponible, o recarga la página. Si persiste, avisa al equipo técnico.

**Liquidé un pago pero el restaurante sigue suspendido.**
Al liquidar, el restaurante se reactiva **solo si su suspensión era por falta de pago**. Si está en "Mantenimiento", debes quitarlo desde la sección de Mantenimiento.

**¿Qué es el "MRR"?**
Es el ingreso mensual recurrente: la suma de los precios de los planes de pago (Básico y Premium) de los restaurantes que están activos. El Trial no cuenta porque es gratis.

**¿Puedo deshacer un cambio?**
No hay un botón de "deshacer", pero todo queda registrado en **Auditoría**, así que puedes ver qué cambió y revertirlo manualmente.

**¿Por qué hay un restaurante "Portales" aparte?**
Portales es una app cliente con su propia base de datos. Por eso aparece como un alcance separado en Feature Flags y Permisos, y sus ventas y tickets se muestran por separado.

---

*Fin del manual de usuario. Para dudas técnicas, consulta el manual técnico (`manual-tecnico-2026-06-28.md`).*
