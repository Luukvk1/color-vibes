/* Permanent strength and colour changes need a card of their own, since the
   printed value lives in the card database rather than on the deck entry.

   Every one of these is minted at runtime, which makes it invisible to a save
   file: a deck entry pointing at `lifted_4` is a dangling reference the moment
   the page reloads. So each mint also writes a recipe into run.minted, and
   loading a save replays those recipes in order to rebuild the definitions
   before the deck is read. */

import C from '../rules/index.js';
import { store } from '../store.js';

var CARDS = C.CARDS;

/* Permanent strength and colour changes need a card of their own, since the
   printed value lives in the card database rather than on the deck entry.

   Every one of these is minted at runtime, which makes it invisible to a save
   file: a deck entry pointing at `lifted_4` is a dangling reference the moment
   the page reloads. So each mint also writes a recipe into run.minted, and
   loading a save replays those recipes in order to rebuild the definitions
   before the deck is read. Recipes, not definitions, because a definition
   carries live functions and would not survive JSON.

   The strength lift copies with Object.assign rather than naming fields one
   at a time. The old field list quietly dropped anything it did not mention —
   reinforcing a fused card threw away its `fused` and `silenced` flags, so a
   silenced Amalgam came off the bench newly open to auras. */
var liftSeq = 0;

function mintId() { return 'lifted_' + (++liftSeq); }

function recordMint(recipe) {
  if (store.run && store.run.minted) store.run.minted.push(recipe);
}

function applyLift(id, fromId, up, amount) {
  var cardDef = CARDS[fromId];
  if (!cardDef || cardDef.type !== 'unit') return null;
  CARDS[id] = Object.assign({}, cardDef, {
    strength: C.cardStrength({ id: fromId, up: up }) + amount,
    cost: (cardDef.cost || 30) + amount * 10,
    reforged: true
  });
  return id;
}

function applyRecolour(id, fromId, up, color) {
  var cardDef = CARDS[fromId];
  if (!cardDef || cardDef.type !== 'unit') return null;
  CARDS[id] = Object.assign({}, cardDef, {
    color: color, strength: C.cardStrength({ id: fromId, up: up }), reforged: true
  });
  return id;
}

export function liftStrength(entry, amount) {
  if (CARDS[entry.id].type !== 'unit') return entry;
  var id = mintId();
  if (!applyLift(id, entry.id, entry.up, amount)) return entry;
  recordMint({ k: 'lift', id: id, from: entry.id, up: !!entry.up, amount: amount });
  return { id: id, up: false };
}

export function recolourCard(entry, color) {
  if (CARDS[entry.id].type !== 'unit') return entry;
  var id = mintId();
  if (!applyRecolour(id, entry.id, entry.up, color)) return entry;
  recordMint({ k: 'recolour', id: id, from: entry.id, up: !!entry.up, color: color });
  return { id: id, up: false };
}

/* The Lab's permanent fusion mints too, so it needs the same ledger entry. */
export function fuseInDeck(entryA, entryB) {
  var fused = C.fuseCards(entryA, entryB, undefined, store.rnd);
  /* The inherited effect list is recorded, not recomputed. Once a fusion
     carries more than three effects the surplus is dropped at random, so
     replaying the same two parents on load would roll a different card than
     the one the player is actually holding. */
  recordMint({ k: 'fuse', id: fused.id, a: entryA.id, aUp: !!entryA.up, b: entryB.id, bUp: !!entryB.up,
               eff: (fused.effectSources || []).slice() });
  return fused;
}

/* Replay a ledger onto CARDS. Order matters: a lift can be built on a recolour
   which was built on a fusion, so recipes are applied exactly as recorded. */
export function replayMints(ledger) {
  var highest = 0, highestFusion = 0;
  (ledger || []).forEach(function (mint) {
    if (mint.k === 'lift') applyLift(mint.id, mint.from, mint.up, mint.amount);
    else if (mint.k === 'recolour') applyRecolour(mint.id, mint.from, mint.up, mint.color);
    else if (mint.k === 'fuse') {
      var made = C.fuseCards({ id: mint.a, up: mint.aUp }, { id: mint.b, up: mint.bUp }, mint.eff);
      CARDS[mint.id] = CARDS[made.id];          // re-key onto the id the deck remembers
      var fusionNum = +String(made.id).split('_')[1];
      if (fusionNum > highestFusion) highestFusion = fusionNum;
    }
    var mintNum = +String(mint.id).split('_')[1];
    if (mint.k !== 'fuse' && mintNum > highest) highest = mintNum;
  });
  if (highest > liftSeq) liftSeq = highest;
}
