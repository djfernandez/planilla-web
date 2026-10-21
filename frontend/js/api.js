let firebaseAuth;

export function configureApi(auth) {
  firebaseAuth = auth;
}

export async function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
  if (!firebaseAuth?.currentUser) throw new Error('Inicia sesión para continuar.');
  const token = await firebaseAuth.currentUser.getIdToken();
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Authorization', `Bearer ${token}`);
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const response = await fetch(`/api${path}`, {
    method,
    headers: requestHeaders,
    body,
    cache: 'no-store'
  });
  if (response.status === 204) {
    if (method !== 'GET') window.dispatchEvent(new Event('api:datachanged'));
    return null;
  }

  const responseText = await response.text();
  let result = {};
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(`El servidor devolvió una respuesta inválida (${response.status}).`);
    }
  }
  if (!response.ok) {
    const error = new Error(result.error || `Error de API (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (method !== 'GET') window.dispatchEvent(new Event('api:datachanged'));
  return result.data;
}

export async function uploadFile(file, kind, key = '') {
  const formData = new FormData();
  formData.append('file', file, file.name || 'documento.pdf');
  formData.append('kind', kind);
  if (key) formData.append('key', key);
  return apiRequest('/files', { method: 'POST', body: formData });
}

export const serverTimestamp = () => ({ __serverTimestamp: true });
export const deleteField = () => ({ __deleteField: true });
