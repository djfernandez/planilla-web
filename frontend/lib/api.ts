export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function messageFrom(body: unknown) {
  if (!body || typeof body !== 'object') return 'No se pudo completar la operación.';
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join(' ');
  if (typeof message === 'string') return message;
  return 'No se pudo completar la operación.';
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && retry && !path.startsWith('/api/auth/login') && path !== '/api/auth/refresh') {
    const refresh = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) return api<T>(path, init, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(messageFrom(body), response.status);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) return response.json() as Promise<T>;
  return undefined as T;
}
