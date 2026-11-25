import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entry = fileURLToPath(new URL("index.html", import.meta.url));

// root 是仓库根，静态壳在 /web/ 下；开发时把任意无前缀路径回落到壳入口，
// 让 currentPath() 与线上（站点根即 SPA 根）保持一致。
// 只接管接受 HTML 的导航请求：函数代理、静态资源与 Vite 内部路径（/@、/_、/node_modules）一律放行，
// 否则 /__vite_ping 之类的探测会被改写成 index.html，HMR 会反复重载。
function spaDevFallback(): Plugin {
  return {
    name: "novara-spa-dev-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = decodeURIComponent((req.url ?? "").split("?")[0]);
        const acceptsHtml = (req.headers.accept ?? "").includes("text/html");
        const internal =
          path.startsWith("/functions/") ||
          path.startsWith("/web/") ||
          path.startsWith("/@") ||
          path.startsWith("/_") ||
          path.startsWith("/node_modules/") ||
          path.includes(".");
        if (req.method === "GET" && acceptsHtml && !internal) {
          req.url = "/web/index.html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // 组件与 lib 与 Next 形态共用一份，root 取仓库根，避免 root 之外的文件被当成依赖预构建。
  root: repoRoot,
  plugins: [react(), spaDevFallback()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/functions/v1/app": "http://127.0.0.1:8000" },
  },
  build: {
    rollupOptions: { input: entry },
    outDir: fileURLToPath(new URL("../out", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
});
