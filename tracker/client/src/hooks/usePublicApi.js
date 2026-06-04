// Public API fetch helper — same shape as apiFetch but DOES NOT redirect to /login
// on 401. Public endpoints (under /api/public) return 200 without auth, but we
// don't want an accidental 401 to kick an unauthenticated visitor to the admin
// login screen.
export async function publicFetch(path, options = {}) {
  const timeout = options.timeout || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let res;
  try {
    // Prefix with Vite's base (import.meta.env.BASE_URL) so calls resolve under
    // the mount point: '/tracker/api/...' integrated, '/api/...' standalone.
    res = await fetch(`${import.meta.env.BASE_URL}api${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: controller.signal,
      ...options,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (${res.status})`);
  }
  // Some endpoints (204 No Content, or HEAD) have no body. Guard res.json()
  // so a success response without a JSON body doesn't surface as an error.
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}
