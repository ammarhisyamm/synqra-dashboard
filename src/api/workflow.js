import { api } from './client';
export const workflowApi = {
  statuses: () => api('/api/workflow/statuses'),
  createStatus: body => api('/api/workflow/statuses', { method: 'POST', body: JSON.stringify(body) }),
  updateStatus: (id, body) => api(`/api/workflow/statuses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  sprints: () => api('/api/workflow/sprints'),
  createSprint: body => api('/api/workflow/sprints', { method: 'POST', body: JSON.stringify(body) })
};
