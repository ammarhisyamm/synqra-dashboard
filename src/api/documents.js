import { api } from './client';
export const documentsApi = {
  list: (projectId, signal) => api(`/api/documents?projectId=${encodeURIComponent(projectId)}`, {signal}),
  create: body => api('/api/documents', {method:'POST',body:JSON.stringify(body)}),
  update: (id, body) => api(`/api/documents/${encodeURIComponent(id)}`, {method:'PATCH',body:JSON.stringify(body)})
};
