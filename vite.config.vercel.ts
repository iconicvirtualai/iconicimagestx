import { defineConfig } from "vite";
import path from "path";

/**
 * Vercel Serverless Function Build
 *
 * Bundles server/vercel-handler.ts into api/index.mjs — a self-contained
 * ES module that Vercel runs directly as a serverless function without any
 * TypeScript recompilation (avoiding the @vercel/node ESM resolution issues).
 *
 * External packages are intentionally kept external so Vercel uses the
 * installed node_modules at runtime.
 */
export default defineConfig({
  publicDir: false, // Don't copy public/ assets into api/
  build: {
    lib: {
      entry: path.resolve(__dirname, "server/vercel-handler.ts"),
      formats: ["es"],
      fileName: "index",
    },
    outDir: "api",
    target: "node22",
    ssr: true,
    rollupOptions: {
      external: [
        // Node.js built-ins
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
        // Keep npm packages as external — Vercel resolves from node_modules
        "express",
        "cors",
        "dotenv/config",
        "dotenv",
        "firebase-admin",
        "firebase-admin/app",
        "firebase-admin/auth",
        "firebase-admin/firestore",
        "firebase-admin/storage",
        "firebase-functions",
        "stripe",
        "nodemailer",
        "twilio",
        "googleapis",
        "zod",
        "serverless-http",
      ],
      output: {
        format: "es",
        entryFileNames: "index.mjs",
      },
    },
    emptyOutDir: false, // Do NOT wipe the api/ directory
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
