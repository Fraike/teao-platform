const DATE = /^(20\d{2})[.年/-](\d{1,2})(?:[.月/-](\d{1,2}))?(?:日|月)?(?!\d)/;

export function leadingCommentDate(text: string): { date: string; length: number } | null {
  const match = text.match(DATE);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = match[3] ? Number(match[3]) : null;
  if (month < 1 || month > 12 || (day !== null && (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()))) return null;
  if (/^[.\d]/.test(text.slice(match[0].length))) return null;
  return { date: `${year}-${String(month).padStart(2, "0")}${day === null ? "" : `-${String(day).padStart(2, "0")}`}`, length: match[0].length };
}

export function firstCommentDate(text: string): string {
  for (const line of text.split("\0")[0].split(/\r?\n/)) {
    const match = leadingCommentDate(line.trim());
    if (match) return match.date;
  }
  return "";
}
