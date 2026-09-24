/* The view: everything a player sees and touches.

   It reads the game's state and turns taps into game actions; it never decides
   anything itself. The game announces what happened through subscribe(), and this
   is the one place that turns an announcement into pixels. */

import { getActiveRun, getBattleState, rules, subscribe, tutorial, tutorialOpen } from '../game/index.js';
import { announce } from './battle/panels.js';
import { newFissures, playFx } from './battle/board.js';
import { maybeOpponentMove, render, showPassPuck } from './battle/index.js';
import { syncResults } from './battle/results.js';
import { els } from './dom.js';
import { init, selfTest } from './menu.js';
import { renderLog, renderScreen } from './screens/index.js';
import { renderTutorial, tutorialView } from './tutorial.js';

function syncTutorialToggle() {
  if (els.tutorialToggle) els.tutorialToggle.textContent = 'Tutorial: ' + (tutorial.enabled ? 'on' : 'off');
  if (els.tutorialOff) els.tutorialOff.checked = !tutorial.enabled;
}

function onGameEvent(type, payload) {
  if (type === 'log') { renderLog(); return; }
  if (type === 'passPuck') { showPassPuck(payload); return; }
  if (type === 'fx') { playFx(payload); return; }
  if (type === 'announce') { announce(payload.text, payload.tone); return; }
  if (type === 'fissure') { newFissures[payload.key] = 1; return; }
  if (type !== 'change' || !getActiveRun() || !els.mapBody) return;   // nothing to draw on yet
  renderScreen();
  if (tutorial.open !== tutorialView.open) renderTutorial();
  syncTutorialToggle();
  if (getActiveRun().screen === 'battle' && getBattleState()) {
    syncResults();
    // the enemy holds its move while a lesson is open, so nothing shifts under someone reading
    if (!tutorialOpen()) maybeOpponentMove();
  }
}

/* Start listening and, once the page is ready, wire it up. The game is already
   running by now (main.js started it), so the first render has a run to read. */
export function mount() {
  subscribe(onGameEvent);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

/* What the console and the browser tests reach for. */
export { selfTest, render, rules };
