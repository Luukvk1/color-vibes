/* The frame around the game: title screen, menus, keyboard, and wiring every
   button to the engine action it stands for. */

import { rules as C } from '../game/index.js';
import { advance, beginWild, cancelPending, cancelSelection, closeTutorial, dismissTutorial, getActiveRun, getBattleState, hasCheckpoint, newGame, onMixToggle, onPass, onRewind, resume, selectCard, setTutorial, skipReward, toggleShopRemoval, tutorial } from '../game/index.js';
import { buildBoard } from './battle/board.js';
import { closeInfo } from './battle/info.js';
import { alignRoomBackground, sizeBoardStage } from './battle/layout.js';
import { els } from './dom.js';
import { iconRow } from './icons.js';
import { renderDeckModal } from './screens/chrome.js';
import { closeGlossary, openGlossary, setGlossaryTab } from './screens/glossary.js';
import { renderScreen } from './screens/index.js';
import { tutorialStep } from './tutorial.js';

var CARDS = C.CARDS;
var PLAYER = C.PLAYER;
var cardStrength = C.cardStrength;
var colorInfo = C.colorInfo;

/* The suite lives in ./self-test/. It is 44KB gzipped of code no player
   ever runs, so it is fetched the first time it is asked for rather than
   shipped with the game -- which is most of what having it in its own file
   is worth. Both ways in return a promise: the menu button and
   ColorVibes.selfTest(). */
let builtSelfTest = null;

export async function selfTest(only) {
  if (!builtSelfTest) {
    const { createSelfTest } = await import('./self-test/index.js');
    const { buildTestContext, isolated } = await import('./test-context.js');
    const suite = createSelfTest(buildTestContext());
    builtSelfTest = function (topic) { return isolated(function () { return suite(topic); }); };
  }
  return builtSelfTest(only);
}

async function runSelfTestUI() {
  var results = await selfTest(), passed = results.filter(function (test) { return test.pass; }).length;
  els.resultsTitle.textContent = 'Self test — ' + passed + ' / ' + results.length + ' passed';
  els.resultsBody.innerHTML = '<ul class="test-list">' + results.map(function (test) {
    return '<li class="' + (test.pass ? 'ok' : 'bad') + '"><span>' + (test.pass ? 'PASS' : 'FAIL') + '</span><span>' + test.name +
      (test.detail ? ' <em>(' + test.detail + ')</em>' : '') + '</span></li>';
  }).join('') + '</ul>';
  els.continueBtn.textContent = 'Close';
  els.continueBtn.onclick = function () { els.overlay.hidden = true; };
  els.overlay.hidden = false;
}

/* ===================================================================
   BOOT
   =================================================================== */
/* Wipe everything and drop back to a fresh map. Any open modal is closed first,
   otherwise the old overlay keeps covering the new run. */
/* Wipe everything and drop back to a fresh map. Any open modal is closed first,
   otherwise the old overlay keeps covering the new run. */
/* Wipe everything and drop back to a fresh map. Any open modal is closed first,
   otherwise the old overlay keeps covering the new run. */
export function startFreshRun() {
  els.overlay.hidden = true;
  els.deckOverlay.hidden = true;
  dismissTutorial();
  newGame();
}

/* Pick up where the player left off if there is anything to pick up. A save
   that fails to load for any reason yields null and we start clean rather
   than half-restoring something and limping. */
/* Pick up where the player left off if there is anything to pick up. */
function resumeSaved() {
  return resume();
}

/* The title is shown over a live game rather than instead of one: a run is
   always set up underneath, so dismissing the title is one flag and nothing
   has to be constructed at that moment. Continue only appears when there is
   genuinely something to continue. */
function showTitle() {
  var titleScreen = document.getElementById('titleScreen');
  var continueButton = document.getElementById('titleContinue');
  if (continueButton) continueButton.hidden = !hasCheckpoint();
  var newRunWarning = document.getElementById('titleNewWarn');
  if (newRunWarning) newRunWarning.hidden = true;
  var newRunButton = document.getElementById('titleNew');
  if (newRunButton) { newRunButton.textContent = 'New run'; newRunButton.dataset.armed = ''; }
  if (titleScreen) titleScreen.hidden = false;
}

function hideTitle() {
  var titleScreen = document.getElementById('titleScreen');
  if (titleScreen) titleScreen.hidden = true;
}

/* The game is already running behind the title — main.js started it — so the
   interface is never empty. */
function bootToTitle() {
  renderScreen();
  showTitle();
}

export function init() {
  ['board', 'controls', 'battleHud',
   'passBtn', 'rewindBtn', 'chainCount', 'cancelBtn', 'wildBtn', 'colorPicker', 'pipsYou', 'pipsOpp',
   'scoreYou', 'scoreOpp', 'enemyOmens', 'chainBadge',
   'logList', 'overlay', 'resultsTitle', 'resultsBody', 'continueBtn',
   'hand', 'handCount', 'cardPeek', 'lanes', 'enemyName', 'enemyRank', 'enemyRules', 'enemyRuleText', 'enemyRulesLayer',
   'lanesOverlay', 'logOverlay', 'infoOverlay', 'infoTitle', 'infoBody',
   'runLives', 'runGold', 'runDepth', 'runAct', 'runRelics', 'mapBody',
   'enemyColors', 'enemyHand', 'enemyDeckCount', 'actionToast',
   'rewardCards', 'rewardRelic', 'rewardRot', 'shopCards', 'shopRelics', 'shopRemove',
   'deckBtn', 'deckBtnCount', 'relicBtnCount', 'deckOverlay', 'deckModalBody', 'mapScroll', 'mapLegend',
   'tutorialOverlay', 'tutorialBody', 'tutorialBack', 'tutorialNext', 'tutorialSkip', 'tutorialOff',
   'tutorialToggle', 'easeNote', 'menuBtn', 'menuDropdown', 'logBtn',
   'labBody', 'eventBody', 'gameoverBody', 'actBody', 'victoryBody'
  ].forEach(function (id) { els[id] = document.getElementById(id); });
  ['map', 'act', 'victory', 'loadout', 'battle', 'reward', 'shop', 'lab', 'event', 'gameover'].forEach(function (screenName) {
    els['screen_' + screenName] = document.getElementById('screen-' + screenName);
  });

  buildBoard();
  var _bgRaf = null;
  window.addEventListener('resize', function () {
    if (_bgRaf) return;
    _bgRaf = requestAnimationFrame(function () { _bgRaf = null; sizeBoardStage(); alignRoomBackground(); });
  });
  /* Self-healing: any layout shift in the battle screen — a wrapped header, a
     longer enemy name, fonts finishing their load — re-triggers both, rather
     than relying only on game-state renders to happen to fire again. */
  if (window.ResizeObserver && els.screen_battle) {
    var _ro = new ResizeObserver(function () {
      if (_bgRaf) return;
      _bgRaf = requestAnimationFrame(function () { _bgRaf = null; sizeBoardStage(); alignRoomBackground(); });
    });
    _ro.observe(els.screen_battle);
  }

  els.passBtn.addEventListener('click', onPass);
  els.rewindBtn.addEventListener('click', onRewind);
  els.cancelBtn.addEventListener('click', cancelPending);
  els.wildBtn.addEventListener('click', beginWild);
  document.getElementById('leaveShopBtn').addEventListener('click', function () { advance(); });
  document.getElementById('skipRewardBtn').addEventListener('click', function () { skipReward(); });
  els.deckBtn.addEventListener('click', function () { renderDeckModal(); });
  /* The menu only holds toggles/one-shot actions, so it stays open on an
     inner click — New Run's arm-then-confirm needs the dropdown to survive
     its first tap — and closes on an outside tap, Escape, or re-toggling. */
  function closeMenu() {
    els.menuDropdown.hidden = true;
    els.menuBtn.setAttribute('aria-expanded', 'false');
  }
  /* One-shot, not a toggle — unlike the rest of the menu this one closes
     itself, since leaving the dropdown open behind the log modal would
     just be clutter once something else is on screen. */
  els.logBtn.addEventListener('click', function () {
    els.logOverlay.hidden = false;
    closeMenu();
  });
  els.menuBtn.addEventListener('click', function (event) {
    event.stopPropagation();
    var opening = els.menuDropdown.hidden;
    els.menuDropdown.hidden = !opening;
    els.menuBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
  });
  document.addEventListener('click', function (event) {
    if (els.menuDropdown.hidden) return;
    if (els.menuBtn.contains(event.target) || els.menuDropdown.contains(event.target)) return;
    closeMenu();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !els.menuDropdown.hidden) closeMenu();
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-close');
      if (id === 'infoOverlay') closeInfo();
      else document.getElementById(id).hidden = true;
    });
  });
  // tapping the backdrop dismisses these light overlays
  ['lanesOverlay', 'logOverlay', 'infoOverlay'].forEach(function (id) {
    els[id].addEventListener('click', function (event) {
      if (event.target !== els[id]) return;
      if (id === 'infoOverlay') closeInfo(); else els[id].hidden = true;
    });
  });
  els.tutorialBack.addEventListener('click', function () { tutorialStep(-1); });
  els.tutorialNext.addEventListener('click', function () { tutorialStep(1); });
  els.tutorialSkip.addEventListener('click', function () { dismissTutorial(); });
  els.tutorialOff.addEventListener('change', function () { setTutorial(!els.tutorialOff.checked); });
  els.tutorialToggle.addEventListener('click', function () { setTutorial(!tutorial.enabled); });
  els.deckCloseBtn = document.getElementById('deckCloseBtn');
  els.deckCloseBtn.addEventListener('click', function () { els.deckOverlay.hidden = true; });

  /* The overlay the peek strip opens. Built from the same card data the
     small hand button and the peek strip already read — a bigger rendering
     of the same card, not a second source of truth for what it says. */
  function openCardDetail(cardId) {
    if (!cardId) return;
    var overlay = document.getElementById('cardDetailOverlay');
    var body = document.getElementById('cardDetailBody');
    if (!overlay || !body) return;
    var html;
    if (cardId === '__mix__') {
      html = '<div class="cd-card" style="--card:' + colorInfo(null).hex + ';--card-ink:' + colorInfo(null).ink + '">' +
        '<div class="cd-top"><span class="cd-badge">' + (getBattleState() ? getBattleState().mixTokens[PLAYER] : 1) + '</span>' +
        '<div><div class="cd-name">Mix</div><div class="cd-meta">Action</div></div></div>' +
        '<div class="cd-icons">' + iconRow('__mix__') + '</div>' +
        '<div class="cd-text">Fuse two touching friendly units. Colours combine, strengths add plus one.</div></div>';
    } else {
      var cardDef = CARDS[cardId];
      if (!cardDef) return;
      var colorData = colorInfo(cardDef.color);
      var badge = cardDef.type === 'unit' ? (CARDS[cardId] ? cardStrengthDisplay(cardId) : cardDef.strength)
        : cardDef.type === 'hazard' ? 'HAZ' : 'SPL';
      html = '<div class="cd-card" style="--card:' + colorData.hex + ';--card-ink:' + colorData.ink + '">' +
        '<div class="cd-top"><span class="cd-badge">' + badge + '</span>' +
        '<div><div class="cd-name">' + cardDef.name + '</div>' +
        '<div class="cd-meta">' + cardDef.rarity + (cardDef.color ? ' \u00b7 ' + colorData.name : '') + '</div></div></div>' +
        '<div class="cd-icons">' + iconRow(cardId) + '</div>' +
        '<div class="cd-text">' + (cardDef.text || 'No effect. Just muscle.') + '</div></div>';
    }
    body.innerHTML = html;
    overlay.hidden = false;
  }
  /* The card currently selected for play may carry an upgrade (+1) that a
     bare CARDS[cardId].strength would miss — read it off the hand entry
     when one matches, same as the small card button already does. */
  function cardStrengthDisplay(cardId) {
    var state = getBattleState();
    var entry = state && state.hands[PLAYER].filter(function (card) { return card.id === cardId; })[0];
    return entry ? cardStrength(entry) : CARDS[cardId].strength;
  }
  els.cardPeek = document.getElementById('cardPeek');
  els.cardPeek.addEventListener('click', function () { openCardDetail(this.dataset.cardId); });
  var cardDetailOverlay = document.getElementById('cardDetailOverlay');
  document.getElementById('cardDetailCloseBtn').addEventListener('click', function () { cardDetailOverlay.hidden = true; });
  cardDetailOverlay.addEventListener('click', function (event) { if (event.target === cardDetailOverlay) cardDetailOverlay.hidden = true; });
  /* Two-step confirm rather than window.confirm(): browsers let people tick
     "prevent this page from creating more dialogs", after which confirm()
     silently returns false and the button looks broken. */
  var newRunBtn = document.getElementById('newRunBtn'), armed = null;
  function disarmNewRun() {
    clearTimeout(armed); armed = null;
    newRunBtn.textContent = 'New run';
    newRunBtn.classList.remove('armed');
  }
  newRunBtn.addEventListener('click', function () {
    if (!armed) {
      newRunBtn.textContent = 'Abandon run?';
      newRunBtn.classList.add('armed');
      armed = setTimeout(disarmNewRun, 4000);
      return;
    }
    disarmNewRun();
    startFreshRun();
  });
  document.getElementById('restartBtn').addEventListener('click', startFreshRun);

  /* ---- title screen ---- */
  document.getElementById('titleContinue').addEventListener('click', function () {
    if (resumeSaved()) hideTitle();
  });
  document.getElementById('titleNew').addEventListener('click', function () {
    var newRunButton = this, newRunWarning = document.getElementById('titleNewWarn');
    /* Starting over wipes a saved run, so it arms first when one exists.
       Without the confirm a mis-tap on the very first screen destroys a run
       the player never got to see. */
    if (hasCheckpoint() && newRunButton.dataset.armed !== '1') {
      newRunButton.dataset.armed = '1';
      newRunButton.textContent = 'Start over \u2014 tap again';
      if (newRunWarning) newRunWarning.hidden = false;
      return;
    }
    startFreshRun();
    hideTitle();
  });
  document.getElementById('titleGlossary').addEventListener('click', function () {
    openGlossary();
  });
  document.getElementById('glossaryBtn').addEventListener('click', function () {
    openGlossary();
  });
  document.getElementById('titleBtn').addEventListener('click', function () {
    showTitle();
  });
  document.getElementById('glossaryClose').addEventListener('click', function () {
    closeGlossary();
  });
  document.getElementById('glossary').addEventListener('click', function (event) {
    if (event.target === this) closeGlossary();     // tap the backdrop to dismiss
  });
  Array.prototype.forEach.call(document.querySelectorAll('.gl-tab'), function (tabButton) {
    tabButton.addEventListener('click', function () { setGlossaryTab(tabButton.getAttribute('data-tab')); });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !document.getElementById('glossary').hidden) closeGlossary();
  });
  document.getElementById('selfTestBtn').addEventListener('click', runSelfTestUI);
  /* Removal used to read r.active, a field that does not exist, so the button
     threw the moment it was clicked; and it removed a card at random, which is
     no use at all to someone trying to cut one specific curse out of a deck.
     Now it arms a picker and the player chooses. */
  els.shopRemove.addEventListener('click', function () { toggleShopRemoval(); });

  document.addEventListener('keydown', function (event) {
    var state = getBattleState();
    if (event.key === 'Escape') {
      if (!els.infoOverlay.hidden) { closeInfo(); return; }
      if (!els.lanesOverlay.hidden) { els.lanesOverlay.hidden = true; return; }
      if (!els.logOverlay.hidden) { els.logOverlay.hidden = true; return; }
    }
    if (!els.tutorialOverlay.hidden && event.key === 'Escape') { closeTutorial(); return; }
    if (!els.deckOverlay.hidden && event.key === 'Escape') { els.deckOverlay.hidden = true; return; }
    if (!document.getElementById('cardDetailOverlay').hidden && event.key === 'Escape') { document.getElementById('cardDetailOverlay').hidden = true; return; }
    if (!els.overlay.hidden && event.key === 'Escape') { els.overlay.hidden = true; return; }
    if (event.target && /INPUT|TEXTAREA/.test(event.target.tagName)) return;
    if (!state || getActiveRun().screen !== 'battle') return;
    var key = event.key.toLowerCase();
    if (key === 'escape') { cancelSelection(); return; }
    if (state.pending) return;
    if (key === 'p') onPass();
    if (key === 'r') onRewind();
    if (key === 'm') onMixToggle();
    if (/^[1-9]$/.test(key)) selectCard(+key - 1);
  });

  bootToTitle();
}
