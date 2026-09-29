# Theming

Everything ScreenReel draws on your page reads `--sr-*` custom properties, and each one falls back to
today's look. Set them on `:root`, or on any ancestor of `<body>`, to match your design system,
including dark mode. ScreenReel inserts its stylesheet first in `<head>`, so your own rules for the
class hooks below win at equal specificity. You don't need `body > …` overrides.

```css
:root {
  --sr-accent: #2563eb;           /* Next button, rings, ripple, focus outlines */
  --sr-font-family: Inter, sans-serif;
  --sr-callout-bg: #ffffff;
  --sr-callout-fg: #09090b;
}
@media (prefers-color-scheme: dark) {
  :root { --sr-callout-bg: #18181b; --sr-callout-fg: #fafafa; --sr-callout-body-fg: #a1a1aa; --sr-callout-border: 1px solid #27272a; }
}
```

| Area | Properties (default) |
|---|---|
| Shared | `--sr-accent` (#7c3aed), `--sr-accent-foreground` (#fff), `--sr-font-family` (system-ui) |
| Callout card `.sr-action-callout` | `--sr-callout-bg` (#fff), `--sr-callout-fg` (#18181b), `--sr-callout-body-fg` (#52525b), `--sr-callout-title-fg`, `--sr-callout-muted` (#71717a), `--sr-callout-border` (1px solid #e4e4e7), `--sr-callout-radius` (10px), `--sr-callout-shadow`, `--sr-callout-width` (300px), `--sr-callout-font-size` (13px), `--sr-callout-title-size` (14px), `--sr-callout-button-border` (#e4e4e7), `--sr-button-radius` (7px) |
| Highlight ring `.sr-glow-box`, spotlight ring `.sr-action-box` | `--sr-glow` (the rainbow; set a colour such as `var(--sr-accent)` for a solid brand ring), `--sr-ring-color`, `--sr-ring-radius` (14px), `--sr-ring-shadow` |
| Dim | `--sr-dim-rgb` (`9, 9, 11`); the strength is the action's `dim` |
| Click ripple `.sr-click-ripple` | `--sr-ripple-color` |
| Countdown `.sr-count-num`, `.sr-count-cap` | `--sr-countdown-color`, `--sr-countdown-caption-color`, `--sr-countdown-size` (220px), `--sr-countdown-backdrop` (transparent), `--sr-countdown-backdrop-filter` (none) |
| Choice `.sr-choice-card`, `.sr-choice-prompt` | `--sr-choice-backdrop`, `--sr-choice-card-bg`, `--sr-choice-card-fg`, `--sr-choice-radius` (14px), `--sr-choice-prompt-color` |
| Chooser and pill (inside the projector's shadow root) | `--sr-surface`, `--sr-foreground`, `--sr-muted`, `--sr-border`, `--sr-backdrop`, `--sr-radius`, `--sr-radius-lg`, `--sr-shadow`, `--sr-text-title`, `--sr-text-body`, `--sr-text-small`, `--sr-chooser-width` |

A readable countdown, for example, is a frosted title card:

```css
:root { --sr-countdown-backdrop: rgba(255,255,255,.6); --sr-countdown-backdrop-filter: blur(8px); --sr-countdown-color: var(--sr-accent); }
```

Class hooks inside the callout: `.sr-callout-title`, `.sr-callout-body`, `.sr-callout-actions`,
`.sr-callout-step`, `.sr-callout-skip`, `.sr-callout-back`, and `.sr-callout-next`. A callout with
controls also carries `.sr-callout--interactive`, and `data-side` says where it landed.
