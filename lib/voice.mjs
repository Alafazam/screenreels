// Pluggable text-to-speech for voiceover. Local-first: the default provider is macOS `say`
// (zero accounts, works offline); `command` runs any CLI template (espeak, piper, a cloud CLI);
// a config can also pass its own { synthesize } object since screenreel.config.mjs is real JS.
// Every provider must produce the SAME audio shape so assembled parts stay concat-safe.
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ffmpegPath } from './media.mjs';

export const AUDIO_SAMPLE_RATE = 48000;
export const AUDIO_CHANNELS = 2;

/* Transcodes any synthesized audio into the canonical AAC/48k/stereo m4a every concat part uses. */
function transcode(ffmpeg, input, outFile) {
  execFileSync(ffmpeg, ['-y', '-i', input, '-c:a', 'aac', '-ar', String(AUDIO_SAMPLE_RATE), '-ac', String(AUDIO_CHANNELS), outFile], { stdio: ['ignore', 'ignore', 'inherit'] });
  return outFile;
}

function sayProvider(voice) {
  return {
    name: 'say',
    available() {
      if (process.platform !== 'darwin') return { ok: false, reason: "the 'say' provider needs macOS — use provider 'command' with espeak/piper or your own CLI" };
      return { ok: true };
    },
    async synthesize(text, outFile) {
      const ffmpeg = ffmpegPath();
      const stamp = Date.now().toString(36);
      const aiff = path.join(os.tmpdir(), `screenreel-say-${stamp}.aiff`);
      // Text goes through a file (-f): argv can't take arbitrarily long scripts, and a script
      // starting with '-' would be parsed as a flag.
      const textFile = path.join(os.tmpdir(), `screenreel-say-${stamp}.txt`);
      fs.writeFileSync(textFile, text);
      const args = ['-o', aiff, '-f', textFile];
      if (voice.voiceName) args.push('-v', voice.voiceName);
      if (voice.rate) args.push('-r', String(voice.rate));
      try {
        execFileSync('say', args, { stdio: ['ignore', 'ignore', 'inherit'] });
        return transcode(ffmpeg, aiff, outFile);
      } finally { fs.rmSync(aiff, { force: true }); fs.rmSync(textFile, { force: true }); }
    },
  };
}

/* Runs a user-supplied command template with {textFile} and {outFile} placeholders. The command
   writes raw audio to {outFile}.raw's path; we transcode to the canonical shape afterwards. */
function commandProvider(voice) {
  return {
    name: 'command',
    available() {
      if (!voice.command || !voice.command.includes('{outFile}')) return { ok: false, reason: "provider 'command' needs voice.command with {textFile} and {outFile} placeholders" };
      return { ok: true };
    },
    async synthesize(text, outFile) {
      const ffmpeg = ffmpegPath();
      const stamp = Date.now().toString(36);
      const textFile = path.join(os.tmpdir(), `screenreel-tts-${stamp}.txt`);
      const rawFile = path.join(os.tmpdir(), `screenreel-tts-${stamp}.audio`);
      fs.writeFileSync(textFile, text);
      try {
        const commandLine = voice.command.replaceAll('{textFile}', textFile).replaceAll('{outFile}', rawFile);
        execSync(commandLine, { stdio: ['ignore', 'ignore', 'inherit'] });
        if (!fs.existsSync(rawFile)) throw new Error(`voice.command did not write ${rawFile}`);
        return transcode(ffmpeg, rawFile, outFile);
      } finally { fs.rmSync(textFile, { force: true }); fs.rmSync(rawFile, { force: true }); }
    },
  };
}

export function createVoiceProvider(voice) {
  if (voice.provider && typeof voice.provider === 'object') {
    if (typeof voice.provider.synthesize !== 'function') throw new Error('a custom voice.provider must expose synthesize(text, outFile)');
    return { name: voice.provider.name || 'custom', available: voice.provider.available || (() => ({ ok: true })), synthesize: voice.provider.synthesize };
  }
  if (voice.provider === 'say' || !voice.provider) return sayProvider(voice);
  if (voice.provider === 'command') return commandProvider(voice);
  throw new Error(`unknown voice.provider: ${voice.provider} (use 'say', 'command', or a { synthesize } object)`);
}

/* The spoken script for a scene: explicit narration wins so presenter notes and voiceover can
   diverge; talkingPoints is the natural default since authors already write it. */
export function narrationText(scene) {
  const text = String(scene.narration ?? scene.talkingPoints ?? '').trim();
  return text || null;
}
