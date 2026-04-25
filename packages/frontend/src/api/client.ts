// Centralized API client — handles base URL, Authorization header,
// JWT expiry checking, and global 401 handling.

const API_URL = import.meta.env.VITE_API_URL as string | undefined ?? "";

let authToken: string | null = null;
let onAuthExpired: (() => void) | null = null;

/** Register a callback invoked when a 401 is received or the token is expired. */
export function setAuthExpiredHandler(handler: () => void): void {
  onAuthExpired = handler;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem("authToken", token);
  } else {
    localStorage.removeItem("authToken");
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem("authToken");
  }
  if (authToken && isTokenExpired(authToken)) {
    clearAuthToken();
    return null;
  }
  return authToken;
}

export function clearAuthToken(): void {
  authToken = null;
  localStorage.removeItem("authToken");
}

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  if (!token && !path.includes("/api/auth/login")) {
    onAuthExpired?.();
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // Only auto-set Content-Type for string bodies (JSON). FormData, Blob, etc.
  // need the browser to set the correct Content-Type with boundary.
  if (!headers.has("Content-Type") && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiUrl(path), { ...options, headers });

  if (response.status === 401) {
    clearAuthToken();
    onAuthExpired?.();
  }

  return response;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    const exp = payload.exp as number | undefined;
    if (!exp) return false;
    // Consider expired 30 seconds early to avoid edge-case race conditions
    return Date.now() >= (exp - 30) * 1000;
  } catch {
    return true;
  }
}
