import { defineConfig, loadEnv, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "node:fs/promises";
import path from "path";
import { createServer } from "./server";
import { isBareClientRoute } from "./shared/bareClientRoute";
import { applyBareNotFound } from "./server/lib/bareClientNotFound";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  return {
    server: {
      host: "::",
      port: 8080,
      fs: {
        allow: ["./client", "./shared"],
        deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
      },
    },
    build: {
      outDir: "dist/spa",
    },
    plugins: [react(), expressPlugin()],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: {
      'process.env': env
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./client"),
        "@shared": path.resolve(__dirname, "./shared"),
      },
    },
  };
});

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(server) {
      // Serve the standalone guest-prep sheet at a clean path before the SPA fallback.
      server.middlewares.use((req, _res, next) => {
        const raw = req.url || "";
        const queryAt = raw.indexOf("?");
        const pathOnly = queryAt === -1 ? raw : raw.slice(0, queryAt);
        if (pathOnly === "/podcast-guest-prep" || pathOnly === "/podcast-guest-prep/") {
          const search = queryAt === -1 ? "" : raw.slice(queryAt);
          req.url = `/podcast-guest-prep.html${search}`;
        }
        next();
      });

      // Exact /studio and /gallery are 404s. ID paths fall through to the SPA.
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const raw = req.url || "/";
        const queryAt = raw.indexOf("?");
        const pathOnly = queryAt === -1 ? raw : raw.slice(0, queryAt);
        if (!isBareClientRoute(pathOnly)) return next();
        try {
          const indexPath = path.resolve(server.config.root, "index.html");
          const source = await fs.readFile(indexPath, "utf8");
          const transformed = await server.transformIndexHtml(pathOnly, source);
          const html = applyBareNotFound(transformed, pathOnly);
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Robots-Tag", "noindex");
          res.end(req.method === "HEAD" ? undefined : html);
        } catch (err) {
          next(err);
        }
      });

      process.env.ICONIC_VITE_DEV = "1";
      const app = createServer();

      // Add Express app as middleware to Vite dev server
      server.middlewares.use(app);
    },
  };
}
