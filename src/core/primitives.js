/* Small operations every other file needs: reading a unit off the board,
   walking a side, placement legality, and building a card instance. */

import { PLAYER, ROWS, ROW_INFO } from './board-shape.js';
import { CARDS } from './cards.js';
import { hasRelic } from './relics.js';

/* ===================================================================
   3. PRIMITIVES
   =================================================================== */
export function emptyBoard() {
  return { bottom: { row1: [null, null, null, null], row2: [null, null, null], row3: [null, null] },
           top:    { row1: [null, null, null, null], row2: [null, null, null], row3: [null, null] } };
}
export function emptyHazards() {
  return { bottom: { row1: null, row2: null, row3: null }, top: { row1: null, row2: null, row3: null } };
}
export function cloneBoard(board) {
  var copy = { bottom: {}, top: {} };
  ['bottom', 'top'].forEach(function (side) {
    ROWS.forEach(function (row) {
      copy[side][row] = board[side][row].map(function (unit) {
        return unit ? { cardId: unit.cardId, color: unit.color, strength: unit.strength, temp: unit.temp || 0,
          up: unit.up || false, cracked: unit.cracked || 0, deckIndex: unit.deckIndex } : null;
      });
    });
  });
  return copy;
}
export function cloneHazards(hazards) {
  var copy = emptyHazards();
  ['bottom', 'top'].forEach(function (side) { ROWS.forEach(function (row) { copy[side][row] = hazards[side][row]; }); });
  return copy;
}
export function otherSide(side) { return side === 'bottom' ? 'top' : 'bottom'; }
export function unitAt(board, side, row, index) { return board[side][row][index]; }
export function sideName(side) { return side === PLAYER ? 'You' : 'Enemy'; }
export function slotName(row, index) { return ROW_INFO[row].label + ' · Slot ' + (index + 1); }
export function eachUnit(board, side, callback) {
  ROWS.forEach(function (row) {
    for (var index = 0; index < ROW_INFO[row].count; index++) {
      var unit = board[side][row][index];
      if (unit) callback(unit, row, index);
    }
  });
}
/* Row minimums are the single biggest structural constraint in the game: Row 2
   wants 2, Row 3 wants 3, so a strength-1 unit may only ever stand in Row 1's
   four tiles. Measured, that meant the swarm and colour-coverage archetypes
   could physically fill only 4-7 of 9 slots while a deck of Titans filled all
   nine — they were not weak on rates, they were playing a smaller board.

   `anyRow` lifts the minimum for a single card, and a relic lifts it for all
   of them. That is the enabler those archetypes were missing; without it no
   amount of extra cheap cards would have helped. */
export function canPlace(board, side, row, index, strength, opts) {
  if (unitAt(board, side, row, index)) return { ok: false, reason: 'That tile is already occupied.' };
  var rowIsFree = opts && (opts.anyRow || (opts.freeRows && opts.freeRows[row]));
  if (!rowIsFree && strength < ROW_INFO[row].min) {
    return { ok: false, reason: ROW_INFO[row].label + ' needs strength ' + ROW_INFO[row].min + ' or higher.' };
  }
  return { ok: true };
}
export function legalTiles(board, side, strength, opts) {
  var tiles = [];
  ROWS.forEach(function (row) {
    for (var index = 0; index < ROW_INFO[row].count; index++) {
      if (canPlace(board, side, row, index, strength, opts).ok) tiles.push({ row: row, index: index });
    }
  });
  return tiles;
}
/* Whether a given card, in a given run, ignores row minimums. */
export function placeOpts(cardId, relics, board, side) {
  var cardDef = CARDS[cardId];
  var anyRow = !!(cardDef && cardDef.anyRow) || hasRelic(relics || [], 'field_commission');
  var freeRows = null;
  /* A Footing on the board opens its own row to anything, so the enabler can
     come from the board as well as from the card or the relic. */
  if (!anyRow && board && side) {
    ROWS.forEach(function (row) {
      for (var index = 0; index < ROW_INFO[row].count; index++) {
        var unit = board[side][row][index];
        if (unit && CARDS[unit.cardId] && CARDS[unit.cardId].rowFreesPlacement) {
          (freeRows = freeRows || {})[row] = 1;
        }
      }
    });
  }
  return { anyRow: anyRow, freeRows: freeRows };
}
export function splitStrength(strength, shareCount) {
  if (shareCount <= 0) return [];
  var base = Math.floor(strength / shareCount), remainder = strength - base * shareCount, shares = [];
  for (var index = 0; index < shareCount; index++) shares.push(base + (index < remainder ? 1 : 0));
  return shares;
}
export function hazardsOnRow(hazards, row) { return ['bottom', 'top'].map(function (side) { return hazards[side][row]; }).filter(Boolean); }
export function rowHasHazard(hazards, row, kind) { return hazardsOnRow(hazards, row).indexOf(kind) !== -1; }
export function freeHazardRows(hazards, side) { return ROWS.filter(function (row) { return !hazards[side][row]; }); }
