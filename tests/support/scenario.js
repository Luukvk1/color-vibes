/* Setting up a particular situation to test, without playing to it.

   A scenario starts a real battle against a chosen enemy through the game's own
   actions, then lets the test arrange the board and the hands directly — those
   are plain data — and carry on with real actions from there. */

import * as game from '../../src/game/index.js';
import { newSeededGame } from './play.js';

var C = game.rules, PLAYER = C.PLAYER, ENEMY = C.ENEMY;
export { C, PLAYER, ENEMY };

/* A battle against `enemyKey`, with empty hands and it being the player's turn. */
export function battleAgainst(enemyKey, options) {
  options = options || {};
  newSeededGame(options.seed || 1);
  var run = game.getRun(), enemy = C.ENEMIES[enemyKey];
  run.relics = (options.relics || []).slice();
  if (options.deck) run.deck = options.deck.map(function (id) { return { id: id, up: false }; });
  run.pendingNode = { depth: options.depth || 0, col: 0, type: enemy.kind === 'boss' ? 'boss' : enemy.kind === 'elite' ? 'elite' : 'battle', enemy: enemyKey, next: [0], done: false };
  game.beginBattle();
  var state = game.getBattleState();
  state.hands = { bottom: [], top: [] };
  state.turn = PLAYER; state.roundStarter = PLAYER;
  state.opponentThinking = false;
  return state;
}

export function put(state, side, row, index, cardId, strength, color) {
  var def = C.CARDS[cardId];
  state.board[side][row][index] = { cardId: cardId, color: color || def.color, strength: strength || def.strength, temp: 0, cracked: 0 };
  return state.board[side][row][index];
}

export function giveCard(state, cardId, side) {
  var card = C.makeCard(cardId, false);
  state.hands[side || PLAYER].push(card);
  return card;
}

/* Score a round as it stands and move on to the next one, the way the view does after the results are read. */
export function endRound() {
  game.resolveRound();
  game.continueBattle();
}

export function unitsOn(state, side) {
  var found = [];
  C.eachUnit(state.board, side, function (unit, row, index) { found.push({ unit: unit, row: row, index: index }); });
  return found;
}
