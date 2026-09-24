/* Card catalogue helpers: which cards exist for which purpose, how a card
   entry reads (strength, name), and how two of them fuse. */

import { COLORS, mixResultColor } from './colors.js';
import { CARDS } from './cards.js';

export var HAZARD_TEXT = { colorless: 'Colourless Row — no colour in this row', scorch: 'Scorched Row — 1 weaker in this row' };
/* bossOnly and secretOnly cards are excluded here, which keeps them out of
   rewards, shops, enemy decks and every random roll at once \u2014 DRAWABLE is
   the single source for all of them. The boss reward, and the secret-act
   trophy reward, each reach past it deliberately. */
export var DRAWABLE = Object.keys(CARDS).filter(function (cardId) {
  return !CARDS[cardId].token && !CARDS[cardId].curse && !CARDS[cardId].bossOnly && !CARDS[cardId].secretOnly;
});
export var BOSS_CARDS = Object.keys(CARDS).filter(function (cardId) { return CARDS[cardId].bossOnly; });
/* One road, one set of three — never rolled, never shared with the ordinary
   seven. Keyed by act so the reward code can look a road up directly rather
   than filtering the whole card table on every visit. */
export var SECRET_TROPHIES = {
  white: ['white_prism_crown', 'white_absolute_zero', 'white_last_verdict'],
  rot: ['rot_reliquary', 'rot_plague_herald', 'rot_undying_choir'],
  rift: ['rift_keystone', 'rift_bridgewalker', 'rift_the_widening']
};
export var CURSE_KEYS = Object.keys(CARDS).filter(function (cardId) { return CARDS[cardId].curse; });
export function cardsOfRarity(rarity) { return DRAWABLE.filter(function (cardId) { return CARDS[cardId].rarity === rarity; }); }

/* An upgraded card is +1 strength (units) or costs nothing extra (spells). */
export function cardStrength(entry) {
  var cardDef = CARDS[entry.id];
  return cardDef.strength + (entry.up && cardDef.type === 'unit' ? 1 : 0);
}
export function cardName(entry) { return CARDS[entry.id].name + (entry.up ? '+' : ''); }

export var cardSeq = 0;
/* deckIndex ties a battle-instance card back to its exact slot in the
   persistent run.deck, so a permanent on-play buff can be written back to
   the run rather than just the disposable board copy. Only meaningful for
   the player's own run-sourced cards — tokens, test-harness cards, and
   the enemy's freshly-built deck all leave it undefined, which is exactly
   right: there's nothing in a persistent deck for them to write back to. */
export function makeCard(id, up, deckIndex) { return { uid: 'u' + (++cardSeq), id: id, up: !!up, deckIndex: deckIndex }; }

/* A permanent fusion mints a brand new card definition at runtime. It follows
   the same maths as mixing on the board — components combine, strengths add
   plus one, plus two if Black is involved — and, like a mixed unit, it carries
   no rules text. Registered outside DRAWABLE so it can never turn up in a shop. */
export var fusionSeq = 0;
/* ---- what a fusion inherits ----
   A fused card used to be silenced: pure numbers, no rules. That made fusing
   a stat-upgrade button rather than a build decision, and it is the whole
   reason a run collapsed toward the same pile of enormous Black Amalgams.
   Whatever you started as, fusing erased it.

   Now a fusion carries its parents' rules forward, so identity compounds down
   a chain instead of burning off at the first bench.

   Three effects is the ceiling. Past that a random one is dropped to make
   room, which keeps a long fusion chain from being strictly additive: late
   fusions are a trade, and which rule you lose is not yours to choose. */
export var FUSED_EFFECT_CAP = 3;

/* Hooks an inherited effect can carry. onPlay/targets are handled separately
   because they drive the targeting UI and cannot meaningfully run three times
   over; only the first inherited one is kept. */
export var INHERITED_HOOKS = ['passive', 'aura', 'rowAura', 'enemyAura', 'matchup',
                       'onMixConsumed', 'onMixConsumedChain', 'onFriendlyMix',
                       'fissure', 'mixBonus', 'guardsColour', 'drawsEachRound',
                       'swarmAura', 'enemyFieldAura', 'warded', 'wardsAdjacent',
                       'wardsWhenAlone', 'wardsRowWhenFront', 'wardsRow',
                       'wardsSelfWhenFront'];
/* Data-shaped effects, inherited by merging rather than by composing calls. */
export var INHERITED_DATA = ['enemyRowAura'];

export function hasAnyHook(cardDef) {
  if (!cardDef) return false;
  if (cardDef.onPlay || cardDef.targets) return true;
  return INHERITED_HOOKS.concat(INHERITED_DATA).some(function (hook) { return cardDef[hook] !== undefined; });
}
/* The effect ids a card brings to a fusion: its own inherited list if it is
   already a fusion, otherwise itself when it actually does something. */
export function effectSourcesOf(cardId) {
  var cardDef = CARDS[cardId];
  if (!cardDef) return [];
  if (cardDef.effectSources) return cardDef.effectSources.slice();
  return hasAnyHook(cardDef) ? [cardId] : [];
}

/* Compose inherited hooks onto a fused definition: numeric hooks sum, flags
   OR together, onPlay/targets take the first carrier. */
export function applyInheritedEffects(def, sources) {
  var sourceDefs = sources.map(function (cardId) { return CARDS[cardId]; }).filter(Boolean);
  /* Three shapes of hook, and mixing them up produces silent nonsense: a
     numeric one wrapped as a function ends up added to a strength as NaN, and
     a boolean flag turned into a function is always truthy. They are listed
     explicitly rather than inferred, so adding a hook forces the author to
     say which kind it is. */
  var FLAG_HOOKS = { guardsColour: 1, warded: 1, wardsAdjacent: 1, wardsWhenAlone: 1,
                     wardsRowWhenFront: 1, wardsRow: 1, wardsSelfWhenFront: 1,
                     enemyFieldAura: 1 };
  var NUMBER_HOOKS = { mixBonus: 1, drawsEachRound: 1, swarmAura: 1,
                        onMixConsumed: 1, onMixConsumedChain: 1 };
  INHERITED_HOOKS.forEach(function (hook) {
    var carriers = sourceDefs.filter(function (sourceDef) { return sourceDef[hook] !== undefined; });
    if (!carriers.length) return;
    if (FLAG_HOOKS[hook]) {
      def[hook] = carriers.some(function (sourceDef) { return sourceDef[hook]; });
      return;
    }
    if (NUMBER_HOOKS[hook]) {
      def[hook] = carriers.reduce(function (sum, sourceDef) { return sum + (sourceDef[hook] || 0); }, 0);
      return;
    }
    def[hook] = function () {
      var args = arguments, total = 0;
      carriers.forEach(function (sourceDef) {
        if (typeof sourceDef[hook] === 'function') total += sourceDef[hook].apply(null, args) || 0;
      });
      return total;
    };
  });
  INHERITED_DATA.forEach(function (hook) {
    var carriers = sourceDefs.filter(function (sourceDef) { return sourceDef[hook]; });
    if (!carriers.length) return;
    // same row: amounts add. Different rows: the first one wins.
    var first = carriers[0][hook];
    var total = carriers.reduce(function (sum, sourceDef) {
      return sourceDef[hook].row === first.row ? sum + (sourceDef[hook].amount || 0) : sum;
    }, 0);
    def[hook] = { row: first.row, amount: total };
  });
  /* onPlay and targets compose too, and this is the one place the old code
     actually dropped an effect rather than merely under-describing it: it
     kept only the FIRST carrier with onPlay and discarded the rest, while
     `text` above already joins every source's line unconditionally. So a
     fusion of Blue Scout (draw a card) and Black Maw (damage a frontline)
     printed both sentences but only ever drew the card — the damage had no
     path left to run.

     The targeting UI already treats `targets` as one flat list: it prompts
     through `list[picks.length]` and hands the whole resolved `targets`
     array to a single `onPlay` call, with no idea how many specs belong to
     which effect. So the fix is to make that one call actually be many:
     concatenate every carrier's own targets in order, and close over how
     many entries each one owns so the composed onPlay can slice the
     resolved picks back apart and call each carrier with its own share. A
     carrier that takes no targets (like the draw) simply gets an empty
     slice, exactly as it would if played alone. */
  var acting = sourceDefs.filter(function (sourceDef) { return typeof sourceDef.onPlay === 'function'; });
  if (acting.length) {
    var mergedTargets = [];
    var shares = acting.map(function (sourceDef) {
      /* A spec's `ref` (e.g. "an empty tile touching the unit from step 0")
         is authored as an index into that CARD's own targets array. Simply
         concatenating arrays leaves those indices pointing at whatever
         landed in that slot globally, which is only correct by accident —
         put a second carrier ahead of this one and `ref: 0` now names a
         completely different card's pick. Offsetting by how many target
         slots the merge has already used keeps every ref pointing at the
         same pick it meant before the fusion existed. */
      var offset = mergedTargets.length;
      var ownTargets = (sourceDef.targets || []).map(function (spec) {
        return spec.ref === undefined ? spec : Object.assign({}, spec, { ref: spec.ref + offset });
      });
      mergedTargets = mergedTargets.concat(ownTargets);
      return { onPlay: sourceDef.onPlay, count: ownTargets.length };
    });
    if (mergedTargets.length) def.targets = mergedTargets;
    def.onPlay = function (battleState, side, at, targets, api) {
      var picks = targets || [], pickIndex = 0, notes = [];
      shares.forEach(function (share) {
        var slice = picks.slice(pickIndex, pickIndex + share.count);
        pickIndex += share.count;
        var note = share.onPlay(battleState, side, at, slice, api);
        if (note) notes.push(note);
      });
      return notes.join('; ');
    };
  }
  return def;
}

/* `forced` replays an exact effect list from a save. Once the cap starts
   biting a fusion is no longer deterministic, so the chosen list has to be
   recorded rather than recomputed on load. `random` is where the cap's dice
   come from — the run passes its own, so a seeded game fuses the same way
   every time. */
export function fuseCards(cardEntryA, cardEntryB, forced, random) {
  var cardDefA = CARDS[cardEntryA.id], cardDefB = CARDS[cardEntryB.id];
  var color = mixResultColor(cardDefA.color, cardDefB.color) || 'red';
  var bonus = (cardDefA.color === 'black' || cardDefB.color === 'black') ? 2 : 1;
  var strength = cardStrength(cardEntryA) + cardStrength(cardEntryB) + bonus;
  var id = 'fusion_' + (++fusionSeq);

  var sources;
  if (forced) sources = forced.slice();
  else {
    sources = effectSourcesOf(cardEntryA.id).concat(effectSourcesOf(cardEntryB.id));
    while (sources.length > FUSED_EFFECT_CAP) {
      sources.splice(Math.floor((random || Math.random)() * sources.length), 1);
    }
  }

  var lines = sources.map(function (cardId) { return CARDS[cardId] && CARDS[cardId].text; }).filter(Boolean);
  var def = {
    name: COLORS[color].name + ' Amalgam', color: color, strength: strength,
    rarity: 'Fused', type: 'unit', cost: 40 + strength * 8, fused: true,
    effectSources: sources.slice(),
    text: lines.length ? lines.join(' ')
      : 'Fused from ' + cardDefA.name + ' and ' + cardDefB.name + '. No rules text.'
  };
  /* Only a fusion that inherited nothing stays silenced. One carrying rules is
     a real card and should be liftable by auras like any other — the silencing
     existed to justify free stats, and the stats are no longer free of
     anything. */
  if (!sources.length) def.silenced = true;
  CARDS[id] = applyInheritedEffects(def, sources);
  return { id: id, up: false, effectSources: sources.slice() };
}
export function fusePreview(cardEntryA, cardEntryB) {
  var cardDefA = CARDS[cardEntryA.id], cardDefB = CARDS[cardEntryB.id];
  var color = mixResultColor(cardDefA.color, cardDefB.color) || 'red';
  var bonus = (cardDefA.color === 'black' || cardDefB.color === 'black') ? 2 : 1;
  return { color: color, strength: cardStrength(cardEntryA) + cardStrength(cardEntryB) + bonus, bonus: bonus };
}
