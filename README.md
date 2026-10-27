# Gestor de Proyectos

> **Versión en uso: dentro de Claude.** La app publicada vive como página de Claude, con su propia base de datos y la identidad de Claude (el acceso se da con el botón Compartir). Se compila con `npm run build:claude` y se publica desde la conversación con Claude. La versión con GitHub Pages + Supabase queda en el código como alternativa y solo se despliega si se crea la variable de Actions `USAR_SUPABASE = true`.

Aplicación web de gestión de proyectos (estilo Monday.com): proyectos, grupos, tareas, subtareas, estados y prioridades editables, responsables, fechas, estimaciones y comentarios. Incluye vista de **tabla**, **tablero** (arrastrar y soltar) y **resumen**. Se adapta a celular, y los cambios se sincronizan en tiempo real entre dispositivos.

## Cómo funciona

| Pieza | Servicio | Qué hace |
|---|---|---|
| Código y publicación | GitHub + GitHub Pages | Cada cambio en `main` se prueba y se publica automáticamente |
| Datos, inicio de sesión y tiempo real | Supabase | Postgres con reglas de seguridad (RLS), contraseñas con hash bcrypt |
| Administración de usuarios | Función `admin-users` (Supabase) | Crear, desactivar, restablecer y eliminar cuentas |

- **Cambios de código** → se suben a GitHub → GitHub Actions prueba, actualiza la base de datos y publica el sitio.
- **Cambios de datos** (proyectos, tareas…) → se guardan directo en la base de datos desde la app, al instante, sin volver a publicar.

## Seguridad

- No hay registro público: solo la administradora crea cuentas, desde **Usuarios** dentro de la app.
- Cada cuenta nueva recibe una contraseña temporal que debe cambiarse en el primer ingreso (mínimo 8 caracteres, con letras y números).
- Las contraseñas nunca se guardan en texto plano. Supabase Auth las guarda con hash bcrypt.
- Cada proyecto tiene roles: **Dueño** (administra el equipo), **Editor** (crea y edita) y **Lector** (ve y comenta). Esto lo impone la base de datos, no solo la pantalla.
- Ninguna credencial vive en este repositorio: todas están en *Settings → Secrets and variables → Actions*.

## Secrets necesarios en GitHub

| Nombre | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token de cuenta de Supabase |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base de datos |
| `SUPABASE_PROJECT_REF` | ID del proyecto (20 letras) |
| `ADMIN_USERNAME` | Usuario de la administradora |
| `ADMIN_PASSWORD` | Contraseña inicial de la administradora (se pide cambiarla al entrar) |

## Estructura

```
src/                       App (React + Vite)
supabase/migrations/       Esquema de la base de datos (se aplica solo desde GitHub)
supabase/functions/        Función segura de administración de usuarios
supabase/tests/            Pruebas de permisos (RLS)
pruebas/e2e-local.mjs      Prueba de punta a punta contra una copia local de Supabase
.github/workflows/         Integración y despliegue continuo
```

## Pruebas

```bash
npm test                                   # lógica de la app
deno test supabase/functions/admin-users   # validaciones de la función
python3 supabase/tests/test_rls.py "<conexión>"   # permisos de la base de datos
```
