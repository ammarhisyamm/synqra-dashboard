import { api } from './client';
export const projectsApi = {
  create: body => api('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  spaces: () => api('/api/spaces')
};
