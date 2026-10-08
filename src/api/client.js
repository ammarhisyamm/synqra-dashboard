let mutationRevision = 0;
let pendingMutations = 0;
export const mutationState = () => ({ revision: mutationRevision, pending: pendingMutations });

export async function api(path, options = {}) {
  const mutating = ['POST', 'PATCH', 'DELETE', 'PUT'].includes((options.method || 'GET').toUpperCase());
  if (mutating) { pendingMutations += 1; mutationRevision += 1; }
  try {
    const response = await fetch(path, {
      ...options,
      cache: options.cache || 'no-store',
      headers: { ...(options.body instanceof FormData ? {} : { 'content-type':'application/json' }), ...(options.headers || {}) }
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
      body = text ? { message: text.slice(0, 200) } : null;
    }
    if (!response.ok) {
      const error = new Error(body?.error || body?.message || `Request failed with status ${response.status}`);
      error.status = response.status;
      if (response.status === 401 && !path.startsWith('/api/auth/') && typeof window !== 'undefined') window.dispatchEvent(new Event('synqra:session-expired'));
      throw error;
    }
    if (!contentType.includes('application/json') || !body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Server returned an unexpected response. Please try again.');
    }
    return body;
  } finally {
    if (mutating) { pendingMutations -= 1; mutationRevision += 1; }
  }
}
