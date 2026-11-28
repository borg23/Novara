import type { Metadata } from "next";
import "./globals.css";
import { IdentityProvider } from "@/components/identity";
import { ThemeProvider } from "@/components/theme-provider";
import Nav from "@/components/nav";

export const metadata: Metadata = {
  title: "Novara · 作业与课程管理",
  description: "面向学生的作业与课程管理工具：作业、GPA、计时与组件化面板",
};

const PUBLIC_PATHS = ["/login", "/register"];

// 首屏前按本地偏好直接给 <html> 加 .dark，避免浅色闪白（FOUC）。
const BOOT_SCRIPT = `try{(function(){var t=localStorage.getItem("novara-theme");if(t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}})()}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen">
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <IdentityProvider loginHref="/login" requireLogin publicPaths={PUBLIC_PATHS}>
          <ThemeProvider>
            <Nav />
            <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
          </ThemeProvider>
        </IdentityProvider>
      </body>
    </html>
  );
}
