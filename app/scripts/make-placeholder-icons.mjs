// Generates placeholder app icons (a casino chip on green felt) without any image library.
// Replace public/assets/brand/icon-*.png with the real artwork when it is ready (GAME_DESIGN.md §17.1).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'brand');

const FELT = [8, 22, 15];
const FELT_LIGHT = [29, 90, 64];
const BRASS = [180, 137, 74];
const ABSINTHE = [185, 217, 74];
const PAPER = [238, 228, 205];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x supersampling for smooth edges
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const [pr, pg, pb] = pixel((x + (sx + 0.5) / 2) / size, (y + (sy + 0.5) / 2) / size);
        r += pr; g += pg; b += pb;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r / 4; raw[o + 1] = g / 4; raw[o + 2] = b / 4; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** scale: chip radius relative to the icon (smaller for maskable safe zone). */
function chip(scale) {
  return (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) / scale;
    const a = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI); // 0..1
    // background felt with soft lamp
    const lamp = Math.max(0, 1 - Math.hypot(dx, dy + 0.1) * 1.6);
    const bg = FELT.map((c, i) => c + (FELT_LIGHT[i] - c) * lamp * 0.35);
    if (d > 0.4) return bg;
    if (d > 0.37) return BRASS; // outer rim
    if (d > 0.29) return Math.floor(a * 16) % 2 === 0 ? ABSINTHE : PAPER; // edge spots
    if (d > 0.27) return BRASS;
    if (d > 0.2) return FELT_LIGHT;
    // centre: letter-less emblem — three stacked bars (a stylised "M")
    const bar = Math.abs(dy / scale) < 0.11 && [-0.075, 0, 0.075].some((cx) => Math.abs(dx / scale - cx) < 0.022);
    return bar ? PAPER : FELT_LIGHT;
  };
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon-192.png'), png(192, chip(1.1)));
writeFileSync(join(OUT, 'icon-512.png'), png(512, chip(1.1)));
writeFileSync(join(OUT, 'icon-maskable.png'), png(512, chip(0.85)));
console.log('placeholder icons written to', OUT);
