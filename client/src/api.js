const TOKEN_KEY = 'pg_token';
let token = localStorage.getItem(TOKEN_KEY);
let onUnauthorized = () => {};

export const getToken = () => token;
export function setToken(t) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY);
}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/** fetch wrapper: JSON in/out, Bearer token, throws Error with .fields (per-input messages) and .status. */
export async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("Can't reach the server. Check your connection and try again."), { fields: {} });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { fields: data.fields || {}, status: res.status });
  return data;
}
