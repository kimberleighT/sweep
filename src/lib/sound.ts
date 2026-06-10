/**
 * Tiny WebAudio sound kit — all effects are synthesised at runtime, so
 * there are no audio files to ship. Muted state is remembered in
 * localStorage. The AudioContext is created lazily on first use (after a
 * user gesture), as browsers require.
 */
let ctx: AudioContext | null = null;
let muted = localStorage.getItem("wcs:muted") === "1";

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function isMuted() {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem("wcs:muted", muted ? "1" : "0");
  return muted;
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "sine",
  gain = 0.2
) {
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}

/** soft click as flags flick past in the slot-machine reveal */
export function tick() {
  tone(880, 0, 0.04, "square", 0.05);
}

/** bright "ding" when a team locks in */
export function ding() {
  tone(880, 0, 0.18, "sine", 0.18);
  tone(1320, 0.04, 0.22, "sine", 0.14);
}

/** celebratory airhorn for a Pot 1 heavyweight */
export function airhorn() {
  tone(440, 0, 0.55, "sawtooth", 0.16);
  tone(554, 0, 0.55, "sawtooth", 0.12);
  tone(660, 0.05, 0.5, "sawtooth", 0.1);
}

/** little fanfare when the whole draw completes */
export function fanfare() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, "triangle", 0.18));
}
