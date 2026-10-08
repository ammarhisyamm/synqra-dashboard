export function calendarDate(value, label = 'Date', required = false) {
  if (value === '' || value == null) {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid ${label.toLowerCase()}.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${label.toLowerCase()}.`);
  return value;
}

export function dateRange(start, end, label = 'Due date') {
  if (start && end && end < start) throw new Error(`${label} must be on or after the start date.`);
}
