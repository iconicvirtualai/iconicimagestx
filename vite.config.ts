import { defineConfig, loadEnv, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

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
    async configureServer(server) {
      // Serve the standalone guest-prep sheet at a clean path before the SPA fallback.
      server.middlewares.use((req, res, next) => {
        const raw = req.url || "";
        const queryAt = raw.indexOf("?");
        const pathOnly = queryAt === -1 ? raw : raw.slice(0, queryAt);
        if (pathOnly === "/pricing-v1" || pathOnly === "/pricing-v1/") {
          res.statusCode = 301;
          res.setHeader("Location", "/pricing");
          res.end();
          return;
        }
        if (pathOnly === "/podcast-guest-prep" || pathOnly === "/podcast-guest-prep/") {
          const search = queryAt === -1 ? "" : raw.slice(queryAt);
          req.url = `/podcast-guest-prep.html${search}`;
        }
        next();
      });

      process.env.ICONIC_VITE_DEV = "1";
      const app = createServer();
      // Dynamic import so the Vercel api/index build never traces sharp.
      const { handleMediaDisplay } = await import("./server/routes/mediaDisplay");
      app.get("/api/media/display/p/:token/:index", handleMediaDisplay);
      app.get("/api/media/display/o/:signedToken/:index", handleMediaDisplay);
      app.get("/api/media/display/:listingId/:index", handleMediaDisplay);

      // Add Express app as middleware to Vite dev server
      server.middlewares.use(app);
    },
  };
}
