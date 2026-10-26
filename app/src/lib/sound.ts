import type { Phase } from '@greenmafia/engine';
import { asset } from './assets';
import { mayPlaySound, type Sfx } from './soundPolicy';
export type { Sfx } from './soundPolicy';

let enabled = true;
let phase: Phase['t'] | null = null;
let paused = false;
let context: AudioContext | null = null;
let epoch = 0;
const buffers = new Map<string, Promise<AudioBuffer>>();
const playing = new Set<AudioBufferSourceNode>();

function stop(): void {
  epoch++;
  for (const source of playing) source.stop();
  playing.clear();
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!on) stop();
}

/** Synchronous store subscription runs before screen effects can play. */
export function setSoundContext(nextPhase: Phase['t'] | null, nextPaused: boolean): void {
  if (phase !== nextPhase || paused !== nextPaused) stop();
  phase = nextPhase;
  paused = nextPaused;
}

/** Unlock on a gesture so later timer alerts also work on mobile browsers. */
export function initSound(): void {
  const unlock = () => {
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* Audio is optional on unsupported devices. */ }
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
}

export function play(name: Sfx, volume = 0.8): void {
  if (!enabled || document.hidden || !mayPlaySound(name, phase, paused) || !context) return;
  const url = asset(`audio/sfx/${name}`, 'audio');
  if (!url) return;
  const audio = context;
  const requestedAt = epoch;
  let buffer = buffers.get(url);
  if (!buffer) {
    buffer = fetch(url).then((r) => {
      if (!r.ok) throw new Error('Sound unavailable');
      return r.arrayBuffer();
    }).then((data) => audio.decodeAudioData(data));
    buffers.set(url, buffer);
    void buffer.catch(() => buffers.delete(url));
  }
  void buffer.then((data) => {
    if (requestedAt !== epoch || !enabled || document.hidden || audio.state !== 'running' || !mayPlaySound(name, phase, paused)) return;
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = data;
    gain.gain.value = Math.max(0, Math.min(1, volume));
    source.connect(gain).connect(audio.destination);
    playing.add(source);
    source.onended = () => { playing.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }).catch(() => {});
}

export function vibrate(pattern: number | number[]): void {
  if (!enabled || paused || phase === 'night' || phase === 'reveal' || document.hidden) return;
  try { navigator.vibrate?.(pattern); } catch { /* Optional. */ }
}
