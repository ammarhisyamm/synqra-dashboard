export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: options.cache || 'no-store',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  let body;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } else {
    const text = await response.text();
    body = text ? { message: text } : null;
  }
  if (!response.ok) {
    const error = new Error(body?.error || body?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body || {};
}
