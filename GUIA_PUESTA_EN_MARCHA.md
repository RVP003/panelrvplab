# HT-RVP-09 Panel de Documentación LAB – Versión 02

## Guía de puesta en marcha

Responsable: Profesional SIG, con el apoyo de TICS. Fecha de la versión: 20/10/2026.

---

## 1. Qué cambia en la versión 02

| Incidente (MT-09) | Problema en la v01 | Solución en la v02 |
|---|---|---|
| 51 | Contraseñas escritas en el código y precargadas en el ingreso | Firebase Authentication: cada persona entra con su correo y su contraseña. El código no tiene contraseñas y no precarga datos. La sesión se cierra al cerrar el navegador o tras 30 minutos sin uso. |
| 7 y 52 | `clientSecret` de Google Drive publicado en el `config.js` | Se retira Google Drive. El `config.js` solo tiene datos públicos. El preset de Cloudinary se restringe (paso 5). |
| 53 | Evaluaciones, bitácora y repositorio solo en el navegador de cada equipo | Todo se guarda en Cloud Firestore y se ve igual desde la PTAP, la sede o cualquier equipo, en tiempo real. |
| 54 | Evidencias en base64 en el navegador; «Evidencias guardadas» aunque fallara | Los archivos van a Cloudinary y su registro a Firestore. «Guardado» solo aparece cuando el servidor confirma; si no hay conexión, el panel lo dice y no guarda. |
| 55 | Un archivo marcaba todas las evidencias; «Certificado de Cumplimiento» | Una carga por evidencia. El ítem queda «Cumple» solo con todas sus evidencias **y** la validación del Líder de Laboratorio. Se llama «Reporte interno de autoevaluación» y lleva el aviso de que no es una certificación. |
| 56 | Perfiles sin permisos; eliminar quitaba el registro | Perfiles con permisos aplicados en el servidor (tabla 2). Nada se borra: los documentos van a una papelera con motivo, y solo el Profesional SIG los restaura. |
| 57 | Dirección de GitHub en una cuenta personal | Organización de GitHub «redvitalpaipa» administrada por el Profesional SIG y TICS, dirección `https://redvitalpaipa.github.io/panellab` y panel instalable en cada equipo (pasos 10 y 11). |
| 58 | Pie sin código HT; librería en versión de prueba | Pie «HT-RVP-09 · Versión 02 · 20/10/2026»; Font Awesome 6.5.2 estable. |

**Trazabilidad documental (ISO 9001, 7.5.3):**
- Cada documento recibe un código **LAB-DOC-####** y su **versión**.
- Se guardan la **huella SHA-256**, quién lo cargó y la fecha y hora del servidor.
- Reemplazar un documento crea una versión nueva y deja la anterior **obsoleta**, consultable.
- El **Listado maestro** (Excel) y el **respaldo JSON** sirven como evidencia para auditorías y para el registro PA-GCOM-FO-08.

### Tabla 2. Perfiles

| Rol | Puede |
|---|---|
| Profesional SIG (`admin`) | Todo: usuarios, migración, restaurar de la papelera, respaldo JSON |
| Líder de Laboratorio (`lider`) | Cargar, validar o devolver ítems, declarar «No aplica», enviar a la papelera |
| Analista de Laboratorio (`analista`) | Cargar evidencias y documentos, nuevas versiones, observaciones, enviar a la papelera |
| Apoyo de Laboratorio (`apoyo`) | Cargar evidencias y documentos y escribir observaciones; **no** envía a la papelera ni valida |

---

## 2. Archivos del paquete

| Archivo | Se publica en GitHub | Función |
|---|---|---|
| `index.html` | Sí | Panel |
| `config.js` | Sí | Configuración pública de Firebase y Cloudinary (paso 6) |
| `js/` (4 archivos) | Sí | Lógica del panel, datos de la Resolución 1619 y conexión con Firebase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Sí | Instalación del panel como aplicación en cada equipo |
| `migracion-v01.html` | Sí, mientras dure la migración | Exporta los datos de la v01 de un equipo |
| `firestore.rules` | No (se pega en la consola) | Reglas de seguridad del servidor |
| `GUIA_PUESTA_EN_MARCHA.md` | No | Esta guía |

---

## 3. Crear el proyecto de Firebase

Se hace con la **cuenta de Google institucional** que será dueña del panel; nunca con una cuenta personal.

1. Entrar a `console.firebase.google.com` y seleccionar **Agregar proyecto**, por ejemplo con el nombre `panel-lab-rvp`. Google Analytics no es necesario.
2. El proyecto queda en el plan gratuito **Spark**, que alcanza para este uso.
3. En **Configuración del proyecto › Tus apps**, agregar una app **Web** con el nombre «Panel LAB». No hace falta activar Firebase Hosting.
4. Copiar los valores `apiKey`, `authDomain`, `projectId` y `appId`, que se usan en el paso 6.

## 4. Authentication, Firestore y primer administrador

**Authentication**
1. En **Authentication › Método de acceso**, habilitar **Correo electrónico/contraseña**.
2. En **Authentication › Usuarios › Agregar usuario**, crear la cuenta de cada persona con su correo institucional y una contraseña inicial de al menos 10 caracteres. Cada persona la cambia después con el botón 🔑 del panel.
3. En **Authentication › Configuración › Dominios autorizados**, agregar `redvitalpaipa.github.io` y la dirección github.io actual (la de la v01), que se usa durante la migración.

**Firestore**
1. En **Firestore Database › Crear base de datos**, elegir el **modo de producción**. Para la ubicación se sugiere `southamerica-east1` o `us-east1`; no se puede cambiar después.
2. En **Firestore Database › Reglas**, borrar el contenido, pegar el archivo `firestore.rules` completo y seleccionar **Publicar**.

**Primer administrador** (solo una vez; la consola no aplica las reglas)
1. En **Authentication › Usuarios**, copiar el **UID** de la cuenta del Profesional SIG.
2. En **Firestore › Iniciar colección**, crear la colección `usuarios` con un documento cuyo ID sea ese UID y estos campos:
   - `nombre` (string)
   - `email` (string)
   - `rol` (string) = `admin`
   - `activo` (boolean) = `true`
3. Los demás usuarios se registran desde el panel, en **Administración › Usuarios**, con su UID y su rol.

**Restringir la clave web** (recomendado, con TICS)
- En Google Cloud Console, en **APIs y servicios › Credenciales**, abrir la clave del navegador.
- En **Restricciones de aplicaciones**, elegir **Sitios web** y permitir solo `https://redvitalpaipa.github.io/*` y, durante la migración, la dirección github.io actual.

## 5. Cloudinary y Google Drive (cierre de los incidentes 7 y 52)

**Nuevo preset de Cloudinary**
1. Crear un **upload preset nuevo** con estos valores:
   - Signing mode: **Unsigned**
   - Folder: `SIG_LABORATORIO`
   - Allowed formats: `pdf, doc, docx, xls, xlsx, ppt, pptx, jpg, jpeg, png, gif, txt, zip, csv`
   - Max file size: 50 MB
   - Overwrite: desactivado
   - Unique filename: activado
2. **Eliminar el preset anterior**: estuvo publicado en el `config.js` de la v01.

**Google Drive**
- En Google Cloud, **eliminar el cliente OAuth** de Google Drive de la v01, o al menos **rotar su secreto**.
- Aunque se borre el `config.js` del repositorio, el secreto sigue en el historial público de GitHub.

## 6. Completar `config.js`

Reemplazar cada `PEGAR_AQUI` con los valores de los pasos 3 y 5 y dejar `MODO_PRUEBA: false`.

El valor `urlOficial` es solo informativo: el código usa rutas relativas y funciona en cualquier dirección sin modificar `index.html`.

## 7. Publicar en GitHub

1. En el repositorio actual, **borrar el `config.js` de la v01**.
2. Cargar todos los archivos marcados «Sí» en la tabla del punto 2, con sus carpetas (`js/` e `icons/`).
3. Mensaje del commit: «HT-RVP-09 Versión 02 – Firebase y trazabilidad».
4. Esperar a que GitHub Pages publique y abrir la dirección actual de github.io. Debe aparecer la pantalla de ingreso con el pie «HT-RVP-09 · Versión 02 · 20/10/2026».
5. Ingresar con la cuenta de administrador y registrar a los demás usuarios.

## 8. Migrar los datos de la v01 (antes del paso 10)

La v01 guardó los datos en el navegador de **cada** equipo, y el navegador solo los entrega a la misma dirección donde se usaron. Por eso la migración se hace **mientras el panel sigue en la dirección actual de github.io**: cuando el repositorio pase a la organización, esos datos dejan de ser accesibles.

Use una de estas dos opciones en cada equipo donde se usó la v01 (PTAP, sede u otros):

- **Opción A.** El Profesional SIG abre la v02 en ese equipo y navegador, ingresa y va a **Administración › Migración**. Escribe el nombre del equipo (p. ej. «PTAP-Analista») y selecciona **Migrar datos de este equipo**.
- **Opción B.** En ese equipo se abre `.../migracion-v01.html`, se escribe el nombre del equipo y se descarga el archivo. El Profesional SIG lo carga en **Administración › Migración › Opción B**; puede cargar varios archivos a la vez.

**Cómo se comporta la migración:**
- **Sin duplicados:** puede repetirse. Los archivos iguales se detectan por su huella SHA-256 y no se cargan dos veces.
- **Archivos de los ítems:** quedan **«por clasificar»**, porque la v01 no indicaba a qué evidencia correspondía cada archivo. El Analista abre cada ítem, revisa el archivo y lo **asigna** a la evidencia correcta.
- **Evaluaciones de la v01:** no se trasladan como validadas. Pasan a la bitácora como **registro histórico**, y el Líder valida de nuevo con el criterio de la v02.
- **Archivos que solo estaban en Google Drive:** se informan en el registro de la migración y se cargan a mano.
- **Datos locales:** la migración no borra nada del navegador. Cuando el Profesional SIG confirme que todo está en la v02, se pueden limpiar los datos del sitio en cada equipo.

## 9. Probar desde las dos oficinas (criterios de aceptación)

- [ ] El ingreso con una contraseña errada muestra «Correo o contraseña incorrectos» y no precarga nada.
- [ ] Una evidencia cargada en la PTAP aparece en la sede sin recargar la página.
- [ ] Un ítem con todas sus evidencias queda «Por validar», y solo el Líder lo pasa a «Cumple».
- [ ] Una nueva versión deja la anterior «Obsoleta», con el historial visible.
- [ ] El perfil Apoyo no ve el botón «Enviar a papelera».
- [ ] Sin Internet, el panel muestra «Sin conexión» y no confirma guardados.
- [ ] El Listado maestro en Excel muestra códigos, versiones y huellas SHA-256.
- [ ] El `config.js` publicado no contiene `clientSecret` ni contraseñas.

## 10. Dirección institucional: organización de GitHub

Se hace **después** de la migración. No se modifica ningún archivo del panel.

1. Con la cuenta de GitHub institucional, ir a **+ › New organization**, elegir el plan **Free** y usar el nombre `redvitalpaipa` (si está ocupado, `redvitalpaipa-esp`).
2. Invitar a TICS como segundo propietario: **People › Invite member › Owner**.
3. En el repositorio del panel, ir a **Settings › General** y renombrarlo `panellab`. Luego, en **Danger Zone › Transfer ownership**, transferirlo a la organización. GitHub conserva el historial de versiones (commits).
4. En el repositorio, ya dentro de la organización, ir a **Settings › Pages** y confirmar el origen **Deploy from a branch** con la rama `main` y la carpeta `/ (root)`. La dirección queda `https://redvitalpaipa.github.io/panellab`.
5. Comprobar que `redvitalpaipa.github.io` está en los dominios autorizados de Firebase (paso 4).
6. Retirar `migracion-v01.html` del repositorio y quitar la dirección github.io antigua de los dominios autorizados.
7. Registrar la organización, sus propietarios y la nueva dirección en el MT-09 y en la ficha PE-SIG-SGC-FO-29.

**Más adelante (opcional):** si se obtiene el acceso al DNS en Latinoamérica Hosting, en **Settings › Pages › Custom domain** se agrega un subdominio de la empresa, sin cambiar el código.

## 11. Instalar el panel en cada equipo

1. Abrir `https://redvitalpaipa.github.io/panellab` en **Chrome o Edge**.
2. Seleccionar **Instalar en este equipo** (en el encabezado del panel) o el ícono de instalar de la barra de direcciones.
3. Queda un ícono «Panel LAB» en el escritorio y en el menú Inicio. El panel abre en su propia ventana y siempre carga la versión publicada.
4. Para los visitantes ocasionales: imprimir un código QR con la dirección y ubicarlo en la PTAP y en la sede.

## 12. Operación y respaldo

- **Cada mes:** en **Reportes**, descargar el **Respaldo completo (JSON)** y el **Listado maestro (Excel)**, y registrarlos en el PA-GCOM-FO-08.
- **Nuevas versiones:** se publican igual que en el paso 7. Antes, se cambia `VERSION` en `sw.js` y `version` en `config.js`. Los equipos abiertos ven el aviso «Hay una nueva versión del panel».
- **Archivos en Cloudinary:** los archivos enviados a la papelera siguen allí, porque eliminarlos exige credenciales de servidor. El Listado maestro trae el «Public ID» de cada uno, para depurarlos con TICS si se decide eliminarlos.

## 13. Pendientes que no resuelve esta versión

- **Archivos en Cloudinary:** quien conoce el enlace de un archivo puede abrirlo. Para que solo los usuarios autenticados accedan a los archivos, migrar a Firebase Storage, que exige el plan Blaze con facturación.
- **Firebase App Check:** activarlo con reCAPTCHA Enterprise para limitar el uso de la clave web a la página oficial.
- **Documentación:** actualizar el instructivo PA-GCOM-IN-09 a la versión 02, la ficha FO-29 y el MT-09 (versión 02 y cierre de los incidentes 7 y 51 a 58, con la evidencia de las pruebas del punto 9).
