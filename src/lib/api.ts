export const API_BASE = "/functions/v1/app";

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { credentials: "same-origin", ...init });
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  return (await res.json()) as T;
}

// 匿名只读样例返回 `{ <key>: [...], readOnly: true }`，登录态返回裸数组。
export async function apiList<T>(path: string, key: string): Promise<T[]> {
  const data = await apiJson<T[] | Record<string, unknown>>(path);
  if (Array.isArray(data)) return data;
  const rows = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(rows) ? (rows as T[]) : [];
}
