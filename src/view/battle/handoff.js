/* The cover between turns of a friendly match.

   The engine leaves it to the opponent's turn and waits. The acting player keeps
   a moment to see what their move did, then the screen goes dark before the seats
   trade, so the next player's hand is never drawn in front of the wrong person. */

import { getBattleState, getLog, needsHandoff, rules as C, takeSeat } from '../../game/index.js';
import { els } from '../dom.js';

var LINGER_MS = 900;
var waiting = null, wired = false;

function coverText(state) {
  var nextUp = state.turn === C.ENEMY ? state.seats.top.name : state.seats.bottom.name;
  els.pvpCoverName.textContent = nextUp;
  var lastEvent = (getLog()[0] || '').replace(/^R\d+ · /, '');
  els.pvpCoverNote.innerHTML = state.finalTurn
    ? 'The other player passed. This is your last action of the round.'
    : (lastEvent || 'No peeking at the other hand.');
}

export function syncHandoff() {
  if (!els.pvpCover) return;
  if (!wired) {
    wired = true;
    els.pvpCoverGo.addEventListener('click', function () { els.pvpCover.hidden = true; takeSeat(); });
  }
  var state = getBattleState();
  if (!needsHandoff(state)) {
    els.pvpCover.hidden = true;
    if (waiting) { clearTimeout(waiting); waiting = null; }
    return;
  }
  if (!els.pvpCover.hidden || waiting) return;
  waiting = setTimeout(function () {
    waiting = null;
    var current = getBattleState();
    if (!needsHandoff(current)) return;
    coverText(current);
    els.pvpCover.hidden = false;
    els.pvpCoverGo.focus();
  }, state.freshSeat && state.turn !== C.ENEMY ? 0 : LINGER_MS);
}
