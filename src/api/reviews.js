import { api } from './client';
export const reviewsApi = {
  list: () => api('/api/bootstrap'),
  create: review => api('/api/reviews', { method: 'POST', body: JSON.stringify(review) }),
  update: (id, patch) => api(`/api/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: id => api(`/api/reviews/${id}`, { method: 'DELETE' }),
  details: id => api(`/api/reviews/${id}/details`),
  comment: (id, body) => api(`/api/reviews/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  addSubtask: (id, title) => api(`/api/reviews/${id}/subtasks`, { method: 'POST', body: JSON.stringify({ title }) }),
  updateSubtask: (reviewId, subtaskId, patch) => api(`/api/reviews/${reviewId}/subtasks/${subtaskId}`, { method: 'PATCH', body: JSON.stringify(patch) })
};
