import { defineConfig, loadEnv, createLogger } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "VITE_");
  const logger = createLogger();
  const error = logger.error.bind(logger);
  // Un fallo del proxy tampoco debe revelar identificaciones en la terminal.
  logger.error = (message, options) =>
    error(
      message.replace(
        /(\/(?:api\/cedula|functions\/v1\/cedula)\/)\d{9}/g,
        "$1[oculta]",
      ),
      options,
    );
  return {
    customLogger: logger,
    plugins: [react()],
    server: {
      proxy: environment.VITE_SUPABASE_URL
        ? {
            "/api/cedula/": {
              target: environment.VITE_SUPABASE_URL,
              changeOrigin: true,
              rewrite: (path) =>
                path.replace("/api/cedula/", "/functions/v1/cedula/"),
            },
          }
        : undefined,
      fs: {
        deny: [
          ".env",
          ".env.*",
          "**/.env*",
          "**/*.{crt,pem}",
          "**/.git/**",
          "**/.local/**",
          "**/backups/**",
          "**/config/team.json",
        ],
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            supabase: ["@supabase/supabase-js"],
            react: ["react", "react-dom"],
            icons: ["lucide-react"],
          },
        },
      },
    },
  };
});
