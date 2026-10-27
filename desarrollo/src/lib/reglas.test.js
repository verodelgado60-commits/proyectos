import { describe, expect, it } from "vitest";
import { aplicarOps } from "ghdb";
import { claves, reglas } from "./reglas.js";

const yo = "u1";
const base = () => ({
  projects: [{ id: "p1", name: "P", owner_id: yo }],
  project_members: [{ project_id: "p1", user_id: yo, role: "owner" }, { project_id: "p1", user_id: "u2", role: "viewer" }],
  tasks: [{ id: "t1", project_id: "p1", title: "A", group_id: "g1" }, { id: "t2", project_id: "p1", title: "Sub", parent_id: "t1", group_id: "g1" }],
  comments: [{ id: "c1", task_id: "t2", project_id: "p1", author_id: "u2" }],
  adjuntos: [{ id: "a1", task_id: "t1", project_id: "p1", ruta: "t1/x" }],
  groups: [{ id: "g1", project_id: "p1" }], labels: [{ id: "l1", project_id: "p1" }],
});
const ctx = (tablas, id = yo, rol = "editor") => ({ sesion: { user: { id }, rol }, tablas, nuevoId: () => Math.random().toString(36).slice(2), extra: [], archivos: [] });

describe("reglas de negocio", () => {
  it("crear proyecto agrega dueño, 8 etiquetas y un grupo", () => {
    const c = ctx({ project_members: [] });
    const p = reglas.insertar("projects", { id: "p2", name: "Nuevo" }, c);
    expect(p.owner_id).toBe(yo);
    const t = aplicarOps({}, c.extra, claves);
    expect(t.project_members).toEqual([expect.objectContaining({ project_id: "p2", user_id: yo, role: "owner" })]);
    expect(t.labels).toHaveLength(8);
    expect(t.groups).toHaveLength(1);
  });
  it("un lector del proyecto no puede crear tareas", () => {
    expect(() => reglas.insertar("tasks", { project_id: "p1", title: "x" }, ctx(base(), "u2"))).toThrow(/permiso/);
  });
  it("un lector del proyecto sí puede comentar", () => {
    const f = reglas.insertar("comments", { task_id: "t1", body: "hola" }, ctx(base(), "u2"));
    expect(f).toMatchObject({ project_id: "p1", author_id: "u2" });
  });
  it("no se edita el comentario de otra persona", () => {
    expect(() => reglas.actualizar("comments", base().comments[0], { body: "x" }, ctx(base()))).toThrow(/tus comentarios/);
  });
  it("borrar una tarea borra subtareas, comentarios y adjuntos", () => {
    const t = base(); const c = ctx(t);
    reglas.borrar("tasks", t.tasks[0], c);
    const r = aplicarOps(t, [...c.extra, { t: "delete", tabla: "tasks", filtros: [["id", "eq", "t1"]] }], claves);
    expect(r.tasks).toHaveLength(0);
    expect(r.comments).toHaveLength(0);
    expect(r.adjuntos).toHaveLength(0);
    expect(c.archivos).toEqual(["t1/x"]);
  });
  it("borrar el proyecto borra todo su contenido", () => {
    const t = base(); const c = ctx(t);
    reglas.borrar("projects", t.projects[0], c);
    const r = aplicarOps(t, [...c.extra, { t: "delete", tabla: "projects", filtros: [["id", "eq", "p1"]] }], claves);
    for (const k of ["projects", "tasks", "groups", "labels", "project_members", "comments", "adjuntos"]) expect(r[k]).toHaveLength(0);
  });
  it("solo quien es miembro ve el proyecto (la administración ve todo)", () => {
    const t = base();
    expect(reglas.filtrarLectura("projects", t.projects, ctx(t, "u9"))).toHaveLength(0);
    expect(reglas.filtrarLectura("projects", t.projects, ctx(t, "u9", "admin"))).toHaveLength(1);
  });
  it("fecha de inicio posterior a la límite se rechaza", () => {
    expect(() => reglas.actualizar("tasks", { ...base().tasks[0], due_date: "2026-01-01" }, { start_date: "2026-02-01" }, ctx(base()))).toThrow(/fecha/);
  });
});
