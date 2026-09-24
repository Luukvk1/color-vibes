/* The inspector overlay, and what a tap on a tile turns into. */

import { rules as C } from '../../game/index.js';
import { clearInspection, evalCtx, getBattleState, onTileActivate } from '../../game/index.js';
import { els } from '../dom.js';
import { chip } from '../screens/chrome.js';

var CARDS = C.CARDS;
var ROW_INFO = C.ROW_INFO;
var adjacentTiles = C.adjacentTiles;
var colorInfo = C.colorInfo;
var evaluateBoard = C.evaluateBoard;
var lanesOf = C.lanesOf;
var otherSide = C.otherSide;
var sideName = C.sideName;
var slotName = C.slotName;
var unitAt = C.unitAt;

/* Detail now arrives as a tap-through overlay rather than a permanent panel,
   so the board can own the screen. */
export function openInfo(title, html) {
  els.infoTitle.textContent = title;
  els.infoBody.innerHTML = html;
  els.infoOverlay.hidden = false;
}

export function closeInfo() {
  els.infoOverlay.hidden = true;
  clearInspection();
}

/* The engine says what a tap meant; when it meant "look at this", show it. */
export function tapTile(side, row, index) {
  var outcome = onTileActivate(side, row, index);
  if (outcome !== 'inspect') return;
  var state = getBattleState();
  var ev = evaluateBoard(state.board, state.hazards, evalCtx(state));
  openInfo(sideName(side) + ' · ' + slotName(row, index), tileInfo(ev, state.inspected));
}

export function hazardInfo(hz) {
  return '<p class="inspect-sub">' + ROW_INFO[hz.row].label + ' · set by ' + sideName(hz.owner).toLowerCase() + '</p>' +
    '<p class="card-rules">' + (hz.kind === 'colorless'
      ? 'Units in this row have no colour. They cannot be effective, and nothing can be effective against them.'
      : 'Units in this row are 1 weaker.') + '</p>' +
    '<p class="inspect-note">A hazard sits on the row itself, so it applies to <b>both halves</b> — ' +
    'whoever set it pays the same price. Cyan Cleanser can clear it.</p>';
}

function tileInfo(ev, tile) {
  var state = getBattleState();
  var unit = unitAt(state.board, tile.side, tile.row, tile.index);
  /* Read the live topology, not the pristine one: a severed tile really does
     feed fewer lanes, and the panel is where a player checks why. */
  var topo = C.boardTopo(state.fissures);
  var lanes = C.lanesOfFor(tile.side, tile.row, tile.index, topo);
  var neighbours = C.adjacentTilesFor(tile.side, tile.row, tile.index, topo);
  var natural = adjacentTiles(tile.row, tile.index);
  var lost = natural.filter(function (naturalNeighbor) {
    return !neighbours.some(function (currentNeighbor) { return C.sameTile(currentNeighbor, naturalNeighbor); });
  });
  var gained = neighbours.filter(function (currentNeighbor) {
    return !natural.some(function (naturalNeighbor) { return C.sameTile(naturalNeighbor, currentNeighbor); });
  });
  var touching = C.fissuresTouching(tile.side, tile.row, tile.index, state.fissures);
  var cut = lanesOf(tile.row, tile.index).filter(function (laneIndex) { return lanes.indexOf(laneIndex) === -1; });
  var extraLanes = lanes.filter(function (laneIndex) { return lanesOf(tile.row, tile.index).indexOf(laneIndex) === -1; });
  function names(list) { return list.map(function (neighborTile) { return slotName(neighborTile.row, neighborTile.index); }).join(' and '); }
  var crackNote = (lost.length || gained.length || touching)
    ? '<p class="inspect-note">' +
      (lost.length
        ? 'A fissure separates this tile from ' + names(lost) +
          '. Nothing carries across it \u2014 no auras, no mixing, no support. '
        : '') +
      (gained.length
        ? 'A fissure has bridged this tile to ' + names(gained) +
          ', and everything carries across. '
        : '') +
      (cut.length
        ? 'It no longer reaches lane ' + cut.map(function (laneIndex) { return laneIndex + 1; }).join(' or ') + '. '
        : '') +
      (extraLanes.length
        ? 'It now also feeds lane ' + extraLanes.map(function (laneIndex) { return laneIndex + 1; }).join(' and ') +
          ', thinning every share it sends. '
        : '') +
      (touching
        ? 'A unit here bleeds ' + (C.FISSURE_DRAIN * touching) + ' strength into the fissures.'
        : '') +
      '</p>'
    : ''
  if (!unit) {
    return '<p class="inspect-sub">Empty · needs strength ' + ROW_INFO[tile.row].min + '</p>' +
      '<div class="link-row"><span>Feeds lanes</span><span>' +
      lanes.map(function (laneIndex) { return laneIndex + 1; }).join(', ') + '</span></div>' + crackNote;
  }
  var view = ev.get(tile.side, tile.row, tile.index), cardDef = CARDS[unit.cardId];
  var html = '<p class="inspect-sub">' + chip(view.color) + '<b>' + (cardDef ? cardDef.name : 'Mixed unit') + '</b></p>';
  html += '<p class="card-rules">' + (cardDef ? cardDef.text : 'Mixed units carry no card text.') + '</p>';
  html += '<div class="link-row"><span>Strength now</span><span><b>' + ev.strengthOf(view) + '</b></span></div>';
  html += crackNote;

  if (view.colorless || !C.EFFECTIVE[view.color]) {
    html += '<p class="inspect-note">Colourless — it cannot be effective, and nothing is effective against it.</p>';
  } else {
    var beats = C.EFFECTIVE[view.color];
    var beatenBy = C.COLOR_KEYS.filter(function (colorKey) { return C.isEffective(colorKey, view.color); });
    html += '<div class="matchup"><span class="lbl">Strong against</span><div class="mchips">' +
      beats.map(function (colorKey) { return chip(colorKey); }).join('') + '</div></div>' +
      '<div class="matchup"><span class="lbl">Weak to</span><div class="mchips">' +
      beatenBy.map(function (colorKey) { return chip(colorKey); }).join('') + '</div></div>';
    lanes.forEach(function (laneIndex) {
      var mine = ev.lanes[laneIndex][tile.side], foe = ev.lanes[laneIndex][otherSide(tile.side)];
      if (!mine || !foe) return;
      if (mine.champion.row !== tile.row || mine.champion.index !== tile.index) return;
      html += '<p class="inspect-note">Lane ' + (laneIndex + 1) + ' versus ' + colorInfo(foe.color).name + ' — ' +
        (mine.effective ? '<b class="good">you double here</b>'
         : foe.effective ? '<b class="bad">they double here</b>' : 'neither side is effective') + '.</p>';
    });
  }
  lanes.forEach(function (laneIndex) {
    var laneSide = ev.lanes[laneIndex][tile.side];
    var isFront = laneSide && laneSide.champion.row === tile.row && laneSide.champion.index === tile.index;
    html += '<div class="link-row"><span>Lane ' + (laneIndex + 1) + ' · ' + (isFront ? '<b>frontline</b>' : 'support') +
      '</span><span>' + ev.shares[tile.side + '-' + tile.row + '-' + tile.index][laneIndex] + '</span></div>';
  });
  return html;
}

/* Keep an open overlay in step with the board underneath it. */
export function renderInfoOverlay(ev) {
  var state = getBattleState();
  if (els.infoOverlay.hidden) return;
  if (state.inspectedHazard) {
    openInfo(state.inspectedHazard.kind === 'colorless' ? 'Colourless Row' : 'Scorched Row', hazardInfo(state.inspectedHazard));
  } else if (state.inspected) {
    openInfo(sideName(state.inspected.side) + ' · ' + slotName(state.inspected.row, state.inspected.index), tileInfo(ev, state.inspected));
  }
}
