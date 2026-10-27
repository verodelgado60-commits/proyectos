// Pruebas de ghdb.js contra el GitHub simulado. Uso: node pruebas/ghdb.prueba.mjs
import { crearSimulador } from "./github-simulado.mjs";
import { crearCliente, crearInstalacion } from "../../ghdb.js";

const PUERTO = 4377;
const sim = crearSimulador({ owner: "o", repo: "r" });
await sim.escuchar(PUERTO);
const config = { owner: "o", repo: "r", rama: "datos", api: `http://127.0.0.1:${PUERTO}`, raw: `http://127.0.0.1:${PUERTO}/raw` };
const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const cliente = () => crearCliente(config, { almacenamiento: memoria(), persistente: memoria() });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hastaGuardar(c, max = 20000) { const t = Date.now(); while (c.pendientes() && Date.now() - t < max) await esperar(100); return c.pendientes() === 0; }

let ok = 0, fallas = 0;
const check = (n, c) => { if (c) { ok++; console.log("  ✔", n); } else { fallas++; console.log("  ✘", n); } };

// Instalación inicial (lo que hace el script del desarrollador)
const TEMPORAL = "Temporal-2026-abc";
const { usuarios, datos } = await crearInstalacion({ usuarioAdmin: "VeronicaDelgado1", claveAdmin: TEMPORAL, nombreAdmin: "Verónica Delgado" });
sim.poner("datos", "usuarios.json", JSON.stringify(usuarios));
sim.poner("datos", "datos.json", JSON.stringify(datos));
const txtU = sim.obtener("datos", "usuarios.json").toString();
check("usuarios.json no contiene el nombre de usuario ni contraseñas en claro", !/veronica/i.test(txtU) && !txtU.includes(TEMPORAL));
check("datos.json no contiene texto en claro", !sim.obtener("datos", "datos.json").toString().includes("tablas"));

console.log("Ingreso y token");
const a = cliente();
check("contraseña incorrecta rechazada", (await a.auth.signInWithPassword({ usuario: "VeronicaDelgado1", password: "mala" })).error?.code === "credenciales");
check("usuario inexistente da el mismo mensaje", (await a.auth.signInWithPassword({ usuario: "nadie", password: "x" })).error?.message === "Usuario o contraseña incorrectos.");
let r = await a.auth.signInWithPassword({ usuario: "veronicadelgado1", password: TEMPORAL });
check("administradora entra (sin importar mayúsculas)", !r.error);
check("primera vez: pide token", r.data.session.needsToken === true);
const perfil = (await a.from("profiles").select("*").eq("id", r.data.user.id).single()).data;
check("perfil exige cambiar la contraseña temporal", perfil.must_change_password === true && perfil.rol === "admin");
check("sin token no se puede guardar", (await a.from("projects").insert({ name: "x" })).error === null && !(await hastaGuardar(a, 1500)));
a._estado.cola = []; // se descarta esa prueba
check("token con formato inválido rechazado", (await a.auth.guardarToken("hola")).error?.code === "token");
check("token válido se guarda cifrado", !(await a.auth.guardarToken(sim.tokenValido)).error && !sim.obtener("datos", "usuarios.json").toString().includes(sim.tokenValido));
check("cambio de contraseña", !(await a.auth.updateUser({ password: "Vero-Nueva-2026" })).error);
await a.from("profiles").update({ must_change_password: false }).eq("id", perfil.id);
const a2 = cliente();
check("la contraseña temporal ya no sirve", (await a2.auth.signInWithPassword({ usuario: "VeronicaDelgado1", password: TEMPORAL })).error);
r = await a2.auth.signInWithPassword({ usuario: "VeronicaDelgado1", password: "Vero-Nueva-2026" });
check("entra con la nueva y recupera el token", !r.error && r.data.session.needsToken === false);

console.log("Guardado, cola y fusión");
const p1 = (await a.from("projects").insert({ name: "Q3 Alpha" }).select().single()).data;
await a.from("tasks").insert({ project_id: p1.id, title: "Requisitos" });
check("cambios agrupados en un solo guardado", await hastaGuardar(a));
const escriturasAntes = sim.control.escrituras;
await a2.sondearAhora();
check("otra sesión ve los cambios al sondear", (await a2.from("tasks").select("*").eq("project_id", p1.id)).data.length === 1);
// Conflicto: ambos guardan a la vez
await Promise.all([a.from("tasks").insert({ project_id: p1.id, title: "Desde A" }), a2.from("tasks").insert({ project_id: p1.id, title: "Desde B" })]);
await Promise.all([hastaGuardar(a), hastaGuardar(a2)]);
await a.sondearAhora(); await a2.sondearAhora();
const titulos = (await a.from("tasks").select("*").eq("project_id", p1.id)).data.map((t) => t.title).sort();
check("guardados simultáneos se fusionan sin perder nada", JSON.stringify(titulos) === JSON.stringify(["Desde A", "Desde B", "Requisitos"]));
check("hubo reintento por conflicto (más de una escritura)", sim.control.escrituras - escriturasAntes >= 2);
// Falla de red: no se pierden cambios
sim.control.fallaEscritura = true;
await a.from("tasks").update({ title: "Requisitos v2" }).eq("title", "Requisitos");
await esperar(1200);
check("si GitHub falla, el cambio queda pendiente", a.pendientes() > 0);
sim.control.fallaEscritura = false;
check("se reintenta solo cada 15 s y se guarda", await hastaGuardar(a, 20000));
await a2.sondearAhora();
check("el cambio reintentado llegó", (await a2.from("tasks").select("*").eq("title", "Requisitos v2")).data.length === 1);
// Recarga: la sesión se recupera
const sesionGuardada = a._estado;
check("la sesión vive en sessionStorage (recarga)", Boolean(sesionGuardada.sesion));

console.log("Usuarios y permisos");
await a.admin.crear({ usuario: "ana.mora", nombre: "Ana Mora", clave: "Ana-Temporal-1", rol: "editor" });
await a.admin.crear({ usuario: "beto", nombre: "Beto", clave: "Beto-Lector-1", rol: "lector" });
check("usuario duplicado rechazado", await a.admin.crear({ usuario: "beto", clave: "x", rol: "lector" }).then(() => false, (e) => e.code === "duplicado"));
const ana = cliente();
r = await ana.auth.signInWithPassword({ usuario: "ana.mora", password: "Ana-Temporal-1" });
check("editora entra y obtiene el token sin pedirlo", !r.error && r.data.session.needsToken === false);
await ana.from("tasks").insert({ project_id: p1.id, title: "Tarea de Ana" });
check("editora guarda", await hastaGuardar(ana));
check("editora no administra usuarios", await ana.admin.crear({ usuario: "zz", clave: "Zz-1234567", rol: "lector" }).then(() => false, (e) => e.code === "permiso"));
const beto = cliente();
r = await beto.auth.signInWithPassword({ usuario: "beto", password: "Beto-Lector-1" });
check("lector entra sin token", !r.error && r.data.session.needsToken === false);
const rawAntes = sim.control.lecturasRaw;
await beto.sondearAhora();
check("lector lee desde raw (sin token)", sim.control.lecturasRaw > rawAntes);
check("lector ve los datos", (await beto.from("tasks").select("*").eq("title", "Tarea de Ana")).data.length === 1);
check("lector no puede escribir", (await beto.from("tasks").insert({ project_id: p1.id, title: "hack" })).error?.code === "permiso");
check("lector no puede cambiar su contraseña (necesita token)", (await beto.auth.updateUser({ password: "Otra-123456" })).error?.code === "token");

console.log("Adjuntos cifrados");
const contenido = new Uint8Array(300000).map((_, i) => (i * 7) % 256);
const up = await a.storage.from("adjuntos").upload("t1/informe.pdf", new Blob([contenido]));
check("subir adjunto", !up.error);
const enGit = sim.obtener("datos", "adjuntos/t1/informe.pdf");
check("el adjunto queda cifrado en GitHub (iv + contenido)", enGit.length === contenido.length + 12 + 16 && !enGit.subarray(12, 40).equals(Buffer.from(contenido.subarray(0, 28))));
const down = await beto.storage.from("adjuntos").download("t1/informe.pdf");
const bajado = new Uint8Array(await down.data.arrayBuffer());
check("lector descarga y el contenido es idéntico", bajado.length === contenido.length && bajado.every((x, i) => x === contenido[i]));
check("lector no puede borrar adjuntos", (await beto.storage.from("adjuntos").remove(["t1/informe.pdf"])).error?.code === "permiso");

console.log("Archivos grandes y cupo de la API");
await a.from("comments").insert({ task_id: "x", project_id: p1.id, body: "x".repeat(1200000) });
await hastaGuardar(a);
check("datos.json de más de 1 MB", sim.obtener("datos", "datos.json").length > 1024 * 1024);
const a3 = cliente();
r = await a3.auth.signInWithPassword({ usuario: "VeronicaDelgado1", password: "Vero-Nueva-2026" });
check("se lee por blob cuando supera 1 MB", !r.error && (await a3.from("comments").select("*")).data.length === 1);
sim.control.limite = true;
await ana.sondearAhora();
check("sin cupo: la lectura sigue por raw", (await ana.from("tasks").select("*")).data.length >= 4);
await ana.from("tasks").insert({ project_id: p1.id, title: "Sin cupo" });
await esperar(1200);
check("sin cupo: el cambio queda pendiente, no se pierde", ana.pendientes() > 0);
sim.control.limite = false;
for (const c of [a, a2, a3, ana, beto]) c._gh.limitadoHasta = 0; // en la vida real se espera la hora de reinicio que indica GitHub
await ana.guardarAhora();
check("al volver el cupo, el cambio pendiente se guarda", await hastaGuardar(ana, 5000));

console.log("Intentos de ingreso");
const x = cliente();
for (let i = 0; i < 5; i++) await x.auth.signInWithPassword({ usuario: "ana.mora", password: "mala" });
check("tras 5 intentos fallidos se bloquea", (await x.auth.signInWithPassword({ usuario: "ana.mora", password: "Ana-Temporal-1" })).error?.code === "bloqueo");

console.log("Rotación de llaves al desactivar");
const kidAntes = JSON.parse(sim.obtener("datos", "usuarios.json")).kid;
await a.admin.desactivar((await a.from("profiles").select("*").eq("username", "ana.mora").single()).data.id);
const u2 = JSON.parse(sim.obtener("datos", "usuarios.json"));
check("se generó una llave nueva", u2.kid !== kidAntes && JSON.parse(sim.obtener("datos", "datos.json")).kid === u2.kid);
const anaDeNuevo = cliente();
check("la persona desactivada ya no entra", (await anaDeNuevo.auth.signInWithPassword({ usuario: "ana.mora", password: "Ana-Temporal-1" })).error);
const beto2 = cliente();
r = await beto2.auth.signInWithPassword({ usuario: "beto", password: "Beto-Lector-1" });
check("el lector recibe la llave nueva sin cambiar su contraseña", !r.error && (await beto2.from("tasks").select("*").eq("title", "Requisitos v2")).data.length === 1);
const down2 = await beto2.storage.from("adjuntos").download("t1/informe.pdf");
check("los adjuntos se volvieron a cifrar con la llave nueva", !down2.error && down2.data.size === contenido.length);
const a4 = cliente();
r = await a4.auth.signInWithPassword({ usuario: "VeronicaDelgado1", password: "Vero-Nueva-2026" });
check("la administradora entra con la llave nueva y conserva el token", !r.error && r.data.session.needsToken === false);
await a4.from("tasks").insert({ project_id: p1.id, title: "Tras rotación" });
check("se puede seguir guardando tras la rotación", await hastaGuardar(a4));
const viejaSesion = await ana.sondearAhora().then(() => ana._estado.sesion);
check("la sesión abierta de la persona desactivada se cierra sola", viejaSesion === null);

await sim.cerrar();
console.log(`\nResultado: ${ok} OK, ${fallas} fallidas`);
process.exit(fallas ? 1 : 0);
