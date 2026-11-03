# Gestor de Proyectos

Plataforma web **estática** publicada con GitHub Pages. Guarda sus datos **cifrados** en este mismo repositorio (rama `datos`). Sin Supabase, sin servidor y sin servicios externos: el navegador cifra todo y habla directamente con la API de GitHub.

**Sitio:** https://verodelgado60-commits.github.io/proyectos/

## Qué hace
Proyectos (por ejemplo IA, IVR) que agrupan tareas; cada tarea con secciones de subtareas numeradas, pasos, estados y prioridades editables, responsables, fechas, estimaciones, comentarios y **adjuntos cifrados**. Vistas de tabla, tablero y resumen; adaptable a computadora, tablet y celular.

## Cómo funciona

| Rama | Contenido |
|---|---|
| `main` | El sitio: `index.html`, `app.js`, `ghdb.js`, `config.js`, `estilos.css`, `lib/` (React y fuentes, sin CDNs) y `desarrollo/` (código fuente y pruebas) |
| `datos` | `datos.json` (todas las tablas, AES-GCM 256), `usuarios.json` (llaves envueltas), `adjuntos/` (cada archivo cifrado) |

- **Ingreso:** usuario + contraseña → PBKDF2-SHA256 (250 000 iteraciones) → abre la llave de datos K. Administración y edición abren también W, que descifra el token de GitHub. Lectura: solo K. La contraseña nunca sale del navegador.
- **Guardado:** cola de cambios con espera de 400 ms; al guardar se vuelve a leer el archivo remoto, se reaplican los cambios y se hace `PUT` con su `sha`. Si hay conflicto (409/422) se reintenta; si falla, los cambios no se descartan: quedan cifrados en el navegador y se reintenta cada 15 s.
- **Cambios de otras personas:** se revisan cada 20 s con `ETag` (las respuestas 304 no gastan cupo) sin interrumpir a quien escribe.
- **Sin token o sin cupo:** se lee desde `raw.githubusercontent.com` (puede tardar hasta unos 5 min en reflejar cambios por la caché de GitHub).
- **Quitar acceso:** se generan llaves nuevas, se vuelven a cifrar datos y adjuntos, y cada persona que sigue recibe la llave nueva con su llave pública (ECDH P-256), sin que nadie conozca su contraseña.

## Seguridad
- Content-Security-Policy: `default-src 'self'; script-src 'self'; connect-src` solo a `api.github.com` y `raw.githubusercontent.com`; `object-src 'none'`.
- No se muestra dentro de iframes de otras páginas.
- Límite de intentos de ingreso, sesión en `sessionStorage` y cierre por 15 min de inactividad.
- Nunca se usa `innerHTML` con datos de usuarios.
- Scripts versionados (`?v=AAAAMMDDhhmm`) y revisión automática de versión nueva.

**Límites que conviene conocer:**
- El repositorio es público: cualquiera puede descargar los archivos cifrados. Lo que los protege es la contraseña, así que usá contraseñas largas (mínimo 8 caracteres con letras y números; mejor 12 o más).
- Quien tiene rol Editor o Administradora puede abrir el token de GitHub. Dale esos roles solo a personas de confianza, y al quitarle el acceso a una de ellas, renová el token.
- Los permisos por proyecto (dueño, editor, lector) los aplica la plataforma. Todas las cuentas abren la misma llave de datos.
- Las personas con rol Lector no pueden cambiar su contraseña: lo hace la administradora.

## Desarrollo
```bash
cd desarrollo
npm ci
npm test               # lógica y reglas
npm run prueba:ghdb    # ghdb.js contra un GitHub simulado
npm run publicar       # compila y copia el sitio a la raíz con ?v= nuevo
```

## Recordatorio diario por WhatsApp (API oficial de Meta)
Todos los días a las 7:17 a. m. (hora de Costa Rica), GitHub Actions (`.github/workflows/avisos-whatsapp.yml`) entra con una cuenta de solo lectura, descifra los datos en el momento y envía **un** WhatsApp con las tareas y subtareas que vencen hoy o mañana. Si no vence nada, no envía. En el registro público de Actions nunca se escriben nombres de tareas.

**Secrets** (Settings → Secrets and variables → Actions → *New repository secret*):

| Nombre | Qué es |
|---|---|
| `AVISOS_USUARIO` / `AVISOS_CLAVE` | Una cuenta con rol **Lector** creada en «Usuarios y permisos» solo para esto |
| `WA_TOKEN` | Token permanente (usuario del sistema) de la app de Meta con permiso `whatsapp_business_messaging` |
| `WA_PHONE_ID` | *Phone number ID* del número de WhatsApp Business (en WhatsApp → API Setup) |
| `WA_DESTINO` | Tu número con código de país, sin + (ej. `50688887777`) |

Opcionales como **Variables**: `WA_PLANTILLA` (por defecto `recordatorio_vencimiento`), `WA_IDIOMA` (`es`), `WA_VERSION` (`v23.0`), `AVISOS_NOMBRE` (`Vero`).

La plantilla (categoría **Utilidad**, idioma español) debe estar aprobada por Meta con dos variables, por ejemplo:
> Hola {{1}}, tenés pendientes por vencer: {{2}}. Revisalos en tu plataforma de proyectos.

Para probarlo: Actions → «Recordatorio por WhatsApp» → *Run workflow*.
