#!/usr/bin/env node
// Removes the flat studio backdrop (a uniform ~#F7F7F7) from the supplied
// shield reference photo so it composites into the film's navy world. This
// keys the BACKGROUND out only — it does not redraw, restyle, or alter a
// single pixel of the shield artwork itself, per the brief's instruction to
// use the supplied shield exactly as provided.

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'public', 'images', 'shield.jpg');
const OUT = join(__dirname, '..', 'public', 'images', 'shield.png');

const BG = { r: 247, g: 247, b: 247 };
const LOW = 18; // distance from BG below which a pixel is fully transparent
const HIGH = 55; // distance from BG above which a pixel is fully opaque

async function main() {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels === 3 (no alpha in source jpg)
  const out = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const dr = r - BG.r;
    const dg = g - BG.g;
    const db = b - BG.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const t = Math.max(0, Math.min(1, (dist - LOW) / (HIGH - LOW)));
    const alpha = Math.round(t * 255);

    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = alpha;
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(OUT);

  console.log(`Wrote keyed shield: ${OUT} (${width}x${height})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
