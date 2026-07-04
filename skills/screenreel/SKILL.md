---
name: screenreel
description: Record a polished demo/launch video of any running web app — scripted user journeys captured with a visible cursor, stitched with title cards into one MP4. Use this whenever the user wants a demo video, launch video, product walkthrough, feature showcase, "capture the screens", "record the user journeys", or a video of new screens/prototypes — even if they don't say "screenreel". Also use it when asked to re-record or extend an existing reel after UI changes.
---

# Screenreel — scripted journeys → demo video

Screenreel records a running web app: for each *scene* it navigates to a route, runs scripted in-page actions (clicks, glows, drags, function calls) with a fake cursor visible, records via Chrome's screencast, and encodes an exact-seekable clip. Then it stitches all clips with title cards into one MP4. The target app needs **zero integration** — screenreel injects everything; the app only needs reachable routes and stable selectors.

It does NOT need HyperFrames or any composition framework. Clips are all-intra CFR H.264, so they remain usable later inside HyperFrames or any editor if a cinematic cut is wanted.

## Workflow

### 1. Install (once per repo)

```bash
# from git (recommended)
npm i -D "git+ssh://git@github.com/Alafazam/screenReels.git"
# or from a tarball (npm pack in the screenreel source dir produces screenreel-x.y.z.tgz)
npm i -D ./screenreel-0.1.0.tgz
```

Requires Node ≥ 20 and a local Chrome (or `CHROME_PATH` pointing at a Chromium). ffmpeg/ffprobe ship as npm deps — nothing to install system-wide.

### 2. Scaffold and configure

```bash
npx screenreel init
```

Creates `screenreel.config.mjs` (environment: baseUrl, login hook, outputs, title cards) and `screenreel.scenes.json` (the journeys). Edit the config first:

- `baseUrl` — where the dev server runs. **Start the app's dev server before capturing**; screenreel does not start it.
- `login(page, config)` — fill the app's auth flow once per run (dev-auth form, token cookie, etc.). Delete if no auth.
- `initScript` — pin app state before scripts run, e.g. `localStorage.setItem('theme','light')`.
- `prepare(context)` — Playwright route shims, needed only when CDNs are blocked (serve unpkg/fonts from node_modules copies).

### 3. Author scenes

One scene = one user journey = one clip. Before writing scenes, read the companion skill **screenreel-video-craft** — it is the difference between a broken capture and a good one. For the full action vocabulary and scene schema, read [references/actions.md](references/actions.md).

Explore the app first (running instance or source) to find real selectors — prefer `data-action`/`data-*` attributes; if the screens lack them, add them to the source rather than scripting against styling classes. For agent/AI moments, look for page globals to drive via the `call` action.

### 4. Record

```bash
npx screenreel record                    # capture all scenes + stitch
npx screenreel capture scene-a scene-b   # re-capture just the listed scenes
npx screenreel assemble                  # re-stitch from existing clips (fast)
```

`record` fails loudly if any scene fails — fix and re-capture only that scene, then `assemble`.

### 5. Verify — never ship blind

Extract mid-action frames and look at them:

```bash
FFMPEG=$(node -p "require('@ffmpeg-installer/ffmpeg').path")
$FFMPEG -y -ss 8 -i screenreel-output/clips/<scene>.mp4 -frames:v 1 /tmp/check.png
```

Read the frame. Confirm: the cursor is visible, the money moment is on screen (toast, diff, updated number), no blank/loading states, no login page. If a scene runs long/short, tune `leadInMs`/`tailMs`/`afterMs` and re-capture just that scene.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Clip shows the login page | `login` hook missing/failed — verify selectors against the real login form |
| "selector not found" warnings | Selector churned or element renders late — use `data-*` attrs; raise `timeoutMs` on the action or the scene's `waitFor` |
| Action ran but nothing visible changed | Money moment happened during `leadInMs` or after `tailMs` — rebalance pacing |
| evaluate error on last action | The action navigates — set `"endsInNavigation": true` on the scene |
| Blank charts / missing fonts | Raise `settleMs`; if CDNs are blocked, add `prepare` route shims |
| "no Chrome/Chromium found" | Install Chrome or set `CHROME_PATH` |
| Different footage between runs | The app is non-deterministic — see screenreel-video-craft (fixtures, Date.now, randomness) |
