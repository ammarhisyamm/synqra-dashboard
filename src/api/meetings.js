import { api } from './client';

export const meetingsApi = {
  create: meeting => api('/api/meetings', { method: 'POST', body: JSON.stringify(meeting) }),
  update: (id, patch) => api(`/api/meetings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: id => api(`/api/meetings/${id}`, { method: 'DELETE' })
};
