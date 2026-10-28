"""Prueba de punta a punta en navegador del sitio compilado contra el GitHub simulado.
Requiere: node pruebas/iniciar-entorno.mjs corriendo (puertos 4378-4380)."""
import json, sys, urllib.request, os
from playwright.sync_api import sync_playwright

SITIO = "http://127.0.0.1:4379/"
CONTROL = "http://127.0.0.1:4380/"
C = "/var/tmp/gh-capturas/"
os.makedirs(C, exist_ok=True)
ok = fallas = 0
errores = []
def check(n, c):
    global ok, fallas
    if c: ok += 1; print("  ✔", n)
    else: fallas += 1; print("  ✘", n)
def control(q=""):
    return urllib.request.urlopen(CONTROL + q).read()
TOKEN = json.loads(control())["token"]

def observar(p, quien):
    p.on("pageerror", lambda e: errores.append(f"{quien}: {e}"))
    p.on("console", lambda m: m.type == "error" and "status of 4" not in m.text and errores.append(f"{quien}: {m.text}"))

def entrar(p, usuario, clave):
    p.goto(SITIO); p.wait_for_selector("text=Iniciar sesión")
    p.fill("input[autocomplete=username]", usuario); p.fill("input[type=password]", clave); p.click("button:has-text('Entrar')")

def abrir_tarea(p, nombre="Q3 Proyecto Alpha", carpeta="IA"):
    if p.locator(f"button.nav-tarea:has-text('{nombre}')").count() == 0:
        p.click(f"button.nav-carpeta:has-text('{carpeta}')")
    p.click(f"button.nav-tarea:has-text('{nombre}')")

def crear_clave(p, nueva):
    p.wait_for_selector("text=Creá tu contraseña")
    pw = p.locator("input[type=password]"); pw.nth(0).fill(nueva); pw.nth(1).fill(nueva); p.click("button:has-text('Guardar contraseña')")

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1366, "height": 860}, accept_downloads=True)
    v = ctx.new_page(); observar(v, "vero")

    print("Ingreso de la administradora")
    entrar(v, "VeronicaDelgado1", "mala-1234"); v.wait_for_selector("text=Usuario o contraseña incorrectos.")
    check("contraseña incorrecta: mensaje claro", True)
    entrar(v, "VeronicaDelgado1", "Temporal-Prueba-9")
    v.wait_for_selector("text=Conectá GitHub"); check("primera vez pide el token de GitHub", True)
    v.screenshot(path=C + "01_token.png")
    v.fill("#token-gh", "no-es-token"); v.click("button:has-text('Guardar token')"); v.wait_for_selector("text=no parece un token")
    check("rechaza texto que no es token", True)
    v.fill("#token-gh", TOKEN); v.click("button:has-text('Guardar token')")
    crear_clave(v, "Vero-Segura-2026"); v.wait_for_selector("text=Hola Verónica")
    check("tras token y contraseña nueva entra al espacio", True)
    check("el token quedó cifrado (no aparece en usuarios.json)", TOKEN.encode() not in control("?archivo=usuarios.json"))

    print("Proyecto, tareas, comentarios y adjuntos")
    v.click("text=+ Nuevo proyecto"); v.fill("#nc-nombre", "IA"); v.click(".modal button:has-text('Crear proyecto')")
    v.wait_for_selector(".vista-carpeta h1:has-text('IA')"); check("proyecto IA creado y abierto", True)
    check("el proyecto se despliega en el menú con «+ Crear tarea»", v.locator(".subnav button:has-text('+ Crear tarea')").count() == 1)
    v.click(".vista-carpeta button:has-text('+ Crear tarea')"); v.fill("#nt-nombre", "Q3 Proyecto Alpha")
    check("la tarea nueva queda en el proyecto IA", v.locator("#nt-carpeta option:checked").inner_text() == "IA")
    v.click(".modal button:has-text('Crear tarea')")
    v.wait_for_selector("h1:has-text('Q3 Proyecto Alpha')")
    check("la tarea aparece debajo de IA en el menú", v.locator(".subnav button.nav-tarea:has-text('Q3 Proyecto Alpha')").count() == 1)
    check("migas: volver a IA", v.locator(".migas-proyecto a").inner_text() == "← IA")
    v.screenshot(path=C + "01b_carpeta_menu.png")
    for t in ["Requisitos", "Criterios de éxito", "Presupuesto"]:
        v.fill("input[aria-label^='Agregar subtarea a']", t); v.keyboard.press("Enter"); v.wait_for_selector(f"text={t}")
    fila = lambda i: v.locator("tr.fila").nth(i)
    check("sección por defecto se llama Subtareas", v.locator(".cabecera-grupo >> text=Subtareas").count() >= 1)
    check("filas numeradas 1. 2. 3.", [v.locator("tr.fila .numero-fila").nth(i).inner_text() for i in range(3)] == ["1.", "2.", "3."])
    check("botón + para agregar", v.locator("button.boton-mas").count() >= 1)
    est = v.locator("select[aria-label='Estado']").first
    opciones = est.locator("option").all_inner_texts()
    check("lista de estados: Pendiente, En curso, Stopper, Listo", opciones[1:] == ["Pendiente", "En curso", "Stopper", "Listo"])
    v.locator("select[aria-label='Estado']").nth(0).select_option(label="Listo")
    v.locator("select[aria-label='Estado']").nth(1).select_option(label="En curso")
    v.locator("select[aria-label='Estado']").nth(2).select_option(label="Stopper")
    v.wait_for_selector(".modal >> text=¿Cuál es el stopper?"); check("al elegir Stopper se pide el motivo", True)
    v.fill(".modal textarea", "Falta la aprobación de finanzas"); v.click(".modal button:has-text('Guardar stopper')")
    v.wait_for_selector("tr.fila .icono-stopper"); check("el stopper queda marcado en la fila", "Falta la aprobación" in v.locator("tr.fila .icono-stopper").first.get_attribute("title"))
    v.locator("select[aria-label='Estado']").nth(1).select_option(label="Stopper")
    v.wait_for_selector(".modal >> text=¿Cuál es el stopper?"); v.click(".modal button:has-text('Cancelar')")
    v.wait_for_timeout(500)
    check("si se cancela, el estado no cambia", v.locator("select[aria-label='Estado']").nth(1).evaluate("e => e.options[e.selectedIndex].text") == "En curso")
    fondo = lambda i: v.locator("select[aria-label='Estado']").nth(i).locator("..").evaluate("e => getComputedStyle(e).backgroundColor")
    v.wait_for_timeout(800)
    check("colores: Listo verde, En curso amarillo, Stopper rojo", [fondo(0), fondo(1), fondo(2)] == ["rgb(29, 205, 159)", "rgb(255, 190, 0)", "rgb(224, 60, 49)"])
    v.locator("select[aria-label='Prioridad']").nth(0).select_option(label="Alta")
    v.locator("select[aria-label='Estimación en horas']").nth(0).select_option(label="4 h")
    v.locator("tr.fila input[type=date]").nth(0).fill("2026-11-15")
    check("3 tareas con estados", v.locator("tr.fila").count() == 3)
    v.wait_for_selector("text=Guardado en GitHub", timeout=15000); check("indicador: guardado en GitHub", True)
    check("datos.json en GitHub está cifrado", b"Requisitos" not in control("?archivo=datos.json"))
    fila(0).locator("button.abrir").click(); v.wait_for_selector(".panel-tarea")
    v.fill(".nuevo-comentario textarea", "Aprobado por el equipo"); v.click("button:has-text('Comentar')")
    v.wait_for_selector(".texto-comentario:has-text('Aprobado por el equipo')"); check("comentario publicado", True)
    contenido = bytes((i * 31) % 256 for i in range(250000))
    v.set_input_files(".subir-adjunto input[type=file]", files=[{"name": "informe.pdf", "mimeType": "application/pdf", "buffer": contenido}])
    v.wait_for_selector(".lista-adjuntos >> text=informe.pdf", timeout=20000); check("adjunto subido", True)
    with v.expect_download() as d: v.click(".nombre-adjunto:has-text('informe.pdf')")
    bajado = open(d.value.path(), "rb").read()
    check("adjunto descargado y descifrado es idéntico", bajado == contenido)
    v.screenshot(path=C + "02_panel.png")
    v.keyboard.press("Escape")
    v.wait_for_selector("text=Guardado en GitHub", timeout=15000)
    v.reload(); v.wait_for_selector("h1:has-text('Q3 Proyecto Alpha')", timeout=20000)
    check("tras recargar: el motivo del stopper sigue guardado", "Falta la aprobación" in (v.locator("tr.fila .icono-stopper").first.get_attribute("title") or ""))
    v.click("tr.fila .icono-stopper"); v.wait_for_selector(".modal textarea")
    check("el stopper se puede editar", v.input_value(".modal textarea") == "Falta la aprobación de finanzas"); v.click(".modal button:has-text('Cancelar')")
    check("tras recargar: prioridad, estimación y fecha guardadas",
      v.locator("select[aria-label='Prioridad']").nth(0).evaluate("e => e.options[e.selectedIndex].text") == "Alta"
      and v.locator("select[aria-label='Estimación en horas']").nth(0).input_value() == "4"
      and v.locator("tr.fila input[type=date]").nth(0).input_value() == "2026-11-15")
    v.screenshot(path=C + "02b_tabla.png", full_page=True)
    import subprocess
    salida = subprocess.run(["node", "pruebas/proyecto-antiguo.mjs", "VeronicaDelgado1", "Vero-Segura-2026", "Q3 Proyecto Alpha"], capture_output=True, text=True)
    check("proyecto pasado al formato anterior (Atascado / Grupo 1)", salida.stdout.strip() == "ok")
    v.reload(); v.wait_for_selector("h1:has-text('Q3 Proyecto Alpha')", timeout=20000)
    v.wait_for_selector(".cabecera-grupo >> text=Subtareas", timeout=20000)
    opciones = v.locator("select[aria-label='Estado']").first.locator("option").all_inner_texts()
    check("actualización automática: Atascado → Stopper y Grupo 1 → Subtareas", "Stopper" in opciones and "Atascado" not in opciones)
    try: v.wait_for_function("() => getComputedStyle(document.querySelectorAll(\"select[aria-label='Estado']\")[1].parentElement).backgroundColor === 'rgb(255, 190, 0)'", timeout=10000); amarillo = True
    except Exception: amarillo = False
    check("actualización automática: En curso pasa a amarillo (era naranja)", amarillo)
    v.wait_for_selector("text=Guardado en GitHub", timeout=15000)
    v.wait_for_selector("text=Guardado en GitHub", timeout=15000)
    v.reload(); v.wait_for_selector("text=Requisitos", timeout=15000)
    check("recarga: la sesión sigue y los datos están", v.locator("tr.fila").count() == 3)
    v.screenshot(path=C + "03_tabla.png", full_page=True)

    print("Eliminar proyectos")
    for nombre, tarea, borrar_tareas in [("Temporal", "Para borrar", True), ("Viejo", "Se conserva", False)]:
        v.click("text=+ Nuevo proyecto"); v.fill("#nc-nombre", nombre); v.click(".modal button:has-text('Crear proyecto')")
        v.wait_for_selector(f".vista-carpeta h1:has-text('{nombre}')")
        v.click(".vista-carpeta button:has-text('+ Crear tarea')"); v.fill("#nt-nombre", tarea); v.click(".modal button:has-text('Crear tarea')")
        v.wait_for_selector(f"h1:has-text('{tarea}')"); v.click(".migas-proyecto a"); v.wait_for_selector(f".vista-carpeta h1:has-text('{nombre}')")
        v.click("button:has-text('🗑 Eliminar proyecto')"); v.wait_for_selector(".capa >> text=Tiene 1 tarea")
        if borrar_tareas: v.click(".opciones-borrar label:has-text('Eliminarlas también')")
        if nombre == "Temporal": v.screenshot(path=C + "02c_eliminar.png")
        v.click(".capa button:has-text('Eliminar')")
        v.wait_for_selector("text=Hola Ver", timeout=10000)
        v.wait_for_function(f"() => ![...document.querySelectorAll('button.nav-carpeta')].some(b => b.textContent.includes('{nombre}'))", timeout=10000)
    check("eliminar proyecto con sus tareas: desaparecen ambos", v.locator("button.nav-carpeta:has-text('Sin proyecto')").count() == 1)
    v.click("button.nav-carpeta:has-text('Sin proyecto')"); v.wait_for_selector(".vista-carpeta")
    check("eliminar proyecto conservando tareas: pasan a Sin proyecto", v.locator(".vista-carpeta .tarjeta-proyecto:has-text('Se conserva')").count() == 1 and v.locator("text=Para borrar").count() == 0)
    v.click(".vista-carpeta .tarjeta-proyecto:has-text('Se conserva')"); v.wait_for_selector("text=Guardado en GitHub", timeout=15000)
    print("Importar de Excel")
    excel = os.environ.get("EXCEL_PRUEBA")
    if not excel:
        import openpyxl, datetime
        wb = openpyxl.Workbook(); ws = wb.active
        for fila in [["Tablero de prueba"], ["Pendientes"], ["Nombre", "Estado", "Vencimiento", "Prioridad", "Notas", "Menú desplegable"],
                     ["Flujo bienvenida", "En curso", datetime.datetime(2026, 11, 20), "Alta", "Revisar textos", "Flujo enviado"],
                     ["Token de llamadas", "No iniciado", datetime.datetime(2026, 11, 30), "Baja", "", ""],
                     ["Ya cerrado", "Listo", datetime.datetime(2026, 10, 1), "Media", "", ""]]:
            ws.append(fila)
        excel = "/var/tmp/gh-capturas/prueba.xlsx"; wb.save(excel)
    v.click("button.nav-carpeta:has-text('IA')"); v.wait_for_selector(".vista-carpeta h1:has-text('IA')")
    antes = v.locator(".vista-carpeta .tarjeta-proyecto").count() - 1
    v.click("button:has-text('Importar de Excel')"); v.set_input_files(".modal input[type=file]", excel)
    v.wait_for_selector(".lista-import li")
    marcadas = [l.locator(".nombre-import").inner_text() for l in v.locator(".lista-import li").all() if l.locator("input").is_checked()]
    estados = [l.locator(".estado-import").inner_text() for l in v.locator(".lista-import li").all() if l.locator("input").is_checked()]
    print("    marcadas:", marcadas)
    check("marca por defecto solo En curso y No iniciado", len(marcadas) > 0 and set(estados) <= {"En curso", "No iniciado"})
    v.screenshot(path=C + "02d_importar.png")
    v.click(".modal button:has-text('Importar')")
    v.wait_for_selector(".modal", state="detached", timeout=60000)
    despues = v.locator(".vista-carpeta .tarjeta-proyecto").count() - 1
    check(f"se crearon {len(marcadas)} tareas en IA", despues - antes == len(marcadas))
    primera = marcadas[0]; est0 = estados[0]
    v.click(f".vista-carpeta .tarjeta-proyecto:has-text('{primera}')"); v.wait_for_selector("tr.fila")
    est = v.locator("select[aria-label='Estado']").first.evaluate("e => e.options[e.selectedIndex].text")
    check("la subtarea 1 trae estado, fecha y notas", est == ("Pendiente" if est0 == "No iniciado" else est0) and v.locator("tr.fila input[type=date]").first.input_value() != "")
    v.wait_for_selector("text=Guardado en GitHub", timeout=20000)
    v.screenshot(path=C + "02e_importada.png", full_page=True)
    print("Usuarios y permisos")
    v.click("button.nav-item:has-text('Usuarios y permisos')"); v.wait_for_selector("h1:has-text('Usuarios y permisos')")
    claves = {}
    for usuario, nombre, rol in [("ana.mora", "Ana Mora", "editor"), ("beto", "Beto Solís", "lector")]:
        v.click("button:has-text('+ Crear usuario')"); v.fill("#nu-usuario", usuario); v.fill("#nu-nombre", nombre); v.select_option("#nu-rol", rol)
        claves[usuario] = v.input_value("#clave-temporal")
        v.click(".modal button:has-text('Crear usuario')"); v.wait_for_selector("text=Usuario creado"); v.click("button:has-text('Listo')")
        v.wait_for_selector(f".lista-usuarios >> text={nombre}")
    check("crea editora y lector con clave temporal", len(claves) == 2)
    v.screenshot(path=C + "04_usuarios.png")
    abrir_tarea(v); v.click("button:has-text('Equipo')")
    for usuario, rol in [("ana.mora", "editor"), ("beto", "viewer")]:
        v.fill(".modal input[placeholder='Nombre de usuario']", usuario); v.select_option(".modal select[aria-label=Rol] >> nth=0", rol); v.click(".modal button:has-text('Agregar')")
        v.wait_for_selector(f".lista-miembros >> text=@{usuario}")
    check("agrega a ambos al equipo del proyecto", True)
    v.keyboard.press("Escape")

    a = b.new_context(viewport={"width": 1280, "height": 800}).new_page(); observar(a, "ana")
    entrar(a, "ana.mora", claves["ana.mora"]); crear_clave(a, "Ana-Segura-2026")
    a.wait_for_selector("text=Hola Ana"); check("editora entra sin pedir token (lo abre con su llave)", True)
    abrir_tarea(a); a.wait_for_selector("text=Requisitos")
    a.fill("input[aria-label^='Agregar subtarea a']", "Tarea de Ana"); a.keyboard.press("Enter"); a.wait_for_selector("text=Guardado en GitHub", timeout=15000)
    v.wait_for_selector("text=Tarea de Ana", timeout=35000); check("el cambio de la editora aparece solo en la otra sesión (≤ 20 s)", True)

    l = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True).new_page(); observar(l, "beto")
    raw_antes = json.loads(control())["raw"]
    entrar(l, "beto", claves["beto"]); l.wait_for_selector("text=Hola Beto")
    check("lector entra sin cambio obligatorio de clave ni token", l.locator("text=Creá tu contraseña").count() == 0)
    abrir_tarea(l); l.wait_for_selector("text=Tarea de Ana")
    check("lector lee desde raw.githubusercontent", json.loads(control())["raw"] > raw_antes)
    check("lector: solo lectura (sin agregar tareas ni nuevo proyecto)", l.locator("input[aria-label^='Agregar subtarea a']").count() == 0 and l.locator("text=+ Nuevo proyecto").count() == 0)
    l.locator("tr.fila:has-text('Requisitos') button.abrir").click(); l.wait_for_selector(".lista-adjuntos >> text=informe.pdf")
    with l.expect_download() as d2: l.click(".nombre-adjunto:has-text('informe.pdf')")
    check("lector descarga el adjunto", open(d2.value.path(), "rb").read() == contenido)
    check("lector no ve botón para borrar adjuntos", l.locator(".lista-adjuntos button[aria-label^=Eliminar]").count() == 0)

    print("Quitar acceso (rotación de llaves)")
    v.click("button.nav-item:has-text('Usuarios y permisos')"); v.locator(".lista-usuarios li:has-text('Ana Mora') button:has-text('Quitar acceso')").click()
    v.locator(".modal button:has-text('Quitar acceso')").click()
    v.wait_for_selector("text=Renová el token de GitHub", timeout=30000); check("pide renovar el token tras quitar a una editora", True)
    v.click("button:has-text('Entendido')")
    a.wait_for_selector("text=Iniciar sesión", timeout=35000); check("la sesión de la editora se cierra sola", True)
    entrar(a, "ana.mora", "Ana-Segura-2026"); a.wait_for_selector("text=Usuario o contraseña incorrectos."); check("la editora ya no puede entrar", True)
    l.wait_for_selector("text=Iniciar sesión", timeout=35000)
    entrar(l, "beto", claves["beto"]); l.wait_for_selector("text=Hola Beto"); abrir_tarea(l)
    l.wait_for_selector("text=Tarea de Ana"); check("el lector recibe la llave nueva y sigue leyendo", True)
    check("la administradora sigue trabajando sin interrupción", v.locator("text=Usuarios y permisos").count() >= 1)
    v.click(".cuenta .nav-item"); v.click("text=Cerrar sesión"); v.wait_for_selector("text=Iniciar sesión")
    entrar(v, "VeronicaDelgado1", "Vero-Segura-2026"); v.wait_for_selector("text=Hola Verónica")
    abrir_tarea(v); v.fill("input[aria-label^='Agregar subtarea a']", "Después de rotar"); v.keyboard.press("Enter")
    v.wait_for_selector("text=Guardado en GitHub", timeout=15000); check("la administradora sigue guardando tras la rotación", True)

    print("Seguridad del sitio")
    f = b.new_context().new_page()
    f.set_content(f'<iframe id="x" src="{SITIO}" width="800" height="600"></iframe>'); f.wait_for_timeout(2500)
    marco = f.frame_locator("#x")
    visible = f.frames[1].evaluate("getComputedStyle(document.documentElement).visibility") if len(f.frames) > 1 else "sin marco"
    print("     visibilidad dentro del iframe:", visible, "· página superior:", f.url)
    check("dentro de un iframe ajeno el sitio no se muestra", visible == "hidden" or f.url.startswith(SITIO))
    reloj = b.new_context().new_page(); observar(reloj, "reloj")
    reloj.clock.install()
    entrar(reloj, "beto", claves["beto"]); reloj.wait_for_selector("text=Hola Beto")
    reloj.clock.fast_forward("16:00"); reloj.wait_for_selector("text=sin actividad", timeout=10000)
    check("se cierra la sesión tras 15 minutos sin actividad", reloj.locator("text=Iniciar sesión").count() == 1)
    control("?version=209912312359")
    n = b.new_context().new_page(); cargas = []
    n.on("load", lambda: cargas.append(n.url))
    n.goto(SITIO); n.wait_for_selector("text=Hay una versión nueva", timeout=15000); n.wait_for_timeout(3000)
    check(f"detecta versión nueva y avisa, sin bucle de recargas ({len(cargas)} carga/s)", len(cargas) <= 2)
    n.click(".aviso-version button"); n.wait_for_timeout(2000)
    check("el botón Actualizar recarga con ?v= nuevo una sola vez", "v=209912312359" in n.url and len(cargas) <= 3)
    control("?version=")
    m = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2).new_page()
    entrar(m, "beto", claves["beto"]); m.wait_for_selector("text=Hola Beto"); m.screenshot(path=C + "05_movil.png")
    check("celular: sin desplazamiento horizontal", m.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    b.close()

print("Errores de consola:", errores[:6] or "ninguno")
print(f"\nResultado: {ok} OK, {fallas} fallidas")
sys.exit(1 if fallas or errores else 0)
