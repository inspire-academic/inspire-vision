/**
 * Flips to true once scripts/generate-vo.mjs has successfully generated all
 * 7 real ElevenLabs voiceover clips. Until then, OurStory renders silently
 * so scratch renders never block on the ElevenLabs API key. The master
 * video carries no burned-in captions — see public/captions/our-story.vtt
 * and watch-story.js for the accessible caption track instead.
 */
export const VO_READY = true;
