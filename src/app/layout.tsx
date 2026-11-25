import type { Metadata } from "next";
import "./globals.css";
import { IdentityProvider } from "@/components/identity";
import Nav from "@/components/nav";

export const metadata: Metadata = {
  title: "Novara · 作业与课程管理",
  description: "面向学生的作业与课程管理工具：作业、GPA、计时与组件化面板",
};

const PUBLIC_PATHS = ["/login", "/register"];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <IdentityProvider loginHref="/login" requireLogin publicPaths={PUBLIC_PATHS}>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
        </IdentityProvider>
      </body>
    </html>
  );
}
