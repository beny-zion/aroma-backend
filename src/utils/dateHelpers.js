// Shared local-date helpers.
//
// scheduledDate (and other date-only fields) are stored as local midnight, so
// YYYY-MM-DD strings must be parsed/formatted in the server's local TZ — not UTC.
// Mixing UTC midnight with these stored values shifts days for any non-UTC server.

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function toLocalDateString(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(s) {
  if (!s) return new Date();
  if (s instanceof Date) return s;
  const str = String(s);
  if (DATE_ONLY_RE.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(str);
}

function startOfLocalDay(s) {
  if (typeof s === 'string' && DATE_ONLY_RE.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfNextLocalDay(s) {
  if (typeof s === 'string' && DATE_ONLY_RE.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d + 1);
  }
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}

function startOfMonth(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function startOfYear(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Date(date.getFullYear(), 0, 1);
}

module.exports = {
  DATE_ONLY_RE,
  toLocalDateString,
  parseLocalDate,
  startOfLocalDay,
  startOfNextLocalDay,
  startOfMonth,
  startOfNextMonth,
  startOfYear
};
