/** Compute the table body's space from measured layout, never from a hard-coded header height. */
export function getTableViewportHeight(top: number, bottom: number, chromeHeight: number, inset = 8): number {
  return Math.max(80, Math.floor(bottom - top - chromeHeight - inset));
}
