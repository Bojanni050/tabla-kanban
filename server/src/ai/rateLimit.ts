// A small per-user sliding-window limiter so one account cannot run up the provider bill.
// In memory, like the session store - fine for the single backend container Kala runs as.

const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

/** Records a request for `key` and returns true if it is within the limit. */
export function allowRequest(key: string, limitPerHour: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limitPerHour) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map does not grow without bound.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return true;
}
