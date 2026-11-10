import { apiFetch } from "./api";

export class ApiError extends Error {
  status: number;
  /** Parsed JSON body of the error response (if any). */
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function readBody<T>(res: Response): Promise<T> {
  return res.json().catch(() => ({} as T));
}

/** Authenticated fetch that throws {@link ApiError} when the response is not ok. */
export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const data = await readBody<T & { error?: string }>(res);
  if (!res.ok) {
    const msg =
      (data as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, data as Record<string, unknown>);
  }
  return data;
}

export function getJson<T>(url: string) {
  return apiJson<T>(url);
}

export function postJson<T>(url: string, body: unknown) {
  return apiJson<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchJson<T>(url: string, body: unknown) {
  return apiJson<T>(url, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
