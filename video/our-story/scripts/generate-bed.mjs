#!/usr/bin/env node
// Generates a placeholder ambient piano/strings-style music bed for the
// "Our Story" film — pure Node sine synthesis, no external audio library or
// paid stock license needed. Stereo, with harmonic-series "piano" notes and
// chorus-detuned "string" tones for warmth, a one-pole lowpass for softness.
// Follows the brief's phase-by-phase sound design: near-silence 0-4s, sparse
// piano 4-13s, warmth broadening 13-24s, one SMALL restrained swell 24-28s,
// resolve/breathe 28-30s. Swap public/music/bed.wav for a licensed/AI track
// later; MusicBed.tsx needs no code change.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'public', 'music', 'bed.wav');

const SAMPLE_RATE = 44100;
const DURATION_S = 30;
const N = SAMPLE_RATE * DURATION_S;

// Soft "piano-like" note onsets timed to the brief's scene boundaries,
// ascending gently as the story builds. Each is rendered as a small
// harmonic series (fundamental + 2nd + 3rd partial) with the upper partials
// decaying faster than the fundamental, for a warmer, less "beepy" pluck.
const NOTE_ONSETS = [
  { t: 4.2, freq: 659.25, amp: 0.1 }, // E5 — sparse piano begins (phase B)
  { t: 9.2, freq: 783.99, amp: 0.1 }, // G5
  { t: 13.2, freq: 880.0, amp: 0.11 }, // A5 — warmth broadens (phase C)
  { t: 19.2, freq: 987.77, amp: 0.12 }, // B5
  { t: 24.1, freq: 1046.5, amp: 0.13 }, // C6 — swell entry (phase D)
  { t: 28.2, freq: 659.25, amp: 0.08 }, // E5 — resolve (phase E)
];
// Near-silent "air" in the first 4 seconds — audible presence, not a note.
const OPEN_AIR = { t: 0.6, freq: 1318.5, amp: 0.02, decay: 3.2 }; // E6, very faint
const PARTIALS = [
  { mul: 1, amp: 1, decay: 1.5 },
  { mul: 2, amp: 0.35, decay: 0.55 },
  { mul: 3, amp: 0.16, decay: 0.32 },
];

// Sustained low drone (two very quiet sine tones throughout).
const DRONE = [
  { freq: 130.81, amp: 0.026 }, // C3
  { freq: 196.0, amp: 0.02 }, // G3
];

// The single swell: warm string-pad chord, Hann-windowed, peaking at 26s
// (inside Scene 6's 24s-28s window) then receding into Scene 7. Each chord
// tone is three slightly detuned sines summed (a cheap "ensemble of
// strings" chorus effect) rather than one bare sine.
const SWELL_CENTER = 26;
const SWELL_WIDTH = 7; // seconds, full width of the Hann window
const SWELL_CHORD = [196.0, 246.94, 293.66, 392.0]; // G3, B3, D4, G4
const SWELL_PEAK_AMP = 0.1; // small and restrained, not a climax
const DETUNE_CENTS = [0, 7, -7];

// A extremely faint high shimmer, present mainly through the swell and the
// resolve at the very end — "tiny tonal arrival" texture, not an effect.
const SHIMMER_TONES = [2093.0, 2637.0]; // C7, E7
const SHIMMER_AMP = 0.012;

function hann(t, center, width) {
  const half = width / 2;
  const d = (t - center) / half;
  if (d <= -1 || d >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * d));
}

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

// Overall phase envelope matching the brief's sound-design progression:
// near-silence (0-4s) -> sparse piano (4-13s) -> broadening warmth (13-24s)
// -> small swell handled separately (24-28s) -> resolve/breathe (28-30s).
function phaseGain(t) {
  if (t < 4) return 0.22 + 0.1 * (t / 4);
  if (t < 13) return 0.55;
  if (t < 24) return 0.55 + 0.35 * ((t - 13) / 11);
  if (t < 28) return 0.9;
  return Math.max(0, 0.9 * (1 - (t - 28) / 2.2));
}

// Two channels for a stereo bed: right channel carries a tiny detune +
// delay offset relative to left, for width, rather than a bare mono file.
const left = new Float64Array(N);
const right = new Float64Array(N);

for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE;
  let sL = 0;
  let sR = 0;

  for (const d of DRONE) {
    sL += d.amp * Math.sin(2 * Math.PI * d.freq * t);
    sR += d.amp * Math.sin(2 * Math.PI * d.freq * 0.9993 * t);
  }

  if (t >= OPEN_AIR.t) {
    const dt = t - OPEN_AIR.t;
    const env = Math.exp(-dt / OPEN_AIR.decay);
    sL += OPEN_AIR.amp * env * Math.sin(2 * Math.PI * OPEN_AIR.freq * t);
    sR += OPEN_AIR.amp * env * Math.sin(2 * Math.PI * OPEN_AIR.freq * 0.999 * t);
  }

  for (const note of NOTE_ONSETS) {
    if (t < note.t) continue;
    const dt = t - note.t;
    if (dt > 3.5) continue;
    const attack = Math.min(1, dt / 0.04);
    let voiceL = 0;
    let voiceR = 0;
    for (const p of PARTIALS) {
      const decayEnv = Math.exp(-dt / p.decay);
      const f = note.freq * p.mul;
      voiceL += p.amp * decayEnv * Math.sin(2 * Math.PI * f * t);
      voiceR += p.amp * decayEnv * Math.sin(2 * Math.PI * f * 0.9988 * t + 0.15);
    }
    sL += note.amp * attack * voiceL;
    sR += note.amp * attack * voiceR;
  }

  const swellEnv = hann(t, SWELL_CENTER, SWELL_WIDTH) * SWELL_PEAK_AMP;
  if (swellEnv > 0) {
    for (const freq of SWELL_CHORD) {
      let voiceL = 0;
      let voiceR = 0;
      for (const cents of DETUNE_CENTS) {
        const f = freq * centsToRatio(cents);
        voiceL += Math.sin(2 * Math.PI * f * t) / DETUNE_CENTS.length;
        voiceR += Math.sin(2 * Math.PI * f * t + 0.4) / DETUNE_CENTS.length;
      }
      sL += (swellEnv / SWELL_CHORD.length) * voiceL;
      sR += (swellEnv / SWELL_CHORD.length) * voiceR;
    }
  }

  // Shimmer fades in through the swell and lingers into the resolve.
  const shimmerEnv =
    (Math.max(0, hann(t, SWELL_CENTER, SWELL_WIDTH + 3)) * 0.6 +
      Math.max(0, 1 - Math.abs(t - 29) / 1.5) * 0.4) *
    SHIMMER_AMP;
  if (shimmerEnv > 0) {
    for (const freq of SHIMMER_TONES) {
      sL += (shimmerEnv / SHIMMER_TONES.length) * Math.sin(2 * Math.PI * freq * t);
      sR += (shimmerEnv / SHIMMER_TONES.length) * Math.sin(2 * Math.PI * freq * 1.0015 * t + 0.6);
    }
  }

  const gain = phaseGain(t);
  left[i] = sL * gain;
  right[i] = sR * gain;
}

// One-pole lowpass on each channel for warmth (rolls off harsh upper
// harmonics from the additive synthesis above).
function lowpass(buf, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    prev = prev + alpha * (buf[i] - prev);
    buf[i] = prev;
  }
}
lowpass(left, 5200);
lowpass(right, 5200);

// Normalize to a sane peak, then apply fade-in/out to avoid edge clicks.
function normalize(buf, peak) {
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
  const scale = max > 0 ? peak / max : 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= scale;
}
// Lower target peak than a typical master bed — this stays a restrained,
// mostly-quiet accompaniment even at its loudest moment (the small swell).
normalize(left, 0.55);
normalize(right, 0.55);

const fadeInN = Math.floor(0.3 * SAMPLE_RATE);
const fadeOutN = Math.floor(1.2 * SAMPLE_RATE);
for (const buf of [left, right]) {
  for (let i = 0; i < fadeInN; i++) buf[i] *= i / fadeInN;
  for (let i = 0; i < fadeOutN; i++) {
    const idx = N - 1 - i;
    buf[idx] *= i / fadeOutN;
  }
}

// Write 16-bit PCM stereo WAV.
const bytesPerSample = 2;
const channels = 2;
const dataSize = N * bytesPerSample * channels;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // fmt chunk size
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(channels, 22);
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample * channels, 28); // byte rate
buffer.writeUInt16LE(bytesPerSample * channels, 32); // block align
buffer.writeUInt16LE(16, 34); // bits per sample
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

for (let i = 0; i < N; i++) {
  const l = Math.max(-1, Math.min(1, left[i]));
  const r = Math.max(-1, Math.min(1, right[i]));
  const offset = 44 + i * bytesPerSample * channels;
  buffer.writeInt16LE(Math.round(l * 32767), offset);
  buffer.writeInt16LE(Math.round(r * 32767), offset + 2);
}

writeFileSync(OUT_PATH, buffer);
console.log(`Wrote placeholder music bed: ${OUT_PATH} (${DURATION_S}s, ${SAMPLE_RATE}Hz stereo)`);
