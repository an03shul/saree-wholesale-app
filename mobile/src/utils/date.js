// SQLite's CURRENT_TIMESTAMP stores UTC as "YYYY-MM-DD HH:MM:SS" with no
// timezone marker. `new Date(...)` parses that space-separated form as LOCAL
// time (not UTC), so a raw `new Date(ts)` silently shifts every timestamp by
// the viewer's UTC offset. Normalize to an explicit UTC ISO string first.
export const parseServerDate = (ts) => {
  if (!ts) return new Date(NaN);
  const iso = ts.replace(' ', 'T');
  return new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
};
