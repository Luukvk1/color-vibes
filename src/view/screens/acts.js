/* The screens between acts: the fork, the victory choice, the ending. */

import { getActiveRun, rules as C } from '../../game/index.js';
import { ACTS, ACT_KEYS, SECRET_ACT_KEYS, allActsConquered, beginAct, endAsVictory, goEndless, secretOffers, whiteUnlocked } from '../../game/index.js';
import { setBackgroundMetrics } from '../battle/layout.js';
import { ACT_ART, SECRET_REASON } from '../content.js';
import { els } from '../dom.js';
import { cardMini } from './chrome.js';

var COLORS = C.COLORS;
var ENEMIES = C.ENEMIES;

export function renderActSelect() {
  var offer = getActiveRun().actOffer || [];
  var cleared = getActiveRun().actsCleared.map(function (key) {
    return '<span class="chip" style="background:' + COLORS[ACTS[key].color].hex +
      ';color:' + COLORS[ACTS[key].color].ink + '">' + ACTS[key].name + '</span>';
  }).join(' ');

  /* Each option wears its own room. A scrim sits between the painting and the
     words rather than dimming the painting itself, so the art keeps its colour
     while the text keeps a solid dark backing — the two darkest paintings and
     the two brightest all stay readable without per-act tuning. */
  var cards = offer.map(function (key) {
    var act = ACTS[key], colorDef = COLORS[act.color], art = ACT_ART[key] || {};
    var bg = art.varName ? 'var(' + art.varName + ')' : 'none';
    return '<button class="act-pick" data-act="' + key + '" style="--act:' + colorDef.hex +
      ';--act-art:' + bg + ';--act-art-filter:' + (art.filter || 'none') +
      ';--act-art-y:' + Math.round((art.seam || 0.25) * 100) + '%">' +
      '<span class="act-art" aria-hidden="true"></span>' +
      '<span class="act-scrim" aria-hidden="true"></span>' +
      '<span class="act-copy">' +
        '<span class="act-name">' + act.name + '</span>' +
        '<span class="act-blurb">' + act.blurb + '</span>' +
        '<span class="act-boss">Boss · ' + ENEMIES[act.boss].name + '</span>' +
      '</span></button>';
  }).join('');

  /* Just the two roads, and nothing about the ones you cannot walk.

     This screen used to list every shut act with its exact requirement —
     "needs 2 Magenta, you hold 0" — which turned discovery into a checklist.
     The player was told the whole colour wheel before they had made a single
     secondary, so opening a new road stopped being a thing you found and
     became a task you completed. What is left is the fork itself.

     The knowledge still arrives, just afterwards and obliquely: unlocking an
     act writes a cryptic line into the glossary, so the codex fills in with
     the shape of what you did rather than the recipe for doing it again. */
  els.actBody.innerHTML =
    '<h2>The road forks</h2>' +
    '<p class="screen-lead">' + (cleared ? 'Behind you: ' + cleared + '. ' : '') +
    'Where you can go next is decided by what your deck is made of.</p>' +
    '<div class="act-picks">' + cards + '</div>';

  Array.prototype.forEach.call(els.actBody.querySelectorAll('.act-pick'), function (btn) {
    btn.addEventListener('click', function () { beginAct(btn.getAttribute('data-act')); });
  });
}

export function renderVictory() {
  var offers = secretOffers(getActiveRun());
  var full = whiteUnlocked(getActiveRun());
  var roster = ACT_KEYS.map(function (key) {
    var act = ACTS[key], colorDef = COLORS[act.color];
    var walked = getActiveRun().actsCleared.indexOf(key) !== -1;
    return '<span class="chip" style="background:' + (walked ? colorDef.hex : 'transparent') +
      ';color:' + (walked ? colorDef.ink : 'var(--ink-3)') +
      (walked ? '' : ';border:1px dashed var(--line)') + '">' + act.name + '</span>';
  }).join(' ');

  var head = full ? 'The wheel is complete' : 'Black is broken';
  var lead = full
    ? 'Seven bosses, seven roads, one deck. There is nothing left that your colours have not ' +
      'already opened \u2014 and something that was never on the wheel has noticed.'
    : 'You broke The Spectrum and walked out of the Ashen Wastelands. Black was the last colour ' +
      'and the hardest door; the roads you did not take are still out there.';
  if (!full && offers.length) {
    lead += ' Something else has been following you, though.';
  }

  /* Every secret road that qualified, not just the first. A run that went
     broad, carried its rot and broke the ground has done three separate hard
     things and is offered all three. */
  var secretCards = offers.map(function (key) {
    var act = ACTS[key], colorDef = COLORS[act.color];
    var art = ACT_ART[key] || {};
    var bg = art.varName ? 'var(' + art.varName + ')' : 'none';
    return '<button class="act-pick victory-pick" data-secret="' + key + '" style="--act:' + colorDef.hex +
      ';--act-art:' + bg + ';--act-art-filter:' + (art.filter || 'none') +
      ';--act-art-y:' + Math.round((art.seam || 0.25) * 100) + '%">' +
      '<span class="act-art" aria-hidden="true"></span>' +
      '<span class="act-scrim" aria-hidden="true"></span>' +
      '<span class="act-copy">' +
        '<span class="act-name">' + act.name + '</span>' +
        '<span class="act-blurb">' + act.blurb + ' ' + (SECRET_REASON[key] || '') + '</span>' +
        '<span class="act-boss">Boss \u00b7 ' + ENEMIES[act.boss].name + '</span>' +
      '</span></button>';
  }).join('');

  els.victoryBody.innerHTML =
    '<h2>' + head + '</h2>' +
    '<p class="screen-lead">' + roster + '</p>' +
    '<p class="screen-lead">' + lead + '</p>' +
    '<div class="act-picks">' + secretCards +
      '<button class="act-pick victory-pick" id="goEndlessBtn" style="--act:#f3c86a">' +
        '<span class="act-copy">' +
          '<span class="act-name">Go endless</span>' +
          '<span class="act-blurb">Every road opens again, and the world keeps getting harder ' +
            'the longer you last. There is no further ending waiting for you \u2014 only how far ' +
            'you get.</span>' +
        '</span></button>' +
      '<button class="act-pick victory-pick" id="endHereBtn" style="--act:#8a8378">' +
        '<span class="act-copy">' +
          '<span class="act-name">End the run here</span>' +
          '<span class="act-blurb">Take the win. Your run, your deck, and the road behind you are ' +
            'recorded as they stand.</span>' +
        '</span></button>' +
    '</div>';

  Array.prototype.forEach.call(els.victoryBody.querySelectorAll('[data-secret]'), function (btn) {
    btn.addEventListener('click', function () { beginAct(btn.getAttribute('data-secret')); });
  });
  document.getElementById('goEndlessBtn').addEventListener('click', function () { goEndless(); });
  document.getElementById('endHereBtn').addEventListener('click', function () { endAsVictory(); });
}

export function applyActTheme() {
  var art = ACT_ART[(getActiveRun() && getActiveRun().act) || 'green'] || ACT_ART.green;
  document.documentElement.style.setProperty('--bg-art', 'var(' + art.varName + ')');
  document.documentElement.style.setProperty('--room-dim', String(art.dim || 0));
  document.documentElement.style.setProperty('--art-filter', art.filter || 'none');
  setBackgroundMetrics(art);
}

export function renderGameOver() {
  var won = getActiveRun().lives > 0 && getActiveRun().actsCleared.length > 0;
  var conquered = allActsConquered(getActiveRun());
  var last = getActiveRun().actsCleared[getActiveRun().actsCleared.length - 1];
  var head, lead;
  if (!won) {
    /* Dying inside an endless run is still a real ending, and a proud one —
       it deserves its own line rather than reading identically to dying on
       the very first act. */
    head = getActiveRun().endless ? 'The endless road ends' : 'Run over';
    lead = getActiveRun().endless
      ? 'Every road had already fallen once before this one finally took you — in ' +
        ACTS[getActiveRun().act].name + ', at depth ' + (getActiveRun().depth + 1) + '.'
      : 'You ran out of lives in ' + ACTS[getActiveRun().act].name + ', at depth ' + (getActiveRun().depth + 1) + '.';
  } else if (SECRET_ACT_KEYS.some(function (key) { return getActiveRun().actsCleared.indexOf(key) !== -1; })) {
    var walkedSecret = SECRET_ACT_KEYS.filter(function (key) { return getActiveRun().actsCleared.indexOf(key) !== -1; });
    var lastSecret = walkedSecret[walkedSecret.length - 1];
    var SECRET_END = {
      white: 'You brought every colour back to the one place that had none, and it was enough.',
      rot:   'You walked into the thing your own rot had been building, and it stopped singing.',
      rift:  'You fought it on ground that was breaking under both of you, and you were the one still standing.'
    };
    head = ACTS[lastSecret].name;
    lead = (SECRET_END[lastSecret] || '') + ' There is no road after this one.';
  } else if (conquered) {
    head = 'Every road conquered';
    lead = 'You broke ' + ENEMIES[ACTS[last].boss].name + ' and walked every road there is. ' +
      'You chose to stop here, with the whole wheel behind you.';
  } else {
    head = 'Run complete';
    lead = 'You broke ' + ENEMIES[ACTS[last].boss].name + ' and walked out of ' + ACTS[last].name +
      '. There is no road left that your deck can open — for now, that is the end of it.';
  }
  var loops = getActiveRun().endless
    ? '<div><span class="tag">LOOPS</span><b>' +
      Math.max(1, getActiveRun().actsCleared.length - ACT_KEYS.length + 1) + '</b></div>' : '';
  els.gameoverBody.innerHTML = '<h2>' + head + '</h2>' +
    '<p class="screen-lead">' + lead + '</p>' +
    '<div class="summary"><div><span class="tag">ACTS CLEARED</span><b>' + getActiveRun().actsCleared.length + '</b></div>' +
    loops +
    '<div><span class="tag">BATTLES WON</span><b>' + getActiveRun().battlesWon + '</b></div>' +
    '<div><span class="tag">GOLD</span><b>' + getActiveRun().gold + '</b></div>' +
    '<div><span class="tag">RELICS</span><b>' + getActiveRun().relics.length + '</b></div>' +
    '<div><span class="tag">DECK</span><b>' + getActiveRun().deck.length + '</b></div></div>' +
    '<div class="deck-grid">' + getActiveRun().deck.map(function (entry) { return cardMini(entry); }).join('') + '</div>';
}
