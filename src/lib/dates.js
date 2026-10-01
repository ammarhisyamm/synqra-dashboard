export function parseDate(value) {
  if (!value) return null;
  // SQLite CURRENT_TIMESTAMP is UTC despite not including a timezone suffix.
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z` : value;
  const candidate = new Date(typeof normalized === 'string' && normalized.length === 10 ? `${normalized}T12:00:00` : normalized);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}
export function localToday(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
export function dateLabel(date) { const value = parseDate(date); return value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(value) : '—'; }
export function slashDate(date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '—'; const [y, m, d] = date.split('-'); return `${m}/${d}/${y}`; }
export function shortDate(date) { const value = parseDate(date); return value ? new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(value) : '—'; }
export function ageLabel(createdAt) { const then = parseDate(createdAt)?.getTime(); return `${then ? Math.max(0, Math.floor((Date.now() - then) / 86400000)) : 0}d`; }
export function groupDateLabel(date) { const value = parseDate(date); return value ? new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(value) : '—'; }
export function relativeDate(date) { const dateValue = parseDate(date); if (!dateValue) return '—'; const d = Math.max(0, Math.floor((Date.now() - dateValue.getTime()) / 86400000)); return d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`; }
