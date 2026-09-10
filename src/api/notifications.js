import { api } from './client';
export const notificationsApi = {
  list: () => api('/api/notifications'),
  read: id => api(`/api/notifications/${id}`, { method: 'PATCH' }),
  readAll: () => api('/api/notifications/read-all', { method: 'POST' })
};
