/* What the in-browser self-test suite is given to work with.

   The suite drives the real game and reads the real page, so it needs both
   sides: the game's whole surface, plus the view functions that draw it. The
   old code handed it one big `RUN` object; this rebuilds that shape from the
   modules it now lives in, so the suite reads the same as it always did.

   The save round-trip checks go through the real session module, exactly as
   main.js does — snapshot the game, write it, read it back, restore it. */

import * as game from '../game/index.js';
import * as session from '../session/index.js';
import { render, showPassPuck } from './battle/index.js';
import { sizeBoardStage } from './battle/layout.js';
import { els, tileEls, SVG_NS } from './dom.js';
import * as icons from './icons.js';
import { ACT_ART, ACT_OMENS } from './content.js';
import { cardMini, chip, renderDeckModal, renderRunBar } from './screens/chrome.js';
import { closeGlossary, openGlossary, renderGlossary, setGlossaryTab } from './screens/glossary.js';
import { renderMap } from './screens/map.js';
import { applyActTheme, renderVictory } from './screens/acts.js';
import { TUTORIAL_LESSONS, TUTORIAL_STEPS, liveUnits, renderTutorial, tutorialStep } from './tutorial.js';

/* Run a suite pass with storage pointed at the sandbox, so it cannot touch a
   player's real save. */
export function isolated(fn) {
  session.sandbox(true);
  try { return fn(); } finally { session.sandbox(false); }
}

export function buildTestContext() {
  // the old rules object also carried the glyph vocabulary and the SVG namespace
  var C = Object.assign({}, game.rules, icons, { SVG_NS: SVG_NS });
  var RUN = Object.assign({}, game, {
    els: els, tileEls: tileEls, log: game.store.log,
    ACT_ART: ACT_ART, ACT_OMENS: ACT_OMENS, TUTORIAL_LESSONS: TUTORIAL_LESSONS, TUTORIAL_STEPS: TUTORIAL_STEPS,
    cardMini: cardMini, chip: chip, renderDeckModal: renderDeckModal, renderRunBar: renderRunBar, renderMap: renderMap,
    renderGlossary: renderGlossary, openGlossary: openGlossary, closeGlossary: closeGlossary, setGlossaryTab: setGlossaryTab,
    renderVictory: renderVictory, applyActTheme: applyActTheme, renderTutorial: renderTutorial, tutorialStep: tutorialStep,
    liveUnits: liveUnits,
    // storage, the way main.js does it, but from the live run rather than the last checkpoint
    saveRun: function () {
      var run = game.getRun();
      if (run && run.screen !== 'battle') session.save({ run: run, codex: game.codex });
    },
    loadRun: function () { return game.restoreRun(session.load().run); },
    clearSave: function () { session.clear(); },
    saveKey: session.storageKey
  });
  return {
    S: game.getBattleState, sizeBoardStage: sizeBoardStage, render: render, showPassPuck: showPassPuck,
    snapshotForRewind: game.snapshotForRewind, markRewindPoint: game.markRewindPoint, restoreRewind: game.restoreRewind,
    canRewind: game.canRewind, pass: game.pass, endBattle: game.endBattle,
    aiSkill: game.aiSkill, shapedLead: game.shapedLead, reservePrice: game.reservePrice, concedeBonus: game.concedeBonus,
    spendCost: game.spendCost, laneShapedDelta: game.laneShapedDelta, decideOpponentMove: game.decideOpponentMove,
    SAFE_LEAD: game.SAFE_LEAD,
    C: C, RUN: RUN, COLORS: C.COLORS, COLOR_KEYS: C.COLOR_KEYS, CARDS: C.CARDS, RELICS: C.RELICS, ENEMIES: C.ENEMIES,
    ROW_INFO: C.ROW_INFO, ROWS: C.ROWS, PLAYER: C.PLAYER, ENEMY: C.ENEMY, GEO: C.GEO, eachUnit: C.eachUnit, lanesOf: C.lanesOf,
    els: els, tileEls: tileEls
  };
}
