/* Colour Vibes — generated from the single-file build by build/split.py.
   Edit color-vibes-act1.html, then re-run the script. */

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
export function cloneBoard(b) {
  var o = { bottom: {}, top: {} };
  ['bottom', 'top'].forEach(function (s) {
    ROWS.forEach(function (r) {
      o[s][r] = b[s][r].map(function (u) {
        return u ? { cardId: u.cardId, color: u.color, strength: u.strength, temp: u.temp || 0, up: u.up || false, cracked: u.cracked || 0, deckIndex: u.deckIndex } : null;
      });
    });
  });
  return o;
}
export function cloneHazards(h) {
  var o = emptyHazards();
  ['bottom', 'top'].forEach(function (s) { ROWS.forEach(function (r) { o[s][r] = h[s][r]; }); });
  return o;
}
export function otherSide(s) { return s === 'bottom' ? 'top' : 'bottom'; }
export function unitAt(b, s, r, i) { return b[s][r][i]; }
export function sideName(s) { return s === PLAYER ? 'You' : 'Enemy'; }
export function slotName(r, i) { return ROW_INFO[r].label + ' · Slot ' + (i + 1); }
export function eachUnit(board, side, fn) {
  ROWS.forEach(function (row) {
    for (var i = 0; i < ROW_INFO[row].count; i++) { var u = board[side][row][i]; if (u) fn(u, row, i); }
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
  var free = opts && (opts.anyRow || (opts.freeRows && opts.freeRows[row]));
  if (!free && strength < ROW_INFO[row].min) {
    return { ok: false, reason: ROW_INFO[row].label + ' needs strength ' + ROW_INFO[row].min + ' or higher.' };
  }
  return { ok: true };
}
export function legalTiles(board, side, strength, opts) {
  var out = [];
  ROWS.forEach(function (row) {
    for (var i = 0; i < ROW_INFO[row].count; i++) {
      if (canPlace(board, side, row, i, strength, opts).ok) out.push({ row: row, index: i });
    }
  });
  return out;
}
/* Whether a given card, in a given run, ignores row minimums. */
export function placeOpts(cardId, relics, board, side) {
  var d = CARDS[cardId];
  var free = !!(d && d.anyRow) || hasRelic(relics || [], 'field_commission');
  var freeRows = null;
  /* A Footing on the board opens its own row to anything, so the enabler can
     come from the board as well as from the card or the relic. */
  if (!free && board && side) {
    ROWS.forEach(function (row) {
      for (var i = 0; i < ROW_INFO[row].count; i++) {
        var u = board[side][row][i];
        if (u && CARDS[u.cardId] && CARDS[u.cardId].rowFreesPlacement) {
          (freeRows = freeRows || {})[row] = 1;
        }
      }
    });
  }
  return { anyRow: free, freeRows: freeRows };
}
export function splitStrength(strength, n) {
  if (n <= 0) return [];
  var base = Math.floor(strength / n), rem = strength - base * n, out = [];
  for (var i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
  return out;
}
export function hazardsOnRow(h, row) { return ['bottom', 'top'].map(function (s) { return h[s][row]; }).filter(Boolean); }
export function rowHasHazard(h, row, kind) { return hazardsOnRow(h, row).indexOf(kind) !== -1; }
export function freeHazardRows(h, side) { return ROWS.filter(function (r) { return !h[side][r]; }); }
