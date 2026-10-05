(function (root) {
  function createListeningTracker() {
    let current = null;
    return {
      sample(key, position, playing, now = Date.now()) {
        if (!key) { current = null; return; }
        if (!current || current.key !== key) current = { key, position, at: now, playing, seconds: 0, reported: false };
        const elapsed = Math.max(0, (now - current.at) / 1000);
        const delta = position - current.position;
        if (current.playing && delta > 0 && delta <= elapsed + 1.5 && elapsed <= 60)
          current.seconds += Math.min(delta, elapsed);
        current.position = position; current.at = now; current.playing = playing;
      },
      take(key) {
        if (!current || current.key !== key || current.reported) return null;
        current.reported = true;
        return Math.floor(current.seconds);
      },
      reset() { current = null; },
    };
  }
  if (typeof module !== 'undefined') module.exports = { createListeningTracker };
  else root.createListeningTracker = createListeningTracker;
})(globalThis);
