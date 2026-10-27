// Crea usuarios.json y datos.json iniciales (cifrados) con la cuenta de administración.
// Uso: node scripts/instalar.mjs <usuario> "<Nombre>" <carpeta-salida>
// La contraseña temporal se genera al azar y se muestra una sola vez; nunca se guarda en el repositorio.
import fs from "node:fs";
import path from "node:path";
import { crearInstalacion } from "../../ghdb.js";

const [usuario, nombre = "", salida] = process.argv.slice(2);
if (!usuario || !salida) { console.error("Uso: node scripts/instalar.mjs <usuario> \"<Nombre>\" <carpeta-salida>"); process.exit(1); }
const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", numeros = "23456789";
const r = crypto.getRandomValues(new Uint32Array(18));
const todo = letras + numeros;
let clave = Array.from(r, (n) => todo[n % todo.length]);
clave[0] = letras[r[0] % letras.length]; clave[1] = numeros[r[1] % numeros.length];
clave = clave.join("").replace(/(.{6})(.{6})/, "$1-$2-");
const { usuarios, datos } = await crearInstalacion({ usuarioAdmin: usuario, claveAdmin: clave, nombreAdmin: nombre });
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, "usuarios.json"), JSON.stringify(usuarios, null, 1) + "\n");
fs.writeFileSync(path.join(salida, "datos.json"), JSON.stringify(datos) + "\n");
fs.writeFileSync(path.join(salida, "README.md"), "# Rama de datos\n\nAquí viven los datos de la plataforma, **siempre cifrados** (AES-GCM 256). No edites estos archivos a mano.\n");
console.log(`CLAVE_TEMPORAL=${clave}`);
