import { useAuth } from "../store/auth";

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = useAuth.getState().token;
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const hasBody = init?.body != null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    useAuth.getState().logout();
    const path = window.location.pathname;
    if (!path.startsWith("/login")) {
      window.location.href = `/login?from=${encodeURIComponent(path)}`;
    }
  }

  return res;
}
