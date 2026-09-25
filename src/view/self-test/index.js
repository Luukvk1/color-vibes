/* The self-test suite: 304 checks covering the rules, board evaluation, the
   colour gate, saves, map generation, AI behaviour and layout invariants. Run
   it from the in-game menu, or from a console with:
     (await ColorVibes.selfTest()).filter(t => !t.pass)
   Under Node, `npm test` runs everything here that needs no page.

   The checks live in topics/, one file per subject, run in the order below. Each
   check is a function run on its own, so one that throws is a failure with a
   reason, not the end of the suite. A topic takes what it works on as a context
   (see ../test-context.js) rather than closing over it.

   selfTest() runs everything; selfTest('save-load') runs one topic. */

import topic1 from './topics/01-board-and-lanes-still-intact.js';
import topic2 from './topics/02-mixing-baseline.js';
import topic3 from './topics/03-relic-stable-fusion.js';
import topic4 from './topics/04-relic-prism-core-first-mix-only.js';
import topic5 from './topics/05-relic-double-rainbow.js';
import topic6 from './topics/06-black-singularity-scales-off-the-chain.js';
import topic7 from './topics/07-black-devourer-takes-the-current-strength.js';
import topic8 from './topics/08-a-targeted-spell-with-nothing-to.js';
import topic9 from './topics/09-a-numeric-mix-hook-must-survive.js';
import topic10 from './topics/10-volatile-fusion-cascades-and-terminates.js';
import topic11 from './topics/11-relic-colour-lens.js';
import topic12 from './topics/12-relic-glass-cannon.js';
import topic13 from './topics/13-relic-empty-palette.js';
import topic14 from './topics/14-relic-heavy-brush-on-placement.js';
import topic15 from './topics/15-relic-black-paint.js';
import topic16 from './topics/16-relic-echo-chamber.js';
import topic17 from './topics/17-relic-chromatic-memory.js';
import topic18 from './topics/18-upgrades.js';
import topic19 from './topics/19-enemy-modifiers.js';
import topic20 from './topics/20-run-structure.js';
import topic21 from './topics/21-act-progression.js';
import topic22 from './topics/22-a-fusion-must-execute-every-effect.js';
import topic23 from './topics/23-save-load.js';
import topic24 from './topics/24-boss-rules.js';
import topic25 from './topics/25-deck-economy-the-run-must-be.js';
import topic26 from './topics/26-the-draw-archetype.js';
import topic27 from './topics/27-boss-trophies-and-reward-quality-over.js';
import topic28 from './topics/28-what-the-player-is-told-about.js';
import topic29 from './topics/29-fixes-that-came-out-of-playtesting.js';
import topic30 from './topics/30-the-opponent-should-not-empty-its.js';
import topic31 from './topics/31-the-opponent-gets-better-as-the.js';
import topic32 from './topics/32-black-is-a-two-secondary-colour.js';
import topic33 from './topics/33-odds-and-ends.js';
import topic34 from './topics/34-the-victory-screen-conquering-every-road.js';
import topic35 from './topics/35-relics-come-from-the-things-worth.js';
import topic36 from './topics/36-a-fusion-keeps-what-its-parents.js';
import topic37 from './topics/37-the-back-rows-are-no-longer.js';
import topic38 from './topics/38-black-ends-the-game-white-is.js';
import topic39 from './topics/39-warding-one-flag-honoured-by-every.js';
import topic40 from './topics/40-the-roads-earned-by-how-a.js';
import topic41 from './topics/41-six-things-a-deck-can-be.js';
import topic42 from './topics/42-build-arounds-each-payoff-must-want.js';
import topic43 from './topics/43-row-minimums-were-the-thing-holding.js';
import topic44 from './topics/44-frontlines-fall-between-rounds-but-only.js';
import topic45 from './topics/45-colour-lab.js';
import topic46 from './topics/46-the-peek-strip-s-click-to.js';
import topic47 from './topics/47-enemy-deck-quality-is-gated-by.js';
import topic48 from './topics/48-volatile-fusion-can-actually-start-a.js';

export var TOPICS = [
  { name: 'board-and-lanes-still-intact', title: "board and lanes still intact", run: topic1 },
  { name: 'mixing-baseline', title: "mixing baseline", run: topic2 },
  { name: 'relic-stable-fusion', title: "relic: Stable Fusion", run: topic3 },
  { name: 'relic-prism-core-first-mix-only', title: "relic: Prism Core, first mix only", run: topic4 },
  { name: 'relic-double-rainbow', title: "relic: Double Rainbow", run: topic5 },
  { name: 'black-singularity-scales-off-the-chain', title: "Black Singularity scales off the chain", run: topic6 },
  { name: 'black-devourer-takes-the-current-strength', title: "Black Devourer takes the CURRENT (aura inclusive) strength, and eats the card for good", run: topic7 },
  { name: 'a-targeted-spell-with-nothing-to', title: "a targeted spell with nothing to target must never auto resolve", run: topic8 },
  { name: 'a-numeric-mix-hook-must-survive', title: "a numeric mix hook must survive fusion as a number, not a function", run: topic9 },
  { name: 'volatile-fusion-cascades-and-terminates', title: "Volatile Fusion cascades and terminates", run: topic10 },
  { name: 'relic-colour-lens', title: "relic: Colour Lens", run: topic11 },
  { name: 'relic-glass-cannon', title: "relic: Glass Cannon", run: topic12 },
  { name: 'relic-empty-palette', title: "relic: Empty Palette", run: topic13 },
  { name: 'relic-heavy-brush-on-placement', title: "relic: Heavy Brush on placement", run: topic14 },
  { name: 'relic-black-paint', title: "relic: Black Paint", run: topic15 },
  { name: 'relic-echo-chamber', title: "relic: Echo Chamber", run: topic16 },
  { name: 'relic-chromatic-memory', title: "relic: Chromatic Memory", run: topic17 },
  { name: 'upgrades', title: "upgrades", run: topic18 },
  { name: 'enemy-modifiers', title: "enemy modifiers", run: topic19 },
  { name: 'run-structure', title: "run structure", run: topic20 },
  { name: 'act-progression', title: "act progression (Act Progression doc, Option 1)", run: topic21 },
  { name: 'a-fusion-must-execute-every-effect', title: "a fusion must execute every effect its text describes", run: topic22 },
  { name: 'save-load', title: "save / load", run: topic23 },
  { name: 'boss-rules', title: "boss rules (each act boss must play differently, not just harder)", run: topic24 },
  { name: 'deck-economy-the-run-must-be', title: "deck economy: the run must be able to shrink, not only grow", run: topic25 },
  { name: 'the-draw-archetype', title: "the draw archetype", run: topic26 },
  { name: 'boss-trophies-and-reward-quality-over', title: "boss trophies and reward quality over a run", run: topic27 },
  { name: 'what-the-player-is-told-about', title: "what the player is told about what they are fighting", run: topic28 },
  { name: 'fixes-that-came-out-of-playtesting', title: "fixes that came out of playtesting", run: topic29 },
  { name: 'the-opponent-should-not-empty-its', title: "the opponent should not empty its hand into a round it has won", run: topic30 },
  { name: 'the-opponent-gets-better-as-the', title: "the opponent gets better as the run goes on", run: topic31 },
  { name: 'black-is-a-two-secondary-colour', title: "Black is a two secondary colour, but mixing is never refused", run: topic32 },
  { name: 'odds-and-ends', title: "odds and ends", run: topic33 },
  { name: 'the-victory-screen-conquering-every-road', title: "the victory screen: conquering every road, and going endless", run: topic34 },
  { name: 'relics-come-from-the-things-worth', title: "relics come from the things worth beating", run: topic35 },
  { name: 'a-fusion-keeps-what-its-parents', title: "a fusion keeps what its parents were", run: topic36 },
  { name: 'the-back-rows-are-no-longer', title: "the back rows are no longer safe", run: topic37 },
  { name: 'black-ends-the-game-white-is', title: "Black ends the game; White is the prize for the long way round", run: topic38 },
  { name: 'warding-one-flag-honoured-by-every', title: "warding: one flag, honoured by every source of harm", run: topic39 },
  { name: 'the-roads-earned-by-how-a', title: "the roads earned by how a run was lived", run: topic40 },
  { name: 'six-things-a-deck-can-be', title: "six things a deck can be built around", run: topic41 },
  { name: 'build-arounds-each-payoff-must-want', title: "build arounds: each payoff must want a different board", run: topic42 },
  { name: 'row-minimums-were-the-thing-holding', title: "row minimums were the thing holding cheap unit archetypes down", run: topic43 },
  { name: 'frontlines-fall-between-rounds-but-only', title: "frontlines fall between rounds, but only where the lane was contested", run: topic44 },
  { name: 'colour-lab', title: "colour lab", run: topic45 },
  { name: 'the-peek-strip-s-click-to', title: "the peek strip's click to expand overlay", run: topic46 },
  { name: 'enemy-deck-quality-is-gated-by', title: "enemy deck quality is gated by depth", run: topic47 },
  { name: 'volatile-fusion-can-actually-start-a', title: "Volatile Fusion can actually start a chain", run: topic48 }
];

export function createSelfTest(ctx) {
  var C = ctx.C, CARDS = ctx.CARDS;
  return function selfTest(only) {
    var out = [], topicName = null;
    function check(name, run, detail) {
      var pass = false, note = '', threw = null;
      try { pass = run(); note = detail ? detail() : ''; }
      catch (error) { threw = error; note = 'threw: ' + error.message; }
      out.push({ name: name, topic: topicName, pass: !!pass && !threw, detail: note || '', threw: threw ? String(threw.message) : null });
    }
    function fresh(relics) {
      return { board: C.emptyBoard(), hazards: C.emptyHazards(),
        hands: { bottom: [], top: [] }, decks: { bottom: [], top: [] },
        relics: relics || [], mixChain: 0, chains: { bottom: 0, top: 0 },
        mixesThisRound: 0, freeMixesThisRound: 0, cascadeDepth: 0 };
    }
    function put(battleState, side, row, index, cardId, strength, color) {
      var cardDef = CARDS[cardId];
      battleState.board[side][row][index] = { cardId: cardId, color: color || cardDef.color, strength: strength || cardDef.strength, temp: 0, cracked: 0 };
    }
    var t = { ctx: ctx, check: check, fresh: fresh, put: put };
    TOPICS.forEach(function (topic) {
      if (only && only !== topic.name) return;
      topicName = topic.name;
      topic.run(t);
    });
    return out;
  };
}
