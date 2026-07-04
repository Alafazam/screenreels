# screenreel

Record scripted user journeys of any running web app as a stitched demo video — a visible cursor performs clicks, highlights and agent moments on camera; every journey becomes an exact-seekable clip; title cards + one final MP4 come out the other end.

Extracted from the ms-planning-brain trailer capture rig (`ui/increff-merchandising-system/trailer/scripts/capture-live.mjs`), inverted so the **target app needs zero integration**: screenreel injects the cursor, the action director, and the scene data through Playwright. The app only needs reachable routes and stable selectors.

**No HyperFrames required.** The stack is playwright-core + ffmpeg (both npm deps; ffmpeg binaries included). Clips are all-intra CFR H.264, so they stay compatible with HyperFrames or any editor if you later want a cinematic cut with music and camera moves.

## Install

Requires Node ≥ 20 and a local Chrome (or `CHROME_PATH` → any Chromium).

```bash
# Straight from git (recommended — no tarball to manage):
npm i -D "git+ssh://git@github.com/Alafazam/screenReels.git"

# Or build a tarball from a checkout of this repo:
npm pack                               # → screenreel-0.1.0.tgz
npm i -D /path/to/screenreel-0.1.0.tgz # in any project
```

## Quickstart

```bash
npx screenreel init        # scaffolds screenreel.config.mjs + screenreel.scenes.json
# 1. edit the config: baseUrl, login hook, title cards
# 2. author scenes (see skills/screenreel/references/actions.md)
# 3. start your app's dev server
npx screenreel record      # capture all scenes + stitch the reel
```

Outputs: `screenreel-output/clips/<scene>.mp4` per scene, `screenreel-output/reel.mp4` stitched.

Partial workflow: `npx screenreel capture scene-a` re-captures one scene; `npx screenreel assemble` re-stitches from existing clips.

## Configuration — `screenreel.config.mjs`

| Key | Default | Meaning |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | Where the app runs — start it yourself before capturing |
| `scenes` | `./screenreel.scenes.json` | The journeys file (relative to the config) |
| `out.clips` / `out.video` / `out.tmp` | `./screenreel-output/…` | Outputs |
| `viewport` / `deviceScaleFactor` | 1920×1080 @ 2× | Capture at 2×, encode smaller → crisp text |
| `fps` / `videoSize` | 30 / 1920×1080 | Output timing and size |
| `titleCards` | open + per-scene | `{ open: {title, sub}, perScene, durS, openDurS, bg, titleColor, subColor }` |
| `font` | platform default | Absolute path to .ttf/.ttc for title cards (macOS Helvetica / Linux DejaVu found automatically) |
| `login(page, config)` | — | Authenticate once per run (async Playwright page hook) |
| `prepare(context)` | — | Context setup: route shims for blocked CDNs, etc. |
| `initScript` | `''` | JS injected before app scripts on every page (pin theme/state) |

## Scenes — `screenreel.scenes.json`

One scene = one journey = one clip. Scene fields: `id`, `route`, `waitFor`, `settleMs`, `leadInMs`, `tailMs`, `endsInNavigation`, `title`/`sub` (title card), `actions[]`.

Action vocabulary: `wait · click · hover · fill · glow · scroll · scrollIntoView · drag · pointer · lever · set · call · goto` — full schema and a worked example in [skills/screenreel/references/actions.md](skills/screenreel/references/actions.md).

The `call` action invokes a page-global function with the cursor first travelling to a UI element (`cursorTo`) — the cleanest way to stage agent/AI demo moments deterministically.

## What to take care of (the craft)

The short version — the full reasoning lives in [skills/screenreel-video-craft/SKILL.md](skills/screenreel-video-craft/SKILL.md):

1. **Determinism**: fixture-driven screens, no `Date.now()`/randomness/live APIs; scenes idempotent across reloads; theme pinned.
2. **One money moment per scene**, 8–20s, structured orient → act → land (`leadInMs` / actions / `tailMs`).
3. **The cursor and toasts are the narration** — nothing happens "by magic"; route programmatic triggers through `call` + `cursorTo`; make sure the app acknowledges important actions visibly.
4. **Stable selectors**: `data-action`/`data-*` attributes, never styling classes; add them to the app if missing.
5. **Verify frames, not exit codes**: extract mid-action frames with ffmpeg and look at them before calling it done.

## Claude skills

`skills/` ships two agent skills. Copy them into a project's `.claude/skills/` (or your user skills directory) so Claude picks them up:

- **screenreel** — the end-to-end workflow: install → init → author scenes → record → verify.
- **screenreel-video-craft** — the authoring craft above, in enforceable detail.

## Relationship to the trailer rig

The original rig (`trailer/scripts/capture-live.mjs` + the prototype's in-app `demo-director.js`) stays untouched — it also powers the in-app `?demo=1` guided tour, which screenreel deliberately does not include. Screenreel is the portable, injection-based extraction of the capture path only. The two share the action vocabulary, so scenes port between them with minimal edits (screenreel scenes carry `leadInMs`/`tailMs`/`title` inline instead of a separate scene map).

## Develop

```bash
git clone git@github.com:Alafazam/screenReels.git
cd screenReels
npm install          # installs playwright-core + bundled ffmpeg/ffprobe
node bin/screenreel.mjs --help
```

Layout: `bin/` CLI entry · `lib/` capture + assemble + config loaders · `lib/inject/` the cursor and director injected into the target page · `templates/` files `init` scaffolds · `skills/` the two Claude skills · `example/` a runnable config + scenes that double as the end-to-end verification harness.

Generated artifacts (`node_modules/`, `screenreel-output/`, `.capture-tmp/`, `*.tgz`) are git-ignored — don't commit recordings.

## License

[Apache 2.0](LICENSE).
