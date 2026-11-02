/* What is on screen follows run.screen. */

import { getActiveRun, getBattleState, getLog } from '../../game/index.js';
import { buildBoard } from '../battle/board.js';
import { render } from '../battle/index.js';
import { els } from '../dom.js';
import { applyActTheme, renderActSelect, renderGameOver, renderVictory } from './acts.js';
import { applyGrey, renderRunBar } from './chrome.js';
import { renderEvent } from './event.js';
import { renderLab } from './lab.js';
import { renderMap, renderMapLegend } from './map.js';
import { renderPvp } from './pvp.js';
import { renderReward } from './reward.js';
import { renderShop } from './shop.js';

/* What is on screen follows run.screen. Runs after every action. */
var renderedBattle = null, renderedAct = null;

export function renderScreen() {
  var screen = getActiveRun().screen;
  document.body.classList.toggle('pvp-mode', !!getActiveRun().pvp);
  // the battle screen is locked to one viewport; everything else scrolls normally
  document.body.classList.toggle('battle-mode', screen === 'battle');
  // also on the root, or its scrollbar gutter leaves a grey band beside the art
  document.documentElement.classList.toggle('battle-mode', screen === 'battle');
  if (screen !== 'battle') {
    var hud = document.getElementById('battleHud');
    if (hud) hud.hidden = true;   // hide the battle HUD content on every other screen
    // leaving battle: drop the inline alignment so other screens keep the
    // CSS default rather than a stale position computed for the board.
    var art = document.querySelector('.room-art');
    if (art) { art.style.backgroundPosition = ''; art.style.backgroundSize = ''; }
  }
  ['map', 'act', 'victory', 'battle', 'reward', 'shop', 'lab', 'event', 'gameover', 'pvp'].forEach(function (screenName) {
    var el = els['screen_' + screenName];
    if (el) el.hidden = (screenName !== screen);
  });
  if (getActiveRun().act !== renderedAct) { renderedAct = getActiveRun().act; applyActTheme(); }
  applyGrey();
  renderRunBar();
  if (screen === 'map') { renderMap(); renderMapLegend(); }
  else if (screen === 'act') renderActSelect();
  else if (screen === 'victory') renderVictory();
  else if (screen === 'reward') renderReward();
  else if (screen === 'shop') renderShop();
  else if (screen === 'lab') renderLab();
  else if (screen === 'event') renderEvent();
  else if (screen === 'gameover') renderGameOver();
  else if (screen === 'pvp') renderPvp();
  else if (screen === 'battle') {
    if (getBattleState() !== renderedBattle) { renderedBattle = getBattleState(); buildBoard(); }
    render();
  }
}

/* The battle log, newest first. */
export function renderLog() {
  if (els.logList) els.logList.innerHTML = getLog().map(function (entry) { return '<li>' + entry + '</li>'; }).join('');
}
