/* Drawing a battle, and pacing the opponent so it looks like it is thinking. */

import { rules as C } from '../../game/index.js';
import { evalCtx, getBattleState, opponentAct, opponentThink } from '../../game/index.js';
import { renderFissures, renderHazardMarks, renderTiles } from './board.js';
import { renderEnemyHand, renderHand } from './hand.js';
import { renderInfoOverlay } from './info.js';
import { alignRoomBackground, sizeBoardStage } from './layout.js';
import { renderControls, renderLanes, renderStatus } from './panels.js';

var evaluateBoard = C.evaluateBoard;

export function render() {
  var state = getBattleState();
  if (!state) return;
  var ev = evaluateBoard(state.board, state.hazards, evalCtx(state));
  renderTiles(ev); renderStatus(); renderControls(ev); renderHand();
  renderLanes(ev); renderHazardMarks(); renderFissures(); renderInfoOverlay(ev); renderEnemyHand();
  sizeBoardStage();
  alignRoomBackground();
}

export function showPassPuck(on) {
  var el = document.getElementById('passPuck');
  if (!el) return;
  if (on) {
    el.hidden = false;
    // restart the drop, so a second pass in the same battle animates again
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  } else {
    el.hidden = true;
  }
}

/* View: give the enemy its pause, then let it move. */
export function maybeOpponentMove() {
  var delay = opponentThink();
  if (delay === null) return;
  var thinkingState = getBattleState();
  render();
  setTimeout(function () { if (getBattleState() === thinkingState) opponentAct(); }, delay);
}
