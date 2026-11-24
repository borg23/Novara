"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavUser {
  id: number;
  username: string;
  displayName: string;
}

const LINKS = [
  { href: "/", label: "面板" },
  { href: "/homework", label: "作业" },
  { href: "/courses", label: "课程" },
  { href: "/gpa", label: "GPA" },
  { href: "/focus", label: "专注" },
];

export default function Nav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Novara
          </Link>
          {user && (
            <nav className="flex items-center gap-1 text-sm">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={
                    pathname === l.href
                      ? "rounded-lg bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700"
                      : "rounded-lg px-3 py-1.5 text-stone-600 hover:bg-stone-100"
                  }
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-stone-500">{user.displayName}</span>
            <button onClick={logout} className="btn-ghost !px-2.5 !py-1">
              退出
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Link href="/login" className="btn-ghost">
              登录
            </Link>
            <Link href="/register" className="btn-primary">
              注册
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
