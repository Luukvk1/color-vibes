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

## Code style

**ES5 `var`/`function` style is deliberate**, not legacy debt — it matches
the rest of the codebase, so keep writing `var` and `function (x) {}`
rather than `const`/`let`/arrow functions. Don't modernize syntax as a
drive-by change.

**Full names, not single letters.** The codebase used to be dense with
single-letter locals that meant different things in different scopes (`v`
was "view" in one file and "unit" in another; `d` was "card definition" in
most places but "map depth" or "a detail string" a few hundred lines away
in the same file). That ambiguity is the thing to avoid — a short name is
fine when it's genuinely unambiguous in its own narrow scope (a loop index
`i`, coordinate pairs `x`/`y`, or a data-shape's own required field names
like a fissure's `{a, b}` endpoints), but reused single letters standing in
for different domain concepts are not. Prefer the full word:

| short | full name | short | full name |
|---|---|---|---|
| `v` | `view` (evaluation) / `unit` (card hooks) | `d` | `cardDef` / `enemyDef` / `relicDef` |
| `u`, `u2` | `unit`, `otherUnit` | `g` | `battleState` (mutable mix/draw/play state) |
| `s` | `side` / `state` (battle state, context-dependent) | `r`, `row` | `row` |
| `i`, `idx` | `index` | `n` | context-specific count |
| `t` | `tile` | `k` | `key` |
| `ev` | `evaluation` (kept as-is; established shorthand) | `L` | `laneIndex` |
| `sev`/`sv`/`tp` | `topology` (severed/bridged board topology) | `run` | the active run object (`RUN.getRun()`) |

**Extract inlined callback bodies into named functions** rather than
nesting logic several `forEach`/`map` levels deep — a named function with a
descriptive name documents what the block does even before you read its
body. This matters most in the densest files (`core/evaluation.js`'s
scoring pipeline is the reference example: a sequence of named
`applyX`/`computeX` functions called in order from `evaluateBoard`, each
taking explicit params rather than closing over everything).

**Comments explain why, not what.** A well-named function or variable
already says what the code does; only add a comment for the reasoning a
reader can't get from the code itself — a game-design rule, a non-obvious
ordering requirement, or a past bug being guarded against. Match the voice
already in the codebase (see `colors.js`'s mix-to-Black comment or
`board-shape.js`'s fissure comments) — direct, specific, and short. Don't
add a comment that just restates the function name in prose.

**Renaming safety.** When renaming a variable across a large stretch of
code, check what it actually means at *every* site before doing a bulk
find-and-replace — the same short name reused for unrelated concepts a few
hundred lines apart is exactly the trap this convention exists to avoid,
and a blind substitution will silently rename the wrong thing. Two concrete
failure modes worth watching for specifically: a single-letter regex like
`\bs\b` also matches the `s` in every English possessive (`board's` →
`board'state`), since an apostrophe is a non-word character; and renaming a
function parameter to a name some line inside that same function *also*
already uses (e.g. `function (k) { var key = ...} ` where `k` becomes
`key`) creates a same-scope shadowing bug. After any bulk rename, re-run
the self-test suite and grep for the old name to confirm nothing was
missed or corrupted.

See [Code layout](#code-layout) above for the single-file constraint on
`run/index.js` and `battle/index.js` — the naming and decomposition
guidance here applies *within* those files (many well-named internal
functions), not as an argument for splitting them.

## Deploys

Pushing to `main` builds and deploys `build/` to GitHub Pages via
`.github/workflows/deploy.yml`. No manual deploy step.
