/* The colour lab screens. */

import { rules as C } from '../../game/index.js';
import { advance, boostUnit, confirmFusion, curseRisk, deckUnits, rollLab, store, toggleLabPick, volatilePress } from '../../game/index.js';
import { els } from '../dom.js';
import { cardMini } from './chrome.js';

var CARDS = C.CARDS;

export function renderLab() {
  if (!store.run.lab) rollLab();
  var lab = store.run.lab;
  if (lab.kind === 'volatile') return renderVolatileLab();
  if (lab.kind === 'fuse') return renderFuseLab();
  return renderBoostLab();
}

/* --- permanent fusion --- */
function renderFuseLab() {
  var lab = store.run.lab, units = deckUnits();
  var preview = '';
  if (lab.picks.length === 2) {
    var entryA = store.run.deck[lab.picks[0]], entryB = store.run.deck[lab.picks[1]];
    var previewResult = C.fusePreview(entryA, entryB), colorDef = C.colorInfo(previewResult.color);
    /* Fusing a secondary against the one primary it does not already contain
       cannot make Black on its own — that takes two secondaries. The mix
       still happens; it just stays the secondary, added together. Worth
       saying here, since the printed maths ("+bonus, Black in the mix")
       otherwise implies something it is not doing. */
    var rawWouldBe = C.mixColor(CARDS[entryA.id].color, CARDS[entryB.id].color);
    var redirected = rawWouldBe === 'black' && previewResult.color !== 'black';
    preview = '<div class="lab-preview"><span class="lbl">Result</span>' +
      '<div class="mini-card" style="--card:' + colorDef.hex + ';--card-ink:' + colorDef.ink + '">' +
      '<span class="mini-top">' + previewResult.strength + '</span>' +
      '<span class="mini-name">' + colorDef.name + ' Amalgam</span>' +
      '<span class="mini-text">' + C.cardName(entryA) + ' + ' + C.cardName(entryB) + ' + ' + previewResult.bonus + '. No rules text.</span></div>' +
      (redirected ? '<p class="legend-note">Black only comes from two secondary colours — this stays ' +
        colorDef.name + ', just stronger.</p>' : '') +
      '<button class="primary" id="labConfirm">Fuse them permanently</button></div>';
  }
  els.labBody.innerHTML = '<h2>Permanent Fusion</h2>' +
    '<p class="screen-lead">Pick two units from your deck. They are consumed and reforged into a single card ' +
    'following the usual mixing rules — colours combine, strengths add plus one, plus two if Black is in the mix. ' +
    'Like any mixed unit, the result carries no rules text.</p>' +
    '<div class="deck-grid">' + units.map(function (unit) {
      var on = lab.picks.indexOf(unit.index) !== -1;
      return '<button class="swap-card' + (on ? ' picked' : '') + '" data-i="' + unit.index + '">' + cardMini(unit.entry) + '</button>';
    }).join('') + '</div>' + preview;

  Array.prototype.forEach.call(els.labBody.querySelectorAll('.swap-card'), function (btn) {
    btn.addEventListener('click', function () { toggleLabPick(+btn.getAttribute('data-i')); });
  });
  var conf = document.getElementById('labConfirm');
  if (conf) conf.addEventListener('click', confirmFusion);
}

/* --- reinforcement --- */
function renderBoostLab() {
  var lab = store.run.lab, units = deckUnits();
  if (lab.done) {
    els.labBody.innerHTML = '<h2>Reinforcement</h2>' +
      '<p class="screen-lead">The bench settles on <b>+' + lab.amount + '</b>.</p>' +
      '<div class="deck-grid">' + cardMini(store.run.deck[lab.target]) + '</div>' +
      '<button class="primary" id="labLeave">Leave the lab</button>';
    document.getElementById('labLeave').addEventListener('click', advance);
    return;
  }
  els.labBody.innerHTML = '<h2>Reinforcement</h2>' +
    '<p class="screen-lead">Pick a unit to reinforce. The bench is imprecise — it will add either ' +
    '<b>+1</b> or <b>+2</b> strength, permanently.</p>' +
    '<div class="deck-grid">' + units.map(function (unit) {
      return '<button class="swap-card" data-i="' + unit.index + '">' + cardMini(unit.entry) + '</button>';
    }).join('') + '</div>';
  Array.prototype.forEach.call(els.labBody.querySelectorAll('.swap-card'), function (btn) {
    btn.addEventListener('click', function () { boostUnit(+btn.getAttribute('data-i')); });
  });
}

function renderVolatileLab() {
  var lab = store.run.lab;
  var risk = Math.round(curseRisk(lab.presses) * 100);
  els.labBody.innerHTML = '<h2>The Volatile Lab</h2>' +
    '<p class="screen-lead">Something is already bubbling. Pull the lever as often as you dare — ' +
    'each pull reshapes your deck, and each one makes the next more likely to bite.</p>' +
    '<div class="vol-meter"><div class="vol-row"><span class="lbl">Curse risk on the next pull</span>' +
    '<b class="' + (risk > 45 ? 'hot' : risk > 25 ? 'warm' : '') + '">' + risk + '%</b></div>' +
    '<div class="vol-bar"><span style="width:' + Math.min(100, risk / 0.75) + '%"></span></div>' +
    '<div class="vol-row"><span class="lbl">Pulls</span><b>' + lab.presses + '</b>' +
    '<span class="lbl">Curses taken</span><b class="' + (lab.curses ? 'hot' : '') + '">' + lab.curses + '</b></div></div>' +
    '<div class="vol-actions"><button class="primary danger" id="labPress">Pull the lever</button>' +
    '<button class="primary" id="labLeave">Leave with what you have</button></div>' +
    (lab.results.length ? '<ul class="vol-log">' + lab.results.map(function (result) {
      return '<li class="' + result.tone + '">' + result.text + '</li>';
    }).join('') + '</ul>' : '<p class="muted" style="font-size:12.5px">Nothing pulled yet.</p>');

  document.getElementById('labPress').addEventListener('click', volatilePress);
  document.getElementById('labLeave').addEventListener('click', advance);
}
