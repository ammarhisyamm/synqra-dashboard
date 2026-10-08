import { api } from './client';

export const meetingsApi = {
  create: meeting => api('/api/meetings', { method: 'POST', body: JSON.stringify(meeting) }),
  update: (id, patch) => api(`/api/meetings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: id => api(`/api/meetings/${id}`, { method: 'DELETE' }),
  capture: (id, signal) => api(`/api/meetings/${id}/capture`, { signal }),
  start: (id, body) => api(`/api/meetings/${id}/capture`, { method:'POST',body:JSON.stringify(body) }),
  sync: id => api(`/api/meetings/${id}/sync`, { method:'POST' }),
  stop: id => api(`/api/meetings/${id}/stop`, { method:'POST' }),
  summarize: id => api(`/api/meetings/${id}/summary`, { method:'POST' }),
  saveSummary: (id, summary) => api(`/api/meetings/${id}/summary`, { method:'PATCH',body:JSON.stringify({summary}) }),
  share: (id, body) => api(`/api/meetings/${id}/shares`, { method:'POST',body:JSON.stringify(body) }),
  revoke: (id, shareId) => api(`/api/meetings/${id}/shares/${shareId}`, { method:'DELETE' }),
  reconcile: (id, providerMeetingId) => api(`/api/meetings/${id}/reconcile`, { method:'POST',body:JSON.stringify({providerMeetingId}) })
};
