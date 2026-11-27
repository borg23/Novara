"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface Account {
  id: string;
  displayName: string;
}

export interface Features {
  gpa: boolean;
  focus: boolean;
  batchImport: boolean;
  weather: boolean;
  passwordAuth: boolean;
}

const FULL_FEATURES: Features = {
  gpa: true,
  focus: true,
  batchImport: true,
  weather: true,
  passwordAuth: true,
};

interface IdentityState {
  ready: boolean;
  account: Account | null;
  invalid: boolean;
  readOnly: boolean;
  loginHref: string;
  features: Features;
}

const IdentityContext = createContext<IdentityState>({
  ready: false,
  account: null,
  invalid: false,
  readOnly: false,
  loginHref: "/login",
  features: FULL_FEATURES,
});

const NO_PUBLIC_PATHS: string[] = [];

function isPublicPath(publicKey: string, path: string): boolean {
  return publicKey !== "" && publicKey.split("|").includes(path);
}

export function IdentityProvider({
  children,
  loginHref,
  features = FULL_FEATURES,
  requireLogin = false,
  publicPaths = NO_PUBLIC_PATHS,
}: {
  children: React.ReactNode;
  loginHref: string;
  features?: Features;
  requireLogin?: boolean;
  publicPaths?: string[];
}) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [invalid, setInvalid] = useState(false);
  // 依赖数组里必须是稳定值：每次渲染都新建的 [] 会让这个效应反复触发 /auth/me。
  const publicKey = publicPaths.join("|");

  useEffect(() => {
    let alive = true;
    apiFetch("/auth/me")
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 403) {
          setInvalid(true);
          return;
        }
        const data = (await res.json()) as Partial<Account> | null;
        if (data && typeof data.id === "string") {
          setAccount({ id: data.id, displayName: data.displayName ?? "" });
        } else if (requireLogin && !isPublicPath(publicKey, currentPath())) {
          window.location.replace(loginHref);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [loginHref, requireLogin, publicKey]);

  const readOnly = !invalid && account === null;

  return (
    <IdentityContext.Provider value={{ ready, account, invalid, readOnly, loginHref, features }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): IdentityState {
  return useContext(IdentityContext);
}

// 匿名只读样例下不渲染任何写操作入口，避免留下点了只会 401 的半成品交互。
export function IfWritable({ children }: { children: React.ReactNode }) {
  const { readOnly } = useIdentity();
  return readOnly ? null : <>{children}</>;
}

export function AppLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname.replace(/\/$/, "") || "/";
}

export function ReadOnlyNotice() {
  const { account, ready, invalid, loginHref } = useIdentity();
  if (!ready || account) return null;
  if (invalid) {
    return (
      <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-700">
        登录状态校验失败，请刷新页面重试
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-center text-sm text-indigo-800">
      <span>当前浏览的是公开示例数据，内容为只读。</span>
      <a href={loginHref} className="font-medium underline">
        登录后即可创建与编辑
      </a>
    </div>
  );
}
