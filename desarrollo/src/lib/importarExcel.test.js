// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { elementosDeTablero, esPorDefecto, estadoEquivalente, fechaDeExcel, leerXlsx } from "./importarExcel.js";

// Excel mínimo con texto en línea, textos compartidos y una fecha (número de serie)
function xlsx(filasXml, compartidos = []) {
  return zipSync({
    "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8(`<sst>${compartidos.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${filasXml}</sheetData></worksheet>`),
  });
}
const t = (ref, s) => `<c r="${ref}" t="inlineStr"><is><t>${s}</t></is></c>`;

describe("importar de Excel", () => {
  const archivo = xlsx([
    `<row r="1">${t("A1", "Tablero")}</row>`,
    `<row r="2">${t("A2", "Pendientes")}</row>`,
    `<row r="3">${t("A3", "Nombre")}${t("B3", "Estado")}${t("C3", "Vencimiento")}${t("D3", "Prioridad")}${t("E3", "Notas")}${t("F3", "Menú desplegable")}</row>`,
    `<row r="4">${t("A4", "Flujo &amp; IVR")}${t("B4", "En curso")}<c r="C4" s="1"><v>46318.0</v></c>${t("D4", "Crítica ⚠️")}${t("E4", "Revisar")}${t("F4", "Flujo enviado")}</row>`,
    `<row r="5"><c r="A5" t="s"><v>0</v></c>${t("B5", "No iniciado")}<c r="C5"><v>46325</v></c>${t("D5", "Baja")}</row>`,
    `<row r="6">${t("A6", "Viejo")}${t("B6", "Listo")}</row>`,
    `<row r="7">${t("A7", "Completado")}</row>`,
    `<row r="8">${t("A8", "Nombre")}${t("B8", "Estado")}</row>`,
    `<row r="9">${t("A9", "Cerrado")}${t("B9", "Detenido")}</row>`,
  ].join(""), ["Token de llamadas"]);

  it("lee filas, textos compartidos y fechas", () => {
    const els = elementosDeTablero(leerXlsx(archivo));
    expect(els.map((e) => e.nombre)).toEqual(["Flujo & IVR", "Token de llamadas", "Viejo", "Cerrado"]);
    expect(els[0]).toMatchObject({ estado: "En curso", vence: "2026-10-23", prioridad: "Crítica", notas: "Revisar\n\nSeguimiento: Flujo enviado" });
    expect(els[1].vence).toBe("2026-10-30");
  });
  it("por defecto marca en curso y sin iniciar; no lo listo ni la sección Completado", () => {
    const els = elementosDeTablero(leerXlsx(archivo));
    expect(els.filter(esPorDefecto).map((e) => e.nombre)).toEqual(["Flujo & IVR", "Token de llamadas"]);
  });
  it("equivalencias de estado y fechas", () => {
    expect(estadoEquivalente("No iniciado")).toBe("Pendiente");
    expect(estadoEquivalente("Detenido")).toBe("Stopper");
    expect(estadoEquivalente("Listo")).toBe("Listo");
    expect(fechaDeExcel("28/10/2026")).toBe("2026-10-28");
    expect(fechaDeExcel(46318)).toBe("2026-10-23");
  });
  it("rechaza archivos que no son Excel", () => {
    expect(() => leerXlsx(new TextEncoder().encode("hola"))).toThrow(/No se pudo leer/);
  });
});
