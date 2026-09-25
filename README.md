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
index.html            the page: markup only, loads one module
styles/game.css       every style
assets/art/           the ten act paintings, one file each
src/
  main.js             entry point: loads the session, starts the game, wires the view
  game/               the rules and everything the player decides — no DOM, no storage
    index.js            the game's whole public surface
    store.js            the state holder, the 'change' event and the act() wrapper
    codex.js            what the player has met
    tutorial.js         when a lesson is worth teaching
    rules/              pure data and functions
      colors.js           colour identity and the mixing wheel
      board-shape.js      the eighteen tiles: adjacency, lanes, coordinates
      primitives.js       board reads, placement legality, card instances
      cards.js            every card, with its hooks
      deck.js             the card catalogue: what can drop where, fusion
      relics.js           run-long modifiers
      enemies.js          enemies, bosses, and each boss's signature rule
      evaluation.js       the scoring pipeline: auras, hazards, wards, boss rules
      index.js            assembles the rules
    content/acts.js     the acts: every road is a colour
    run/                what happens between battles
      map.js              map generation and its guarantees
      flow.js             starting, resuming, walking the map, finishing acts
      rewards.js  shop.js  lab.js  events.js  mints.js
    battle/             the table itself
      setup.js            starting a battle
      engine.js           mixing, drawing, and the api card rules are written against
      targeting.js        what a card may ask for, and resolving it
      rewind.js           Rewind and the fissures it leaves behind
      ai.js               how the opponent weighs a move
      turns.js            playing, mixing, passing, closing a round
  session/index.js    localStorage only
  view/               what the player sees and touches
    index.js            listens to the game and redraws
    menu.js             title screen, menus, keyboard, every button wired to an action
    screens/            map, acts, reward, shop, lab, event, glossary, run bar
    battle/             board, hand, panels, inspector, layout, round results
    tutorial.js  icons.js  content.js  dom.js
    self-test/          304 checks over the rules and the layout, one file per subject
tests/                headless tests (npm test)
tools/                the balance simulation (npm run balance)
build.js              the esbuild bundler script (see "Building for production")
```

The folders under `src/` point one way. `game` imports nothing outside itself and
touches no browser API, so it can be played to the end in Node. `session` reads
and writes storage and knows nothing about the game. `view` imports `game`
(only through `game/index.js`) and never `session`. `main.js` is the one place
they meet: it loads what the session saved, hands it to the game, and from then
on writes the game's snapshot back whenever the game reports a change. The
boundaries are checked by `tests/architecture.test.js`.

The game reports rather than draws: every change to the game is an action that
announces once when it has finished, and one-off happenings (a log line, an
effect on a tile, a toast) are events. The view subscribes and redraws from
state; a tap calls an action and nothing else.

## Tests

`npm test` runs headlessly under Node — no browser, under half a minute:

- **Whole games.** A bot plays seeded runs through the game's public surface, the
  same calls the view makes. The same seed must play the same run; every screen of
  every run must respect the rules; a snapshot must always restore. The outcome of
  each seed is pinned in `tests/golden/runs.json`, so a change that alters how
  games go shows up as a diff. If that was the point, regenerate with
  `UPDATE_GOLDEN=1 npm test` and review the diff like any other change.
- **Scenarios** (`tests/scenarios.test.js`). Particular situations set up on a
  real battle and played with real actions: rewind, the Wild Palette, mix chains,
  each boss's signature rule, best-of-three, the secret roads.
- **Balance sanity** (`tests/balance.test.js`). Wide bands on how bots fare, so a
  change that breaks balance outright fails. Loose on purpose; see below for the
  real picture.
- **The boundaries** between `game/`, `session/` and `view/`.
- **The 304 self-test checks**, one group per subject, the ones that need no page
  (287 of them). Each subject starts from a fresh game.

## Balance

```
npm run balance                        a report for the current code
npm run balance -- --save              ...and keep it as the baseline
npm run balance -- --compare           ...and show what moved since the baseline
npm run balance -- --runs 400 --skills careful
```

Bots of two skill levels (`tests/support/bots.js`) play many seeded runs in
parallel: *naive* takes the first of everything, *careful* builds a deck on
purpose, shops, cuts curses, fuses toward new colours and rewinds bad exchanges.
Each is sampled at three lives (how far a player gets) and at forty (many late
fights). The report gives acts cleared, win rate per enemy and per stage of the
run, what kills runs, and which cards and relics show up in winning decks.

`--compare` lists only what moved by more than noise would explain, so read it as
a signal rather than a diff: changing one number changes every run after it. The
per-card figures are biased — strong runs hold more of everything — so treat them
as a place to look, not a verdict. The baseline is `tools/balance-baseline.json`;
commit a new one when a balance change is intended.

The same 304 run in the browser too — the in-game menu, or from the console:

```js
(await ColorVibes.selfTest()).filter(t => !t.pass)   // [] when everything passes
```

It returns a promise because the suite is fetched on demand — it is code no player
ever runs, so it is not part of the page's payload. The seventeen checks that read
layout or the DOM only pass there. `ColorVibes.selfTest('save-load')` runs one subject. The suite saves through a sandboxed storage
key, so running it cannot touch a real save. Headlessly, with Playwright:

```js
await page.goto('http://localhost:8000');
await page.evaluate(async () => (await ColorVibes.selfTest()).filter(t => !t.pass));
```

Five of the checks begin `if (!s) return true` and skip unless a battle is open,
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
