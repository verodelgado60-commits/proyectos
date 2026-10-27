import { describe, expect, it } from "vitest";
import {
  agruparPor, aplicarCambio, estaVencida, fechaCorta, filtrarTareas, iniciales, ordenar,
  posicionAlFinal, posicionEntre, progreso, resumenEstados, subtareasDe, validarClave, validarUsuario, POR_ESTADO_SIN,
} from "./logica.js";
import { correoDeUsuario, normalizarUsuario, traducirError } from "./supabase.js";

const etiquetas = [
  { id: "s1", kind: "status", name: "Pendiente", is_done: false },
  { id: "s2", kind: "status", name: "Listo", is_done: true },
];
const tareas = [
  { id: "a", title: "Requisitos", position: 2, status_id: "s2", assignee_id: "u1" },
  { id: "b", title: "Presupuesto", position: 1, status_id: "s1", due_date: "2020-01-01" },
  { id: "c", title: "Revisar textos", parent_id: "b", position: 1, status_id: "s1", assignee_id: "u2" },
  { id: "d", title: "Sin estado", position: 3, status_id: null },
];

describe("orden y posiciones", () => {
  it("ordena por posición", () => expect(ordenar(tareas.slice(0, 2)).map((t) => t.id)).toEqual(["b", "a"]));
  it("posición entre dos", () => expect(posicionEntre(1, 2)).toBe(1.5));
  it("posición al inicio/fin", () => {
    expect(posicionEntre(null, 1)).toBe(0);
    expect(posicionEntre(3, null)).toBe(4);
    expect(posicionEntre(null, null)).toBe(1);
  });
  it("posición al final", () => {
    expect(posicionAlFinal(tareas)).toBe(4);
    expect(posicionAlFinal([])).toBe(1);
  });
});

describe("filtros", () => {
  it("excluye subtareas de la lista principal", () => expect(filtrarTareas(tareas).map((t) => t.id)).toEqual(["a", "b", "d"]));
  it("busca por texto", () => expect(filtrarTareas(tareas, { texto: "presu" }).map((t) => t.id)).toEqual(["b"]));
  it("muestra la tarea padre si coincide una subtarea", () => expect(filtrarTareas(tareas, { responsable: "u2" }).map((t) => t.id)).toEqual(["b"]));
  it("filtra sin responsable", () => expect(filtrarTareas(tareas, { responsable: "nadie" }).map((t) => t.id)).toEqual(["b", "d"]));
  it("filtra por estado vacío", () => expect(filtrarTareas(tareas, { estado: POR_ESTADO_SIN }).map((t) => t.id)).toEqual(["d"]));
});

describe("agrupación y métricas", () => {
  it("agrupa por estado incluyendo sin estado", () => {
    const g = agruparPor(filtrarTareas(tareas), ["s1", "s2"], "status_id");
    expect(g.get("s1").map((t) => t.id)).toEqual(["b"]);
    expect(g.get("s2").map((t) => t.id)).toEqual(["a"]);
    expect(g.get(POR_ESTADO_SIN).map((t) => t.id)).toEqual(["d"]);
  });
  it("progreso cuenta solo estados terminados", () => expect(progreso(filtrarTareas(tareas), etiquetas)).toEqual({ total: 3, listas: 1, porcentaje: 33 }));
  it("progreso sin tareas", () => expect(progreso([], etiquetas).porcentaje).toBe(0));
  it("resumen de estados", () => expect(resumenEstados(filtrarTareas(tareas), etiquetas).map((e) => e.n)).toEqual([1, 1]));
  it("subtareas de una tarea", () => expect(subtareasDe(tareas, "b").map((t) => t.id)).toEqual(["c"]));
});

describe("fechas", () => {
  it("vencida si pasó la fecha y no está lista", () => expect(estaVencida(tareas[1], etiquetas)).toBe(true));
  it("no vencida si está lista", () => expect(estaVencida({ ...tareas[1], status_id: "s2" }, etiquetas)).toBe(false));
  it("no vencida el mismo día", () => expect(estaVencida({ due_date: "2026-10-27" }, [], new Date("2026-10-27T15:00:00"))).toBe(false));
  it("fecha corta en español", () => expect(fechaCorta("2020-09-04")).toBe("4 sep 2020"));
});

describe("tiempo real", () => {
  const base = [{ id: "1", t: "a" }];
  it("inserta", () => expect(aplicarCambio(base, { eventType: "INSERT", new: { id: "2" } })).toHaveLength(2));
  it("no duplica inserciones", () => expect(aplicarCambio(base, { eventType: "INSERT", new: { id: "1", t: "b" } })).toEqual([{ id: "1", t: "b" }]));
  it("actualiza", () => expect(aplicarCambio(base, { eventType: "UPDATE", new: { id: "1", t: "z" } })[0].t).toBe("z"));
  it("elimina", () => expect(aplicarCambio(base, { eventType: "DELETE", old: { id: "1" } })).toEqual([]));
});

describe("usuarios y contraseñas", () => {
  it("normaliza usuario", () => expect(normalizarUsuario(" VeronicaDelgado1 ")).toBe("veronicadelgado1"));
  it("el ingreso es por usuario", () => expect(correoDeUsuario("VeronicaDelgado1")).toBe("veronicadelgado1"));
  it("valida usuario", () => {
    expect(validarUsuario("VeronicaDelgado1")).toBeNull();
    expect(validarUsuario("a b")).not.toBeNull();
  });
  it("valida contraseña", () => {
    expect(validarClave("Clave2026")).toBeNull();
    expect(validarClave("SinNumeros")).not.toBeNull();
    expect(validarClave("1234567")).not.toBeNull();
  });
  it("iniciales", () => {
    expect(iniciales({ full_name: "Verónica Delgado" })).toBe("VD");
    expect(iniciales({ username: "ana" })).toBe("A");
  });
  it("traduce errores", () => {
    expect(traducirError({ message: "Usuario o contraseña incorrectos." })).toBe("Usuario o contraseña incorrectos.");
    expect(traducirError(new TypeError("Failed to fetch"))).toMatch(/Sin conexión/);
  });
});
