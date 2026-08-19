/**
 * api.ts — Thin API client for Living Diagnosis frontend.
 * All calls go through apiFetch() which:
 *  - Prepends the base URL
 *  - Adds Bearer token when available
 *  - Parses JSON
 *  - Throws on non-2xx responses
 */

const BASE_URL = "http://localhost:8000";
const TOKEN_KEY = "ld_user_id";
const EMAIL_KEY = "ld_email";
const PATIENT_KEY = "ld_patient_id";

// ── Token helpers ────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(userId: string, email: string): void {
  localStorage.setItem(TOKEN_KEY, userId);
  localStorage.setItem(EMAIL_KEY, email);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(PATIENT_KEY);
}

export function getEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(EMAIL_KEY);
}

export function getPatientId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PATIENT_KEY);
}

export function setPatientId(patientId: string): void {
  localStorage.setItem(PATIENT_KEY, patientId);
}

// ── Core fetch wrapper ───────────────────────────────────────────

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.detail ?? body?.message ?? JSON.stringify(body);
    } catch {
      message = await res.text();
    }
    throw new Error(message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
