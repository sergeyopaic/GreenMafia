import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROLES } from '@greenmafia/engine';
import { asset, roleArt, stampImage } from './assets';
import { SFX_NAMES } from './soundPolicy';

describe('готовый игровой комплект', () => {
  it('подключает все карты, штампы и фактуры без заглушек', () => {
    // Art still to be drawn: these roles use the built-in placeholder for now.
    const pendingArt = new Set([]);
    for (const role of [...ROLES, 'back']) {
      if (pendingArt.has(role)) expect(roleArt(role), `${role}: арт появился — уберите из pendingArt`).toBeNull();
      else expect(roleArt(role), role).toBeTruthy();
    }
    for (const kind of ['killed', 'exiled', 'alibi', 'case-closed', 'checked-mafia', 'checked-clean', 'no-answer', 'checked-commissar', 'checked-not-commissar']) {
      expect(stampImage(kind), kind).toBeTruthy();
      expect(stampImage(kind, 'en'), `en/${kind}`).toBeTruthy();
    }
    for (const name of ['paper', 'cardboard']) expect(asset(`textures/${name}`)).toBeTruthy();
    expect(asset('textures/felt')).toBeNull();
  });
  it('все сигналы содержат звук, не клиппируют и заканчиваются без щелчка', () => {
    for (const name of SFX_NAMES) {
      expect(asset(`audio/sfx/${name}`, 'audio'), name).toBeTruthy();
      const wav = readFileSync(new URL(`../assets/audio/sfx/${name}.wav`, import.meta.url));
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.readUInt32LE(24)).toBe(44100);
      let peak = 0;
      for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
      expect(peak, name).toBeGreaterThan(500);
      expect(peak, name).toBeLessThan(31200);
      expect(Math.abs(wav.readInt16LE(wav.length - 2)), name).toBeLessThan(100);
    }
  });
  it('печатный комплект содержит ровно 20 номеров с двумя сторонами', () => {
    for (const file of ['print-kit.html', 'print-kit.en.html']) {
      const html = readFileSync(new URL(`../../public/${file}`, import.meta.url), 'utf8');
      expect(html.match(/class="tent"/g)?.length, file).toBe(20);
      for (let n = 1; n <= 20; n++) expect(html.split(`<b>${n}</b>`).length - 1).toBe(2);
      expect(html).toContain('@page{size:A4');
    }
  });
});
