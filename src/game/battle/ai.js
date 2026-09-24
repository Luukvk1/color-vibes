/* How well the opponent is allowed to play, and how it weighs a move.
   A pure reading of the battle state: it decides, it never acts. */

import C from '../rules/index.js';
import { getBattleState } from '../store.js';
import { applyMix, evalCtx, mixOptions, simGame } from './engine.js';
import { clearFrontlines } from './setup.js';
import { autoTargets, resolveCard } from './targeting.js';

var CARDS = C.CARDS;
var ENEMY = C.ENEMY;
var PLAYER = C.PLAYER;
var cardStrength = C.cardStrength;
var eachUnit = C.eachUnit;
var evaluateBoard = C.evaluateBoard;
var freeHazardRows = C.freeHazardRows;
var legalTiles = C.legalTiles;
var otherSide = C.otherSide;

/* ===================================================================
   AI
   =================================================================== */
/* Split from execution so maybeOpponentMove can time the pause on how
   close the call was before anything actually happens on the board.
   runnerUp tracks the second-best value seen (across cards, tiles, mixes,
   and the option of passing) purely as a side channel — it never changes
   which move wins, only how confident that win looks in hindsight. */
/* ===================================================================
   HOW WELL THE OPPONENT IS ALLOWED TO PLAY
   Skill is not a constant. A first-act brawler should misplay — dump its hand
   into a round it has already won, spend its best unit to gain a point — and
   the same brawler at the end of a long run should not. Tying it to run
   power means the player teaches the world to play well by surviving in it,
   and act one stays the tutorial it is meant to be.

   Each tier only adds; nothing is ever taken away, so a later enemy is
   strictly at least as sharp as an earlier one.

     0  greedy      plays the highest board delta it can find, every turn
     1  measured    stops valuing overkill past a won round
     2  thrifty     charges itself for spending a card that could serve later
     3  patient     concedes a round it cannot win and banks the hand
     4  surgical    spends the cheapest card that does the job

   Elites and bosses are a tier above the road they stand on: an act's boss
   should feel like the sharpest thing in it. */
export var SAFE_LEAD = 6;             // beyond this, a round is already in hand

export function aiSkill(state) {
  var power = state.power || 0;
  var tier = power >= 40 ? 4 : power >= 28 ? 3 : power >= 17 ? 2 : power >= 8 ? 1 : 0;
  var kind = state.enemy && state.enemy.kind;
  if (kind === 'elite') tier += 1;
  if (kind === 'boss') tier += 1;
  return Math.max(0, Math.min(4, tier));
}

/* Tier 1+. Strength banked past a comfortable win does very little, because a
   round is won by leading, not by leading by twenty. Below tier 1 the raw
   delta is used, which is what makes an early enemy overcommit. */
export function shapedLead(delta, tier) {
  if (tier < 1 || delta <= SAFE_LEAD) return delta;
  return SAFE_LEAD + (delta - SAFE_LEAD) * 0.25;
}

/* Tier 2+. A battle is best of three and spent cards are gone for all of it,
   so a card held is a card available later. Zero in the deciding round —
   there is no later to save for — and dearer when reserves are thin. */
export function reservePrice(state, side, ai, tier) {
  if (tier < 2) return 0;
  var roundsPlayed = (state.wins[PLAYER] || 0) + (state.wins[ENEMY] || 0);
  if (roundsPlayed >= 2) return 0;
  var reserves = state.hands[side].length + state.decks[side].length;
  var scarcity = reserves <= 3 ? 2.6 : reserves <= 6 ? 1.7 : 1.0;
  return 1.5 * scarcity * (ai.thrift === undefined ? 1 : ai.thrift);
}

/* Tier 3+. Some rounds are simply gone. Rather than feed cards into a lost
   round, bank the hand and take the next two — which is how the format is
   actually won. Never in the deciding round, where there is no next. */
export function concedeBonus(state, side, rawLead, tier) {
  if (tier < 3) return 0;
  var roundsPlayed = (state.wins[PLAYER] || 0) + (state.wins[ENEMY] || 0);
  if (roundsPlayed >= 2) return 0;               // must fight for the decider
  var gap = -rawLead;
  if (gap <= 10) return 0;
  /* Scaled, not flat. A flat bonus was worth less than a single good blocking
     play, so the enemy kept "fighting" a round it had lost by seventy — and
     blocking *is* worth doing when it is worth ten points, so the answer is
     not to weaken blocking but to let the concession grow with the size of
     the hole. Holding a round already makes banking more attractive still. */
  var banked = state.wins[side] >= 1 ? 1.5 : 1;
  return Math.min(14, (gap - 10) * 0.4 * banked);
}

/* Tier 4+. Two moves that leave the board in the same place are not equal:
   the one that spent the weaker card is better, because the stronger card is
   still in hand for the next round. This is what makes a late enemy answer a
   frontline with the smallest unit that does it, instead of dropping its best
   body to win a lane by one. */
export function spendCost(card, tier) {
  if (tier < 4 || !card) return 0;
  var cardDef = CARDS[card.id];
  if (!cardDef) return 0;
  var rare = cardDef.rarity === 'Rare' ? 1.6 : cardDef.rarity === 'Uncommon' ? 0.8 : 0;
  return (cardStrength(card) * 0.28) + rare;
}

/* Tier 4. Waste is per lane, not per board.

   A lane is won by leading it; every point past that margin is spent for
   nothing, even when the overall score is close. Discounting only the global
   lead missed this entirely, so a surgical enemy still answered a 1-strength
   frontline by dropping a 6-strength Rare on it — a fine play this round and
   a terrible one across three. Charging the surplus lane by lane is what
   actually produces "use the smallest thing that does the job". */
var LANE_MARGIN = 2;

export function laneShapedDelta(ev, side, foe) {
  var mine = 0, theirs = 0;
  ev.lanes.forEach(function (lane) {
    var mineValue = lane[side] ? lane[side].strength * lane[side].multiplier : 0;
    var theirValue = lane[foe] ? lane[foe].strength * lane[foe].multiplier : 0;
    var cap = theirValue + LANE_MARGIN;
    if (mineValue > cap) mineValue = cap + (mineValue - cap) * 0.25;
    mine += mineValue; theirs += theirValue;
  });
  return mine - theirs;
}

/* Tier 3+. Look past the resolve. Frontlines break between rounds, so a board
   whose value survives that break is worth more than one propped up entirely
   by units about to be removed. Blended rather than replacing the immediate
   read, because the current round still has to be won. */
function afterBreakValue(simState, side, foe) {
  var sim = simGame(simState);
  clearFrontlines(sim.board, sim.hazards, evalCtx(sim));
  var simEval = evaluateBoard(sim.board, sim.hazards, evalCtx(sim));
  return simEval.totals[side] - simEval.totals[foe];
}

/* `forSide` is the enemy unless a caller — a test bot — wants the same reading of
   the board on the player's behalf. Only the enemy carries a personality. */
export function decideOpponentMove(forSide) {
  var state = getBattleState(), side = forSide || ENEMY, foe = otherSide(side);
  var ai = side === ENEMY ? (state.enemy.ai || {}) : {};
  var tier = aiSkill(state);
  var now = evaluateBoard(state.board, state.hazards, evalCtx(state));
  var rawLead = tier >= 4 ? laneShapedDelta(now, side, foe)
                          : now.totals[side] - now.totals[foe];
  /* Every move is scored as an *improvement on doing nothing*, and ai.strength
     weights that improvement rather than scaling the board state itself.

     Multiplying the lead directly was wrong twice over: it inflated the value
     of playing while leaving passing untouched, and — because a lead is
     signed — it made a losing position look even worse to sit in, so a
     hopeless round produced frantic play instead of a concession. Scoring the
     delta keeps the sign out of it: an aggressive enemy simply wants gains
     more, whichever side of level it is on. */
  var aggro = ai.strength || 1;
  var baseline = shapedLead(rawLead, tier);
  var passValue = baseline + concedeBonus(state, side, rawLead, tier);
  var hold = reservePrice(state, side, ai, tier);
  var best = null, runnerUp = -Infinity;

  function spreadBonus(board) {
    if (!ai.spread) return 0;
    var seen = {}, count = 0;
    eachUnit(board, side, function (unit) { if (unit.color && !seen[unit.color]) { seen[unit.color] = 1; count++; } });
    return count * ai.spread;
  }
  function consider(value, candidate) {
    if (!best || value > best.value) {
      if (best) runnerUp = Math.max(runnerUp, best.value);
      candidate.value = value; best = candidate;
    } else runnerUp = Math.max(runnerUp, value);
  }

  state.hands[side].forEach(function (card, cardIndex) {
    var cardDef = CARDS[card.id], spots = [];
    if (cardDef.type === 'unit') spots = legalTiles(state.board, side, cardStrength(card), C.placeOpts(card.id, side === PLAYER ? state.relics : [], state.board, side));
    else if (cardDef.type === 'hazard') spots = freeHazardRows(state.hazards, side).map(function (row) { return { row: row, index: 0 }; });
    else spots = [null];
    spots.forEach(function (tile) {
      var simState = simGame(state);
      var targets = autoTargets(simState, side, card, tile);
      try { resolveCard(simState, side, card, tile, targets); } catch (err) { return; }
      var evalAfter = evaluateBoard(simState.board, simState.hazards, evalCtx(simState));
      var delta = tier >= 4 ? laneShapedDelta(evalAfter, side, foe)
                            : evalAfter.totals[side] - evalAfter.totals[foe];
      // tier 3 looks past the break; below that it only sees this instant
      if (tier >= 3) delta = delta * 0.65 + afterBreakValue(simState, side, foe) * 0.35;
      var value = baseline + (shapedLead(delta, tier) - baseline) * aggro
              + spreadBonus(simState.board) - hold - spendCost(card, tier);
      consider(value, { type: 'card', cardIndex: cardIndex, tile: tile, targets: targets });
    });
  });

  if (state.mixTokens[side] > 0) {
    mixOptions(state.board, side).forEach(function (mixOption) {
      var simState = simGame(state);
      applyMix(simState, side, mixOption.base, mixOption.other, 0, false);
      var evalAfter = evaluateBoard(simState.board, simState.hazards, evalCtx(simState));
      /* A mix costs no card — it spends a token and consumes units already
         committed — so it is not charged the reserve price. That makes mixing
         the natural move for an enemy that wants to improve without emptying
         its hand, which is exactly the behaviour worth encouraging. */
      var mixDelta = evalAfter.totals[side] - evalAfter.totals[foe];
      if (tier >= 3) mixDelta = mixDelta * 0.65 + afterBreakValue(simState, side, foe) * 0.35;
      var value = baseline + (shapedLead(mixDelta, tier) - baseline) * (ai.mix || 1)
              + spreadBonus(simState.board);
      consider(value, { type: 'mix', base: mixOption.base, other: mixOption.other });
    });
  }

  runnerUp = Math.max(runnerUp, passValue);
  /* Pass whenever holding beats playing. At tier 0 `hold` is zero and the
     lead is unshaped, so playing essentially always wins and the enemy dumps
     its hand exactly as it used to — which is the intended act-one feel. */
  var willPass = !best || best.value <= passValue;
  // Infinity when there was really only one live option (or passing was
  // the obvious call) — decisionDelay treats that as the easiest case.
  var margin = (!willPass && best) ? best.value - runnerUp : Infinity;
  return { side: side, best: best, willPass: willPass, margin: margin };
}

/* A close call between the best move and its nearest rival reads as a
   harder decision and earns a longer visible pause; a lopsided choice
   lands quickly. margin arrives as Infinity for a one-option or obvious-
   pass turn, which floors the delay at its minimum. */
export function decisionDelay(margin) {
  if (!isFinite(margin)) return 400;
  var extra = Math.max(0, 1000 - margin * 80);
  return 400 + Math.min(1000, extra);
}
