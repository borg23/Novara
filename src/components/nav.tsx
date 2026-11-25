"use client";

import { AppLink, ReadOnlyNotice, currentPath, useIdentity } from "@/components/identity";
import { apiFetch } from "@/lib/api";

const LINKS: { href: string; label: string; feature?: "gpa" | "focus" }[] = [
  { href: "/", label: "面板" },
  { href: "/homework", label: "作业" },
  { href: "/courses", label: "课程" },
  { href: "/gpa", label: "GPA", feature: "gpa" },
  { href: "/focus", label: "专注", feature: "focus" },
];

export default function Nav() {
  const { account, ready, loginHref, features } = useIdentity();
  const path = currentPath();
  const links = LINKS.filter((l) => !l.feature || features[l.feature]);

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <AppLink href="/" className="text-lg font-bold tracking-tight">
            Novara
          </AppLink>
          {ready && account && (
            <nav className="flex items-center gap-1 text-sm">
              {links.map((l) => (
                <AppLink
                  key={l.href}
                  href={l.href}
                  className={
                    path === l.href
                      ? "rounded-lg bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700"
                      : "rounded-lg px-3 py-1.5 text-stone-600 hover:bg-stone-100"
                  }
                >
                  {l.label}
                </AppLink>
              ))}
            </nav>
          )}
        </div>
        {!ready ? null : account ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-stone-500">{account.displayName}</span>
            {features.passwordAuth && (
              <button onClick={logout} className="btn-ghost !px-2.5 !py-1">
                退出
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <AppLink href={loginHref} className="btn-primary">
              {features.passwordAuth ? "登录" : "用 Qoder 账号登录"}
            </AppLink>
            {features.passwordAuth && (
              <AppLink href="/register" className="btn-ghost">
                注册
              </AppLink>
            )}
          </div>
        )}
      </div>
      <ReadOnlyNotice />
    </header>
  );
}
