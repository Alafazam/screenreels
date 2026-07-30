// Shared ffmpeg/ffprobe binary resolution and probing. Capture, assemble, and voice all shell
// out to the same vendored binaries; this is their one home.
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolved via a child `node -p` so this ESM module can read the CJS installers' exports
// without a require shim; cwd anchors resolution to this package, not the caller's project.
const resolveInstaller = (pkg) =>
  execFileSync('node', ['-p', `require('${pkg}').path`], { cwd: __dirname }).toString().trim();

export const ffmpegPath = () => resolveInstaller('@ffmpeg-installer/ffmpeg');
export const ffprobePath = () => resolveInstaller('@ffprobe-installer/ffprobe');

export function probeDurationSeconds(file) {
  const out = execFileSync(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  const seconds = Number(out);
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe could not read a duration from ${file}`);
  return seconds;
}

export function countAudioStreams(file) {
  const out = execFileSync(ffprobePath(), ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).toString().trim();
  return out ? out.split('\n').length : 0;
}
