# ScreenReel landing design QA

## Evidence

- Source visual truth: the generated repo-native landing mockup the redesign was built from (kept outside the repository).
- Final repo-native implementation: `screenreel-output/design-qa/implementation-repo-native-final.png`
- Product-in-product implementation: `screenreel-output/design-qa/implementation-product-in-product.png`
- Side-by-side comparison: `screenreel-output/design-qa/repo-native-side-by-side.png`
- These screenshots were local QA output under the gitignored `screenreel-output/` folder and are not committed.
- Viewport: 1536 x 1024 CSS px, device scale factor 1.
- Pixel normalization: source and implementation are both 1536 x 1024 physical pixels; no resampling or density adjustment was needed.
- State: light theme, desktop, forced `repo-native` or `product-in-product` query override, landing allocation disabled.

## Full-view comparison

The final repo-native render preserves the selected composition: repository-first top bar, open-source badge, three-line statement, concise supporting copy, two conversion actions, readable JSON window, product/Studio stack, dotted source-to-runtime connectors, and the next section beginning at the same fold. The lower section intentionally uses the shared experiment-neutral content from the approved plan rather than copying the reference's three compact process cards.

The product-in-product render uses the same navigation and shared fold while preserving its alternate violet statement and Studio-over-product visual. Both variants retain the same primary conversion, destination contract, and visual weight.

## Focused comparison

- Typography: display scale, three-line wrap, dark weight, violet terminal punctuation, body hierarchy, and compact UI labels match the source intent. System font fallback remains legible and optically close.
- Spacing and layout: top-bar height, hero split, badge placement, CTA spacing, visual-stack proportions, dividers, radii, and low-elevation shadows match the reference hierarchy. The implementation gives the code window slightly more whitespace; this is acceptable for readable real copy.
- Colors and tokens: white canvas, near-black text, muted slate copy, restrained violet accents, subtle gray borders, and green success state are consistent with the source.
- Image and asset quality: the product visuals are responsive HTML surfaces by design, not embedded screenshots. The ScreenReel brand asset and official GitHub mark render sharply with no masking or transparency artifacts.
- Copy and content: the opening category, ownership model, repository workflow, and outputs are understandable without prior product knowledge. Self-repair remains supporting proof rather than the hook.
- Icons and controls: the ScreenReel mark, official GitHub icon, arrows, buttons, focusable controls, and status treatments are aligned and consistent. Decorative hero controls are removed from the accessibility tree.
- Accessibility and resilience: semantic headings and landmarks, labels, keyboard focus, reduced-motion handling, mobile tap targets, and no horizontal overflow were checked at 390 x 844 and desktop widths.

## Findings

No actionable P0, P1, or P2 visual differences remain.

## Comparison history

1. Initial responsive pass found a P2 horizontal overflow at 390 px caused by the unbroken installation command. The command now wraps with `overflow-wrap: anywhere`; the browser regression asserts `scrollWidth <= clientWidth` for both forced variants.
2. Initial desktop pass found two P3 fidelity gaps: the Star control used a wordmark instead of the selected GitHub mark, and the repo visual lacked its source-to-runtime connectors. The asset was replaced with GitHub's official square mark and two restrained dotted connectors were added. The final implementation screenshot confirms both changes.

## Primary interactions tested

- Forced preview selection for both variants without persisting assignment.
- Shared live-demo launch from scene one.
- Complete six-scene playback across landing, Demo Lab authoring, output, and return routes.
- Demo Lab type, select, toggle, slider, reorder, output navigation, share/live/video feedback.
- Keyboard-accessible navigation and Studio authoring flow.
- Browser console and page errors checked after the blank-flow Studio regression fix; none remain in the final smoke run.

## Implementation checklist

- [x] Match selected repo-native hero and shared repository-first navigation.
- [x] Preserve product-in-product alternate positioning.
- [x] Verify desktop and mobile layouts, overflow, focus, and reduced motion.
- [x] Verify both variants use the same conversion and demo contracts.
- [x] Inspect final source-versus-render comparison and browser console.

final result: passed
