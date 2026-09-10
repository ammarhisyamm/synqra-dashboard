import { api } from './client';
export const projectsApi = {
  create: body => api('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  remove: id => api(`/api/projects/${id}`, { method: 'DELETE' }),
  spaces: () => api('/api/spaces')
};
