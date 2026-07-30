# Keeping demos working

**What it does:** finds the demo steps your app just broke, proposes or applies repairs, and turns
demo breakage into a failing CI check instead of a surprise mid-call.

Live demo: [Chapter 2 of the showcase](../examples/action-showcase/showcase-heal.html).

## Why this exists

ScreenReel drives your **real app** through real selectors. That's the whole point — the demo can
never show something the product doesn't do. The cost is that a renamed class or a restructured
component can break a step. These two tools pay that cost down to roughly zero.

## Check a flow

```bash
screenreel flow validate --flow demos/sales.json --base-url http://localhost:3000 --json
```

Loads every scene's route in a real browser and validates each action against the live DOM. Exits
non-zero if anything is broken. This is a **dry run** — it never executes your actions.

## Diagnose and repair

```bash
# Show what's broken and what it would change
screenreel flow doctor --flow demos/sales.json --base-url http://localhost:3000

# Apply the confident repairs
screenreel flow doctor --flow demos/sales.json --base-url http://localhost:3000 --fix
```

Typical output:

```
✖ tour-opening action 2   selector matches multiple elements
  repair  .flow-row → [data-flow-step="1"]   confidence 100
▲ tour-controls action 5   has no matches   (follows a state-mutating action — warning, not repaired)

1 fix applied
```

### What it repairs, and what it only reports

| Problem | What happens |
|---|---|
| `selector matches multiple elements` | **Repaired.** Re-derives a unique selector for the first match, or adds `index: 0`. |
| `has no matches`, action has a `fingerprint` | **Repaired** when the match is confident: the target is found again by its text, tag, and role, and the selector is rewritten. |
| `has no matches`, no `fingerprint` | **Reported only.** You get the three closest candidates, ranked. Never auto-changed. |
| Unsupported action type, invalid route, invalid function name, out-of-range number | **Reported only.** These need a human decision. |

`--fix` edits **only** the keys it repaired. Your key order, comments-as-data, and every unrelated
field survive untouched — it mutates the parsed file surgically rather than re-serializing a
normalized copy.

### Fingerprints: what makes repair possible

A `fingerprint` is the target's human-recognisable identity, stored on the action:

```json
{ "type": "click", "selector": "#submit-control",
  "fingerprint": { "text": "Rock the demo", "tag": "button", "role": "" } }
```

You never write these by hand. They're stamped automatically when you **pick a target in Studio**
or **[record a scene](recording.md)**. When `#submit-control` becomes `#submit-primary`, the doctor
finds the button that still says "Rock the demo" and rewrites the selector.

Flows authored before fingerprints existed still validate fine — they just get candidate
suggestions instead of automatic repair. Re-pick a target in Studio to add one.

### About that "warning, not repaired" line

Validation is a dry run against the page as it loads. If action 3 clicks a button that opens a
modal, action 4's selector genuinely doesn't exist yet — that's not a break. So when a
`has no matches` follows a state-mutating action (`click`, `pointer`, `toggle`, `set`, `type`,
`drag`, `call`, `goto`) in the same scene, or a prior `waitFor` targets the same selector, it's
reported as a **warning**: not repaired, and not a failure.

The trade-off is deliberate: a genuinely dead selector after a click is downgraded too. If you want
to be strict about a scene, put a `waitFor` before the action so its intent is explicit.

## Catch it in CI

Every PR can validate the demos against the running app. Add this to a workflow — the app server is
your step, because it's your stack:

```yaml
- run: npm ci
- name: Start my app
  run: npm run dev & npx wait-on http://localhost:3000
- uses: Alafazam/screenreels/.github/actions/validate-flows@main
  with:
    flow: demos/sales-demo.json
    base-url: http://localhost:3000
```

A break becomes an inline annotation on the PR that caused it:

```
Error: flow guided-tour scene tour-kpis action 2 (highlight): selector has no matches
```

**Requirements:** Node 22 (or set `CHROME_PATH`), and Chromium — the action installs it into
`/opt/pw-browsers`, where ScreenReel looks on Linux.

To wire it up manually instead, `scripts/annotate-validate.mjs` is the whole mechanism: it runs
`flow validate --json`, prints `::error` workflow commands, and exits 1 on failure.

## Troubleshooting

**"no Chrome/Chromium found"** — set `CHROME_PATH`, install Chrome, or
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright install chromium`.

**Everything reports "has no matches"** — your `--base-url` probably doesn't match where the app is
serving, so every route 404s. Check the `route:` errors at the scene level first.

**The doctor proposed something wrong** — it only auto-applies the two high-confidence classes, so
this should be rare. `--fix` is opt-in and the change is a small diff: review and revert. If a
fingerprint match was wrong, the target text is probably duplicated on the page; pick the target
again in Studio to get a more specific selector.

## Under the hood

Decision logic is pure and unit-tested in
[`lib/doctor-heuristics.mjs`](../lib/doctor-heuristics.mjs) — error classification, fingerprint
scoring (exact text ≫ tag ≫ role ≫ token overlap), the dynamic-target downgrade, and the surgical
rewrite. [`lib/flow-doctor.mjs`](../lib/flow-doctor.mjs) is just browser orchestration over the same
dry-run `flow validate` uses, so the two can never disagree about what "broken" means.
