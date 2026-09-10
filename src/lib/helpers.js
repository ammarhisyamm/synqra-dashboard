import { STORAGE_KEY } from '../constants/workflow';

export const REPORT_COLORS = {
  accent: '#111b30',
  accentSoft: '#4f46e5',
  info: '#6366f1',
  success: '#334155',
  warning: '#64748b',
  danger: '#94a3b8',
  muted: '#cbd5e1'
};

export const seed = {
  project: { name: 'Acme Redesign', initials: 'A' },
  reviews: [
    { id: 'r1', title: 'Pricing page copy needs tightening', area: 'Marketing', priority: 'Major', stage: 'Review', assignee: 'Aria', due: '2026-09-12', createdAt: '2026-09-09', archived: false },
    { id: 'r2', title: 'Empty states illustration set', area: 'Design', priority: 'Minor', stage: 'Planning', assignee: 'Mia', due: '2026-09-16', createdAt: '2026-09-09', archived: false },
    { id: 'r3', title: 'Homepage hero lacks clear value proposition', area: 'Marketing', priority: 'Major', stage: 'Planning', assignee: 'Leo', due: '2026-09-14', createdAt: '2026-09-08', archived: false },
    { id: 'r4', title: 'Dark mode contrast fails WCAG AA on cards', area: 'Design', priority: 'Major', stage: 'In Progress', assignee: 'Mia', due: '2026-09-11', createdAt: '2026-09-07', archived: false },
    { id: 'r5', title: 'API rate limiting for public endpoints', area: 'Engineering', priority: 'Minor', stage: 'Review', assignee: 'Leo', due: '2026-09-15', createdAt: '2026-09-06', archived: false },
    { id: 'r6', title: 'Checkout flow drops on mobile Safari', area: 'Engineering', priority: 'Blocker', stage: 'In Progress', assignee: 'Aria', due: '2026-09-09', createdAt: '2026-09-05', archived: false },
    { id: 'r7', title: 'Footer links audit', area: 'Marketing', priority: 'Minor', stage: 'Final', assignee: 'Aria', due: '2026-09-08', createdAt: '2026-09-04', archived: false },
    { id: 'r8', title: 'Analytics events naming', area: 'Engineering', priority: 'Minor', stage: 'Completed', assignee: 'Leo', due: '2026-09-07', createdAt: '2026-09-03', archived: false },
    { id: 'r9', title: 'Onboarding checklist states', area: 'Design', priority: 'Major', stage: 'Final', assignee: 'Mia', due: '2026-09-09', createdAt: '2026-09-02', archived: false }
  ],
  meetings: [
    { id: 'm1', title: 'Weekly product sync', date: '2026-09-09', ai: true, notes: 'Fix onboarding flow. Update the pricing page. Audit dashboard metrics.', itemCount: 3 },
    { id: 'm2', title: 'Design review — checkout', date: '2026-09-06', ai: true, notes: 'Improve checkout mobile layout. Review dark mode contrast.', itemCount: 2 },
    { id: 'm3', title: 'Marketing alignment', date: '2026-09-03', ai: false, notes: 'Clarify hero proposition. Tighten pricing page copy.', itemCount: 2 }
  ]
};

export function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || seed; } catch { return seed; }
}

export function statusFor(review) {
  if (review.status) return review.status;
  if (review.stage === 'Completed') return 'Resolved';
  if (review.stage === 'Final') return 'Review';
  if (review.stage === 'In Progress') return 'In Progress';
  return 'Open';
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
  const timestamp = value => { const parsed = new Date(value).getTime(); return Number.isFinite(parsed) ? parsed : now; };
  const events = history?.length ? [...history].sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt)) : [{ id: 'initial', fromStatus: null, toStatus: currentStatus, createdAt, name: 'System' }];
  const timeline = events.map((event, index) => {
    const start = timestamp(event.createdAt); const end = events[index + 1] ? timestamp(events[index + 1].createdAt) : now;
    const minutes = Math.max(0, (end - start) / 60000);
    return { ...event, from: event.fromStatus || 'Created', minutes, spent: elapsedLabel(minutes) };
  });
  const totals = timeline.reduce((result, item) => { result[item.toStatus] = (result[item.toStatus] || 0) + item.minutes; return result; }, {});
  const activeMinutes = Math.max(0, (now - timestamp(createdAt)) / 60000);
  return { timeline, totals, activeMinutes };
}
export function historyDateLabel(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }

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
