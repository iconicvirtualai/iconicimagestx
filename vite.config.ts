import { defineConfig, loadEnv, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";
import { wixPathRedirects } from "./shared/wixLaunch";

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

const WIX_DEV_REDIRECTS = new Map(wixPathRedirects().map((rule) => [rule.source, rule.destination]));

function devHostname(host: string | string[] | undefined): string {
  const first = String(Array.isArray(host) ? host[0] : host || "").split(",")[0].trim().toLowerCase();
  return first.replace(/:\d+$/, "");
}

/** Dev-server mirror of the Vercel host rule and Wix path redirects. */
function devLaunchRedirect(pathOnly: string, host: string | string[] | undefined): { status: number; location: string } | null {
  if (devHostname(host) === "iconicimagestx.com") {
    return { status: 301, location: `https://www.iconicimagestx.com${pathOnly === "/" ? "/" : pathOnly}` };
  }
  const location = WIX_DEV_REDIRECTS.get(pathOnly);
  return location ? { status: 301, location } : null;
}

function withSearch(location: string, rawUrl: string): string {
  const queryAt = rawUrl.indexOf("?");
  if (queryAt < 0 || location.includes("?")) return location;
  const search = rawUrl.slice(queryAt).split("#")[0];
  const hashAt = location.indexOf("#");
  return hashAt >= 0 ? `${location.slice(0, hashAt)}${search}${location.slice(hashAt)}` : `${location}${search}`;
}

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
        const launchRedirect = devLaunchRedirect(pathOnly, req.headers.host);
        if (launchRedirect) {
          res.statusCode = launchRedirect.status;
          const raw = req.url || pathOnly;
          res.setHeader("Location", withSearch(launchRedirect.location, raw));
          res.end();
          return;
        }
        if (pathOnly === "/podcast-guest-prep" || pathOnly === "/podcast-guest-prep/") {
          const search = queryAt === -1 ? "" : raw.slice(queryAt);
          req.url = `/podcast-guest-prep.html${search}`;
        }
        if (pathOnly === "/thankful" || pathOnly === "/thankful/") {
          const search = queryAt === -1 ? "" : raw.slice(queryAt);
          req.url = `/thankful.html${search}`;
        }
        if (pathOnly === "/tis-the-season" || pathOnly === "/tis-the-season/") {
          const search = queryAt === -1 ? "" : raw.slice(queryAt);
          req.url = `/tis-the-season.html${search}`;
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
