// ghdb.js — Base de datos cifrada guardada en una rama de un repositorio de GitHub.
// Sin servidor ni servicios externos: el navegador cifra todo con AES-GCM 256 y lo guarda
// con la API de contenidos de GitHub. Las contraseñas nunca salen del navegador.
//
// Archivos en la rama de datos:
//   datos.json    { v, fecha, por, kid, box:{iv,ct} }           ← todas las tablas, cifradas con K
//   usuarios.json { v, pepper, iter, kid, wkid, entries[], dir, gh } (ver crearEntrada)
//   adjuntos/<ruta>  iv (12 bytes) + contenido cifrado con K
//
// Llaves: K (datos), W (envuelve el token de GitHub; solo administración y edición).
// Cada usuario tiene además un par ECDH P-256: su llave privada va cifrada con su contraseña
// y permite que la administradora le entregue llaves nuevas (rotación) sin conocer su contraseña.

const sutil = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();
export const ITERACIONES = 250000;
const ROLES = ["admin", "editor", "lector"];

// ---------------------------------------------------------------- utilidades
export function aB64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function deB64(s) {
  const bin = atob(String(s).replace(/\s/g, ""));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
export const azar = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function sha256hex(texto) { return hex(await sutil.digest("SHA-256", te.encode(texto))); }
const nuevoKid = () => hex(azar(8));
export const nuevoId = () => (globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : hex(azar(16)));
const clonar = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export class ErrorGhdb extends Error {
  constructor(mensaje, codigo, extra = {}) { super(mensaje); this.code = codigo; Object.assign(this, extra); }
}

// ---------------------------------------------------------------- criptografía
async function llaveAes(raw) { return sutil.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }

export async function cifrar(raw, bytes) {
  const iv = azar(12);
  const ct = await sutil.encrypt({ name: "AES-GCM", iv }, await llaveAes(raw), bytes);
  return { iv: aB64(iv), ct: aB64(ct) };
}
export async function descifrar(raw, caja) {
  try {
    return new Uint8Array(await sutil.decrypt({ name: "AES-GCM", iv: deB64(caja.iv) }, await llaveAes(raw), deB64(caja.ct)));
  } catch { throw new ErrorGhdb("No se pudo descifrar: la llave no corresponde.", "llave"); }
}
export const cifrarJSON = async (raw, obj) => cifrar(raw, te.encode(JSON.stringify(obj)));
export const descifrarJSON = async (raw, caja) => JSON.parse(td.decode(await descifrar(raw, caja)));

// Archivos adjuntos: iv (12 bytes) + contenido cifrado
export async function cifrarArchivo(raw, bytes) {
  const iv = azar(12);
  const ct = new Uint8Array(await sutil.encrypt({ name: "AES-GCM", iv }, await llaveAes(raw), bytes));
  const salida = new Uint8Array(12 + ct.length);
  salida.set(iv, 0); salida.set(ct, 12);
  return salida;
}
export async function descifrarArchivo(raw, bytes) {
  try {
    return new Uint8Array(await sutil.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, await llaveAes(raw), bytes.subarray(12)));
  } catch { throw new ErrorGhdb("No se pudo descifrar el archivo.", "llave"); }
}

// Llave derivada de la contraseña (PBKDF2-SHA256)
export async function derivarKek(clave, saltB64, iter = ITERACIONES) {
  const base = await sutil.importKey("raw", te.encode(clave), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await sutil.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: deB64(saltB64), iterations: iter }, base, 256));
}

// ECDH P-256 para entregar llaves a otro usuario sin conocer su contraseña
async function nuevoParEcdh() {
  const par = await sutil.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { pub: await sutil.exportKey("jwk", par.publicKey), priv: new Uint8Array(await sutil.exportKey("pkcs8", par.privateKey)) };
}
async function secretoCompartido(privKey, pubJwk) {
  const pub = await sutil.importKey("jwk", pubJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await sutil.deriveBits({ name: "ECDH", public: pub }, privKey, 256);
  const mezcla = new Uint8Array([...new Uint8Array(bits), ...te.encode("ghdb-envoltura-v1")]);
  return new Uint8Array(await sutil.digest("SHA-256", mezcla));
}
export async function envolverPara(pubJwk, secreto) {
  const eph = await sutil.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = await secretoCompartido(eph.privateKey, pubJwk);
  return { epk: await sutil.exportKey("jwk", eph.publicKey), ...(await cifrar(raw, secreto)) };
}
async function abrirEnvoltura(privPkcs8, env) {
  const priv = await sutil.importKey("pkcs8", privPkcs8, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return descifrar(await secretoCompartido(priv, env.epk), env);
}

export async function idDeUsuario(pepper, usuario) {
  return sha256hex(`${pepper}:${String(usuario).trim().toLowerCase()}`);
}

// Crea la entrada de un usuario: K envuelta con su contraseña y, si escribe, también W
export async function crearEntrada({ pepper, iter = ITERACIONES, usuario, clave, K, kid, W, wkid }) {
  const id = await idDeUsuario(pepper, usuario);
  const salt = aB64(azar(16));
  const kek = await derivarKek(clave, salt, iter);
  const par = await nuevoParEcdh();
  const entrada = { id, salt, kid, k: await cifrar(kek, K), pub: par.pub, priv: await cifrar(kek, par.priv) };
  if (W) { entrada.wkid = wkid; entrada.w = await cifrar(kek, W); }
  return entrada;
}

// Archivos iniciales (los usa el script de instalación con Node)
export async function crearInstalacion({ usuarioAdmin, claveAdmin, nombreAdmin = "" }) {
  const pepper = aB64(azar(16));
  const K = azar(32), W = azar(32), kid = nuevoKid(), wkid = nuevoKid();
  const entrada = await crearEntrada({ pepper, usuario: usuarioAdmin, clave: claveAdmin, K, kid, W, wkid });
  const dir = [{ id: entrada.id, usuario: String(usuarioAdmin).trim().toLowerCase(), nombre: nombreAdmin, rol: "admin", color: "#0780ee", activo: true, cambiarClave: true, creado: new Date().toISOString() }];
  const usuarios = { v: 1, pepper, iter: ITERACIONES, kid, wkid, entries: [entrada], dir: { kid, ...(await cifrarJSON(K, dir)) }, gh: null };
  const datos = { v: 1, fecha: new Date().toISOString(), por: entrada.id, kid, box: await cifrarJSON(K, { tablas: {} }) };
  return { usuarios, datos };
}

// ---------------------------------------------------------------- transporte GitHub
export class TransporteGitHub {
  constructor({ owner, repo, rama = "datos", api = "https://api.github.com", raw = "https://raw.githubusercontent.com" }) {
    Object.assign(this, { owner, repo, rama, api, raw });
    this.token = null;
    this.limitadoHasta = 0;
  }
  urlContenido(ruta) { return `${this.api}/repos/${this.owner}/${this.repo}/contents/${ruta.split("/").map(encodeURIComponent).join("/")}`; }
  cabeceras(extra = {}) {
    const h = { Accept: "application/vnd.github+json", ...extra };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }
  usaApi() { return Boolean(this.token) && Date.now() > this.limitadoHasta; }

  async revisarError(r, accion) {
    const restante = r.headers.get("x-ratelimit-remaining");
    if (r.status === 429 || (r.status === 403 && restante === "0")) {
      const reinicio = Number(r.headers.get("x-ratelimit-reset")) * 1000;
      this.limitadoHasta = reinicio > Date.now() ? reinicio : Date.now() + 60000;
      throw new ErrorGhdb("Se acabó el cupo de la API de GitHub por ahora. Se reintentará solo.", "limite");
    }
    if (r.status === 409 || r.status === 422) throw new ErrorGhdb("Otro cambio se guardó al mismo tiempo.", "conflicto");
    if (r.status === 401) throw new ErrorGhdb("El token de GitHub no es válido o venció. Actualizalo desde el menú.", "token");
    if (r.status === 403) throw new ErrorGhdb("El token de GitHub no tiene permiso de escritura en este repositorio.", "token");
    if (r.status === 404) throw new ErrorGhdb("No se encontró el archivo en GitHub.", "no_existe");
    throw new ErrorGhdb(`GitHub respondió ${r.status} al ${accion}.`, "red");
  }

  // Lee un archivo de la rama. Devuelve { estado: 200|304|404, bytes, sha, etag }
  async leer(ruta, { etag } = {}) {
    if (this.usaApi()) {
      try {
        const h = this.cabeceras(etag ? { "If-None-Match": etag } : {});
        const r = await fetch(`${this.urlContenido(ruta)}?ref=${encodeURIComponent(this.rama)}`, { headers: h, cache: "no-store" });
        if (r.status === 304) return { estado: 304 };
        if (r.status === 404) return { estado: 404 };
        if (!r.ok) await this.revisarError(r, "leer");
        const j = await r.json();
        let bytes;
        if (j.encoding === "base64" && j.content) bytes = deB64(j.content);
        else if (j.size === 0) bytes = new Uint8Array(0);
        else {
          // Archivos de más de 1 MB: se leen por su blob
          const rb = await fetch(`${this.api}/repos/${this.owner}/${this.repo}/git/blobs/${j.sha}`, { headers: this.cabeceras({ Accept: "application/vnd.github.raw" }), cache: "no-store" });
          if (!rb.ok) await this.revisarError(rb, "leer");
          bytes = new Uint8Array(await rb.arrayBuffer());
        }
        return { estado: 200, bytes, sha: j.sha, etag: r.headers.get("etag") };
      } catch (e) {
        if (e.code !== "limite") throw e; // sin cupo: se continúa por raw
      }
    }
    // Sin token, o sin cupo: lectura pública desde raw.githubusercontent.com
    const r = await fetch(`${this.raw}/${this.owner}/${this.repo}/${encodeURIComponent(this.rama)}/${ruta}?t=${Date.now()}`, { cache: "no-store" });
    if (r.status === 404) return { estado: 404 };
    if (!r.ok) throw new ErrorGhdb(`No se pudo leer ${ruta} (${r.status}).`, "red");
    const bytes = new Uint8Array(await r.arrayBuffer());
    const huella = hex(await sutil.digest("SHA-256", bytes));
    if (etag && etag === `raw:${huella}`) return { estado: 304 };
    return { estado: 200, bytes, sha: null, etag: `raw:${huella}`, viaRaw: true };
  }

  // Crea o reemplaza un archivo; con sha protege contra escrituras simultáneas
  async escribir(ruta, bytes, sha, mensaje) {
    if (!this.token) throw new ErrorGhdb("Para guardar cambios se necesita un token de GitHub.", "token");
    const cuerpo = { message: mensaje, content: aB64(bytes), branch: this.rama };
    if (sha) cuerpo.sha = sha;
    const r = await fetch(this.urlContenido(ruta), { method: "PUT", headers: this.cabeceras({ "Content-Type": "application/json" }), body: JSON.stringify(cuerpo), cache: "no-store" });
    if (!r.ok) await this.revisarError(r, "guardar");
    const j = await r.json();
    return j.content.sha;
  }

  async borrar(ruta, sha, mensaje) {
    if (!this.token) throw new ErrorGhdb("Para borrar se necesita un token de GitHub.", "token");
    const r = await fetch(this.urlContenido(ruta), { method: "DELETE", headers: this.cabeceras({ "Content-Type": "application/json" }), body: JSON.stringify({ message: mensaje, sha, branch: this.rama }), cache: "no-store" });
    if (r.status === 404) return;
    if (!r.ok) await this.revisarError(r, "borrar");
  }

  async shaDe(ruta) {
    const r = await fetch(`${this.urlContenido(ruta)}?ref=${encodeURIComponent(this.rama)}`, { headers: this.cabeceras(), cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) await this.revisarError(r, "consultar");
    return (await r.json()).sha;
  }

  async listar(carpeta) {
    const r = await fetch(`${this.urlContenido(carpeta)}?ref=${encodeURIComponent(this.rama)}`, { headers: this.cabeceras(), cache: "no-store" });
    if (r.status === 404) return [];
    if (!r.ok) await this.revisarError(r, "listar");
    const j = await r.json();
    return Array.isArray(j) ? j.filter((x) => x.type === "file").map((x) => ({ ruta: x.path, sha: x.sha })) : [];
  }
}

// ---------------------------------------------------------------- operaciones sobre tablas
// op: { t:"insert", tabla, filas } | { t:"update", tabla, filtros, cambios } | { t:"delete", tabla, filtros }
function cumple(fila, filtros) {
  return filtros.every(([col, op, val]) => {
    const v = fila[col];
    if (op === "eq") return v === val || (v == null && val == null);
    if (op === "neq") return v !== val;
    if (op === "in") return Array.isArray(val) && val.includes(v);
    if (op === "is") return val === null ? v == null : v === val;
    return false;
  });
}
function claveDe(claves, tabla, fila) { return (claves[tabla] ?? ["id"]).map((c) => fila[c]).join("\u0001"); }

export function aplicarOps(tablas, ops, claves = {}) {
  for (const op of ops) {
    const lista = tablas[op.tabla] ?? (tablas[op.tabla] = []);
    if (op.t === "insert") {
      for (const f of op.filas) {
        const k = claveDe(claves, op.tabla, f);
        const i = lista.findIndex((x) => claveDe(claves, op.tabla, x) === k);
        if (i >= 0) lista[i] = clonar(f); else lista.push(clonar(f));
      }
    } else if (op.t === "update") {
      for (let i = 0; i < lista.length; i++) if (cumple(lista[i], op.filtros)) lista[i] = { ...lista[i], ...clonar(op.cambios) };
    } else if (op.t === "delete") {
      tablas[op.tabla] = lista.filter((x) => !cumple(x, op.filtros));
    }
  }
  return tablas;
}

export function diferencias(antes, despues, claves = {}) {
  const eventos = [];
  const nombres = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  for (const tabla of nombres) {
    const a = new Map((antes[tabla] ?? []).map((f) => [claveDe(claves, tabla, f), f]));
    const d = new Map((despues[tabla] ?? []).map((f) => [claveDe(claves, tabla, f), f]));
    for (const [k, f] of d) {
      if (!a.has(k)) eventos.push({ tabla, eventType: "INSERT", new: f, old: {} });
      else if (JSON.stringify(a.get(k)) !== JSON.stringify(f)) eventos.push({ tabla, eventType: "UPDATE", new: f, old: a.get(k) });
    }
    for (const [k, f] of a) if (!d.has(k)) eventos.push({ tabla, eventType: "DELETE", new: {}, old: f });
  }
  return eventos;
}

// ---------------------------------------------------------------- cliente
const CLAVE_SESION = "ghdb:sesion";
const ESPERA_GUARDADO = 400;
const REINTENTO = 15000;
const SONDEO = 20000;

export function crearCliente(config, opciones = {}) {
  const gh = new TransporteGitHub(config);
  const claves = opciones.claves ?? {};
  const reglas = opciones.reglas ?? {};
  const rpcs = {};
  const almacenamiento = opciones.almacenamiento ?? globalThis.sessionStorage;
  const persistente = opciones.persistente ?? globalThis.localStorage;

  const st = {
    sesion: null,           // { user:{id}, usuario, rol, kid, wkid }
    K: null, W: null,
    usuarios: null, shaUsuarios: null, etagUsuarios: null, dir: [],
    base: {}, sha: null, etag: null, kid: null,   // último estado confirmado en GitHub
    vista: {},                                     // base + cambios pendientes
    cola: [], enVuelo: null, temporizador: null, reintento: null, sondeo: null,
    estado: "guardado", ultimoError: null,
  };
  const oyentesAuth = new Set();
  const oyentesEstado = new Set();
  const canales = new Set();

  const emitirAuth = (ev) => oyentesAuth.forEach((f) => { try { f(ev, sesionPublica()); } catch { /* oyente */ } });
  const fijarEstado = (estado, error = null) => {
    st.estado = estado; st.ultimoError = error;
    oyentesEstado.forEach((f) => { try { f({ estado, error, pendientes: st.cola.length + (st.enVuelo?.length ?? 0) }); } catch { /* oyente */ } });
  };
  const sesionPublica = () => (st.sesion ? { ...st.sesion, needsToken: puedeEscribirRol(st.sesion.rol) && !gh.token } : null);
  const puedeEscribirRol = (rol) => rol === "admin" || rol === "editor";
  const ctx = () => ({ sesion: st.sesion, tablas: st.vista, dir: st.dir, nuevoId });

  // ---- sesión en sessionStorage
  function guardarSesion() {
    if (!st.sesion) { try { almacenamiento.removeItem(CLAVE_SESION); } catch { /* */ } return; }
    const s = { ...st.sesion, K: aB64(st.K), W: st.W ? aB64(st.W) : null, token: gh.token };
    try { almacenamiento.setItem(CLAVE_SESION, JSON.stringify(s)); } catch { /* */ }
  }
  const claveCola = () => `ghdb:cola:${config.owner}/${config.repo}:${st.sesion?.user.id}`;
  async function guardarCola() {
    if (!st.sesion || !st.K) return;
    const pendientes = [...(st.enVuelo ?? []), ...st.cola];
    try {
      if (!pendientes.length) persistente.removeItem(claveCola());
      else persistente.setItem(claveCola(), JSON.stringify(await cifrarJSON(st.K, pendientes)));
    } catch { /* almacenamiento no disponible */ }
  }
  async function recuperarCola() {
    try {
      const txt = persistente.getItem(claveCola());
      if (txt) st.cola = [...(await descifrarJSON(st.K, JSON.parse(txt))), ...st.cola];
    } catch { /* cola de otra llave: se descarta */ }
  }

  // ---- lectura de archivos
  async function leerUsuarios({ condicional = false } = {}) {
    const r = await gh.leer("usuarios.json", condicional ? { etag: st.etagUsuarios } : {});
    if (r.estado === 304) return false;
    if (r.estado === 404) throw new ErrorGhdb("La plataforma aún no está instalada: falta usuarios.json en la rama de datos.", "instalacion");
    const archivo = JSON.parse(td.decode(r.bytes));
    st.usuarios = archivo; st.shaUsuarios = r.sha; st.etagUsuarios = r.etag;
    if (st.K) {
      if (archivo.kid !== st.sesion.kid) { cerrarPorRotacion(); return false; }
      st.dir = await descifrarJSON(st.K, archivo.dir);
    }
    return true;
  }
  async function leerDatos({ condicional = false } = {}) {
    const r = await gh.leer("datos.json", condicional ? { etag: st.etag } : {});
    if (r.estado === 304) return null;
    if (r.estado === 404) return { tablas: {}, sha: null, etag: null };
    const archivo = JSON.parse(td.decode(r.bytes));
    if (archivo.kid && archivo.kid !== st.sesion.kid) { cerrarPorRotacion(); return null; }
    const contenido = await descifrarJSON(st.K, archivo.box);
    return { tablas: contenido.tablas ?? {}, sha: r.sha, etag: r.etag, viaRaw: Boolean(r.viaRaw) };
  }
  function cerrarPorRotacion() {
    detener();
    st.sesion = null; st.K = st.W = null; gh.token = null; guardarSesion();
    emitirAuth("SIGNED_OUT");
    oyentesEstado.forEach((f) => { try { f({ estado: "llave-cambiada" }); } catch { /* */ } });
  }

  function recalcularVista() {
    const antes = st.vista;
    const nueva = aplicarOps(clonar(st.base), [...(st.enVuelo ?? []), ...st.cola], claves);
    st.vista = nueva;
    const evs = diferencias(antes, nueva, claves);
    for (const ev of evs) emitirCambio(ev);
  }
  function emitirCambio(ev) {
    for (const c of canales) for (const o of c.oyentes) {
      if (o.tabla && o.tabla !== ev.tabla) continue;
      if (o.evento && o.evento !== "*" && o.evento !== ev.eventType) continue;
      if (o.filtro) {
        const fila = ev.eventType === "DELETE" ? ev.old : ev.new;
        if (String(fila?.[o.filtro.col]) !== String(o.filtro.val)) continue;
      }
      try { o.cb({ eventType: ev.eventType, new: ev.new, old: ev.old, table: ev.tabla, schema: "public" }); } catch { /* oyente */ }
    }
  }

  // ---- guardado con cola, reintentos y fusión
  function programarGuardado() {
    clearTimeout(st.temporizador);
    st.temporizador = setTimeout(guardar, ESPERA_GUARDADO);
  }
  async function guardar() {
    if (st.enVuelo || !st.cola.length || !st.sesion) return;
    clearTimeout(st.reintento);
    const lote = st.cola.splice(0);
    st.enVuelo = lote;
    fijarEstado("guardando");
    let error = null;
    for (let intento = 0; intento < 6; intento++) {
      try {
        const remoto = await leerDatos();
        if (!remoto) throw new ErrorGhdb("Las llaves cambiaron.", "llave");
        if (remoto.viaRaw) throw new ErrorGhdb("Se acabó el cupo de la API de GitHub por ahora. Tus cambios quedan pendientes y se guardarán solos.", "limite");
        const nueva = aplicarOps(clonar(remoto.tablas), lote, claves);
        const archivo = { v: 1, fecha: new Date().toISOString(), por: st.sesion.user.id, kid: st.sesion.kid, box: await cifrarJSON(st.K, { tablas: nueva }) };
        const nuevoSha = await gh.escribir("datos.json", te.encode(JSON.stringify(archivo)), remoto.sha, "Actualizar datos cifrados");
        st.base = nueva; st.sha = nuevoSha; st.etag = null; st.enVuelo = null;
        await guardarCola();
        recalcularVista();
        fijarEstado(st.cola.length ? "pendiente" : "guardado");
        if (st.cola.length) programarGuardado();
        return;
      } catch (e) {
        error = e;
        if (e.code === "conflicto") { await esperar(300 + Math.random() * 700); continue; }
        break;
      }
    }
    // No se pudo: los cambios NO se descartan; se reintenta cada 15 s
    st.cola = [...lote, ...st.cola]; st.enVuelo = null;
    await guardarCola();
    fijarEstado("pendiente", error);
    if (error?.code !== "llave") st.reintento = setTimeout(guardar, REINTENTO);
  }
  function encolar(ops) {
    if (!ops.length) return;
    st.cola.push(...ops);
    recalcularVista();
    guardarCola();
    fijarEstado("pendiente");
    programarGuardado();
  }

  // ---- sondeo de cambios de otras personas
  async function sondear() {
    if (!st.sesion) return;
    try {
      if (await leerUsuarios({ condicional: true })) emitirCambio({ tabla: "profiles", eventType: "UPDATE", new: {}, old: {} });
      if (!st.sesion) return;
      if (st.enVuelo) return; // no se mezcla mientras se guarda
      const r = await leerDatos({ condicional: true });
      if (r && (r.sha === null || r.sha !== st.sha)) {
        st.base = r.tablas; st.sha = r.sha ?? st.sha; st.etag = r.etag;
        recalcularVista();
      } else if (r) st.etag = r.etag;
    } catch { /* sin conexión: se intentará en el siguiente sondeo */ }
  }
  function iniciar() {
    detener();
    st.sondeo = setInterval(sondear, SONDEO);
  }
  function detener() { clearInterval(st.sondeo); clearTimeout(st.temporizador); clearTimeout(st.reintento); }

  // ---- usuarios.json: escritura con reintentos
  async function modificarUsuarios(cambiar, mensaje = "Actualizar usuarios", { kLectura, kEscritura } = {}) {
    for (let intento = 0; intento < 6; intento++) {
      const r = await gh.leer("usuarios.json");
      if (r.estado !== 200) throw new ErrorGhdb("No se pudo leer usuarios.json.", "red");
      if (r.viaRaw) throw new ErrorGhdb("Se acabó el cupo de la API de GitHub por ahora. Intentá de nuevo en unos minutos.", "limite");
      const archivo = JSON.parse(td.decode(r.bytes));
      const dir = await descifrarJSON(kLectura ?? st.K, archivo.dir);
      await cambiar(archivo, dir);
      archivo.dir = { kid: archivo.kid, ...(await cifrarJSON(kEscritura ?? st.K, dir)) };
      try {
        const sha = await gh.escribir("usuarios.json", te.encode(JSON.stringify(archivo)), r.sha, mensaje);
        st.usuarios = archivo; st.shaUsuarios = sha; st.etagUsuarios = null; st.dir = dir;
        emitirCambio({ tabla: "profiles", eventType: "UPDATE", new: {}, old: {} });
        return archivo;
      } catch (e) {
        if (e.code === "conflicto") { await esperar(300 + Math.random() * 700); continue; }
        throw e;
      }
    }
    throw new ErrorGhdb("No se pudo guardar después de varios intentos. Volvé a intentar.", "conflicto");
  }

  // ---- intentos de ingreso
  const claveIntentos = (u) => `ghdb:intentos:${String(u).trim().toLowerCase()}`;
  function bloqueoActivo(usuario) {
    try {
      const x = JSON.parse(persistente.getItem(claveIntentos(usuario)) || "{}");
      return x.hasta && x.hasta > Date.now() ? x.hasta : 0;
    } catch { return 0; }
  }
  function registrarFallo(usuario) {
    try {
      const x = JSON.parse(persistente.getItem(claveIntentos(usuario)) || "{}");
      const n = (x.n ?? 0) + 1;
      const hasta = n >= 5 ? Date.now() + Math.min(30, 2 ** (n - 5)) * 60000 : 0;
      persistente.setItem(claveIntentos(usuario), JSON.stringify({ n, hasta }));
    } catch { /* */ }
  }
  const limpiarFallos = (usuario) => { try { persistente.removeItem(claveIntentos(usuario)); } catch { /* */ } };

  async function abrirConClave(archivo, entrada, clave) {
    const kek = await derivarKek(clave, entrada.salt, archivo.iter);
    const priv = await descifrar(kek, entrada.priv); // falla si la contraseña no es correcta
    let K = null, W = null, viaEnvoltura = false;
    if (entrada.kid === archivo.kid) K = await descifrar(kek, entrada.k);
    else if (entrada.pend?.k && entrada.pend.kid === archivo.kid) { K = await abrirEnvoltura(priv, entrada.pend.k); viaEnvoltura = true; }
    if (entrada.w && entrada.wkid === archivo.wkid) W = await descifrar(kek, entrada.w);
    else if (entrada.pend?.w && entrada.pend.wkid === archivo.wkid) { W = await abrirEnvoltura(priv, entrada.pend.w); viaEnvoltura = true; }
    if (!K) throw new ErrorGhdb("Tu acceso fue actualizado. Pedile a la administradora que restablezca tu contraseña.", "llave");
    return { kek, priv, K, W, viaEnvoltura };
  }

  async function arrancar() {
    const r = await leerDatos();
    st.base = r.tablas; st.sha = r.sha; st.etag = r.etag; st.vista = {};
    await recuperarCola();
    recalcularVista();
    iniciar();
    if (st.cola.length && gh.token) programarGuardado();
  }

  // ================================================================ API pública
  const auth = {
    async signInWithPassword({ email, usuario, password }) {
      const nombre = String(usuario ?? email ?? "").trim().toLowerCase();
      try {
        const hasta = bloqueoActivo(nombre);
        if (hasta) return { data: null, error: new ErrorGhdb(`Demasiados intentos. Probá de nuevo a las ${new Date(hasta).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}.`, "bloqueo") };
        gh.token = null;
        const r = await gh.leer("usuarios.json");
        if (r.estado !== 200) throw new ErrorGhdb("La plataforma aún no está instalada.", "instalacion");
        const archivo = JSON.parse(td.decode(r.bytes));
        const id = await idDeUsuario(archivo.pepper, nombre);
        const entrada = archivo.entries.find((e) => e.id === id);
        let abierto;
        try {
          if (!entrada) { await derivarKek(password, aB64(azar(16)), archivo.iter); throw new Error("x"); } // mismo costo
          abierto = await abrirConClave(archivo, entrada, password);
        } catch (e) {
          if (e.code === "llave" && entrada && e.message.startsWith("Tu acceso")) return { data: null, error: e };
          registrarFallo(nombre);
          return { data: null, error: new ErrorGhdb("Usuario o contraseña incorrectos.", "credenciales") };
        }
        const dir = await descifrarJSON(abierto.K, archivo.dir);
        const yo = dir.find((d) => d.id === id);
        if (!yo || yo.activo === false) { registrarFallo(nombre); return { data: null, error: new ErrorGhdb("Usuario o contraseña incorrectos.", "credenciales") }; }
        limpiarFallos(nombre);
        st.K = abierto.K; st.W = puedeEscribirRol(yo.rol) ? abierto.W : null;
        st.usuarios = archivo; st.shaUsuarios = r.sha; st.etagUsuarios = r.etag; st.dir = dir;
        st.sesion = { user: { id }, usuario: yo.usuario, rol: yo.rol, kid: archivo.kid, wkid: archivo.wkid };
        if (st.W && archivo.gh && archivo.gh.wkid === archivo.wkid) {
          try { gh.token = td.decode(await descifrar(st.W, archivo.gh)); } catch { gh.token = null; }
        }
        // Llaves recibidas por rotación: se vuelven a guardar con la contraseña
        if (abierto.viaEnvoltura && gh.token) {
          try {
            await modificarUsuarios(async (a) => {
              const e = a.entries.find((x) => x.id === id);
              if (!e) return;
              e.kid = a.kid; e.k = await cifrar(abierto.kek, st.K);
              if (st.W) { e.wkid = a.wkid; e.w = await cifrar(abierto.kek, st.W); }
              delete e.pend;
            }, "Actualizar acceso");
          } catch { /* se reintentará en el próximo ingreso */ }
        }
        guardarSesion();
        await arrancar();
        emitirAuth("SIGNED_IN");
        return { data: { session: sesionPublica(), user: st.sesion.user }, error: null };
      } catch (e) {
        return { data: null, error: e instanceof ErrorGhdb ? e : new ErrorGhdb("Sin conexión con GitHub. Revisá tu internet e intentá de nuevo.", "red") };
      }
    },

    async getSession() {
      if (!st.sesion) {
        try {
          const s = JSON.parse(almacenamiento.getItem(CLAVE_SESION) || "null");
          if (s?.K) {
            st.K = deB64(s.K); st.W = s.W ? deB64(s.W) : null; gh.token = s.token || null;
            st.sesion = { user: s.user, usuario: s.usuario, rol: s.rol, kid: s.kid, wkid: s.wkid };
            await leerUsuarios();
            if (!st.sesion) return { data: { session: null } };
            const yo = st.dir.find((d) => d.id === st.sesion.user.id);
            if (!yo || yo.activo === false) { await auth.signOut(); return { data: { session: null } }; }
            st.sesion.rol = yo.rol;
            await arrancar();
          }
        } catch {
          st.sesion = null; st.K = st.W = null; gh.token = null; guardarSesion();
        }
      }
      return { data: { session: sesionPublica() } };
    },

    onAuthStateChange(cb) {
      oyentesAuth.add(cb);
      return { data: { subscription: { unsubscribe: () => oyentesAuth.delete(cb) } } };
    },

    async signOut() {
      if (st.cola.length || st.enVuelo) { try { await guardar(); } catch { /* quedan guardados cifrados */ } }
      detener();
      st.sesion = null; st.K = st.W = null; gh.token = null; st.base = {}; st.vista = {}; st.cola = [];
      guardarSesion();
      emitirAuth("SIGNED_OUT");
      return { error: null };
    },

    // Cambia la contraseña: vuelve a envolver las llaves con la nueva (requiere token)
    async updateUser({ password }) {
      try {
        if (!st.sesion) throw new ErrorGhdb("Iniciá sesión de nuevo.", "sesion");
        if (!gh.token) throw new ErrorGhdb("Para cambiar la contraseña se necesita el token de GitHub. Pedile a la administradora que la restablezca.", "token");
        const id = st.sesion.user.id;
        await modificarUsuarios(async (a) => {
          const e = a.entries.find((x) => x.id === id);
          if (!e) throw new ErrorGhdb("Tu usuario ya no existe.", "sesion");
          const usuario = st.sesion.usuario;
          const nueva = await crearEntrada({ pepper: a.pepper, iter: a.iter, usuario, clave: password, K: st.K, kid: a.kid, W: st.W, wkid: a.wkid });
          Object.keys(e).forEach((k) => delete e[k]);
          Object.assign(e, nueva);
        }, "Cambiar contraseña");
        guardarSesion();
        emitirAuth("USER_UPDATED");
        return { data: { user: st.sesion.user }, error: null };
      } catch (e) { return { data: null, error: e }; }
    },

    // Guarda el token de GitHub cifrado con W (solo administración y edición)
    async guardarToken(token) {
      try {
        if (!st.W) throw new ErrorGhdb("Tu rol no puede guardar un token.", "permiso");
        const limpio = String(token).trim();
        if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(limpio)) throw new ErrorGhdb("Ese texto no parece un token de GitHub. Debe empezar con github_pat_.", "token");
        const anterior = gh.token;
        gh.token = limpio;
        try {
          await modificarUsuarios(async (a) => { a.gh = { wkid: a.wkid, ...(await cifrar(st.W, te.encode(limpio))) }; }, "Actualizar token cifrado");
        } catch (e) { gh.token = anterior; throw e; }
        guardarSesion();
        emitirAuth("USER_UPDATED");
        if (st.cola.length) programarGuardado();
        return { error: null };
      } catch (e) { return { error: e }; }
    },

    tieneToken: () => Boolean(gh.token),
  };

  // ---- perfiles: vienen del directorio cifrado de usuarios
  const perfilDe = (d) => ({
    id: d.id, username: d.usuario, full_name: d.nombre ?? "", avatar_color: d.color ?? "#0780ee",
    rol: d.rol, is_admin: d.rol === "admin", disabled: d.activo === false, must_change_password: Boolean(d.cambiarClave) && d.rol !== "lector",
    created_at: d.creado,
  });

  // ---- consultas estilo supabase-js
  class Consulta {
    constructor(tabla) { this.tabla = tabla; this.modo = "select"; this.filtros = []; this.orden = null; this.lim = null; this.unico = null; this.devolver = false; this.opc = {}; }
    select(_cols, opc = {}) { if (this.modo === "select") this.opc = opc; else this.devolver = true; return this; }
    insert(filas) { this.modo = "insert"; this.filas = Array.isArray(filas) ? filas : [filas]; return this; }
    upsert(filas) { return this.insert(filas); }
    update(cambios) { this.modo = "update"; this.cambios = cambios; return this; }
    delete() { this.modo = "delete"; return this; }
    eq(c, v) { this.filtros.push([c, "eq", v]); return this; }
    neq(c, v) { this.filtros.push([c, "neq", v]); return this; }
    in(c, v) { this.filtros.push([c, "in", v]); return this; }
    is(c, v) { this.filtros.push([c, "is", v]); return this; }
    order(c, { ascending = true } = {}) { this.orden = [c, ascending]; return this; }
    limit(n) { this.lim = n; return this; }
    single() { this.unico = "uno"; return this; }
    maybeSingle() { this.unico = "quiza"; return this; }
    then(ok, mal) { return this.ejecutar().then(ok, mal); }

    async ejecutar() {
      try {
        if (!st.sesion) throw new ErrorGhdb("Iniciá sesión de nuevo.", "sesion");
        if (this.tabla === "profiles") return await this.ejecutarPerfiles();
        let res;
        if (this.modo === "select") res = this.leer();
        else {
          if (!puedeEscribirRol(st.sesion.rol)) throw new ErrorGhdb("Tu rol es de solo lectura.", "permiso");
          if (this.modo === "insert") res = this.insertar();
          else if (this.modo === "update") res = this.actualizar();
          else res = this.borrar();
        }
        return this.formatear(res);
      } catch (e) { return { data: null, error: e instanceof ErrorGhdb ? e : new ErrorGhdb(e.message, "regla"), count: null }; }
    }
    leer() {
      let filas = (st.vista[this.tabla] ?? []).filter((f) => cumple(f, this.filtros));
      if (reglas.filtrarLectura) filas = reglas.filtrarLectura(this.tabla, filas, ctx());
      return clonar(filas);
    }
    insertar() {
      const ops = []; const salida = [];
      for (const f of this.filas) {
        let fila = { ...f };
        if (!(claves[this.tabla]) && !fila.id) fila.id = nuevoId();
        const extra = [];
        if (reglas.insertar) fila = reglas.insertar(this.tabla, fila, { ...ctx(), extra }) ?? fila;
        ops.push({ t: "insert", tabla: this.tabla, filas: [fila] }, ...extra);
        salida.push(fila);
      }
      encolar(ops);
      return salida;
    }
    actualizar() {
      const afectadas = (st.vista[this.tabla] ?? []).filter((f) => cumple(f, this.filtros));
      const ops = [];
      for (const f of afectadas) {
        let cambios = { ...this.cambios };
        if (reglas.actualizar) cambios = reglas.actualizar(this.tabla, f, cambios, ctx()) ?? cambios;
        const filtro = (claves[this.tabla] ?? ["id"]).map((c) => [c, "eq", f[c]]);
        ops.push({ t: "update", tabla: this.tabla, filtros: filtro, cambios });
      }
      encolar(ops);
      return afectadas.map((f, i) => ({ ...f, ...ops[i].cambios }));
    }
    borrar() {
      const afectadas = (st.vista[this.tabla] ?? []).filter((f) => cumple(f, this.filtros));
      const ops = []; const archivos = [];
      for (const f of afectadas) {
        const extra = [];
        if (reglas.borrar) reglas.borrar(this.tabla, f, { ...ctx(), extra, archivos });
        ops.push(...extra, { t: "delete", tabla: this.tabla, filtros: (claves[this.tabla] ?? ["id"]).map((c) => [c, "eq", f[c]]) });
      }
      encolar(ops);
      // Adjuntos de lo borrado: se eliminan de GitHub en segundo plano
      if (archivos.length) storage.from("adjuntos").remove(archivos).catch(() => {});
      return afectadas;
    }
    async ejecutarPerfiles() {
      let filas = st.dir.filter((d) => d.activo !== false || st.sesion.rol === "admin").map(perfilDe).filter((f) => cumple(f, this.filtros));
      if (this.modo === "update") {
        const ids = filas.map((f) => f.id);
        const propio = ids.length === 1 && ids[0] === st.sesion.user.id;
        if (!propio && st.sesion.rol !== "admin") throw new ErrorGhdb("Solo podés modificar tu propio perfil.", "permiso");
        if (!gh.token) throw new ErrorGhdb("Para guardar tu perfil se necesita el token de GitHub.", "token");
        const c = this.cambios;
        await modificarUsuarios(async (_a, dir) => {
          for (const d of dir) if (ids.includes(d.id)) {
            if (c.full_name !== undefined) d.nombre = String(c.full_name).slice(0, 80);
            if (c.avatar_color !== undefined) d.color = String(c.avatar_color).slice(0, 9);
            if (c.must_change_password === false && d.id === st.sesion.user.id) d.cambiarClave = false;
          }
        }, "Actualizar perfil");
        filas = st.dir.filter((d) => ids.includes(d.id)).map(perfilDe);
      } else if (this.modo !== "select") throw new ErrorGhdb("Los usuarios se administran desde Usuarios y permisos.", "permiso");
      return this.formatear(clonar(filas));
    }
    formatear(filas) {
      if (this.modo !== "select" && !this.devolver && this.unico === null) return { data: null, error: null, count: null };
      if (this.orden) {
        const [c, asc] = this.orden;
        filas.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
      }
      if (this.lim) filas = filas.slice(0, this.lim);
      if (this.opc.head) return { data: null, error: null, count: filas.length };
      if (this.unico === "uno") {
        if (filas.length !== 1) return { data: null, error: new ErrorGhdb("No se encontró el registro.", "no_existe"), count: null };
        return { data: filas[0], error: null, count: 1 };
      }
      if (this.unico === "quiza") return { data: filas[0] ?? null, error: null, count: filas.length };
      return { data: filas, error: null, count: filas.length };
    }
  }

  // ---- canales (cambios en vivo por sondeo y por cambios locales)
  function channel(nombre) {
    const c = {
      nombre, oyentes: [],
      on(_tipo, cfg, cb) {
        let filtro = null;
        const m = /^(\w+)=eq\.(.+)$/.exec(cfg.filter ?? "");
        if (m) filtro = { col: m[1], val: m[2] };
        c.oyentes.push({ tabla: cfg.table, evento: cfg.event, filtro, cb });
        return c;
      },
      subscribe(cb) { canales.add(c); setTimeout(() => cb?.("SUBSCRIBED"), 0); return c; },
      unsubscribe() { canales.delete(c); },
    };
    return c;
  }

  // ---- archivos adjuntos cifrados
  const storage = {
    from(_bucket) {
      const ruta = (p) => `adjuntos/${String(p).replace(/^\/+/, "").replace(/\.\./g, "")}`;
      return {
        async upload(p, archivo) {
          try {
            if (!puedeEscribirRol(st.sesion?.rol)) throw new ErrorGhdb("Tu rol es de solo lectura.", "permiso");
            const bytes = new Uint8Array(await archivo.arrayBuffer());
            if (bytes.length > 20 * 1024 * 1024) throw new ErrorGhdb("El archivo supera 20 MB.", "tamano");
            const cifrado = await cifrarArchivo(st.K, bytes);
            await gh.escribir(ruta(p), cifrado, null, "Agregar adjunto cifrado");
            return { data: { path: p }, error: null };
          } catch (e) { return { data: null, error: e }; }
        },
        async download(p) {
          try {
            const r = await gh.leer(ruta(p));
            if (r.estado !== 200) throw new ErrorGhdb("No se encontró el archivo.", "no_existe");
            return { data: new Blob([await descifrarArchivo(st.K, r.bytes)]), error: null };
          } catch (e) { return { data: null, error: e }; }
        },
        async remove(rutas) {
          try {
            if (!puedeEscribirRol(st.sesion?.rol)) throw new ErrorGhdb("Tu rol es de solo lectura.", "permiso");
            for (const p of rutas) {
              const sha = await gh.shaDe(ruta(p));
              if (sha) await gh.borrar(ruta(p), sha, "Eliminar adjunto");
            }
            return { data: rutas, error: null };
          } catch (e) { return { data: null, error: e }; }
        },
      };
    },
  };

  // ---- administración de usuarios (rol admin)
  const exigirAdmin = () => {
    if (st.sesion?.rol !== "admin") throw new ErrorGhdb("Solo la administradora puede hacer esto.", "permiso");
    if (!gh.token) throw new ErrorGhdb("Primero guardá el token de GitHub.", "token");
  };
  const admin = {
    listar: () => st.dir.map(perfilDe),

    async crear({ usuario, nombre = "", clave, rol = "editor" }) {
      exigirAdmin();
      const u = String(usuario).trim().toLowerCase();
      if (!/^[a-z0-9_.-]{3,30}$/.test(u)) throw new ErrorGhdb("El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.", "validacion");
      if (!ROLES.includes(rol)) throw new ErrorGhdb("Rol inválido.", "validacion");
      await modificarUsuarios(async (a, dir) => {
        const id = await idDeUsuario(a.pepper, u);
        if (a.entries.some((e) => e.id === id) || dir.some((d) => d.id === id && d.activo !== false)) throw new ErrorGhdb("Ese usuario ya existe.", "duplicado");
        const escribe = puedeEscribirRol(rol);
        a.entries.push(await crearEntrada({ pepper: a.pepper, iter: a.iter, usuario: u, clave, K: st.K, kid: a.kid, W: escribe ? st.W : null, wkid: a.wkid }));
        const previo = dir.findIndex((d) => d.id === id);
        const registro = { id, usuario: u, nombre: String(nombre).slice(0, 80), rol, color: ["#0780ee", "#ff7c00", "#1dcd9f", "#a63be3", "#003ff9", "#ffbe00"][dir.length % 6], activo: true, cambiarClave: escribe, creado: new Date().toISOString() };
        if (previo >= 0) dir[previo] = registro; else dir.push(registro);
      }, "Crear usuario");
    },

    async restablecerClave(id, clave) {
      exigirAdmin();
      await modificarUsuarios(async (a, dir) => {
        const d = dir.find((x) => x.id === id);
        const i = a.entries.findIndex((e) => e.id === id);
        if (!d || i < 0) throw new ErrorGhdb("El usuario no existe o está desactivado.", "no_existe");
        const escribe = puedeEscribirRol(d.rol);
        a.entries[i] = await crearEntrada({ pepper: a.pepper, iter: a.iter, usuario: d.usuario, clave, K: st.K, kid: a.kid, W: escribe ? st.W : null, wkid: a.wkid });
        d.cambiarClave = escribe && id !== st.sesion.user.id;
      }, "Restablecer contraseña");
    },

    // Subir de rol: entrega W por envoltura. Bajar de rol: rota W (y conviene renovar el token).
    async cambiarRol(id, rol) {
      exigirAdmin();
      if (id === st.sesion.user.id) throw new ErrorGhdb("No podés cambiar tu propio rol.", "validacion");
      if (!ROLES.includes(rol)) throw new ErrorGhdb("Rol inválido.", "validacion");
      let bajaEscritura = false;
      await modificarUsuarios(async (a, dir) => {
        const d = dir.find((x) => x.id === id);
        const e = a.entries.find((x) => x.id === id);
        if (!d || !e) throw new ErrorGhdb("El usuario no existe o está desactivado.", "no_existe");
        const antes = puedeEscribirRol(d.rol), despues = puedeEscribirRol(rol);
        d.rol = rol;
        if (!antes && despues) e.pend = { ...(e.pend ?? {}), wkid: a.wkid, w: await envolverPara(e.pub, st.W) };
        if (antes && !despues) { delete e.w; delete e.wkid; if (e.pend) { delete e.pend.w; delete e.pend.wkid; } bajaEscritura = true; d.cambiarClave = false; }
      }, "Cambiar rol");
      if (bajaEscritura) await admin.rotarLlaves({ rotarK: false, rotarW: true });
      return { requiereNuevoToken: bajaEscritura };
    },

    // Desactivar: se quita su acceso y se rotan las llaves para que lo ya conocido no sirva
    async desactivar(id) {
      exigirAdmin();
      if (id === st.sesion.user.id) throw new ErrorGhdb("No podés desactivar tu propia cuenta.", "validacion");
      let escribia = false;
      await modificarUsuarios(async (a, dir) => {
        const d = dir.find((x) => x.id === id);
        if (!d) throw new ErrorGhdb("El usuario no existe.", "no_existe");
        escribia = puedeEscribirRol(d.rol);
        d.activo = false;
        a.entries = a.entries.filter((e) => e.id !== id);
      }, "Desactivar usuario");
      await admin.rotarLlaves({ rotarK: true, rotarW: escribia });
      return { requiereNuevoToken: escribia };
    },
    async eliminar(id) {
      const r = await admin.desactivar(id);
      await modificarUsuarios(async (_a, dir) => { const i = dir.findIndex((d) => d.id === id); if (i >= 0) dir.splice(i, 1); }, "Eliminar usuario");
      return r;
    },

    // Rotación: llaves nuevas, todo se vuelve a cifrar y cada usuario recibe la suya por ECDH
    async rotarLlaves({ rotarK = true, rotarW = true, alAvanzar } = {}) {
      exigirAdmin();
      await guardar();
      if (st.cola.length || st.enVuelo) throw new ErrorGhdb("Hay cambios sin guardar. Esperá a que se guarden e intentá de nuevo.", "pendiente");
      detener();
      const Kv = st.K, Wv = st.W;
      const Kn = rotarK ? azar(32) : Kv, Wn = rotarW ? azar(32) : Wv;
      const kidN = rotarK ? nuevoKid() : st.sesion.kid, wkidN = rotarW ? nuevoKid() : st.sesion.wkid;
      try {
        if (rotarK) {
          const lista = await gh.listar("adjuntos");
          let n = 0;
          for (const f of lista) {
            alAvanzar?.({ paso: "adjuntos", hechos: n++, total: lista.length });
            const r = await gh.leer(f.ruta);
            if (r.estado !== 200) continue;
            let plano;
            try { plano = await descifrarArchivo(Kv, r.bytes); } catch { continue; } // ya rotado
            await gh.escribir(f.ruta, await cifrarArchivo(Kn, plano), r.sha, "Volver a cifrar adjunto");
          }
        }
        const yo = st.sesion.user.id;
        await modificarUsuarios(async (a, dir) => {
          a.kid = kidN; a.wkid = wkidN;
          for (const e of a.entries) {
            const d = dir.find((x) => x.id === e.id);
            const escribe = puedeEscribirRol(d?.rol);
            // Cada persona (también la administradora) recibe las llaves nuevas envueltas con su llave pública
            e.pend = { kid: kidN, k: await envolverPara(e.pub, Kn) };
            if (escribe) { e.pend.wkid = wkidN; e.pend.w = await envolverPara(e.pub, Wn); }
          }
          if (a.gh && gh.token) a.gh = { wkid: wkidN, ...(await cifrar(Wn, te.encode(gh.token))) };
        }, "Rotar llaves", { kLectura: Kv, kEscritura: Kn });
        st.K = Kn;
        if (rotarK) {
          for (let intento = 0; intento < 6; intento++) {
            const r = await gh.leer("datos.json");
            const archivo = r.estado === 200 ? JSON.parse(td.decode(r.bytes)) : null;
            const tablas = archivo ? (await descifrarJSON(archivo.kid === kidN ? Kn : Kv, archivo.box)).tablas : {};
            const nuevo = { v: 1, fecha: new Date().toISOString(), por: yo, kid: kidN, box: await cifrarJSON(Kn, { tablas }) };
            try { st.sha = await gh.escribir("datos.json", te.encode(JSON.stringify(nuevo)), r.sha ?? null, "Rotar llaves"); st.base = tablas; break; }
            catch (e) { if (e.code !== "conflicto") throw e; }
          }
        }
        st.W = Wn; st.sesion.kid = kidN; st.sesion.wkid = wkidN;
        guardarSesion();
        st.etag = null; st.etagUsuarios = null;
        recalcularVista();
        iniciar();
        return { ok: true };
      } catch (e) {
        iniciar();
        throw e;
      }
    },
  };

  return {
    from: (tabla) => new Consulta(tabla),
    rpc: async (nombre, args) => {
      try {
        if (!rpcs[nombre]) throw new ErrorGhdb(`Función desconocida: ${nombre}`, "rpc");
        return { data: await rpcs[nombre](args ?? {}, { ...ctx(), perfiles: st.dir.map(perfilDe) }), error: null };
      } catch (e) { return { data: null, error: e }; }
    },
    registrarRpc: (nombre, fn) => { rpcs[nombre] = fn; },
    channel,
    removeChannel: (c) => { canales.delete(c); },
    auth, storage, admin,
    onEstado: (cb) => { oyentesEstado.add(cb); cb({ estado: st.estado, pendientes: st.cola.length }); return () => oyentesEstado.delete(cb); },
    guardarAhora: () => guardar(),
    sondearAhora: () => sondear(),
    pendientes: () => st.cola.length + (st.enVuelo?.length ?? 0),
    _estado: st,
    _gh: gh,
  };
}
