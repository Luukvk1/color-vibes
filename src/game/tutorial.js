/* When a lesson is worth teaching, and whether the player has had it. Only
   the decision lives here; what a lesson looks like is the view's business. */

import C from './rules/index.js';
import { applyMix, evalCtx, mixOptions, simGame } from './battle/engine.js';
import { canRewind } from './battle/rewind.js';
import { act, getBattleState, store } from './store.js';

var CARDS = C.CARDS;
var PLAYER = C.PLAYER;
var cardStrength = C.cardStrength;
var eachUnit = C.eachUnit;
var evaluateBoard = C.evaluateBoard;
var freeHazardRows = C.freeHazardRows;
var legalTiles = C.legalTiles;

/* ---------------- tutorial ---------------- */
export var tutorial = { enabled: true, seen: {}, open: null };

export function tutorialActive() { return tutorial.enabled && store.run && store.run.battlesFought === 0; }

export function inFirstBattle() { return tutorial.enabled && store.run && store.run.battlesFought === 1; }

/* Lessons run across the whole act, not just the opening fight — several of them
   need a board situation that may not turn up until the third or fourth battle. */
export function shouldTeach(key) { return tutorial.enabled && store.run && !store.run.pvp && !tutorial.seen[key]; }

export function tutorialOpen() { return !!tutorial.open; }

/* Which lessons have something to show right now. A lesson that would open
   onto an empty diagram is not offered, and is not spent either. */
export function bestFrontlineLane(evaluation) {
  var best = null;
  evaluation.lanes.forEach(function (lane) {
    if (!lane.bottom || !lane.top) return;
    // prefer the most instructive lane: one with support, or a deep frontline
    var score = (lane.bottom.support ? 2 : 0) +
                (lane.bottom.champion.row !== 'row1' ? 3 : 0) +
                (lane.bottom.effective || lane.top.effective ? 1 : 0);
    if (!best || score > best.score) best = { lane: lane, score: score };
  });
  return best;
}

export function lessonApplies(key, ctx) {
  if (key === 'mixing') return !!ctx.opt;
  if (key === 'frontline') return !!ctx.ev && !!bestFrontlineLane(ctx.ev);
  if (key === 'roundbreak') return !!ctx.fallen && ctx.fallen.bottom.length + ctx.fallen.top.length > 0;
  var laneLesson = /^lanes_(row[123])$/.exec(key);
  if (laneLesson) {
    var tile = ctx.tile;
    return !!tile && !!ctx.ev && tile.row === laneLesson[1] && !!ctx.ev.shares['bottom-' + tile.row + '-' + tile.index];
  }
  return true;
}

export function teach(key, ctx) {
  if (!shouldTeach(key)) return false;
  if (!lessonApplies(key, ctx || {})) return false;   // nothing worth pointing at yet
  tutorial.seen[key] = true;
  tutorial.open = { key: key, ctx: ctx || {} };
  return true;
}

/* Dismissing a lesson may make another one relevant; whether the enemy then
   moves is the view's business, read off the state. */
export var dismissTutorial = act(function dismissTutorial() {
  if (!tutorial.open) return;
  tutorial.open = null;
  if (store.state) teachNow();
});

export var closeTutorial = dismissTutorial;

export var setTutorial = act(function setTutorial(on) {
  tutorial.enabled = !!on;
  if (!on) dismissTutorial();
});

/* ===================================================================
   TEACHING TRIGGERS
   Each rule waits for the board to demonstrate it. Checked in priority order
   and only one may open at a time; whichever fires holds the enemy until it
   is dismissed. Turning the tutorial off silences all of them.
   =================================================================== */

/* Is there a mix available that would actually buy an effective matchup? That
   is the moment mixing — and effectiveness — are worth explaining. */
export function findTeachingMix(state, ev) {
  if (state.mixTokens[PLAYER] < 1) return null;
  var opts = mixOptions(state.board, PLAYER), best = null;
  for (var i = 0; i < opts.length && !best; i++) {
    var opt = opts[i];
    var simulated = simGame(state);
    applyMix(simulated, PLAYER, opt.base, opt.other, 0, false);
    var simEval = C.evaluateBoard(simulated.board, simulated.hazards, evalCtx(simulated));
    simEval.lanes.forEach(function (lane, laneIndex) {
      if (best || !lane.bottom || !lane.top || !lane.bottom.effective) return;
      var champion = lane.bottom.champion;
      if (champion.row !== opt.base.row || champion.index !== opt.base.index) return;
      if (ev.lanes[laneIndex].bottom && ev.lanes[laneIndex].bottom.effective) return;   // already effective
      best = { base: opt.base, other: opt.other, strength: simEval.strengthOf(champion),
               foe: { row: lane.top.champion.row, index: lane.top.champion.index },
               foeColor: lane.top.color };
    });
  }
  return best;
}

export function playerCanAct(state) {
  if (mixOptions(state.board, PLAYER).length && state.mixTokens[PLAYER] > 0) return true;
  return state.hands[PLAYER].some(function (card) {
    var cardDef = CARDS[card.id];
    if (cardDef.type === 'unit') return legalTiles(state.board, PLAYER, cardStrength(card), C.placeOpts(card.id, state.relics, state.board, PLAYER)).length > 0;
    if (cardDef.type === 'hazard') return freeHazardRows(state.hazards, PLAYER).length > 0;
    return true;
  });
}

export function teachNow(ev) {
  var state = getBattleState();
  if (!state || state.resolving || state.battleOver || state.pending) return false;
  if (tutorialOpen()) return false;
  ev = ev || evaluateBoard(state.board, state.hazards, evalCtx(state));
  var ctx = { board: state.board, hazards: state.hazards, ev: ev };

  /* Before anything else: on the player's very first turn, say what a turn is. */
  if (state.turn === PLAYER && !state.opponentThinking && inFirstBattle() && shouldTeach('play')) {
    var mine = 0;
    eachUnit(state.board, PLAYER, function () { mine++; });
    if (!mine && teach('play', ctx)) return true;
  }

  // lane lessons, keyed off the row the player just committed to
  if (state.lastPlaced && state.lastPlaced.side === PLAYER) {
    var key = 'lanes_' + state.lastPlaced.row;
    if (shouldTeach(key) &&
        teach(key, { board: state.board, hazards: state.hazards, ev: ev, tile: state.lastPlaced })) return true;
  }
  if (state.turn !== PLAYER || state.opponentThinking) return false;

  if (shouldTeach('mixing')) {
    var opt = findTeachingMix(state, ev);
    if (opt && teach('mixing', { board: state.board, hazards: state.hazards, ev: ev, opt: opt })) return true;
  }
  if (shouldTeach('frontline') && ev.lanes.some(function (lane) { return lane.bottom && lane.top; })) {
    if (teach('frontline', ctx)) return true;
  }
  if (shouldTeach('rewind') && canRewind()) {
    if (teach('rewind', ctx)) return true;
  }
  if (shouldTeach('passing')) {
    var stuck = !playerCanAct(state);
    var commanding = (ev.totals.bottom - ev.totals.top) >= 12 && ev.totals.bottom > 0;
    if (stuck || commanding) {
      ctx.reason = stuck ? 'stuck' : 'ahead';
      if (teach('passing', ctx)) return true;
    }
  }
  return false;
}
