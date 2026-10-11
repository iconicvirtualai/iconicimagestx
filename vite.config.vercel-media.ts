import { defineConfig } from "vite";
import path from "path";

/**
 * Display-image function. sharp stays external so the native binary is traced
 * only into api/media-display.mjs, never into api/index.mjs.
 */
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: path.resolve(__dirname, "server/media-display-entry.ts"),
      formats: ["es"],
      fileName: "media-display",
    },
    outDir: "api",
    target: "node22",
    ssr: true,
    rollupOptions: {
      external: [
        "fs",
        "fs/promises",
        "path",
        "url",
        "http",
        "https",
        "os",
        "crypto",
        "stream",
        "util",
        "events",
        "buffer",
        "querystring",
        "child_process",
        "net",
        "tls",
        "zlib",
        "dotenv/config",
        "dotenv",
        "firebase-admin",
        "firebase-admin/app",
        "firebase-admin/firestore",
        "sharp",
      ],
      output: {
        format: "es",
        entryFileNames: "media-display.mjs",
      },
    },
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
