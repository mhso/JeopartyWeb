import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";

/**
 * The Flask app is mounted at /jeoparty/ (see `init.create_app(app_name, f"/{app_name}/")`
 * in main.py). Keeping the same base path matters for more than cosmetics: the presenter
 * auth cookie is written with `path=/jeoparty` by mhooge_flask.routing.set_cookie, so
 * serving the SPA from anywhere else would silently stop the cookie being sent.
 */
const BASE = "/jeoparty/";

/** Where the Flask dev server listens (see `main.py -p`). */
const BACKEND = "http://127.0.0.1:5006";

/** Dashboard paths, relative to BASE. Must match `_DASHBOARD_PATHS` in the backend's routes/spa.py. */
const DASHBOARD_PATH = /^(login|create_game|create_pack|pack\/[^/]+(\/cheatsheet)?)?$/;

/**
 * Picks which entry HTML a page URL belongs to -- the dev-server half of the
 * routing table in API_BLUEPRINT.md §8 (Flask does the same in production).
 * Without it Vite only serves `/jeoparty/dashboard.html` etc. literally, which
 * no router route matches.
 */
function entryFor(url: string): string | null {
  if (!url.startsWith(BASE)) return null;
  const path = url.slice(BASE.length);

  if (/^(api|static)(\/|$)/.test(path)) return null; // proxied to Flask
  if (path.startsWith("@") || path.split("/").pop()!.includes(".")) return null; // Vite internals and files

  if (path.startsWith("presenter/")) return "presenter.html";
  if (DASHBOARD_PATH.test(path)) return "dashboard.html";
  return "contestant.html";
}

function multiPageFallback(): Plugin {
  return {
    name: "jeoparty-multi-page-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const acceptsHtml = req.headers.accept?.includes("text/html");
        const entry = req.method === "GET" && acceptsHtml ? entryFor(req.url!.split("?")[0]) : null;
        if (entry) req.url = `${BASE}${entry}`;
        next();
      });
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [vue(), multiPageFallback()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  build: {
    // Three entry points rather than one SPA: the views never navigate to each
    // other, their stylesheets are disjoint, and contestants on phones should
    // never download the question-pack editor.
    rollupOptions: {
      input: {
        dashboard: fileURLToPath(new URL("./dashboard.html", import.meta.url)),
        presenter: fileURLToPath(new URL("./presenter.html", import.meta.url)),
        contestant: fileURLToPath(new URL("./contestant.html", import.meta.url)),
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Proxy rather than CORS. The backend does set `CORS(app)` and
    // `cors_allowed_origins="*"`, but wildcard CORS does not work with
    // credentialed cookies -- and both auth mechanisms here are cookies.
    // Proxying keeps the browser on a single origin and the whole question
    // never comes up.
    proxy: {
      "/jeoparty/api": { target: BACKEND, changeOrigin: true },
      "/jeoparty/static": { target: BACKEND, changeOrigin: true },
      "/socket.io": { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
});
