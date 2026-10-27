import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// base "./" para que funcione en https://usuario.github.io/nombre-repo/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  let origen = "https://*.supabase.co", ws = "wss://*.supabase.co";
  try {
    const u = new URL(env.VITE_SUPABASE_URL);
    origen = u.origin;
    ws = `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
  } catch { /* sin URL: valor genérico */ }
  return {
    base: "./",
    plugins: [react(), {
      name: "csp-supabase",
      // La política de seguridad solo permite conectarse a TU proyecto de Supabase
      transformIndexHtml: (html) => html.replaceAll("__SUPABASE_ORIGEN__", origen).replaceAll("__SUPABASE_WS__", ws),
    }],
    test: { environment: "jsdom" },
  };
});
