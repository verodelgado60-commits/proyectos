// Lee archivos .xlsx (por ejemplo, exportados de Monday) directamente en el navegador.
// No se envía nada a ningún servicio: se descomprime y se lee el XML aquí mismo.
import { inflateSync, strFromU8 } from "fflate";

export const TAMANO_MAXIMO = 5 * 1024 * 1024;

// Lector ZIP mínimo (incluye ZIP64, que usan algunos exportadores como Monday).
// Solo extrae los archivos que pide "quiero" y no confía en los tamaños declarados.
const MAX_DESCOMPRIMIDO = 40 * 1024 * 1024;
function leerZip(u8, quiero) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const u16 = (o) => dv.getUint16(o, true), u32 = (o) => dv.getUint32(o, true);
  const u64 = (o) => u32(o) + u32(o + 4) * 2 ** 32;
  let fin = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (u32(i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("no es zip");
  let total = u16(fin + 10), inicio = u32(fin + 16);
  if ((total === 0xffff || inicio === 0xffffffff) && fin >= 20 && u32(fin - 20) === 0x07064b50) {
    const z = u64(fin - 12);
    if (u32(z) !== 0x06064b50) throw new Error("zip64 inválido");
    total = u64(z + 32); inicio = u64(z + 48);
  }
  const salida = {}; let usado = 0; let p = inicio;
  for (let n = 0; n < total; n++) {
    if (p + 46 > u8.length || u32(p) !== 0x02014b50) throw new Error("directorio inválido");
    const metodo = u16(p + 10); let comprimido = u32(p + 20); const largoNombre = u16(p + 28), largoExtra = u16(p + 30), largoComent = u16(p + 32);
    let local = u32(p + 42);
    const nombre = strFromU8(u8.subarray(p + 46, p + 46 + largoNombre));
    let e = p + 46 + largoNombre; const finExtra = e + largoExtra;
    while (e + 4 <= finExtra) {
      const id = u16(e), largo = u16(e + 2); let q = e + 4;
      if (id === 1) {
        if (u32(p + 24) === 0xffffffff) q += 8;
        if (comprimido === 0xffffffff) { comprimido = u64(q); q += 8; }
        if (local === 0xffffffff) { local = u64(q); }
      }
      e += 4 + largo;
    }
    p = finExtra + largoComent;
    if (!quiero(nombre)) continue;
    if (u32(local) !== 0x04034b50) throw new Error("encabezado inválido");
    const datos = local + 30 + u16(local + 26) + u16(local + 28);
    const crudo = u8.subarray(datos, datos + comprimido);
    const contenido = metodo === 0 ? crudo.slice() : metodo === 8 ? inflateSync(crudo) : null;
    if (!contenido) continue;
    usado += contenido.length;
    if (usado > MAX_DESCOMPRIMIDO) throw new Error("demasiado grande");
    salida[nombre] = contenido;
  }
  return salida;
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodificar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENTIDADES[e] ?? m;
});
const textos = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodificar(m[1])).join("");
const columna = (ref) => [...ref.replace(/\d+/g, "")].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
const atributo = (tag, nombre) => tag.match(new RegExp(`\\s${nombre}="([^"]*)"`))?.[1];

function rutaPrimeraHoja(archivos) {
  const wb = archivos["xl/workbook.xml"] ? strFromU8(archivos["xl/workbook.xml"]) : "";
  const rels = archivos["xl/_rels/workbook.xml.rels"] ? strFromU8(archivos["xl/_rels/workbook.xml.rels"]) : "";
  const hoja = wb.match(/<sheet\s[^>]*>/)?.[0];
  const rid = hoja && (atributo(hoja, "r:id") ?? atributo(hoja, "id"));
  if (rid) {
    const rel = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((r) => atributo(r, "Id") === rid);
    const destino = rel && atributo(rel, "Target");
    if (destino) {
      const ruta = destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`.replace(/\/\.\//g, "/");
      if (archivos[ruta]) return ruta;
    }
  }
  return Object.keys(archivos).filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0];
}

// Devuelve las filas de la primera hoja como listas de valores (texto o número)
export function leerXlsx(bytes) {
  if (bytes.byteLength > TAMANO_MAXIMO) throw new Error("El archivo es muy grande (máximo 5 MB).");
  let archivos;
  try { archivos = leerZip(new Uint8Array(bytes), (n) => n.startsWith("xl/") && (n.endsWith(".xml") || n.endsWith(".rels"))); }
  catch { throw new Error("No se pudo leer el archivo. ¿Es un Excel (.xlsx)?"); }
  const ruta = rutaPrimeraHoja(archivos);
  if (!ruta) throw new Error("El archivo no tiene hojas.");
  const compartidos = archivos["xl/sharedStrings.xml"]
    ? [...strFromU8(archivos["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1])) : [];
  const xml = strFromU8(archivos[ruta]);
  const filas = [];
  for (const [, contenido] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = [];
    for (const m of contenido.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = ` ${m[1]}`; const cuerpo = m[2] ?? "";
      const ref = atributo(attrs, "r"); const tipo = atributo(attrs, "t");
      const i = ref ? columna(ref) : fila.length;
      const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let valor = "";
      if (tipo === "inlineStr") valor = textos(cuerpo);
      else if (tipo === "s") valor = compartidos[Number(v)] ?? "";
      else if (tipo === "str" || tipo === "e") valor = v != null ? decodificar(v) : "";
      else if (tipo === "b") valor = v === "1";
      else if (v != null && v !== "") valor = Number(v);
      if (i >= 0 && i < 200) fila[i] = valor;
    }
    filas.push(Array.from(fila, (x) => (x === undefined ? "" : x)));
  }
  return filas;
}

// Número de serie de Excel → "AAAA-MM-DD"
export function fechaDeExcel(v) {
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (d) return `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  }
  return null;
}

const normal = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase();

// Convierte las filas de un tablero exportado (Nombre, Estado, Vencimiento, Prioridad, Notas…) en elementos
export function elementosDeTablero(filas) {
  const elementos = [];
  let cab = null; let seccion = "";
  for (const fila of filas) {
    const celdas = fila.map((x) => (typeof x === "string" ? x.trim() : x));
    const llenas = celdas.filter((x) => x !== "" && x != null);
    if (normal(celdas[0]) === "nombre" && celdas.some((x) => normal(x) === "estado")) {
      cab = Object.fromEntries(celdas.map((x, i) => [normal(x), i]).filter(([k]) => k));
      continue;
    }
    if (!cab) continue;
    if (llenas.length === 1 && typeof celdas[0] === "string" && celdas[0]) { seccion = celdas[0]; continue; }
    const de = (...nombres) => { for (const n of nombres) if (cab[n] !== undefined) return celdas[cab[n]]; return ""; };
    const nombre = String(de("nombre") ?? "").trim();
    if (!nombre) continue;
    const extra = [];
    const menu = String(de("menu desplegable") ?? "").trim(); if (menu) extra.push(`Seguimiento: ${menu}`);
    const archivo = String(de("archivo") ?? "").trim(); if (archivo) extra.push(`Archivo: ${archivo}`);
    const notas = String(de("notas") ?? "").trim();
    elementos.push({
      nombre: nombre.slice(0, 120),
      estado: String(de("estado") ?? "").trim(),
      vence: fechaDeExcel(de("vencimiento", "fecha limite", "fecha")),
      inicio: fechaDeExcel(de("cronograma  start", "inicio")),
      prioridad: String(de("prioridad") ?? "").replace(/[^\p{L}\p{N} ]/gu, "").trim(),
      notas: [notas, ...extra].filter(Boolean).join("\n\n").slice(0, 5000),
      seccion,
    });
  }
  return elementos;
}

// Estado de Monday → estado de esta plataforma
export function estadoEquivalente(estado) {
  const e = normal(estado);
  if (!e || /no inici|pendiente|sin empezar|por hacer/.test(e)) return "Pendiente";
  if (/curso|progreso|trabajando/.test(e)) return "En curso";
  if (/detenid|stopper|atasc|bloque/.test(e)) return "Stopper";
  if (/listo|complet|hecho|termin/.test(e)) return "Listo";
  return null;
}
export const esPorDefecto = (el) => ["Pendiente", "En curso", "Stopper"].includes(estadoEquivalente(el.estado)) && normal(el.seccion) !== "completado";
