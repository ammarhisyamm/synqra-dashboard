import { parseDate } from './dates.js';

export const REPORT_COLORS = {
  accent: '#111b30',
  accentSoft: '#33445e',
  info: '#526784',
  success: '#248764',
  warning: '#a76d2a',
  danger: '#c24d4d',
  muted: '#a7b3c2'
};

// Workspace records are never restored from shared browser storage before authentication.
export const seed = { project: null, projects: [], reviews: [], meetings: [], sprints: [], metadata: [], spaces: [], notifications: [], unreadNotifications: 0 };
export function loadData() { return { ...seed }; }

export function statusFor(review) {
  if (review.status) return review.status;
  if (review.stage === 'Completed') return 'Resolved';
  if (review.stage === 'Final') return 'Review';
  if (review.stage === 'In Progress') return 'In Progress';
  return 'Open';
}
export function isAssignedTo(review, user) {
  const candidates = [user?.id, user?.name, user?.email, user?.username].filter(Boolean).map(value => String(value).trim().toLowerCase());
  return [review.assignee, ...(Array.isArray(review.assignees) ? review.assignees : [])].filter(Boolean)
    .some(value => candidates.includes(String(value).trim().toLowerCase()));
}
export function nextTaskKey(reviews) {
  const numbers = reviews.map(r => { const match = /^AR-(\d+)$/.exec(r.key || ''); return match ? Number(match[1]) : 0; });
  return `AR-${Math.max(0, ...numbers) + 1}`;
}
export function downloadReviewsCsv(reviews) {
  const columns = ['Key', 'Title', 'Description', 'Team', 'Phase', 'Priority', 'Assignee', 'Status', 'Due date', 'Archived'];
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = reviews.map(item => [item.key, item.title, item.description, item.area, item.stage, item.priority, item.assignee || 'Unassigned', statusFor(item), item.due, item.archived ? 'Yes' : 'No']);
  const csv = [columns, ...rows].map(row => row.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `synqra-reviews-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function elapsedLabel(minutes) {
  const total = Math.max(0, Math.floor(minutes || 0));
  if (total < 1) return '<1m';
  const days = Math.floor(total / 1440); const hours = Math.floor((total % 1440) / 60); const mins = total % 60;
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', mins ? `${mins}m` : ''].filter(Boolean).join(' ') || '<1m';
}
export function makeHistoryModel(history, currentStatus, createdAt, now) {
  const timestamp = value => parseDate(value)?.getTime() ?? now;
  const events = history?.length ? [...history].sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt)) : [{ id: 'initial', fromStatus: null, toStatus: currentStatus, createdAt, name: 'System' }];
  const timeline = events.map((event, index) => {
    const start = timestamp(event.createdAt); const end = events[index + 1] ? timestamp(events[index + 1].createdAt) : now;
    const minutes = Math.max(0, (end - start) / 60000);
    return { ...event, from: event.fromStatus || 'Created', minutes, spent: elapsedLabel(minutes) };
  });
  const totals = timeline.reduce((result, item) => { result[item.toStatus] = (result[item.toStatus] || 0) + item.minutes; return result; }, {});
  // Waiting in Open is elapsed time, not time spent actively working.
  const activeMinutes = (totals['In Progress'] || 0) + (totals.Review || 0);
  return { timeline, totals, activeMinutes };
}
export function historyDateLabel(value) { const date = parseDate(value); return date ? date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }

export function deduplicateNotifications(current, incoming) {
  if (!incoming || !Array.isArray(incoming)) return current;
  const seen = new Set();
  const result = [];
  // Prioritize newer or existing read state
  for (const item of incoming) {
    const key = item.id || `${item.title}-${item.createdAt}`;
    if (!seen.has(key)) {
      seen.add(key);
      const existing = current.find(c => c.id === item.id);
      result.push(existing ? { ...item, read: existing.read || item.read } : item);
    }
  }
  return result;
}

export function extractNotes(notes) { return notes.split(/[\n.]+/).map(s=>s.replace(/^\s*(?:[-•*]\s*)?/, '').trim()).filter(s=>s.length>4).slice(0,6); }
