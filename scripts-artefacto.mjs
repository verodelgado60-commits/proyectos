// Convierte el HTML compilado al formato de página de Claude:
// sin <!doctype>, <html>, <head> ni <body> (la plataforma los agrega).
import fs from "node:fs";
const html = fs.readFileSync("dist-claude/app.html", "utf8");
const titulo = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? "<title>Gestor de Proyectos</title>";
const estilos = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join("\n");
const fuentes = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g)].map((m) => m[0]).join("\n");
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join("\n");
const salida = `${titulo}\n${fuentes}\n${estilos}\n<div id="root"></div>\n${scripts}\n`;
fs.writeFileSync("dist-claude/gestor-proyectos.html", salida);
console.log("dist-claude/gestor-proyectos.html", (salida.length / 1024).toFixed(0), "KB");
