/* Rewind, and the debt it runs up.
   The player never sees a number here. They take back a bad exchange, the
   board quietly writes it down, and some later Rewind is the one that
   finally cracks something. Debt, not currency. */

import C from '../rules/index.js';
import { act, emit, getActiveRun, getBattleState, store } from '../store.js';
import { evalCtx } from './engine.js';
import { addLog } from './setup.js';

var ENEMY = C.ENEMY;
var PLAYER = C.PLAYER;
var evaluateBoard = C.evaluateBoard;
var slotName = C.slotName;

/* ===================================================================
   REWIND AND BOARD INSTABILITY
   The player never sees a number here. They take back a bad exchange, the
   board quietly writes it down, and some later Rewind is the one that
   finally cracks something. Debt, not currency.
   =================================================================== */
export var REWIND = {
  BASE_CHUNK: 5,      // what the very first Rewind costs, at neutral impact
  GROWTH: 1.45,       // per lifetime use — never resets, not even on overflow
  THRESHOLD: 100,     // meter crosses this and the board tears
  MAX_IMPACT: 3       // ceiling on the "how big was that" multiplier
};

/* How much of an exchange was actually taken back. Calibrated so an ordinary
   exchange — one card each way, nothing dying — scores about 1.0, which is the
   figure the growth curve above is tuned against. Taking back a pass costs
   roughly half that; unwinding a mix that killed something and swung the score
   costs two or three times it. Measured in play: mean 1.05, range 0.5 to 2.6. */
export function rewindImpact(snap, now, evaluationBefore, evaluationAfter) {
  var impact = 0.5;
  var cardsPlayed = (snap.handCount.bottom - now.hands[PLAYER].length) +
                    (snap.handCount.top - now.hands[ENEMY].length);
  impact += 0.2 * Math.max(0, cardsPlayed);
  if (snap.mixesThisRound !== (now.mixesThisRound || 0)) impact += 0.35;
  var unitsBefore = evaluationBefore.units.bottom + evaluationBefore.units.top;
  var unitsAfter = evaluationAfter.units.bottom + evaluationAfter.units.top;
  if (unitsAfter < unitsBefore) impact += 0.35 * (unitsBefore - unitsAfter);
  var swingBefore = evaluationBefore.totals.bottom - evaluationBefore.totals.top;
  var swingAfter = evaluationAfter.totals.bottom - evaluationAfter.totals.top;
  impact += Math.min(0.9, Math.abs(swingAfter - swingBefore) / 16);
  return Math.min(REWIND.MAX_IMPACT, impact);
}

export function rewindChunk(runState, impact) {
  return REWIND.BASE_CHUNK * Math.pow(REWIND.GROWTH, runState.rewindsUsed || 0) * impact;
}

/* Pick a link to cut. Prefer somewhere the player is actually standing — a
   crack under an occupied tile is felt immediately rather than discovered
   three rounds later — but fall back to any intact link. */
/* Prefer a join with a unit on at least one end, so the damage is felt now
   rather than discovered three rounds later. */
function preferLive(links, side, board) {
  if (!board) return links;
  var live = links.filter(function (link) {
    return !!C.unitAt(board, side, link.a.row, link.a.index) || !!C.unitAt(board, side, link.b.row, link.b.index);
  });
  return live.length ? live : links;
}

/* What the board does next with a debt it cannot pay.

   While there is somewhere left to break, it breaks: mostly a sever, and
   roughly a third of the time a bridge instead, so a run's board drifts into
   its own shape rather than one long march of cuts. As the board fills up the
   odds tip toward deepening what is already there, and once nothing is left
   to break, every further debt goes into deepening. That way Rewind never
   becomes free — the board simply stops having new ways to say no and starts
   saying it louder. */
export function spawnFissure(side, board) {
  var severableList = C.severableLinks(side, store.run.fissures);
  var bridgeableList = C.bridgeableLinks(side, store.run.fissures);
  var room = severableList.length + bridgeableList.length;
  var deepenable = store.run.fissures.filter(function (fissure) {
    return fissure.side === side && C.fissurePower(fissure) < C.FISSURE_MAX_POWER;
  });

  // near-saturated boards start deepening instead of breaking
  var deepenChance = room === 0 ? 1 : (room <= 3 ? 0.55 : 0.12);
  if (deepenable.length && store.rnd() < deepenChance) {
    var growCandidates = preferLive(deepenable, side, board);
    var chosen = growCandidates[Math.floor(store.rnd() * growCandidates.length)];
    chosen.power = C.fissurePower(chosen) + 1;
    return { grew: chosen };
  }
  if (!room) return null;

  var wantBridge = bridgeableList.length && (!severableList.length || store.rnd() < 0.34);
  var pool = preferLive(wantBridge ? bridgeableList : severableList, side, board);
  var newFissure = pool[Math.floor(store.rnd() * pool.length)];
  store.run.fissures.push(newFissure);
  return { born: newFissure };
}

/* Add to the meter and, if it has overflowed, damage the board once.

   Only ever once. The growth curve is exponential, so by the 11th lifetime
   Rewind a single chunk is worth two thresholds and by the 18th it is worth
   twenty-seven — draining the whole meter in a loop meant one late Rewind
   could tear the board apart in a single click. What escalation is meant to
   buy is certainty (every further use costs you something) not volume, so we
   spend one threshold and drop the rest. Dropping rather than carrying also
   stops an unpayable bank building up that would fire on every future use
   regardless of how small that use was. */
export function addInstability(amount, side, board) {
  store.run.instability = (store.run.instability || 0) + amount;
  if (store.run.instability < REWIND.THRESHOLD) return [];
  var event = spawnFissure(side, board);
  if (!event) {                                    // nothing left to give
    store.run.instability = REWIND.THRESHOLD - 1;
    return [];
  }
  store.run.instability = Math.min(store.run.instability - REWIND.THRESHOLD, REWIND.THRESHOLD - 1);
  return [event];
}

/* ===================================================================
   REWIND
   One snapshot, taken the instant before the player commits. Because the
   enemy replies deterministically and nothing in an exchange rolls dice,
   restoring it genuinely rewinds both halves — there is no draw to re-roll
   and no enemy answer to fish for.
   =================================================================== */
function cloneCard(card) { return { id: card.id, up: !!card.up, deckIndex: card.deckIndex }; }

export function snapshotForRewind(state) {
  return {
    board: C.cloneBoard(state.board), hazards: C.cloneHazards(state.hazards),
    hands: { bottom: state.hands.bottom.map(cloneCard), top: state.hands.top.map(cloneCard) },
    decks: { bottom: state.decks.bottom.map(cloneCard), top: state.decks.top.map(cloneCard) },
    handCount: { bottom: state.hands.bottom.length, top: state.hands.top.length },
    mixTokens: { bottom: state.mixTokens.bottom, top: state.mixTokens.top },
    chains: { bottom: (state.chains && state.chains.bottom) || 0, top: (state.chains && state.chains.top) || 0 },
    mixChain: state.mixChain || 0,
    mixesThisRound: state.mixesThisRound || 0,
    freeMixesThisRound: state.freeMixesThisRound || 0,
    echoUsedThisRound: !!state.echoUsedThisRound,
    wildPaletteUsed: !!state.wildPaletteUsed,
    quieted: state.quieted ? Object.assign({}, state.quieted) : null,
    bestChain: state.bestChain || 0,
    turn: state.turn, finalTurn: !!state.finalTurn, round: state.round,
    spectrumColor: state.spectrumColor,
    logLen: store.log.length
  };
}

/* Only the player's own turns are rewindable, and only the most recent one. */
export function markRewindPoint(side) {
  var state = getBattleState();
  if (!state || state.pvp || side !== PLAYER || state.rewindUsedThisRound) return;
  state.rewindSnap = snapshotForRewind(state);
}

export function restoreRewind(state, snap) {
  state.board = snap.board; state.hazards = snap.hazards;
  state.hands = { bottom: snap.hands.bottom.map(cloneCard), top: snap.hands.top.map(cloneCard) };
  state.decks = { bottom: snap.decks.bottom.map(cloneCard), top: snap.decks.top.map(cloneCard) };
  state.mixTokens = { bottom: snap.mixTokens.bottom, top: snap.mixTokens.top };
  state.chains = { bottom: snap.chains.bottom, top: snap.chains.top };
  state.mixChain = snap.mixChain;
  state.mixesThisRound = snap.mixesThisRound;
  state.freeMixesThisRound = snap.freeMixesThisRound;
  state.echoUsedThisRound = snap.echoUsedThisRound;
  state.wildPaletteUsed = snap.wildPaletteUsed;
  state.quieted = snap.quieted ? Object.assign({}, snap.quieted) : null;
  state.bestChain = snap.bestChain;
  state.turn = snap.turn; state.finalTurn = snap.finalTurn;
  state.spectrumColor = snap.spectrumColor;
  state.cascadeDepth = 0;
  state.pending = null; state.selectedCard = null; state.mixBase = null; state.mode = 'place';
  state.lastPlaced = null; state.inspected = null; state.curseFired = null;
  while (store.log.length > snap.logLen) store.log.shift();
}

export function canRewind() {
  var state = getBattleState();
  if (!state || state.pvp) return false;
  return !!state.rewindSnap && !state.rewindUsedThisRound && state.turn === PLAYER &&
    !state.resolving && !state.battleOver && !state.opponentThinking && !state.pending;
}

export var onRewind = act(function onRewind() {
  if (!canRewind()) return;
  var state = getBattleState(), run = getActiveRun(), snap = state.rewindSnap;
  var evAfter = evaluateBoard(state.board, state.hazards, evalCtx(state));
  var evBefore = evaluateBoard(snap.board, snap.hazards, {
    relics: state.relics, enemyMod: state.enemyMod, chains: snap.chains,
    mixChain: snap.mixChain, spectrumColor: snap.spectrumColor, fissures: state.fissures
  });
  var impact = rewindImpact(snap, state, evBefore, evAfter);
  var chunk = rewindChunk(run, impact);

  restoreRewind(state, snap);
  state.rewindSnap = null;
  state.rewindUsedThisRound = true;
  run.rewindsUsed = (run.rewindsUsed || 0) + 1;

  addLog('You rewound the exchange.');
  emit('announce', { text: 'Rewound', tone: 'you' });

  /* The debt is settled after the restore, so a fissure born now applies to
     the board the player just took back. */
  var events = addInstability(chunk, PLAYER, state.board);
  var headline = '';
  events.forEach(function (event) {
    var fissure = event.born || event.grew;
    emit('fissure', { key: C.edgeKey(fissure.side, fissure.a, fissure.b) });
    var pair = slotName(fissure.a.row, fissure.a.index) + ' and ' + slotName(fissure.b.row, fissure.b.index);
    if (event.grew) {
      addLog('A fissure widens \u2014 ' + pair + ' pull harder at what stands on them.');
      headline = headline || 'The board strains';
    } else if (fissure.kind === 'bridge') {
      addLog('The board folds \u2014 ' + pair + ' now touch, though they never should.');
      headline = 'The board folds';
    } else {
      addLog('A fissure tears through your board \u2014 ' + pair + ' no longer touch.');
      headline = 'The board tears';
    }
  });
  if (headline) emit('announce', { text: headline, tone: 'enemy' });
});
