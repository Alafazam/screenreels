// Shared ffmpeg/ffprobe binary resolution and probing. Capture, assemble, and voice all shell
// out to the same vendored binaries; this is their one home.
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// The installer packages are optional peer dependencies, so a Projector-only install does not
// download an FFmpeg build. Each binary resolves in this order: the env var, the installer
// package, then the command on PATH.
export const FFMPEG = { envVar: 'FFMPEG_PATH', installer: '@ffmpeg-installer/ffmpeg', command: 'ffmpeg' };
export const FFPROBE = { envVar: 'FFPROBE_PATH', installer: '@ffprobe-installer/ffprobe', command: 'ffprobe' };

// Returns null only when the installer package itself is absent. Any other failure (for
// example, the installer has no build for this platform) is a real error and propagates.
function installerPath(pkg) {
  try {
    return require(pkg).path;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes(`'${pkg}'`)) return null;
    throw err;
  }
}

function commandOnPath(command) {
  try {
    execFileSync(command, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Pure resolution; the lookups are injectable so tests do not depend on what this machine has.
export function resolveBinary(spec, { env = process.env, findInstaller = installerPath, onPath = commandOnPath } = {}) {
  if (env[spec.envVar]) return env[spec.envVar];
  const installed = findInstaller(spec.installer);
  if (installed) return installed;
  if (onPath(spec.command)) return spec.command;
  throw new Error(
    `${spec.command} not found. Capture needs it. Do one of these: ` +
      `npm install --save-dev ${spec.installer}, put ${spec.command} on PATH, or set ${spec.envVar}.`,
  );
}

const resolved = new Map();
const cachedBinary = (spec) => {
  if (!resolved.has(spec.command)) resolved.set(spec.command, resolveBinary(spec));
  return resolved.get(spec.command);
};

export const ffmpegPath = () => cachedBinary(FFMPEG);
export const ffprobePath = () => cachedBinary(FFPROBE);

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
