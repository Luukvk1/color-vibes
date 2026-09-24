/* The round-result modal. */

import { rules as C } from '../../game/index.js';
import { continueBattle, getBattleState } from '../../game/index.js';
import { els } from '../dom.js';

var CARDS = C.CARDS;
var PLAYER = C.PLAYER;
var ROW_INFO = C.ROW_INFO;
var colorInfo = C.colorInfo;

function laneTable(ev) {
  var rows = ev.lanes.map(function (lane) {
    function cell(side) {
      var laneSide = lane[side];
      if (!laneSide) return '<td class="muted">—</td><td class="muted">—</td>';
      var colorData = colorInfo(laneSide.color), championDef = CARDS[laneSide.champion.unit.cardId];
      return '<td><span class="chip mini" style="background:' + colorData.hex + ';color:' + colorData.ink + '">' + colorData.name + '</span>' +
        '<em class="detail">' + (championDef ? championDef.name : 'Mixed') + ' · ' + ROW_INFO[laneSide.champion.row].label.replace('Row ', 'R') + '</em></td>' +
        '<td class="num">' + laneSide.frontStrength + (laneSide.support ? '+' + laneSide.support : '') +
        (laneSide.multiplier > 1 ? ' <b class="fx">\u00d7' + laneSide.multiplier + '</b>' : '') + '<b class="tot">' + laneSide.final + '</b></td>';
    }
    return '<tr><td class="lane-no">' + (lane.index + 1) + '</td>' + cell('bottom') + cell('top') + '</tr>';
  }).join('');
  return '<table class="lane-table"><thead><tr><th>Lane</th><th>Your frontline</th><th>Score</th><th>Enemy frontline</th><th>Score</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* View: the modal that reads out a scored round. */
var scheduledResult = null;

export function syncResults() {
  var state = getBattleState(), roundResult = state && state.roundResult;
  if (!roundResult) { scheduledResult = null; return; }
  if (roundResult === scheduledResult) return;
  scheduledResult = roundResult;
  // let the final animation land before the modal covers the board
  setTimeout(function () {
    if (getBattleState() === state && state.roundResult === roundResult) showResults(roundResult.ev, roundResult.result);
  }, 520);
}

function showResults(ev, result) {
  var state = getBattleState();
  var playerWon = state.wins.bottom >= 2;
  els.resultsTitle.textContent = state.battleOver
    ? (playerWon ? 'Battle won' : 'Battle lost')
    : 'Round ' + state.round + ' — ' + (result.winner === PLAYER ? 'you win' : 'enemy wins');
  els.resultsBody.innerHTML =
    '<p class="result-score"><span class="you">You ' + result.bottom + '</span><span class="vs">:</span><span class="opp">' + result.top + ' ' + state.enemy.name + '</span></p>' +
    (result.note ? '<p class="tiebreak">' + result.note + '</p>' : '') + laneTable(ev) +
    '<p class="match-line">Rounds — You ' + state.wins.bottom + ' : ' + state.wins.top + ' · raw ' + ev.raw.bottom + ' : ' + ev.raw.top +
    ' · longest chain ' + state.bestChain + '</p>';

  if (state.battleOver) {
    els.continueBtn.textContent = playerWon ? 'Claim reward' : 'Continue';
  } else {
    els.resultsBody.innerHTML += '<p class="rule-note">Frontline units in <b>contested</b> lanes fall before round ' +
      (state.round + 1) + ' — whatever sits behind them steps up. A lane the enemy never contested keeps its unit.</p>';
    els.continueBtn.textContent = 'Start round ' + (state.round + 1);
  }
  els.continueBtn.onclick = function () { els.overlay.hidden = true; continueBattle(); };
  els.overlay.hidden = false;
  els.continueBtn.focus();
}
