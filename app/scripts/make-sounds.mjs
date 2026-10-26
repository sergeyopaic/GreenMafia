// Original procedural sounds, 44.1 kHz / mono / 16-bit PCM. No external samples.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../src/assets/audio/sfx/', import.meta.url));
mkdirSync(out, { recursive: true });
const rate = 44100;
const tau = 2 * Math.PI;
function tone(t, start, duration, frequency, gain = 0.2) {
  const u = t - start;
  if (u < 0 || u > duration) return 0;
  const edge = Math.min(1, u / 0.008, (duration - u) / 0.025);
  return Math.sin(tau * frequency * u) * Math.max(0, edge) * Math.exp(-u * 3) * gain;
}
function sequence(notes, length = 0.18, gap = 0.12) {
  return (t) => notes.reduce((v, note, i) => v + tone(t, i * gap, length, note), 0);
}
let seed = 42;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0xffffffff * 2 - 1; };
const sounds = {
  tick: [0.075, (t) => tone(t, 0, 0.065, 880, 0.13)],
  'time-up': [0.85, (t) => tone(t, 0, 0.24, 659, 0.28) + tone(t, 0.3, 0.45, 523, 0.28)],
  'night-fall': [1.25, sequence([392, 330, 262], 0.7, 0.22)],
  morning: [1.25, sequence([262, 330, 392, 523], 0.55, 0.18)],
  stamp: [0.22, (t) => (noise() * 0.25 + Math.sin(tau * 95 * t) * 0.3) * Math.min(1, t / 0.003) * Math.exp(-t * 35)],
  chip: [0.18, (t) => tone(t, 0, 0.15, 1800, 0.1) * Math.exp(-t * 30) + noise() * 0.06 * Math.exp(-t * 60)],
  envelope: [0.35, (t) => noise() * 0.12 * Math.sin(Math.PI * t / 0.35) ** 2],
  typewriter: [0.13, (t) => noise() * 0.16 * Math.exp(-t * 70) + tone(t, 0.04, 0.06, 1300, 0.06)],
  'win-town': [1.65, sequence([262, 330, 392, 523], 0.85, 0.23)],
  'win-mafia': [1.65, sequence([330, 311, 262, 196], 0.85, 0.23)],
  'win-maniac': [1.65, sequence([262, 277, 392, 370], 0.85, 0.23)],
};
for (const [name, [duration, sample]] of Object.entries(sounds)) {
  const count = Math.ceil(rate * duration);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const fade = Math.min(1, (duration - t) / 0.025);
    wav.writeInt16LE(Math.round(Math.max(-0.95, Math.min(0.95, sample(t) * fade)) * 32767), 44 + i * 2);
  }
  writeFileSync(`${out}/${name}.wav`, wav);
}
console.log(`Generated ${Object.keys(sounds).length} original sounds.`);
