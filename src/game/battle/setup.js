/* Starting a battle, and the small housekeeping every battle shares. */

import C from '../rules/index.js';
import { discoverCard, discoverFoe } from '../codex.js';
import { ACTS } from '../content/acts.js';
import { curseCount, noteActOmens, powerAt } from '../run/flow.js';
import { emit, getBattleState, store } from '../store.js';
import { drawInto } from './engine.js';

var COLOR_KEYS = C.COLOR_KEYS;
var ENEMIES = C.ENEMIES;
var ENEMY = C.ENEMY;
var PLAYER = C.PLAYER;
var hasRelic = C.hasRelic;
var makeCard = C.makeCard;

/* ===================================================================
   BATTLE STATE
   =================================================================== */
/* Enemy strength per act band. Flat 0 through the opening battles so the
   starting deck has a fair fight, then stepping up as the player's deck grows.
   Retuned once frontlines started falling between rounds: boards are emptier
   and round scores dropped from roughly 24 to roughly 10, so a per-unit bonus
   now weighs about three times what it used to. */
/* The opening fights are a warm-up while the player learns lanes and frontlines.
   Measured: docking every enemy unit a point of strength won those fights 96% of
   the time, which is not easing in, it is a walkover. Holding back two opening
   cards is far gentler — the enemy still plays well, it just has less to play. */
export var EASE_IN_BATTLES = 3, EASE_IN_HAND_PENALTY = 2;

export function easeInHand(battlesFought) { return battlesFought < EASE_IN_BATTLES ? EASE_IN_HAND_PENALTY : 0; }

/* Reads run-wide power, not act-local depth. The old three-step curve topped
   out at 2 and would have left every act after the first sitting on a flat
   ceiling, so the enemy stopped growing exactly when the player did not. */
export function depthBonusFor(power) {
  if (power <= 5) return 0;
  return Math.min(6, 1 + Math.floor((power - 6) / 5));
}

export function newBattle(node) {
  var enemyKey = node.enemy, enemy = ENEMIES[enemyKey];
  // The very first battle of a run always opens with the player, so the tutorial
  // lands on their own move rather than after the enemy has already acted.
  var starter = (store.run.battlesFought === 0) ? PLAYER : (store.rnd() < 0.5 ? PLAYER : ENEMY);
  var battleState = {
    board: C.emptyBoard(), hazards: C.emptyHazards(),
    decks: { bottom: store.run.deck.map(function (entry, index) { return makeCard(entry.id, entry.up, index); }), top: C.buildEnemyDeck(enemy, powerAt(store.run, node.depth), store.rnd, store.run.corruption || 0, curseCount(store.run.deck), ACTS[store.run.act]) },
    hands: { bottom: [], top: [] },
    relics: store.run.relics.slice(),
    enemyKey: enemyKey, enemy: enemy,
    enemyMod: Object.assign({}, enemy.mod || {}, { depthBonus: depthBonusFor(powerAt(store.run, node.depth)) }),
    // the AI reads this to decide how well it is allowed to play
    power: powerAt(store.run, node.depth),
    // frozen at battle start so a curse drawn mid-fight cannot re-price the boss
    playerCurses: curseCount(store.run.deck),
    node: node,
    /* By reference: a fissure torn mid-battle is on the board at once, and
       still there next battle. */
    fissures: store.run.fissures,
    rewindSnap: null, rewindUsedThisRound: false, quieted: null,
    drawn: { extra: 0 },
    mixTokens: { bottom: 1, top: (enemy.mod && enemy.mod.mixTokens) || 1 },
    mixChain: 0, chains: { bottom: 0, top: 0 },
    mixesThisRound: 0, freeMixesThisRound: 0, echoUsedThisRound: false, cascadeDepth: 0,
    wildPaletteUsed: false,
    easeIn: store.run.battlesFought < EASE_IN_BATTLES,
    round: 1, wins: { bottom: 0, top: 0 },
    turn: starter, roundStarter: starter,
    finalTurn: false, resolving: false, battleOver: false,
    opponentThinking: false,
    mode: 'place', selectedCard: null, mixBase: null, pending: null,
    inspected: null, lastPlaced: null, bestChain: 0
  };
  shuffle(battleState.decks.bottom);
  if (enemy.mod && enemy.mod.rotatingColor) battleState.spectrumColor = COLOR_KEYS[Math.floor(store.rnd() * COLOR_KEYS.length)];
  /* Meeting something is what puts it in the codex \u2014 the enemy you are about
     to fight, and every card you are carrying into the fight. */
  discoverFoe(enemyKey);
  /* Checked here rather than only at the end of an act: a colour finished at
     the Lab in depth 6 should be remembered the moment it exists, not held
     back until the boss falls. */
  noteActOmens();
  // a marker left over from the last fight is not about this one
  emit('passPuck', false);
  store.run.deck.forEach(function (entry) { discoverCard(entry.id); });
  drawInto(battleState, PLAYER, C.OPENING_HAND + (hasRelic(store.run.relics, 'open_ledger') ? 2 : 0), true);
  drawInto(battleState, ENEMY, C.OPENING_HAND - easeInHand(store.run.battlesFought));
  return battleState;
}

export function shuffle(list) {
  for (var index = list.length - 1; index > 0; index--) {
    var swapIndex = Math.floor(store.rnd() * (index + 1));
    var temp = list[index]; list[index] = list[swapIndex]; list[swapIndex] = temp;
  }
  return list;
}

export function addLog(msg) {
  store.log.unshift('R' + (store.state ? store.state.round : 0) + ' · ' + msg);
  if (store.log.length > 90) store.log.pop();
  emit('log');
}

export function tileKey(side, row, index) { return side + '-' + row + '-' + index; }

/* Whoever held the line in a CONTESTED lane is removed before the next round.
   Front units are spent taking the fight; the ranks behind step up. A lane
   where only one side fielded anything saw no fight, so nothing falls there —
   that lets you build safely in lanes the enemy has ignored. A unit fronting
   several lanes falls once if any of them was contested. */
export function clearFrontlines(board, hazards, ctx) {
  var evaluation = C.evaluateBoard(board, hazards, ctx || {});
  var fallen = { bottom: [], top: [] };
  evaluation.lanes.forEach(function (lane) {
    if (!lane.bottom || !lane.top) return;      // uncontested — no fight, no losses
    ['bottom', 'top'].forEach(function (side) {
      if (!lane[side]) return;
      var champion = lane[side].champion, key = champion.row + '|' + champion.index;
      if (fallen[side].indexOf(key) === -1) fallen[side].push(key);
    });
  });
  ['bottom', 'top'].forEach(function (side) {
    fallen[side].forEach(function (key) {
      var parts = key.split('|');
      board[side][parts[0]][+parts[1]] = null;
    });
  });
  return fallen;
}

/* Curses resolve inside the draw, so the player is told what just happened. */
/* Curses resolve inside the draw, so the player is told what just happened. */
export function flushCurses() {
  var state = getBattleState();
  if (!state || !state.curseFired || !state.curseFired.length) return;
  state.curseFired.forEach(function (curse) {
    var who = curse.side === PLAYER ? 'You drew' : state.enemy.name + ' drew';
    addLog(who + ' a curse \u2014 ' + curse.name + (curse.note ? ': ' + curse.note : '') + '.');
    if (curse.side === PLAYER) emit('announce', { text: 'Curse drawn \u2014 ' + curse.name, tone: 'curse' });
  });
  state.curseFired.length = 0;
}

/* ===================================================================
   TURN FLOW
   =================================================================== */
export function resetChain(side) {
  var state = getBattleState();
  state.chains = state.chains || { bottom: 0, top: 0 };
  state.chains[side] = 0;
  state.mixChain = 0;
  state.cascadeDepth = 0;
}
