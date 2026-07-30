/* `screenreel flow doctor` — diagnoses a flow against the live DOM and proposes (or, with
   --fix, applies) selector repairs. Browser orchestration only; every decision lives in the
   pure, unit-tested doctor-heuristics.mjs. */
import fs from 'fs';
import path from 'path';
import { browserPage, loadManifest, validateSceneOnPage } from './flow-tools.mjs';
import { applyRepairs, classifyError, isLikelyDynamicTarget, proposeRepair, REPAIR_CONFIDENCE_THRESHOLD } from './doctor-heuristics.mjs';

const jsonResult = (ok, details) => ({ ok, ...details });
const DOCTOR_TARGET_CAP = 800; // inspection sweep bound; matches inspectDocument's spirit of staying cheap

export async function doctorFlow({ baseUrl, flowFile, fix = false }) {
  const file = path.resolve(flowFile);
  const manifest = loadManifest(file, baseUrl);
  const { browser, page, url } = await browserPage(baseUrl);
  const scenes = [];
  const repairs = [];
  try {
    for (let flowIndex = 0; flowIndex < manifest.flows.length; flowIndex++) {
      const flow = manifest.flows[flowIndex];
      for (let sceneIndex = 0; sceneIndex < flow.scenes.length; sceneIndex++) {
        const scene = flow.scenes[sceneIndex];
        const { actions } = await validateSceneOnPage(page, url, scene);
        // Still on the scene's route: inspect once per scene, reused for every repair below.
        // inspectDocument covers interactive/tagged elements; demo emphasis often targets plain
        // visual blocks carrying only a data-* hook, so sweep those too (stable-selector doctrine
        // means real targets almost always carry one).
        const targets = await page.evaluate((cap) => {
          const seen = new Map();
          for (const item of window.ScreenReelCore.inspectDocument(document)) seen.set(item.selector, item);
          for (const el of document.querySelectorAll('*')) {
            if (seen.size >= cap) break;
            if (![...el.attributes].some((attr) => attr.name.startsWith('data-') && !attr.name.startsWith('data-screenreel'))) continue;
            const selector = window.ScreenReelCore.selectorFor(el);
            if (!selector || seen.has(selector)) continue;
            seen.set(selector, { selector, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', text: String(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 120), interactive: false });
          }
          return [...seen.values()];
        }, DOCTOR_TARGET_CAP).catch(() => []);
        const report = [];
        for (const entry of actions) {
          const diagnosed = await diagnoseAction({ page, scene, entry, targets });
          if (diagnosed.repair.kind !== 'none' && diagnosed.severity === 'error') {
            repairs.push({ flowIndex, sceneIndex, actionIndex: entry.index, set: { [diagnosed.repair.key]: diagnosed.repair.to }, describe: `${flow.id}/${scene.id} action ${entry.index + 1}: ${diagnosed.repair.from} → ${diagnosed.repair.to}` });
          }
          report.push(diagnosed);
        }
        const failing = report.filter((item) => item.severity === 'error' && item.errors.length);
        scenes.push({ flowId: flow.id, sceneId: scene.id, route: scene.route, ok: !failing.length, actions: report });
      }
    }
  } finally { await browser.close(); }

  let fixesApplied = 0;
  if (fix && repairs.length) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    fixesApplied = applyRepairs(raw, repairs);
    if (fixesApplied) fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
  }
  return jsonResult(scenes.every((scene) => scene.ok), { fixesApplied, proposed: repairs.map((repair) => repair.describe), scenes });
}

/* One action's diagnosis: severity, and a repair when one is safe to make automatically. */
async function diagnoseAction({ page, scene, entry, targets }) {
  const result = { ...entry, severity: entry.errors.length ? 'error' : 'ok', repair: { kind: 'none', candidates: [] } };
  const rawAction = scene.actions[entry.index];
  for (const message of entry.errors) {
    const classified = classifyError(message);
    if (classified.kind === 'multiple') {
      // Ambiguous selector: prefer a unique re-derived selector for the first match; index: 0 otherwise.
      const selectorKey = classified.key;
      const current = rawAction[selectorKey];
      const rederived = await page.evaluate((sel) => {
        const el = document.querySelector(sel); if (!el) return null;
        const proposed = window.ScreenReelCore.selectorFor(el);
        return proposed && document.querySelectorAll(proposed).length === 1 ? proposed : null;
      }, current).catch(() => null);
      result.repair = rederived
        ? { kind: 'selector', key: selectorKey, from: current, to: rederived, confidence: 100, candidates: [] }
        : { kind: 'index', key: 'index', from: current, to: 0, confidence: 100, candidates: [] };
      break;
    }
    if (classified.kind === 'missing') {
      if (isLikelyDynamicTarget(scene.actions, entry.index)) {
        // validate() is a current-DOM dry run; an earlier action likely creates this target.
        result.severity = 'warning';
        break;
      }
      const proposal = proposeRepair({ fingerprint: rawAction.fingerprint, deadSelector: rawAction[classified.key], targets });
      if (proposal.kind === 'selector' && proposal.confidence >= REPAIR_CONFIDENCE_THRESHOLD) {
        result.repair = { kind: 'selector', key: classified.key, from: rawAction[classified.key], to: proposal.to, confidence: proposal.confidence, candidates: [] };
      } else {
        result.repair = { kind: 'none', key: classified.key, from: rawAction[classified.key], confidence: proposal.confidence, candidates: proposal.candidates };
      }
      break;
    }
  }
  return result;
}
