import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The quick start and the landing page tell people to paste a CDN script pinned to a version.
   Versions are bumped by hand at release, so this fails when either one falls behind package.json. */
const CDN_VERSION = /cdn\.jsdelivr\.net\/npm\/(?:<wbr>)?screenreel@([^/]+)\//g;
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));

for (const file of ['README.md', 'examples/action-showcase/index.html']) {
  test(`${file} pins the CDN script to the package version`, () => {
    const pinned = [...fs.readFileSync(file, 'utf8').matchAll(CDN_VERSION)].map((match) => match[1]);
    assert.ok(pinned.length > 0, `${file} has no CDN script URL`);
    assert.deepEqual([...new Set(pinned)], [version]);
  });
}
