/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [],
  // 组件统一按部署契约的前缀发请求；本地 Next 形态把这些请求桥接回既有 /api 路由。
  async rewrites() {
    return [{ source: "/functions/v1/app/:path*", destination: "/api/:path*" }];
  },
};

export default nextConfig;
