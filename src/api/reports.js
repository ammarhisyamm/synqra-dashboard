import { api } from './client';
export const reportsApi = {
  burndown: sprintId => api(`/api/reports/burndown?sprint_id=${encodeURIComponent(sprintId)}`)
};
