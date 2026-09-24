# Colour Vibes — The Long Road

A roguelite deckbuilder about mixing colours, built as vanilla ES modules
(no framework). See [README.md](README.md) for gameplay and layout details.

## Commands

- `npm install` — installs esbuild (only dependency).
- `npm run build` — bundles `src/` into `build/` via esbuild. `build/` is
  generated and gitignored; never hand-edit anything under it.
- `npm test` — the headless suite (Node ≥ 21, no browser): the architecture
  boundaries, whole seeded runs played by a bot against the real rules, and the
  self-test checks that need no page. `UPDATE_GOLDEN=1 npm test` regenerates
  `tests/golden/runs.json` when a change is *meant* to alter how runs play out —
  review that diff like any other.
- Local dev needs no build step: ES modules require a real origin, so serve
  the repo root with any static server (`python3 -m http.server`, `npx serve`)
  and open `index.html` directly — do not open the file with `file://`.
- Browser suite: run self-test from the in-game menu, or from a console /
  Playwright: `(await ColorVibes.selfTest()).filter(t => !t.pass)` (expect `[]`).
  It is the same 304 checks `npm test` runs; the ~20 that read layout or the DOM
  only pass here. The suite saves and loads through a sandboxed storage key, so it
  cannot touch a real save.

## Code layout

Three folders, and the arrows only ever point one way:

```
src/game/      the rules and everything the player decides. Imports nothing outside
               itself and touches no browser API — no DOM, no storage, no timers.
src/session/   localStorage, and nothing else. Imports nothing from src/.
src/view/      what the player sees and touches. Imports game/, only through
               game/index.js, and never session/.
src/main.js    the one place all three meet.
```

`tests/architecture.test.js` enforces this from the real import graph — a game
file reaching for `window`, or a view file importing session, fails `npm test`.
Keep it true rather than editing the test.

**Inside game/.** `rules/` is pure data and functions (colours, board shape,
cards, enemies, scoring). `content/`, `run/` and `battle/` are the engine: the
map and what happens between battles, and the table itself (mixing, targeting,
rewind, the opponent AI, turn flow). `store.js` holds the state — one object,
because an ES module cannot reassign a binding it exports — and `index.js` is the
game's whole public surface; nothing outside game/ imports deeper than that.

**Actions and events.** Anything that changes the game is an *action*: a function
wrapped in `act()` that does its work and then announces `'change'` once. Actions
call each other freely; only the outermost announces. The engine also reports
one-off happenings a picture of the state could not show — `'log'`, `'fx'`,
`'announce'`, `'passPuck'`, `'fissure'` — and never draws them. The view
subscribes (`view/index.js`) and re-renders from state; a tap calls an action and
nothing else. So a new player choice is: an action in game/, exported from
`game/index.js`, called by a handler in view/, drawn from state by a render
function. The game has no timers: the opponent's pause is the view's
(`opponentThink` returns how long, `opponentAct` acts), and a test just calls
`opponentMove()`.

**Startup and saving.** `main.js` does `session.load()`, hands the result to
`game.loadCodex()` and `game.start()`, and from then on writes `game.snapshot()`
back on every `'change'`. The game keeps the last settled moment of the run
itself (`checkpoint`) and never a battle in progress; `resume()` reads that, not
storage. `restoreRun()` is where a loaded save is judged — session only checks
that it parses. Everything random goes through `store.rnd`, so a seeded game is
reproducible.

`view/self-test.js` is dynamically imported on demand (not shipped with the
initial page) — keep it that way; esbuild's code-splitting depends on it staying
a dynamic `import()`.

## Testing a change

`tests/support/play.js` plays the game through its public surface — the same
calls the view makes — with a bot choosing for the player, so a whole run takes
about a tenth of a second. Prefer a test there over a browser check for anything
about rules or flow.

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
| `sev`/`sv`/`tp` | `topology` (severed/bridged board topology) | `run` | the active run object (`game.getRun()`, or `store.run` inside game/) |

**Extract inlined callback bodies into named functions** rather than
nesting logic several `forEach`/`map` levels deep — a named function with a
descriptive name documents what the block does even before you read its
body. This matters most in the densest files (`game/rules/evaluation.js`'s
scoring pipeline is the reference example: a sequence of named
`applyX`/`computeX` functions called in order from `evaluateBoard`, each
taking explicit params rather than closing over everything).

**Comments explain why, not what.** A well-named function or variable
already says what the code does; only add a comment for the reasoning a
reader can't get from the code itself — a game-design rule, a non-obvious
ordering requirement, or a past bug being guarded against. Match the voice
already in the codebase (see `game/rules/colors.js`'s mix-to-Black comment or
`game/rules/board-shape.js`'s fissure comments) — direct, specific, and short.
Don't add a comment that just restates the function name in prose.

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
`npm test` and grep for the old name to confirm nothing was missed or
corrupted.

## Deploys

Pushing to `main` builds and deploys `build/` to GitHub Pages via
`.github/workflows/deploy.yml`. No manual deploy step.
