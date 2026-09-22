# Colour Vibes — The Long Road

A roguelite deckbuilder about mixing colours, built as vanilla ES modules
(no framework). See [README.md](README.md) for gameplay and layout details.

## Commands

- `npm install` — installs esbuild (only dependency).
- `npm run build` — bundles `src/` into `build/` via esbuild. `build/` is
  generated and gitignored; never hand-edit anything under it.
- Local dev needs no build step: ES modules require a real origin, so serve
  the repo root with any static server (`python3 -m http.server`, `npx serve`)
  and open `index.html` directly — do not open the file with `file://`.
- Tests: open the game, run self-test from the in-game menu, or from a
  console/Playwright: `(await CV_BATTLE.selfTest()).filter(t => !t.pass)`
  (expect `[]`). Some checks only run once a battle is open.

## Code layout

`src/core` (pure rules) → `src/run` (session/map/saves) → `src/battle`
(rendering/input/AI) is a strict one-way dependency chain — never import
downstream. `run/index.js` and `battle/index.js` are intentionally single
files: both hold shared mutable state reassigned throughout (`run` alone is
read 300+ times), which an ES module can't do across files without a state
holder. Don't split them without doing that refactor first.

`battle/self-test.js` is dynamically imported on demand (not shipped with
the initial page) — keep it that way; esbuild's code-splitting depends on it
staying a dynamic `import()`.

## Deploys

Pushing to `main` builds and deploys `build/` to GitHub Pages via
`.github/workflows/deploy.yml`. No manual deploy step.
