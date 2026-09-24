/* The lane readout, status toast, controls and enemy omens. */

import { rules as C } from '../../game/index.js';
import { advanceTarget, canRewind, getBattleState, pendingSpec } from '../../game/index.js';
import { els } from '../dom.js';
import { enemyIcons, glyphSvg, rankIcon } from '../icons.js';
import { chip } from '../screens/chrome.js';

var CARDS = C.CARDS;
var COLORS = C.COLORS;
var COLOR_KEYS = C.COLOR_KEYS;
var ENEMY = C.ENEMY;
var PLAYER = C.PLAYER;
var ROW_INFO = C.ROW_INFO;
var colorInfo = C.colorInfo;
var hasRelic = C.hasRelic;
var slotName = C.slotName;

export function announce(text, tone) {
  if (!els.actionToast) return;
  els.actionToast.textContent = text;
  els.actionToast.className = 'action-toast show ' + (tone || '');
  els.actionToast.hidden = false;
  clearTimeout(announce._t);
  announce._t = setTimeout(function () {
    els.actionToast.className = 'action-toast';
    els.actionToast.hidden = true;
  }, 2400);
}

export function renderLanes(ev) {
  els.lanes.innerHTML = ev.lanes.map(function (lane) {
    function cell(side) {
      var laneSide = lane[side];
      if (!laneSide) return '<span class="lane-empty">—</span>';
      var colorDef = colorInfo(laneSide.color), championCardDef = CARDS[laneSide.champion.unit.cardId];
      return '<span class="lane-unit" style="--c:' + colorDef.hex + '">' +
        '<span class="lane-tot"><b>' + laneSide.final + '</b>' + (laneSide.multiplier > 1 ? '<i class="x2">\u00d7' + laneSide.multiplier + '</i>' : '') + '</span>' +
        '<em>' + colorDef.name + ' · ' + ROW_INFO[laneSide.champion.row].label.replace('Row ', 'R') + '</em>' +
        '<em class="brk">front ' + laneSide.frontStrength + (laneSide.support ? ' + support ' + laneSide.support : '') + ' = ' + laneSide.strength + '</em></span>';
    }
    var mid;
    if (lane.bottom && lane.top) {
      if (lane.bottom.effective && lane.top.effective) mid = '<span class="mid both">\u25c0\u00d72\u25b6</span>';
      else if (lane.bottom.effective) mid = '<span class="mid you">\u00d7' + lane.bottom.multiplier + '\u25b6</span>';
      else if (lane.top.effective) mid = '<span class="mid opp">\u25c0\u00d72</span>';
      else mid = '<span class="mid">vs</span>';
    } else mid = '<span class="mid">vs</span>';
    return '<div class="lane-row' + (!lane.bottom && !lane.top ? ' quiet' : '') + '">' +
      '<span class="lane-id">' + (lane.index + 1) + '</span><span class="lane-side you">' + cell('bottom') + '</span>' +
      mid + '<span class="lane-side opp">' + cell('top') + '</span></div>';
  }).join('');
}

/* The old status box is gone. Necessary guidance (picking a target, what a
   mix needs next) now surfaces as a sticky board toast that holds until the
   situation resolves; ordinary turn-taking is shown ambiently by lighting up
   YOU or ENEMY on the header instead of a running commentary. */
function stickyToast(text, tone) {
  if (!els.actionToast) return;
  if (!text) {
    if (els.actionToast.dataset.sticky === '1') {
      els.actionToast.hidden = true;
      els.actionToast.className = 'action-toast';
      els.actionToast.dataset.sticky = '';
    }
    return;
  }
  var key = text + '|' + (tone || '');
  if (els.actionToast.dataset.sticky === '1' && els.actionToast.dataset.key === key) return;
  clearTimeout(announce._t);
  els.actionToast.textContent = text;
  els.actionToast.className = 'action-toast show ' + (tone || '');
  els.actionToast.hidden = false;
  els.actionToast.dataset.sticky = '1';
  els.actionToast.dataset.key = key;
}

export function renderStatus() {
  var state = getBattleState();
  if (state.pending) {
    var spec = pendingSpec();
    var who = state.pending.kind === 'wild' ? 'Wild Palette' : CARDS[state.pending.card.id].name;
    stickyToast(who + ': ' + (spec ? spec.prompt : 'resolving') + '.', 'target');
  } else if (state.mode === 'mix') {
    stickyToast(state.mixBase
      ? 'Pick a touching friendly unit to mix into ' + slotName(state.mixBase.row, state.mixBase.index) + '.'
      : 'Pick the unit that will absorb the other.', 'mix');
  } else {
    stickyToast(null);
  }
  if (els.battleHud) {
    els.battleHud.hidden = false;      // shown only while a battle is on screen
    var active = !state.resolving && !state.battleOver;
    els.battleHud.classList.toggle('turn-you', active && state.turn === PLAYER);
    els.battleHud.classList.toggle('turn-opp', active && state.turn === ENEMY);
  }
}

export function renderControls(ev) {
  var state = getBattleState();
  var canAct = state.turn === PLAYER && !state.resolving && !state.battleOver && !state.opponentThinking;
  els.scoreYou.textContent = ev.totals.bottom;
  els.scoreOpp.textContent = ev.totals.top;
  function pips(count) {
    var out = '';
    for (var i = 0; i < 2; i++) out += '<span class="pip' + (i < count ? ' on' : '') + '"></span>';
    return out;
  }
  els.pipsYou.innerHTML = pips(state.wins.bottom);
  els.pipsOpp.innerHTML = pips(state.wins.top);

  els.chainCount.textContent = (state.chains && state.chains[PLAYER]) || 0;
  els.chainBadge.classList.toggle('live', ((state.chains && state.chains[PLAYER]) || 0) > 0);
  els.easeNote.hidden = !state.easeIn;
  els.enemyName.textContent = state.enemy.name;
  /* The rank mark and the rule icons only change when the enemy does, so they
     are rebuilt on that key rather than every render \u2014 rebuilding mid-battle
     would drop any rule the player had tapped open. */
  if (els.enemyRules.dataset.for !== state.enemyKey) {
    var rank = rankIcon(state.enemyKey);
    els.enemyRank.innerHTML = rank
      ? '<span class="ic rank-' + rank.i + '" title="' + rank.t + '">' + glyphSvg(rank.i) + '</span>'
      : '';
    var rules = enemyIcons(state.enemyKey);
    els.enemyRulesLayer.hidden = !rules.length;
    els.enemyRules.innerHTML = rules.map(function (rule, index) {
      var style = rule.colour ? ' style="color:' + C.COLORS[rule.colour].hex + '"' : '';
      return '<button class="rule-ic" data-rule="' + index + '"' + style + '>' +
        glyphSvg(rule.i) + (rule.v !== undefined ? '<i class="icn">' + rule.v + '</i>' : '') + '</button>';
    }).join('');
    els.enemyRules.dataset.for = state.enemyKey;
    els.enemyRuleText.hidden = true;
    Array.prototype.forEach.call(els.enemyRules.querySelectorAll('.rule-ic'), function (ruleBtn) {
      ruleBtn.addEventListener('click', function () {
        var ruleIndex = +ruleBtn.getAttribute('data-rule');
        var open = els.enemyRuleText.dataset.open === String(ruleIndex) && !els.enemyRuleText.hidden;
        Array.prototype.forEach.call(els.enemyRules.querySelectorAll('.rule-ic'),
          function (otherBtn) { otherBtn.classList.remove('on'); });
        if (open) { els.enemyRuleText.hidden = true; return; }
        ruleBtn.classList.add('on');
        els.enemyRuleText.textContent = rules[ruleIndex].t;
        els.enemyRuleText.dataset.open = String(ruleIndex);
        els.enemyRuleText.hidden = false;
      });
    });
  }
  renderOmens(state);
  if (!els.enemyColors.dataset.for || els.enemyColors.dataset.for !== state.enemyKey) {
    els.enemyColors.innerHTML = state.enemy.colors.map(function (colorKey) { return chip(colorKey); }).join(' ');
    els.enemyColors.dataset.for = state.enemyKey;
  }

  els.passBtn.disabled = !canAct || !!state.pending;
  els.passBtn.textContent = 'Pass';
  /* No meter, no warning, no count. The button is either offered or it is not. */
  els.rewindBtn.disabled = !canRewind();
  // the icon carries the state; a crossed-out arrow needs no label
  els.rewindBtn.classList.toggle('spent', !!state.rewindUsedThisRound);
  els.rewindBtn.title = state.rewindUsedThisRound
    ? 'Rewind already used this round.'
    : 'Take back your last move and the enemy\u2019s answer to it. Once per round.';
  els.cancelBtn.hidden = !state.pending;
  els.wildBtn.hidden = !hasRelic(state.relics, 'wild_palette');
  els.wildBtn.disabled = !canAct || !!state.pending || state.wildPaletteUsed;
  els.wildBtn.textContent = state.wildPaletteUsed ? 'Wild Palette used' : 'Wild Palette';

  var spec = pendingSpec();
  var showPicker = !!(spec && spec.kind === 'color');
  els.colorPicker.hidden = !showPicker;
  /* The action bar exists only to hold the colour picker, so it follows it.
     This used to be set several lines earlier, from the picker's *previous*
     value \u2014 so on the very render where the picker first appeared, its own
     parent was still hidden and Spectrum Shift and the Wild Palette relic
     looked like they did nothing. It only corrected itself if some later
     event forced a second render. Read after the value is computed, not
     before. */
  els.controls.hidden = !showPicker;
  if (showPicker && !els.colorPicker.dataset.built) {
    els.colorPicker.innerHTML = COLOR_KEYS.map(function (colorKey) {
      return '<button class="pick" data-color="' + colorKey + '" style="background:' + COLORS[colorKey].hex + ';color:' + COLORS[colorKey].ink + '">' + COLORS[colorKey].name + '</button>';
    }).join('');
    Array.prototype.forEach.call(els.colorPicker.querySelectorAll('.pick'), function (btn) {
      btn.addEventListener('click', function () { advanceTarget({ color: btn.getAttribute('data-color') }); });
    });
    els.colorPicker.dataset.built = '1';
  }

}

/* Omens, not explanations. A colour the enemy is currently attuned to, and a pip
   per Mix token they hold beyond the first. The player works out the rest. */
function renderOmens(state) {
  var out = '';
  if (state.spectrumColor) {
    out += '<span class="omen-dot" style="background:' + COLORS[state.spectrumColor].hex +
      '" aria-label="The enemy is attuned to ' + COLORS[state.spectrumColor].name + ' this round"></span>';
  }
  var extra = (state.mixTokens[ENEMY] || 0) - 1;
  for (var i = 0; i < extra; i++) out += '<span class="omen-pip" aria-label="Extra enemy Mix token"></span>';
  els.enemyOmens.innerHTML = out;
}
