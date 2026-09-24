/* The glossary: only what the player has met. */

import { rules as C } from '../../game/index.js';
import { ACTS, ACT_KEYS, codex, codexCounts } from '../../game/index.js';
import { ACT_OMENS } from '../content.js';
import { enemyIconRow, enemyIcons, glyphSvg, iconRow } from '../icons.js';

var CARDS = C.CARDS;
var COLORS = C.COLORS;
var ENEMIES = C.ENEMIES;

/* ---- glossary ----
   Only what you have met. A locked entry still shows a silhouette \u2014 the
   rarity and, for a card, its colour \u2014 because "there is something here you
   have not seen" is information worth having, while the name and text are the
   part you earn. */
var glossaryTab = 'cards';

function glCardEntry(id) {
  var cardDef = CARDS[id], known = !!codex.cards[id];
  var col = cardDef.color ? COLORS[cardDef.color] : { hex: '#6f6a60', ink: '#12100d' };
  var swatch = '<span class="gl-swatch" style="background:' + col.hex + ';color:' + col.ink + '">' +
    (known ? (cardDef.type === 'unit' ? cardDef.strength : '\u2726') : '?') + '</span>';
  if (!known) {
    return '<div class="gl-entry gl-locked">' + swatch +
      '<div class="gl-main"><span class="gl-name">Not yet met</span>' +
      '<span class="gl-meta">' + cardDef.rarity + '</span>' +
      '<div class="gl-text">Find it on the road and it will be recorded here.</div></div></div>';
  }
  return '<div class="gl-entry">' + swatch +
    '<div class="gl-main"><span class="gl-name">' + cardDef.name + '</span>' +
    '<span class="gl-meta">' + cardDef.rarity + (cardDef.bossOnly ? ' \u00b7 boss drop' : '') + '</span>' +
    '<div class="gl-text">' + (cardDef.text || 'No special rule \u2014 just a body.') + '</div>' +
    iconRow(id) + '</div></div>';
}

function glFoeEntry(key) {
  var enemyDef = ENEMIES[key], known = !!codex.foes[key];
  var lead = enemyDef.colors && enemyDef.colors[0] ? COLORS[enemyDef.colors[0]] : { hex: '#6f6a60', ink: '#12100d' };
  var mark = enemyDef.kind === 'boss' ? '\u2726' : enemyDef.kind === 'elite' ? '\u2605' : '\u25cf';
  var swatch = '<span class="gl-swatch" style="background:' + lead.hex + ';color:' + lead.ink + '">' +
    (known ? mark : '?') + '</span>';
  if (!known) {
    return '<div class="gl-entry gl-locked">' + swatch +
      '<div class="gl-main"><span class="gl-name">Not yet met</span>' +
      '<span class="gl-meta">' + enemyDef.kind + '</span>' +
      '<div class="gl-text">Something on a road you have not walked.</div></div></div>';
  }
  var rules = enemyIcons(key);
  return '<div class="gl-entry">' + swatch +
    '<div class="gl-main"><span class="gl-name">' + enemyDef.name + '</span>' +
    '<span class="gl-meta">' + enemyDef.kind + '</span>' +
    '<div class="gl-text">' + enemyDef.behaviour + '</div>' +
    (rules.length ? enemyIconRow(key) : '') + '</div></div>';
}

export function renderGlossary() {
  var body = document.getElementById('glossaryBody');
  if (!body) return;
  var counts = codexCounts(), html = '';

  if (glossaryTab === 'cards') {
    html += '<p class="gl-note">' + counts.cards + ' of ' + counts.cardsTotal +
      ' cards recorded. Cards enter the codex when you are offered one, ' +
      'or when you carry one into a fight.</p>';
    var groups = {};
    C.DRAWABLE.concat(C.BOSS_CARDS).concat(C.CURSE_KEYS).forEach(function (cardId) {
      var cardDef = CARDS[cardId];
      var group = cardDef.curse ? 'Curses' : cardDef.bossOnly ? 'Boss drops'
            : cardDef.color ? COLORS[cardDef.color].name : 'Colourless';
      (groups[group] = groups[group] || []).push(cardId);
    });
    var order = ['Red', 'Green', 'Blue', 'Yellow', 'Cyan', 'Magenta', 'Black',
                 'Colourless', 'Boss drops', 'Curses'];
    order.forEach(function (group) {
      if (!groups[group]) return;
      var seen = groups[group].filter(function (cardId) { return codex.cards[cardId]; }).length;
      html += '<div class="gl-group"><span class="lbl">' + group +
        ' \u00b7 ' + seen + '/' + groups[group].length + '</span>' +
        groups[group].map(glCardEntry).join('') + '</div>';
    });
  } else if (glossaryTab === 'foes') {
    html += '<p class="gl-note">' + counts.foes + ' of ' + counts.foesTotal +
      ' recorded. Every act has its own elite and boss, and each boss plays by ' +
      'a rule of its own \u2014 learning them is how you choose which roads to open.</p>';
    var byKind = { boss: [], elite: [], normal: [] };
    Object.keys(ENEMIES).forEach(function (key) { byKind[ENEMIES[key].kind].push(key); });
    [['boss', 'Act bosses'], ['elite', 'Elites'], ['normal', 'Common foes']].forEach(function (pair) {
      var list = byKind[pair[0]];
      if (!list.length) return;
      var seen = list.filter(function (key) { return codex.foes[key]; }).length;
      html += '<div class="gl-group"><span class="lbl">' + pair[1] +
        ' \u00b7 ' + seen + '/' + list.length + '</span>' +
        list.map(glFoeEntry).join('') + '</div>';
    });
  } else if (glossaryTab === 'roads') {
    var omens = codex.omens || {};
    var found = ACT_KEYS.filter(function (key) { return omens[key]; }).length;
    html += '<p class="gl-note">' + found + ' of ' + ACT_KEYS.length +
      ' roads have opened for you. Each one wrote itself down the first time ' +
      'it became reachable \u2014 what it says is what you noticed, not how it works.</p>';
    html += '<div class="gl-group">' + ACT_KEYS.map(function (key) {
      var act = ACTS[key], col = COLORS[act.color];
      var swatch = '<span class="gl-swatch" style="background:' + col.hex + ';color:' + col.ink +
        '">' + (omens[key] ? '\u2726' : '?') + '</span>';
      if (!omens[key]) {
        return '<div class="gl-entry gl-locked">' + swatch +
          '<div class="gl-main"><span class="gl-name">A road you have not opened</span>' +
          '<div class="gl-text">Something has to change in your deck before this one will exist.</div>' +
          '</div></div>';
      }
      return '<div class="gl-entry">' + swatch +
        '<div class="gl-main"><span class="gl-name">' + act.name + '</span>' +
        '<div class="gl-text">' + ACT_OMENS[key] + '</div></div></div>';
    }).join('') + '</div>';
  } else {
    html += '<p class="gl-note">Every icon in the game, and what it means. ' +
      'These are always readable \u2014 nothing here has to be discovered.</p>';
    var ICON_TEXT = [
      ['boss', 'Act boss. Beat it to end the act and choose your next road.'],
      ['elite', 'Elite. Tougher than a normal fight, and always drops a relic.'],
      ['growth', 'Overgrowth \u2014 its surviving units come back permanently stronger each round.'],
      ['support', 'Scorched Line \u2014 your units behind the front count for half.'],
      ['echoLane', 'Undertow \u2014 it takes half of your strongest lane for its own frontline there.'],
      ['tax', 'Exposure \u2014 whichever colour you field most is taxed per unit.'],
      ['echoMix', 'Refraction \u2014 every mix you land feeds its strongest unit.'],
      ['ward', 'Still Water \u2014 your matchup bonus is cancelled in the lanes it is weakest in.'],
      ['devour', 'It devours your weakest unit at the start of each round.'],
      ['rotate', 'Each round it becomes a colour at random, and grows in that colour.'],
      ['mixtoken', 'It mixes more than once a round.'],
      ['plus', 'A bonus to strength.'],
      ['minus', 'A penalty to strength.'],
      ['draw', 'Draws cards.'],
      ['mix', 'Mixing, or a fused card.'],
      ['freemix', 'A mix that costs no token.'],
      ['chain', 'Cares about your mix chain.'],
      ['aura', 'Affects the units touching it.'],
      ['row', 'Affects a whole row.'],
      ['lane', 'Affects a lane.'],
      ['front', 'Cares about holding a frontline.'],
      ['touch', 'Something adjacent.'],
      ['enemy', 'Targets the enemy.'],
      ['friendly', 'Targets your own side.'],
      ['shield', 'Protection.'],
      ['cleanse', 'Removes a hazard.'],
      ['hazard', 'Places a hazard.'],
      ['destroy', 'Destroys a unit.'],
      ['create', 'Creates a unit.'],
      ['move', 'Moves a unit.'],
      ['palette', 'Changes colour.'],
      ['colourless', 'Strips colour.'],
      ['stack', 'Happens every round.'],
      ['block', 'Blocks a tile.'],
      ['x2', 'Doubles something.']
    ];
    html += '<div class="gl-group">' + ICON_TEXT.map(function (iconPair) {
      return '<div class="gl-icon">' + glyphSvg(iconPair[0]) +
        '<span class="gl-text">' + iconPair[1] + '</span></div>';
    }).join('') + '</div>';
  }
  body.innerHTML = html;
}

export function openGlossary() {
  var glossaryEl = document.getElementById('glossary');
  if (!glossaryEl) return;
  renderGlossary();
  glossaryEl.hidden = false;
}

export function closeGlossary() {
  var glossaryEl = document.getElementById('glossary');
  if (glossaryEl) glossaryEl.hidden = true;
}

export function setGlossaryTab(tab) {
  glossaryTab = tab;
  Array.prototype.forEach.call(document.querySelectorAll('.gl-tab'), function (tabEl) {
    tabEl.classList.toggle('on', tabEl.getAttribute('data-tab') === tab);
  });
  renderGlossary();
}
