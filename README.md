# Colour Vibes — The Long Road

A roguelite deckbuilder about mixing colours. Battles are best-of-three on a
shared triangular board; colours beat other colours; two cards can be mixed into
the colour they make, and mixing is where most of the game's ceiling lives.

[**Play it:**](https://Luukvk1.github.io/color-vibes/)

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

`.nojekyll` is in the root on purpose: without it, Pages runs the repo through
Jekyll, which silently drops any path beginning with an underscore.

## Building for production

```bash
npm install
npm run build
```

This bundles and minifies `src/` with [esbuild](https://esbuild.github.io/)
into `build/` (gitignored — nothing under it is committed). Pushing to `main`
runs the same build in CI and deploys `build/` to GitHub Pages automatically;
see `.github/workflows/deploy.yml`. Node version is pinned in `.nvmrc`.

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
build.js            the esbuild bundler script (see "Building for production")
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

## Tests

304 checks cover colour rules, board evaluation, the colour gate, saves, map
generation, opponent behaviour and layout invariants. Run them from the in-game
menu, or from the browser console:

```js
(await CV_BATTLE.selfTest()).filter(t => !t.pass)   // [] when everything passes
```

It returns a promise because the suite is fetched on demand — it is 44KB
gzipped that no player ever runs, so it is not part of the page's payload.

Headlessly, with Playwright:

```js
await page.goto('http://localhost:8000');
await page.evaluate(async () => (await CV_BATTLE.selfTest()).filter(t => !t.pass));
```

Five of the 304 begin `if (!s) return true` and skip unless a battle is open,
which means they do not run from a cold page. Start a run and enter a fight
before running the suite if you want the opponent-AI and hand-pricing checks to
mean anything.

## Known gaps

- **The layout is phone-first.** It is correct at desktop widths but the board
  sits small in a lot of empty space. Most people opening a shared link will be
  on a laptop.
- **Fonts come from Google Fonts**, so the first paint depends on a third-party
  request. Self-hosting them would remove that dependency.
- **No service worker.** Deliberate for now: a stale cache is the worst thing
  that can happen to a link you are asking people to try.
- **Saves are per-browser.** Clearing site data ends a run.
