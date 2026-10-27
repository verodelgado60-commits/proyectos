// Reglas de validación compartidas (sin dependencias, se prueban con Deno).

export const DOMINIO_INTERNO = "usuarios.example.com";

export function normalizarUsuario(u: unknown): string {
  return String(u ?? "").trim().toLowerCase();
}

export function validarUsuario(u: string): string | null {
  if (!/^[a-z0-9_.-]{3,30}$/.test(u)) {
    return "El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.";
  }
  return null;
}

export function validarClave(p: unknown): string | null {
  const s = String(p ?? "");
  if (s.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (s.length > 72) return "La contraseña no puede tener más de 72 caracteres.";
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(s) || !/[0-9]/.test(s)) {
    return "La contraseña debe incluir letras y números.";
  }
  return null;
}

export function correoInterno(usuario: string): string {
  return `${usuario}@${DOMINIO_INTERNO}`;
}

// Comparación en tiempo constante para el token de arranque
export function igualesSeguro(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
