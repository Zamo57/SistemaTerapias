import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
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
});
