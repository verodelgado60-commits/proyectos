# Gestor de Proyectos

Plataforma web **estática** publicada con GitHub Pages. Guarda sus datos **cifrados** en este mismo repositorio (rama `datos`). Sin Supabase, sin servidor y sin servicios externos: el navegador cifra todo y habla directamente con la API de GitHub.

**Sitio:** https://verodelgado60-commits.github.io/proyectos/

## Qué hace
Proyectos estilo Monday: grupos, tareas, subtareas, estados y prioridades editables, responsables, fechas, estimaciones, comentarios y **adjuntos cifrados**. Vistas de tabla, tablero y resumen; adaptable a computadora, tablet y celular.

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
