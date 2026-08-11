# Logo concepts — Freddo's Mementos

Status: concept 1, “Stem tussen de regels,” was selected on 11 August 2026 and implemented as the production PWA and in-app mark. Concepts 2 and 3 remain here as exploration history.

## Shared design system

- Desk beige: `#E8DDCB`
- Paper cream: `#FFF6E5`
- Ink: `#302820`
- Rust: `#A9573F`
- Muted teal: `#526560`
- Intended use: square PWA icon, readable at small sizes, with identity-critical artwork inside the maskable safe area
- References: `public/icons/icon-512.png` for visual lineage and `public/og.jpg` for the warm editorial mood

## 1. Stem tussen de regels

Two offset pages. Written lines flow into a compact soundwave and back into lines; a rust full stop acts as a personal maker’s mark. This combines poetry and the app’s own-voice recordings.

**Selected for production.** The final implementation is a crisp deterministic redraw in `scripts/generate-icons.py`; the generated image below remains the visual concept reference rather than a shipped asset.

Prompt:

> Create an original PWA symbol called “Stem tussen de regels”: two subtly offset paper pages, where bold horizontal poem lines on the front page flow into one compact, elegant soundwave in the middle, then return to lines. Add one small rust-colored full stop as a personal maker’s mark. Use a flat, minimal, vector-like warm editorial archive style; a centered square composition; strong silhouette; generous margin; maskable-safe placement; and the exact app palette. Symbol only. Avoid words, letters, microphones, music notes, open books, gradients, shadows, mockups, 3D, photographic texture, and watermarks.

## 2. De gevouwen V

Two broad page folds create a V through negative space rather than a printed letter. This is the boldest and most legible direction at favicon size.

Prompt:

> Create an original PWA symbol called “De gevouwen V”: two broad overlapping page shapes fold toward each other so the central negative space forms a clear, elegant letter V without drawing or printing the letter. Use muted teal, rust, and a cream inner fold; a flat, minimal, abstract editorial style; a centered square composition; strong silhouette; generous margin; maskable-safe placement; and the exact app palette. Symbol only. Avoid a written V, words, poem lines, microphones, open-book clichés, gradients, shadows, mockups, 3D, photographic texture, and watermarks.

## 3. Het archiefstempel

A personal archive seal encloses a cream page, with a rust apostrophe and a teal filing tab. This emphasizes privacy, ownership, and preservation.

Prompt:

> Create an original PWA symbol called “Het archiefstempel”: a bold, slightly imperfect circular archive seal enclosing one simplified cream page; a single rust apostrophe-shaped punctuation mark is cut into the page, and a short muted-teal tab suggests a private filing archive. Use a flat, minimal, tactile maker’s-seal style; a centered square composition; compact silhouette; generous margin; maskable-safe placement; and the exact app palette. Symbol only. Avoid words, initials, padlocks, microphones, open books, gradients, shadows, mockups, 3D, photographic texture, and watermarks.

## Generated files

- `01-stem-tussen-de-regels.png`
- `02-de-gevouwen-v.png`
- `03-het-archiefstempel.png`

All three were generated with the built-in image-generation workflow at 1254×1254 RGB. The selected direction was redrawn deterministically and applied consistently to the in-app mark, favicon, Apple touch icon, standard PWA icons, and maskable icon.
