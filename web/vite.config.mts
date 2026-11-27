import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const webRoot = fileURLToPath(new URL(".", import.meta.url));

// root 是 web/，静态壳入口就是根 index.html；开发时把无扩展名的导航路径回落到壳入口，
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
          path.startsWith("/@") ||
          path.startsWith("/_") ||
          path.startsWith("/node_modules/") ||
          path.includes(".");
        if (req.method === "GET" && acceptsHtml && !internal) {
          req.url = "/index.html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // 部署形态的站点根是 out/web/index.html。assets/ 必须落在同一目录，
  // 否则 prepare_site 的 webDirectory=out/web 只上传 HTML、脚本与样式 404。
  root: webRoot,
  plugins: [react(), spaDevFallback()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // 组件与 lib 与 Next 形态共用一份，开发态需要读取 web/ 之外的文件。
    fs: { allow: [repoRoot] },
    proxy: { "/functions/v1/app": "http://127.0.0.1:8000" },
  },
  build: {
    outDir: fileURLToPath(new URL("../out/web", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
});
