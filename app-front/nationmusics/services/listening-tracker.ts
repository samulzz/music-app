// Count audible progress, not the seek bar's position. Same rules as desktop.
export function createListeningTracker() {
  let current: { key: string; position: number; at: number; playing: boolean; seconds: number; reported: boolean } | null = null;
  return {
    sample(key: string, position: number, playing: boolean, now = Date.now()) {
      if (!key) { current = null; return; }
      if (!current || current.key !== key) current = { key, position, at: now, playing, seconds: 0, reported: false };
      const elapsed = Math.max(0, (now - current.at) / 1000);
      const delta = position - current.position;
      if (current.playing && delta > 0 && delta <= elapsed + 1.5 && elapsed <= 60)
        current.seconds += Math.min(delta, elapsed);
      current.position = position; current.at = now; current.playing = playing;
    },
    take(key: string) {
      if (!current || current.key !== key || current.reported) return null;
      current.reported = true;
      return Math.floor(current.seconds);
    },
    reset() { current = null; },
  };
}
