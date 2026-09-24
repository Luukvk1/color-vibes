/* Which tiles, units and colours a card may ask for, and resolving a card
   against the ones it got. */

import C from '../rules/index.js';
import { getBattleState, store } from '../store.js';
import { buildApi } from './engine.js';

var CARDS = C.CARDS;
var COLOR_KEYS = C.COLOR_KEYS;
var PLAYER = C.PLAYER;
var ROWS = C.ROWS;
var ROW_INFO = C.ROW_INFO;
var adjacentTilesFor = C.adjacentTilesFor;
var cardStrength = C.cardStrength;
var eachUnit = C.eachUnit;
var hasRelic = C.hasRelic;
var unitAt = C.unitAt;

/* ===================================================================
   TARGETING AND CARD RESOLUTION
   =================================================================== */
export function legalTargets(battleState, side, spec, picks, selfTile) {
  var legal = [], topology = C.boardTopo(battleState.fissures || (store.run && store.run.fissures));
  function adjacentOf(tile) { return adjacentTilesFor(side, tile.row, tile.index, topology); }
  if (spec.kind === 'friendlyUnit') eachUnit(battleState.board, side, function (unit, row, index) { legal.push({ row: row, index: index }); });
  else if (spec.kind === 'friendlyAdjacentToSelf') {
    if (selfTile) adjacentOf(selfTile).forEach(function (tile) { if (unitAt(battleState.board, side, tile.row, tile.index)) legal.push(tile); });
  } else if (spec.kind === 'friendlyAdjacentTo') {
    var ref = picks[spec.ref];
    if (ref) adjacentOf(ref).forEach(function (tile) { if (unitAt(battleState.board, side, tile.row, tile.index)) legal.push(tile); });
  } else if (spec.kind === 'emptyAdjacentTo') {
    var refTile = picks[spec.ref];
    if (refTile) {
      var movingUnit = unitAt(battleState.board, side, refTile.row, refTile.index), movingStrength = movingUnit ? movingUnit.strength + (movingUnit.temp || 0) : 0;
      adjacentOf(refTile).forEach(function (tile) {
        if (!unitAt(battleState.board, side, tile.row, tile.index) && movingStrength >= ROW_INFO[tile.row].min) legal.push(tile);
      });
    }
  } else if (spec.kind === 'hazard') {
    ['bottom', 'top'].forEach(function (hazardSide) { ROWS.forEach(function (row) { if (battleState.hazards[hazardSide][row]) legal.push({ side: hazardSide, row: row, hazard: battleState.hazards[hazardSide][row] }); }); });
  } else if (spec.kind === 'color') COLOR_KEYS.forEach(function (colorKey) { legal.push({ color: colorKey }); });
  return legal;
}

export function autoTargets(battleState, side, card, selfTile) {
  var cardDef = CARDS[card.id];
  if (!cardDef.targets) return [];
  var picks = [];
  for (var specIndex = 0; specIndex < cardDef.targets.length; specIndex++) {
    var spec = cardDef.targets[specIndex], options = legalTargets(battleState, side, spec, picks, selfTile);
    if (/^friendly/.test(spec.kind)) {
      options = options.slice().sort(function (tileA, tileB) {
        var unitA = unitAt(battleState.board, side, tileA.row, tileA.index), unitB = unitAt(battleState.board, side, tileB.row, tileB.index);
        return (unitB.strength + (unitB.temp || 0)) - (unitA.strength + (unitA.temp || 0));
      });
    }
    if (!options.length) return picks;
    picks.push(options[0]);
  }
  return picks;
}

export function resolveCard(battleState, side, card, tile, targets) {
  var cardDef = CARDS[card.id], notes = [];
  if (cardDef.type === 'hazard') { battleState.hazards[side][tile.row] = cardDef.hazardKind; notes.push('hazard on ' + ROW_INFO[tile.row].label); return notes; }
  if (cardDef.type === 'unit') {
    var strength = cardStrength(card);
    var relics = (side === PLAYER && battleState.relics) ? battleState.relics : [];
    if (hasRelic(relics, 'heavy_brush') && ROW_INFO[tile.row].depth === 3) strength += 1;
    battleState.board[side][tile.row][tile.index] = { cardId: card.id, color: cardDef.color, strength: strength, temp: 0, up: card.up, cracked: 0, deckIndex: card.deckIndex };
  }
  if (cardDef.onPlay) {
    var note = cardDef.onPlay(battleState, side, tile || { row: null, index: null }, targets || [], buildApi(battleState, side, notes));
    if (note) notes.push(note);
  }
  return notes;
}

export function pendingSpec() {
  var state = getBattleState();
  if (!state.pending) return null;
  var list = state.pending.kind === 'wild'
    ? [{ kind: 'friendlyUnit', prompt: 'Pick a unit to repaint' }, { kind: 'color', prompt: 'Pick its new colour' }]
    : CARDS[state.pending.card.id].targets;
  return list ? list[state.pending.picks.length] : null;
}

export function currentTargetOptions() {
  var state = getBattleState(), spec = pendingSpec();
  if (!spec) return [];
  return legalTargets(state, state.pending.side, spec, state.pending.picks, state.pending.tile);
}
