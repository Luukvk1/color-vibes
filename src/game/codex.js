/* The codex: what the player has actually met.

   Kept apart from the run on purpose: a run ends, is abandoned, or is wiped,
   and none of that should erase what you learned. It survives across runs,
   which is what makes the glossary worth opening on a fresh start.

   The codex is state like any other; getting it onto disk is the session's job,
   and it arrives here at startup through loadCodex(). */

import C from './rules/index.js';

var CARDS = C.CARDS, ENEMIES = C.ENEMIES;

/* Mutated in place, never reassigned, so a reference held before loadCodex()
   runs stays live after it. `omens` records the roads that have announced
   themselves; see noteActOmens. */
export var codex = { cards: {}, foes: {}, omens: {}, decks: {} };

export function loadCodex(saved) {
  if (!saved || !saved.cards || !saved.foes) return;
  codex.cards = saved.cards; codex.foes = saved.foes;
  codex.omens = saved.omens || {};
  codex.decks = saved.decks || {};
}
export function discoverCard(id) {
  if (!id || codex.cards[id]) return;
  var cardDef = CARDS[id];
  if (!cardDef || cardDef.fused || cardDef.reforged) return;   // minted cards are not codex entries
  codex.cards[id] = 1;
}
export function discoverFoe(key) {
  if (!key || codex.foes[key]) return;
  codex.foes[key] = 1;
}
export function codexCounts() {
  var totalCards = C.DRAWABLE.length + C.BOSS_CARDS.length + C.CURSE_KEYS.length;
  var foeKeys = Object.keys(ENEMIES);
  return {
    cards: Object.keys(codex.cards).length, cardsTotal: totalCards,
    foes: Object.keys(codex.foes).length, foesTotal: foeKeys.length
  };
}
