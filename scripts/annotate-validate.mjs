/* CI wrapper around `screenreel flow validate`: runs the CLI, parses the --json report, and
   emits GitHub workflow-command annotations so a broken demo shows up inline on the PR
   ("flow guided-tour scene tour-kpis action 2: selector has no matches"). Exits 1 on failure.

   Usage: node scripts/annotate-validate.mjs --flow <file> --base-url <url> */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const index = argv.indexOf(name); return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback; };
const flowFile = opt('--flow', './screenreel.scenes.json');
const baseUrl = opt('--base-url', 'http://127.0.0.1:3000');
const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/screenreel.mjs');

/* Spawn rather than import: printResult's soft exitCode and stdout draining stay the CLI's
   concern, and a hard crash (missing Chrome, unreadable file) surfaces as its own message. */
const run = spawnSync(process.execPath, [cli, 'flow', 'validate', '--flow', flowFile, '--base-url', baseUrl, '--json'], { encoding: 'utf8' });
if (run.error || !run.stdout.trim()) {
  console.error(run.stderr || run.error?.message || 'flow validate produced no output');
  process.exit(1);
}

let report;
try { report = JSON.parse(run.stdout); } catch {
  console.error(`flow validate did not return JSON:\n${run.stdout}\n${run.stderr}`);
  process.exit(1);
}

/* Workflow-command escaping per GitHub's rules for the message portion. */
const escapeData = (value) => String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

let failures = 0;
for (const scene of report.scenes || []) {
  for (const action of scene.actions || []) {
    for (const message of action.errors || []) {
      failures += 1;
      console.log(`::error file=${flowFile},title=ScreenReel flow validation::flow ${scene.flowId} scene ${scene.sceneId} action ${action.index + 1} (${action.type}): ${escapeData(message)}`);
    }
  }
  for (const message of (scene.errors || []).filter((item) => item.startsWith('route:') || item.startsWith('waitFor:'))) {
    failures += 1;
    console.log(`::error file=${flowFile},title=ScreenReel flow validation::flow ${scene.flowId} scene ${scene.sceneId}: ${escapeData(message)}`);
  }
}

if (report.ok) {
  console.log(`ScreenReel flow validation passed: ${report.scenes.length} scene(s) against ${baseUrl}`);
} else {
  console.error(`ScreenReel flow validation failed with ${failures} error(s). Run \`screenreel flow doctor --flow ${flowFile} --base-url ${baseUrl}\` for repair proposals.`);
  process.exit(1);
}
