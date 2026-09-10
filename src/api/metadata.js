import { api } from './client';

export const metadataApi = {
  list: () => api('/api/metadata'),
  create: body => api('/api/metadata', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/metadata/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: id => api(`/api/metadata/${id}`, { method: 'DELETE' })
};
