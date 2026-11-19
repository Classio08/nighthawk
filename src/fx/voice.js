// VoicePlayer: plays one radio line at a time from public/audio/voice/<id>.mp3 (owner-made voice pack, see ASSETS.md).
// Missing files or blocked autoplay never throw: the subtitle still shows, so the game is never silent about what was said.
export class VoicePlayer {
  constructor(base = `${import.meta.env?.BASE_URL ?? './'}audio/voice/`) { this.base = base; this.cache = new Map(); this.cur = null; }
  _el(id) {
    let a = this.cache.get(id);
    if (!a) { a = new Audio(`${this.base}${id}.mp3`); a.preload = 'auto'; this.cache.set(id, a); }
    return a;
  }
  /** start fetching these lines in the background (call after a click so the browser allows it) */
  preload(ids) { if (typeof Audio === 'undefined') return; for (const id of ids) this._el(id); }
  play(id, volume = 0.8) {
    if (typeof Audio === 'undefined' || volume <= 0) return;
    this.stop();
    try {
      const a = this._el(id); a.currentTime = 0; a.volume = Math.min(1, Math.max(0, volume));
      this.cur = a; const p = a.play(); if (p?.catch) p.catch(() => {});
    } catch { /* no audio device: subtitles only */ }
  }
  stop() { try { this.cur?.pause(); } catch { /* ignore */ } this.cur = null; }
}
