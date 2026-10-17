// Tags in notes: "@Haroon" (a team member, by display name) and "@all" (everyone).

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "@Name" as a whole word: not inside an email address ("a@b") and not the start of a longer word.
const tagRx = (name, flags = 'i') => new RegExp(`(^|[^\\w@])@${escapeRx(name)}(?!\\w)`, flags);

/** Who a note's text tags: `{ mentions: [userId], mentionAll }`, for POST / PATCH of a note. */
export function extractMentions(text, team = []) {
  const s = String(text || '');
  return { mentions: team.filter((u) => u.displayName && tagRx(u.displayName).test(s)).map((u) => u._id), mentionAll: tagRx('all').test(s) };
}

/** The note's text cut into `{ text, tag }` pieces, `tag` true for "@all" / "@<team member>", for highlighting. */
export function splitMentions(text, names = []) {
  const s = String(text || '');
  const list = ['all', ...names.filter(Boolean)].sort((a, b) => b.length - a.length).map(escapeRx);
  const rx = new RegExp(`(^|[^\\w@])(@(?:${list.join('|')}))(?!\\w)`, 'gi');
  const parts = [];
  let last = 0;
  for (const m of s.matchAll(rx)) {
    const start = m.index + m[1].length;
    if (start > last) parts.push({ text: s.slice(last, start), tag: false });
    parts.push({ text: m[2], tag: true });
    last = start + m[2].length;
  }
  if (last < s.length) parts.push({ text: s.slice(last), tag: false });
  return parts;
}

/** The "@query" being typed just before the caret, or null when the caret is not in a tag. */
export function tagQueryAt(text, caret) {
  const m = String(text || '').slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/);
  return m ? m[1] : null;
}
