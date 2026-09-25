/* The colour lab screens. */

import { getActiveRun, rules as C } from '../../game/index.js';
import { advance, boostUnit, confirmFusion, curseRisk, deckUnits, rollLab, toggleLabPick, volatilePress } from '../../game/index.js';
import { els } from '../dom.js';
import { cardMini } from './chrome.js';

var CARDS = C.CARDS;

export function renderLab() {
  if (!getActiveRun().lab) rollLab();
  var lab = getActiveRun().lab;
  if (lab.kind === 'volatile') return renderVolatileLab();
  if (lab.kind === 'fuse') return renderFuseLab();
  return renderBoostLab();
}

/* --- permanent fusion --- */
function renderFuseLab() {
  var lab = getActiveRun().lab, units = deckUnits();
  var preview = '';
  if (lab.picks.length === 2) {
    var entryA = getActiveRun().deck[lab.picks[0]], entryB = getActiveRun().deck[lab.picks[1]];
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
  var lab = getActiveRun().lab, units = deckUnits();
  if (lab.done) {
    els.labBody.innerHTML = '<h2>Reinforcement</h2>' +
      '<p class="screen-lead">The bench settles on <b>+' + lab.amount + '</b>.</p>' +
      '<div class="deck-grid">' + cardMini(getActiveRun().deck[lab.target]) + '</div>' +
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

/* What one pull did, in words. The engine records what happened; how it reads is ours. */
function describeResult(result) {
  if (result.tone === 'curse') return 'The mixture turns on you — <b>' + result.curse.name + '</b> is now in your deck. ' + result.curse.text;
  if (result.tone === 'cascade') {
    return '<b>THE WHOLE BENCH GOES UP.</b> Every one of your ' + result.touched + ' units gains strength and a new colour' +
      (result.fusions ? ', and ' + result.fusions + ' pair' + (result.fusions > 1 ? 's' : '') + ' collapse together' : '') + '.';
  }
  return (result.multiple ? '<b>\u00d7' + result.lines.length + '</b> ' : '') + result.lines.join(' \u00b7 ');
}

function renderVolatileLab() {
  var lab = getActiveRun().lab;
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
      return '<li class="' + result.tone + '">' + describeResult(result) + '</li>';
    }).join('') + '</ul>' : '<p class="muted" style="font-size:12.5px">Nothing pulled yet.</p>');

  document.getElementById('labPress').addEventListener('click', volatilePress);
  document.getElementById('labLeave').addEventListener('click', advance);
}
