#!/usr/bin/env node
// Generates the 7 real voiceover clips for "Our Story" via the ElevenLabs
// TTS API. Requires ELEVENLABS_API_KEY (see .env.example). Run with:
//   npm run vo
// On success, flips src/audio/voStatus.ts's VO_READY to true so OurStory
// picks up the real narration on the next render.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VO_DIR = join(ROOT, 'public', 'vo');
const STATUS_FILE = join(ROOT, 'src', 'audio', 'voStatus.ts');

// Load .env if present (no dependency — tiny manual parse).
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb'; // "Brian" — deep, resonant, comforting (premade, free-tier API accessible)

if (!API_KEY) {
  console.error(
    '\nELEVENLABS_API_KEY is not set.\n' +
      'Copy .env.example to .env in video/our-story/ and add your key, then re-run: npm run vo\n',
  );
  process.exit(1);
}

// Scene 1-7 VO lines, verbatim from the creative brief.
const LINES = [
  'Every person is more than the marks they achieve.',
  'Because education is not only about what we know…',
  '…it is also about who we are becoming.',
  'So we began building a place where knowledge, character, wellbeing, faith and purpose grow together.',
  'Because when people flourish, families strengthen. Communities change.',
  'And generations can write a different story.',
  'This is Inspire Vision.',
];

async function synthesize(text, outPath) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        // First pass (stability 0.4, style 0.15) read as flat/robotic per
        // user feedback. Lower stability + higher style = more natural
        // pitch/pace variation and expressive warmth in the read.
        voice_settings: { stability: 0.32, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs API error ${res.status}: ${body}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
}

async function main() {
  console.log(`Generating ${LINES.length} VO clips via ElevenLabs (voice ${VOICE_ID})…`);
  for (let i = 0; i < LINES.length; i++) {
    const outPath = join(VO_DIR, `scene${i + 1}.mp3`);
    console.log(`  scene${i + 1}: "${LINES[i]}"`);
    await synthesize(LINES[i], outPath);
  }

  const status = readFileSync(STATUS_FILE, 'utf8').replace(
    'export const VO_READY = false;',
    'export const VO_READY = true;',
  );
  writeFileSync(STATUS_FILE, status);

  console.log('\nDone. VO_READY flipped to true — re-render to include real narration.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
