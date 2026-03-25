import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  esbuild: {
    charset: 'utf8',
  },
  server: {
    host: true,
    allowedHosts: ['mwpanel.pl', 'www.mwpanel.pl', 'mwpanelpro.pl', 'www.mwpanelpro.pl', 'domradar.online', 'www.domradar.online', 'localhost', '127.0.0.1'],
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: ['mwpanel.pl', 'www.mwpanel.pl', 'mwpanelpro.pl', 'www.mwpanelpro.pl', 'domradar.online', 'www.domradar.online', 'localhost', '127.0.0.1'],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
