# ScreenReel actions

Generated from `packages/core/action-runtime.js`.

| Action | Type | Category | Picker | Defaults |
|---|---|---|---|---|
| Highlight target | `highlight` | Emphasis | visual | `{"holdMs":1600}` |
| Highlight target sequence | `glow` | Emphasis | collection | `{"sequence":true,"count":6,"stepMs":1050,"afterMs":400}` |
| Spotlight target | `spotlight` | Emphasis | visual | `{"holdMs":1800,"dim":0.62}` |
| Target callout | `callout` | Emphasis | visual | `{"text":"Add your callout","placement":"auto","holdMs":2200}` |
| Click target | `click` | Interaction | interactive | `{"afterMs":700}` |
| Hover target | `hover` | Interaction | interactive | `{"holdMs":800}` |
| Focus target | `focus` | Interaction | interactive | `{"afterMs":500}` |
| Type into field | `type` | Interaction | interactive | `{"text":"Sample value","clearFirst":true,"charMs":45}` |
| Set control value | `set` | Interaction | interactive | `{"value":""}` |
| Toggle control | `toggle` | Interaction | interactive | `{"checked":true}` |
| Move slider | `lever` | Interaction | interactive | `{"to":"max","durMs":1200}` |
| Drag target | `drag` | Interaction | source-destination | `{"durMs":900}` |
| Scroll target into view | `scrollIntoView` | Viewport | visual | `{"block":"center","durMs":700}` |
| Scroll by amount | `scroll` | Viewport | none | `{"mode":"relative","direction":"down","amount":50,"unit":"viewportPercent","durMs":800}` |
| Scroll to edge | `scroll` | Viewport | none | `{"mode":"edge","edge":"top","durMs":700}` |
| Wait duration | `wait` | Timing | none | `{"ms":1000}` |
| Wait for target or state | `waitFor` | Timing | visual | `{"condition":"visible","timeoutMs":8000}` |
| Navigate | `goto` | Navigation | none | `{"url":"/"}` |
| Pointer tap | `pointer` | Advanced | interactive | `{"afterMs":700}` |
| Call page function | `call` | Advanced | none | `{"fn":"","args":[],"afterMs":700}` |

## Recipes

- **Scroll and explain** (`scroll-explain`): expands into editable primitive actions.
- **Open and spotlight** (`open-spotlight`): expands into editable primitive actions.
- **KPI walkthrough** (`kpi-walkthrough`): expands into editable primitive actions.
- **Fill and submit** (`fill-submit`): expands into editable primitive actions.
- **Compare a lever** (`compare-lever`): expands into editable primitive actions.
- **Drag and inspect** (`drag-inspect`): expands into editable primitive actions.
