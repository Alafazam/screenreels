// Screenreel assembly: title cards + concat into the final review video.
// Everything is normalized to the same codec params (libx264, yuv420p, CFR)
// before the concat demuxer stitches it, then one clean re-encode produces a
// small, seekable, faststart MP4.
//
// With voice enabled, EVERY concat part carries the same AAC/48k/stereo audio
// shape — narration on narrated clips, silence on cards and unnarrated clips.
// The concat demuxer's known failure mode is mixing audio-bearing and
// audio-less parts; homogeneous streams sidestep it entirely.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolveFont } from './config.mjs';
import { countAudioStreams, ffmpegPath, probeDurationSeconds } from './media.mjs';
import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, createVoiceProvider, narrationText } from './voice.mjs';

const SILENT_SOURCE = () => `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=${AUDIO_CHANNELS === 2 ? 'stereo' : 'mono'}`;

export async function assemble(config, scenes) {
  const ffmpeg = ffmpegPath();
  const tc = config.titleCards;
  // Fonts are only needed to draw cards; a card-less config must not fail on font discovery.
  const font = tc.open || tc.perScene ? resolveFont(config) : null;
  const cardsDir = path.join(config.out.tmp, 'cards');
  fs.mkdirSync(cardsDir, { recursive: true });

  const voice = config.voice?.enabled ? prepareVoice(config) : null;

  const parts = [];

  if (tc.open) parts.push(titleCard('open', tc.open.title, tc.open.sub || '', tc.openDurS, config, font, cardsDir, ffmpeg, !!voice));

  let missing = 0;
  for (const scene of scenes) {
    const clip = path.join(config.out.clips, `${scene.id}.mp4`);
    if (!fs.existsSync(clip)) { console.warn(`[stitch] missing ${scene.id}.mp4 — skipped`); missing++; continue; }
    if (tc.perScene && scene.title) {
      parts.push(titleCard(scene.id, scene.title, scene.sub || '', tc.durS, config, font, cardsDir, ffmpeg, !!voice));
    }
    parts.push(voice ? await narratedClip(scene, clip, voice, ffmpeg) : clip);
  }
  if (!parts.length) throw new Error('nothing to stitch — capture some scenes first');

  if (voice) assertConcatSafe(parts);

  const listFile = path.join(config.out.tmp, 'final-list.txt');
  fs.writeFileSync(listFile, parts.map(p => `file '${p}'`).join('\n') + '\n');
  fs.mkdirSync(path.dirname(config.out.video), { recursive: true });
  execFileSync(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
    '-pix_fmt', 'yuv420p', ...(voice ? ['-c:a', 'aac'] : []), '-movflags', '+faststart', config.out.video,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`\nfinal video → ${config.out.video}${missing ? `  (${missing} scene(s) missing)` : ''}${voice ? '  (with voiceover)' : ''}`);
  return config.out.video;
}

/* Resolves the provider once and fails loudly up front — a half-narrated reel is worse than
   an early clear error. */
function prepareVoice(config) {
  const provider = createVoiceProvider(config.voice);
  const availability = provider.available();
  if (!availability.ok) throw new Error(`voice provider '${provider.name}' is unavailable: ${availability.reason}`);
  return { provider, overflow: config.voice.overflow, dir: path.join(config.out.tmp, 'voice') };
}

/* One scene's clip with its narration muxed in (or silence when the scene has no script).
   Video is stream-copied — clips are all-intra so the copy is exact and cheap. */
async function narratedClip(scene, clip, voice, ffmpeg) {
  fs.mkdirSync(voice.dir, { recursive: true });
  const out = path.join(voice.dir, `${scene.id}-voiced.mp4`);
  const script = narrationText(scene);
  if (!script) {
    execFileSync(ffmpeg, ['-y', '-i', clip, '-f', 'lavfi', '-i', SILENT_SOURCE(), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', out], { stdio: ['ignore', 'ignore', 'inherit'] });
    return out;
  }
  const narration = path.join(voice.dir, `${scene.id}.m4a`);
  await voice.provider.synthesize(script, narration);
  const clipSeconds = probeDurationSeconds(clip);
  const narrationSeconds = probeDurationSeconds(narration);
  if (narrationSeconds > clipSeconds && voice.overflow === 'extend') {
    // Freeze the last frame long enough for the narration to finish, rather than cutting it off.
    const extra = narrationSeconds - clipSeconds;
    console.warn(`[voice] ${scene.id}: narration is ${extra.toFixed(1)}s longer than the clip — extending the last frame (voice.overflow: 'extend')`);
    execFileSync(ffmpeg, ['-y', '-i', clip, '-i', narration, '-map', '0:v', '-map', '1:a', '-vf', `tpad=stop_mode=clone:stop_duration=${extra.toFixed(3)}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-af', 'apad', '-shortest', out], { stdio: ['ignore', 'ignore', 'inherit'] });
    return out;
  }
  if (narrationSeconds > clipSeconds) console.warn(`[voice] ${scene.id}: narration is ${(narrationSeconds - clipSeconds).toFixed(1)}s longer than the clip — truncating (voice.overflow: 'truncate')`);
  // apad fills the remainder of the clip with silence so audio and video lengths match exactly.
  execFileSync(ffmpeg, ['-y', '-i', clip, '-i', narration, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-af', 'apad', '-shortest', out], { stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
}

/* Concat with heterogeneous streams fails in confusing ways downstream; fail loudly here instead. */
function assertConcatSafe(parts) {
  for (const part of parts) {
    const streams = countAudioStreams(part);
    if (streams !== 1) throw new Error(`concat part ${part} has ${streams} audio streams (expected exactly 1) — refusing to stitch a broken reel`);
  }
}

function titleCard(id, title, sub, durS, config, font, cardsDir, ffmpeg, withAudio) {
  // textfile= sidesteps drawtext's escaping rules for arbitrary titles.
  const tTxt = path.join(cardsDir, `${id}-t.txt`);
  const sTxt = path.join(cardsDir, `${id}-s.txt`);
  fs.writeFileSync(tTxt, title);
  fs.writeFileSync(sTxt, sub);
  const { w, h } = config.videoSize;
  const tc = config.titleCards;
  const out = path.join(cardsDir, `${id}.mp4`);
  const draw = (txt, size, color, y) =>
    `drawtext=fontfile=${font}:textfile=${txt}:fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}`;
  const scale = h / 1080; // keep card typography proportional at any output size
  execFileSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', `color=c=${tc.bg}:s=${w}x${h}:r=${config.fps}:d=${durS}`,
    ...(withAudio ? ['-f', 'lavfi', '-i', SILENT_SOURCE()] : []),
    '-vf', `${draw(tTxt, Math.round(64 * scale), tc.titleColor, '(h/2)-70')},${draw(sTxt, Math.round(34 * scale), tc.subColor, '(h/2)+30')}`,
    ...(withAudio ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-shortest'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '1',
    '-pix_fmt', 'yuv420p', out,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
}
