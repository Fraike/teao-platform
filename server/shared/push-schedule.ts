/** Resolve a configured Shanghai minute without relying on the host timezone. */
export function shanghaiMinute(at: number): string {
  return new Date(at + 8 * 3600000).toISOString().slice(11, 16);
}

export function reminderWindowEnd(at: number, time: string, times: string[]): number {
  const midnight = Date.parse(new Date(at + 8 * 3600000).toISOString().slice(0, 10) + 'T00:00:00+08:00');
  const [hour] = time.split(':').map(Number);
  const next = times.find(value => value > time);
  const nextMinute = next ? Number(next.slice(0, 2)) * 60 + Number(next.slice(3)) : 1440;
  return midnight + Math.min((hour + 1) * 60, nextMinute) * 60000;
}
