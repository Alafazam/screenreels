#!/usr/bin/env node
/* Generate narration files for a flow's info cards with ElevenLabs, and time the cards' actions to
   the words. Authoring time only: the files are committed and the viewer's browser plays them, so no
   key ever reaches a visitor.

     node scripts/voice-render.mjs --plan examples/action-showcase/audio/landing/voice-plan.json [--dry-run] [--only <file>]

   The plan names the flow, the voice and, per card, which actions land on which words. The words
   themselves are each card's `narration` in the flow: one home for the script. A line whose text,
   voice and settings are unchanged is not generated again. The key is read from ELEVENLABS_API_KEY
   and is never printed, logged or written. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ffmpegPath, probeDurationSeconds } from '../lib/media.mjs';
import { formatFlowFile, planStep, shiftWords, wordsFromAlignment } from './voice-timing.mjs';

const API_BASE = 'https://api.elevenlabs.io/v1';
const KEY_ENV = 'ELEVENLABS_API_KEY';
const HASH_LENGTH = 8;
/* Speech that starts this soon is left alone; later starts are trimmed to this much lead-in. */
const KEEP_LEAD_IN_S = 0.05;
const LOUDNESS_FILTER = 'loudnorm=I=-16:TP=-1.5:LRA=11';
const MP3_BITRATE = '128k';

const args = process.argv.slice(2);
const opt = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const dryRun = args.includes('--dry-run');
const only = opt('--only');
const planFile = opt('--plan');
if (!planFile) throw new Error('usage: voice-render.mjs --plan <voice-plan.json> [--dry-run] [--only <file>]');

const planDir = path.dirname(path.resolve(planFile));
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const flowFile = path.resolve(planDir, plan.flowFile);
const pageDir = path.dirname(flowFile);
const flowDoc = JSON.parse(fs.readFileSync(flowFile, 'utf8'));
const flow = flowDoc.flows.find((item) => item.id === plan.flow);
if (!flow) throw new Error(`flow "${plan.flow}" is not in ${plan.flowFile}`);

const actionsById = new Map();
for (const scene of flow.scenes) for (const action of scene.actions) if (action.id) actionsById.set(action.id, action);
const cardOf = (id) => { const card = actionsById.get(id); if (!card || card.type !== 'callout') throw new Error(`card "${id}" is not a callout with that id in flow "${flow.id}"`); return card; };

const steps = plan.steps.map((step) => {
  const card = cardOf(step.card);
  const text = String(card.narration ?? '').trim();
  if (!text) throw new Error(`card "${step.card}" has no narration`);
  for (const anchor of step.anchors ?? []) if (!actionsById.has(anchor.action)) throw new Error(`anchor action "${anchor.action}" has no action with that id`);
  const hash = crypto.createHash('sha256').update(JSON.stringify([text, plan.voiceId, plan.modelId, plan.outputFormat, plan.voiceSettings])).digest('hex').slice(0, HASH_LENGTH);
  const audioRel = `${plan.audioDir}/${step.file}.${hash}.mp3`;
  const wordsFile = path.join(planDir, `${step.file}.words.json`);
  const stored = fs.existsSync(wordsFile) ? JSON.parse(fs.readFileSync(wordsFile, 'utf8')) : null;
  const fresh = stored?.hash === hash && fs.existsSync(path.join(pageDir, audioRel));
  return { ...step, card, text, hash, audioRel, wordsFile, stored, fresh };
});

const toGenerate = steps.filter((step) => !step.fresh && (!only || step.file === only));
const characters = toGenerate.reduce((sum, step) => sum + step.text.length, 0);
console.log(`[voice] flow "${flow.id}", voice ${plan.voiceName} (${plan.modelId}): ${steps.length} lines, ${toGenerate.length} to generate, ${characters} characters`);
for (const step of steps) console.log(`  ${step.file.padEnd(4)} ${step.fresh ? 'fresh' : toGenerate.includes(step) ? 'GENERATE' : 'stale (skipped by --only)'}  ${step.text.length} chars`);
if (dryRun) process.exit(0);

async function api(route, init = {}) {
  const key = process.env[KEY_ENV];
  if (!key) throw new Error(`set ${KEY_ENV} to generate narration`);
  const response = await fetch(`${API_BASE}${route}`, { ...init, headers: { 'xi-api-key': key, 'content-type': 'application/json', ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`ElevenLabs ${route.split('?')[0]} failed with ${response.status}: ${JSON.stringify(body.detail ?? body).slice(0, 300)}`);
  return body;
}

/* Trim the lead-in silence to KEEP_LEAD_IN_S, normalise loudness, and write the MP3. Returns the
   seconds trimmed, so the word times can move by the same amount. */
function finishAudio(raw, firstWordS, outFile) {
  const trimS = Math.max(0, firstWordS - KEEP_LEAD_IN_S);
  execFileSync(ffmpegPath(), ['-y', '-loglevel', 'error', '-ss', trimS.toFixed(3), '-i', raw, '-af', LOUDNESS_FILTER, '-ar', '44100', '-ac', '1', '-b:a', MP3_BITRATE, outFile], { stdio: ['ignore', 'ignore', 'inherit'] });
  return trimS;
}

if (toGenerate.length) {
  const subscription = await api('/user/subscription');
  const remaining = subscription.character_limit - subscription.character_count;
  console.log(`[voice] ElevenLabs ${subscription.tier} plan: ${remaining} characters left this period`);
  if (characters > remaining) throw new Error(`need ${characters} characters but only ${remaining} are left`);
}

fs.mkdirSync(path.join(pageDir, plan.audioDir), { recursive: true });
for (const step of toGenerate) {
  const index = steps.indexOf(step);
  const body = {
    text: step.text,
    model_id: plan.modelId,
    voice_settings: plan.voiceSettings,
    previous_text: steps[index - 1]?.text,
    next_text: steps[index + 1]?.text,
  };
  console.log(`[voice] generating ${step.file}`);
  const take = await api(`/text-to-speech/${plan.voiceId}/with-timestamps?output_format=${plan.outputFormat}`, { method: 'POST', body: JSON.stringify(body) });
  const rawWords = wordsFromAlignment(take.alignment);
  if (!rawWords.length) throw new Error(`the take for ${step.file} has no words`);
  const raw = path.join(os.tmpdir(), `screenreel-voice-${step.file}-${step.hash}.mp3`);
  fs.writeFileSync(raw, Buffer.from(take.audio_base64, 'base64'));
  try {
    const out = path.join(pageDir, step.audioRel);
    const trimS = finishAudio(raw, rawWords[0].s, out);
    const durationMs = Math.round(probeDurationSeconds(out) * 1000);
    step.stored = { hash: step.hash, text: step.text, voiceId: plan.voiceId, modelId: plan.modelId, trimmedMs: Math.round(trimS * 1000), durationMs, words: shiftWords(rawWords, trimS) };
    fs.writeFileSync(step.wordsFile, `${JSON.stringify(step.stored, null, 2)}\n`);
  } finally { fs.rmSync(raw, { force: true }); }
  // An older take of this line is now unused.
  const dir = path.join(pageDir, plan.audioDir);
  for (const name of fs.readdirSync(dir)) if (name.startsWith(`${step.file}.`) && name.endsWith('.mp3') && name !== path.basename(step.audioRel)) fs.rmSync(path.join(dir, name));
}

/* Write the timeline for every step that has a take, generated now or earlier. */
for (const step of steps) {
  if (!step.stored || step.stored.hash !== step.hash) { console.warn(`[voice] ${step.file}: no take for the current text; its timing is unchanged`); continue; }
  const result = planStep({ words: step.stored.words, durationMs: step.stored.durationMs, anchors: step.anchors, actions: Object.fromEntries(actionsById), timing: plan.timing });
  step.card.stepMs = result.stepMs;
  step.card.narrationAudio = step.audioRel;
  for (const { action, atMs } of result.atMs) actionsById.get(action).atMs = atMs;
  for (const warning of result.warnings) console.warn(`[voice] ${step.file}: ${warning}`);
  console.log(`[voice] ${step.file}: stepMs ${result.stepMs}${result.atMs.length ? `, ${result.atMs.map((item) => `${item.action} @${item.atMs}`).join(', ')}` : ''}`);
}
fs.writeFileSync(flowFile, formatFlowFile(flowDoc));
console.log(`[voice] wrote ${path.relative(process.cwd(), flowFile)}`);
