function assertEquals(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Esperado ${JSON.stringify(b)}, recibido ${JSON.stringify(a)}`);
}
function assertNotEquals(a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) throw new Error(`No se esperaba ${JSON.stringify(b)}`);
}
import { correoInterno, igualesSeguro, normalizarUsuario, validarClave, validarUsuario } from "./validar.ts";

Deno.test("normaliza usuario a minúsculas y sin espacios", () => {
  assertEquals(normalizarUsuario("  VeronicaDelgado1 "), "veronicadelgado1");
});
Deno.test("valida usuarios", () => {
  assertEquals(validarUsuario("veronicadelgado1"), null);
  assertNotEquals(validarUsuario("ab"), null);
  assertNotEquals(validarUsuario("con espacio"), null);
  assertNotEquals(validarUsuario("x".repeat(31)), null);
});
Deno.test("valida contraseñas", () => {
  assertEquals(validarClave("Clave2026"), null);
  assertNotEquals(validarClave("corta1"), null);
  assertNotEquals(validarClave("SoloLetras"), null);
  assertNotEquals(validarClave("12345678"), null);
  assertNotEquals(validarClave("a1".repeat(40)), null);
});
Deno.test("correo interno", () => {
  assertEquals(correoInterno("ana"), "ana@usuarios.example.com");
});
Deno.test("comparación segura", () => {
  assertEquals(igualesSeguro("abc", "abc"), true);
  assertEquals(igualesSeguro("abc", "abd"), false);
  assertEquals(igualesSeguro("abc", "abcd"), false);
  assertEquals(igualesSeguro("", "x"), false);
});
