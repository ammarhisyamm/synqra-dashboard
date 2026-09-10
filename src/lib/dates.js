export function dateLabel(date) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`)); }
export function slashDate(date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '—'; const [y, m, d] = date.split('-'); return `${m}/${d}/${y}`; }
export function shortDate(date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '—'; return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`)); }
export function ageLabel(createdAt) { const then = new Date(createdAt.length === 10 ? `${createdAt}T12:00:00` : createdAt).getTime(); return `${Math.max(0, Math.floor((Date.now() - then) / 86400000))}d`; }
export function groupDateLabel(date) { return new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`)); }
export function relativeDate(date) { const dateValue = new Date(date.length === 10 ? `${date}T12:00:00` : date); const d = Math.max(0, Math.floor((Date.now() - dateValue.getTime()) / 86400000)); return d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`; }
