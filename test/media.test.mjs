import test from 'node:test';
import assert from 'node:assert/strict';
import { FFMPEG, FFPROBE, resolveBinary } from '../lib/media.mjs';

const none = () => null;
const absent = () => false;

test('resolveBinary prefers the env var over the installer and PATH', () => {
  const found = resolveBinary(FFMPEG, {
    env: { FFMPEG_PATH: '/opt/ffmpeg/bin/ffmpeg' },
    findInstaller: () => '/installer/ffmpeg',
    onPath: () => true,
  });
  assert.equal(found, '/opt/ffmpeg/bin/ffmpeg');
});

test('resolveBinary uses the installer package when no env var is set', () => {
  const found = resolveBinary(FFPROBE, { env: {}, findInstaller: () => '/installer/ffprobe', onPath: () => true });
  assert.equal(found, '/installer/ffprobe');
});

test('resolveBinary falls back to the command on PATH when the installer is absent', () => {
  assert.equal(resolveBinary(FFMPEG, { env: {}, findInstaller: none, onPath: () => true }), 'ffmpeg');
});

test('resolveBinary fails loudly and names every fix when nothing is found', () => {
  assert.throws(
    () => resolveBinary(FFPROBE, { env: {}, findInstaller: none, onPath: absent }),
    (err) =>
      err.message.includes('npm install --save-dev @ffprobe-installer/ffprobe') &&
      err.message.includes('PATH') &&
      err.message.includes('FFPROBE_PATH'),
  );
});
