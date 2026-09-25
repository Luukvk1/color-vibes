/* The colour lab: steady improvements, and the Volatile Lab's press-your-luck
   machine where every pull compounds the payoff and the odds of a curse. */

import C from '../rules/index.js';
import { act, store } from '../store.js';
import { advance, gainCurse } from './flow.js';
import { fuseInDeck, liftStrength, recolourCard } from './mints.js';

var CARDS = C.CARDS;

/* ---------------- colour lab ----------------
   Entering the lab rolls one of three scenarios. Two are steady, deliberate
   improvements; the third is the Volatile Lab, a press-your-luck machine where
   every pull compounds both the payoff and the odds of walking out cursed. */
/* The Volatile Lab is its own place on the map now, so the ordinary lab offers
   only the two steady improvements. */
export var LAB_SCENARIOS = [
  { key: 'fuse', weight: 45 },
  { key: 'boost', weight: 55 }
];

export function rollLab() {
  var total = 0;
  LAB_SCENARIOS.forEach(function (scenario) { total += scenario.weight; });
  var roll = store.rnd() * total, key = 'boost';
  for (var i = 0; i < LAB_SCENARIOS.length; i++) {
    roll -= LAB_SCENARIOS[i].weight;
    if (roll <= 0) { key = LAB_SCENARIOS[i].key; break; }
  }
  store.run.lab = { kind: key, picks: [], presses: 0, results: [], done: false, curses: 0 };
}

export function deckUnits() {
  return store.run.deck.map(function (entry, index) { return { entry: entry, index: index }; })
    .filter(function (unit) { return CARDS[unit.entry.id].type === 'unit'; });
}

function randomUnitIndex() {
  var units = deckUnits();
  return units.length ? units[Math.floor(store.rnd() * units.length)].index : -1;
}

export var toggleLabPick = act(function toggleLabPick(index) {
  var lab = store.run.lab, at = lab.picks.indexOf(index);
  if (at !== -1) lab.picks.splice(at, 1);
  else if (lab.picks.length < 2) lab.picks.push(index);
});

export var confirmFusion = act(function confirmFusion() {
  var lab = store.run.lab;
  if (lab.done || lab.picks.length !== 2) return;
  lab.done = true;
  var hi = Math.max(lab.picks[0], lab.picks[1]), lo = Math.min(lab.picks[0], lab.picks[1]);
  var fused = fuseInDeck(store.run.deck[lo], store.run.deck[hi]);
  store.run.deck.splice(hi, 1); store.run.deck.splice(lo, 1);
  store.run.deck.push(fused);
  advance();
});

export var boostUnit = act(function boostUnit(index) {
  var lab = store.run.lab;
  if (lab.done) return;
  var amount = store.rnd() < 0.65 ? 1 : 2;
  store.run.deck[index] = liftStrength(store.run.deck[index], amount);
  lab.done = true; lab.target = index; lab.amount = amount;
});

/* --- the volatile lab --- */
var VOLATILE_EFFECTS = ['boost', 'recolor', 'fuse'];

/* Which colours a random recolour is allowed to land on.

   The volatile bench used to roll across all seven, Black included, which
   quietly made it the fastest route to the last act: three lucky presses in
   act one and the Wastelands were nearly open, with no mixing done at all.
   That is the colour wheel being bypassed rather than climbed \u2014 the whole
   point of the gate is that Black is Red and Green and Blue, earned two
   fusions at a time.

   So a recolour can only reach a colour you could already have made: the
   primaries, plus any secondary whose two parents are both in your deck. It
   can never mint Black. Black stays something you build. */
export function recolourPalette() {
  var held = C.colourCounts(store.run.deck), palette = C.PRIMARY_COLORS.slice();
  var PARENTS = { yellow: ['red', 'green'], cyan: ['green', 'blue'], magenta: ['red', 'blue'] };
  Object.keys(PARENTS).forEach(function (colorKey) {
    if (held[colorKey] > 0 || PARENTS[colorKey].every(function (parentColor) { return held[parentColor] > 0; })) palette.push(colorKey);
  });
  return palette;
}

export function curseRisk(presses) { return Math.min(0.75, 0.06 + presses * 0.06); }

export function applyVolatile(kind) {
  var index, otherIndex;
  if (kind === 'boost') {
    index = randomUnitIndex();
    if (index < 0) return null;
    var before = C.cardName(store.run.deck[index]);
    store.run.deck[index] = liftStrength(store.run.deck[index], 1);
    return before + ' grows to ' + C.cardStrength(store.run.deck[index]);
  }
  if (kind === 'recolor') {
    index = randomUnitIndex();
    if (index < 0) return null;
    var palette = recolourPalette();
    var col = palette[Math.floor(store.rnd() * palette.length)];
    var was = C.colorInfo(CARDS[store.run.deck[index].id].color).name;
    store.run.deck[index] = recolourCard(store.run.deck[index], col);
    return C.cardName(store.run.deck[index]) + ' turns ' + was + ' \u2192 ' + C.COLORS[col].name;
  }
  if (kind === 'fuse') {
    var units = deckUnits();
    // Curses inflate deck length, so guard on playable units instead: fusing
    // down to a two-card deck padded with curses is not a payoff, it is a brick.
    if (units.length < 5) return null;   // never fuse below four playable units
    /* Every pairing is legal now — mixing is never refused, only redirected —
       so the bench is free to pick any two units exactly as mixing on the
       board can. A secondary landing on the wrong primary here just comes
       back as that secondary, stronger, the same as it would in battle. */
    index = units[Math.floor(store.rnd() * units.length)].index;
    do { otherIndex = units[Math.floor(store.rnd() * units.length)].index; } while (otherIndex === index && units.length > 1);
    if (index === otherIndex) return null;
    var hi = Math.max(index, otherIndex), lo = Math.min(index, otherIndex);
    var nameA = C.cardName(store.run.deck[lo]), nameB = C.cardName(store.run.deck[hi]);
    var fused = fuseInDeck(store.run.deck[lo], store.run.deck[hi]);
    store.run.deck.splice(hi, 1); store.run.deck.splice(lo, 1);
    store.run.deck.push(fused);
    return nameA + ' and ' + nameB + ' collapse into ' + CARDS[fused.id].name + ' ' + CARDS[fused.id].strength;
  }
  return null;
}

export var volatilePress = act(function volatilePress() {
  var lab = store.run.lab;
  lab.presses++;

  if (store.rnd() < curseRisk(lab.presses - 1)) {
    var held = {};
    store.run.deck.forEach(function (entry) { if (CARDS[entry.id].curse) held[entry.id] = true; });
    var fresh = C.CURSE_KEYS.filter(function (key) { return !held[key]; });
    var pool = fresh.length ? fresh : C.CURSE_KEYS;
    var curseKey = pool[Math.floor(store.rnd() * pool.length)];
    gainCurse(curseKey);
    lab.curses++;
    lab.results.unshift({ tone: 'curse', curse: { name: CARDS[curseKey].name, text: CARDS[curseKey].text } });
    return;
  }

  var effectRoll = store.rnd(), count = 1, tone = 'ok';
  if (effectRoll > 0.988) {                       // the whole bench goes up
    cascade(lab);
    return;
  }
  if (effectRoll > 0.86) { count = 3; tone = 'big'; }
  else if (effectRoll > 0.62) { count = 2; tone = 'good'; }

  var lines = [], tries = 0;
  while (lines.length < count && tries++ < 12) {
    var effectResult = applyVolatile(VOLATILE_EFFECTS[Math.floor(store.rnd() * VOLATILE_EFFECTS.length)]);
    if (effectResult) lines.push(effectResult);
  }
  if (!lines.length) lines.push('The mixture fizzles. Nothing changes.');
  lab.results.unshift({ tone: tone, lines: lines, multiple: count > 1 });
});

function cascade(lab) {
  var touched = 0;
  // everything you own, all at once
  for (var index = 0; index < store.run.deck.length; index++) {
    if (CARDS[store.run.deck[index].id].type !== 'unit') continue;
    store.run.deck[index] = liftStrength(store.run.deck[index], 1);
    var palette = recolourPalette();
    store.run.deck[index] = recolourCard(store.run.deck[index], palette[Math.floor(store.rnd() * palette.length)]);
    touched++;
  }
  var fusions = 0;
  for (var attempt = 0; attempt < 2; attempt++) { if (applyVolatile('fuse')) fusions++; }
  lab.results.unshift({ tone: 'cascade', touched: touched, fusions: fusions });
}
