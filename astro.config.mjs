import { defineConfig, envField } from "astro/config";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://victus.shrvan.xyz",
  output: "static",
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
  security: {
    checkOrigin: true,
    csp: {
      directives: ["default-src 'self'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "manifest-src 'self'"],
    },
  },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      ADMIN_PASSWORD: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
