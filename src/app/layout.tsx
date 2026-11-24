import type { Metadata } from "next";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import Nav from "@/components/nav";

export const metadata: Metadata = {
  title: "Novara · 作业与课程管理",
  description: "面向学生的作业与课程管理工具：作业、GPA、计时与组件化面板",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <Nav user={user} />
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
      </body>
    </html>
  );
}
