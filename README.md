# Colour Vibes — The Long Road

A roguelite deckbuilder about mixing colours. Battles are best-of-three on a
shared triangular board; colours beat other colours; two cards can be mixed into
the colour they make, and mixing is where most of the game's ceiling lives.

**Play it:** https://YOUR-USERNAME.github.io/colour-vibes/

No install, no account, no build step. Progress is kept in the browser's local
storage, so a run survives a refresh but does not follow you to another device.

---

## Running it locally

ES modules are subject to the same-origin policy, so the page has to be served
over HTTP. Opening `index.html` by double-clicking it will **not** work — the
browser blocks the module imports and the screen stays black.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server does; `npx serve`, `php -S localhost:8000` and the VS Code
Live Server extension all work the same way.

## Putting it online

The repository is already a working site — every file a browser needs is
committed, and there is nothing to compile.

1. Push this directory to a GitHub repository.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder
   `/ (root)`.
3. Wait a minute and open `https://<user>.github.io/<repo>/`.

`.nojekyll` is in the root on purpose: without it, Pages runs the repo through
Jekyll, which silently drops any path beginning with an underscore.

## Layout

```
index.html          the page: markup only, loads one module
styles/game.css     every style
assets/art/         the ten act paintings, one file each
src/
  main.js           entry point
  core/             the rules — pure, no DOM, no run state
    colors.js         colour identity and the mixing wheel
    board-shape.js    the eighteen tiles: adjacency, lanes, coordinates
    primitives.js     board reads, placement legality, card instances
    cards.js          every card, with its hooks
    card-icons.js     the glyph vocabulary cards are read by
    relics.js         run-long modifiers
    enemies.js        enemies, bosses, and each boss's signature rule
    evaluation.js     the scoring pipeline: auras, hazards, wards, boss rules
    index.js          assembles the public surface
  run/index.js      the session: acts, map, rewards, shops, labs, saves
  battle/
    index.js          the table: rendering, input, opponent AI, turn flow
    self-test.js      304 checks over the rules and the layout
build/
  split.py                 regenerates this tree from the single-file build
  color-vibes-act1.html    that single-file build
```

The three directories under `src/` are a strict dependency chain: `core` knows
nothing about the others, `run` uses `core`, `battle` uses both. `core` splits
further along its own forward-only chain, so each file only ever imports from
files listed above it.

`run/` and `battle/` are one file each rather than several. Both are built
around shared mutable state that every part of them reassigns — `run` alone is
read 388 times — and an ES module cannot reassign an imported binding, so
splitting them means routing those references through a state holder. That is a
real refactor with real regression risk, and it is not the same change as
"make it shareable". Navigate them by their section banners.

## The single file

`build/color-vibes-act1.html` is the whole game in one file, and it is currently
the source of truth. This tree is generated from it:

```bash
cd build && python3 split.py color-vibes-act1.html ../
```

The splitter is a transformation, not a fork: it finds the three modules by
their own structure, computes each core file's imports from the dependency
graph rather than a hand-written list, lifts the art out of the CSS into real
files, and moves the self-test suite into a file of its own. Nothing is
hand-edited on the way out, so the two forms cannot drift.

**This arrangement is transitional.** Two copies of the same program in one
repository is not a state to stay in — see the note at the bottom.

## Tests

304 checks cover colour rules, board evaluation, the colour gate, saves, map
generation, opponent behaviour and layout invariants. Run them from the in-game
menu, or from the browser console:

```js
CV_BATTLE.selfTest().filter(t => !t.pass)   // [] when everything passes
```

Headlessly, with Playwright:

```js
await page.goto('http://localhost:8000');
await page.evaluate(() => CV_BATTLE.selfTest().filter(t => !t.pass));
```

## Known gaps

- **The layout is phone-first.** It is correct at desktop widths but the board
  sits small in a lot of empty space. Most people opening a shared link will be
  on a laptop.
- **Fonts come from Google Fonts**, so the first paint depends on a third-party
  request. Self-hosting them would remove that dependency.
- **No service worker.** Deliberate for now: a stale cache is the worst thing
  that can happen to a link you are asking people to try.
- **Saves are per-browser.** Clearing site data ends a run.

## Decision still open

The single file and this tree are the same program twice. The single file is
better for one person iterating quickly; the tree is better for everything else
— reviewing a change, replacing one painting, letting anyone else contribute.
Keeping both only makes sense while the split is being proved out. Once it is,
one of them should go, and this tree is the one worth keeping.
