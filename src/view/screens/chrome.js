/* Shared pieces of the interface: chips, mini cards, the run bar and the deck modal. */

import { getActiveRun, rules as C } from '../../game/index.js';
import { ACTS } from '../../game/index.js';
import { els } from '../dom.js';

var CARDS = C.CARDS;
var COLORS = C.COLORS;
var RELICS = C.RELICS;
var cardName = C.cardName;
var cardStrength = C.cardStrength;
var colorInfo = C.colorInfo;

export function chip(colorKey, label) {
  var colorDef = colorInfo(colorKey);
  return '<span class="chip" style="background:' + colorDef.hex + ';color:' + colorDef.ink + '">' + (label || colorDef.name) + '</span>';
}

export function cardMini(entry, extra) {
  var cardDef = CARDS[entry.id], colorDef = colorInfo(cardDef.color);
  return '<div class="mini-card ' + cardDef.type + (extra || '') + '" style="--card:' + colorDef.hex + ';--card-ink:' + colorDef.ink + '">' +
    '<span class="mini-top">' + (cardDef.type === 'unit' ? cardStrength(entry)
      : cardDef.type === 'hazard' ? 'HAZ' : cardDef.type === 'curse' ? 'CRS' : 'SPL') + '</span>' +
    '<span class="mini-name">' + cardName(entry) + '</span>' +
    '<span class="mini-text">' + cardDef.text + '</span></div>';
}

export function applyGrey() {
  var corruption = (getActiveRun() && getActiveRun().corruption) || 0;
  var sat = Math.max(0.28, 1 - corruption * 0.075);
  document.documentElement.style.setProperty('--sat', sat.toFixed(3));
  // the room withers on its own curve, a little ahead of the interface
  document.documentElement.style.setProperty('--ash', Math.min(1, corruption / 8).toFixed(3));
}

export function renderRunBar() {
  var hearts = '';
  for (var index = 0; index < getActiveRun().maxLives; index++) hearts += '<span class="life' + (index < getActiveRun().lives ? '' : ' lost') + '">\u25c6</span>';
  els.runLives.innerHTML = hearts;
  els.runGold.textContent = getActiveRun().gold;
  /* Between acts the old act's depth is meaningless and reading "13 / 13"
     next to a fork in the road just looks like a bug. */
  els.runDepth.textContent = getActiveRun().screen === 'act' ? '\u2014'
    : (getActiveRun().depth + 1) + ' / ' + getActiveRun().map.length;
  var actCell = document.getElementById('runAct');
  if (actCell) actCell.textContent = ACTS[getActiveRun().act] ? ACTS[getActiveRun().act].name.replace(/^The /, '') : '\u2014';
  els.deckBtnCount.textContent = getActiveRun().deck.length;
  els.relicBtnCount.textContent = getActiveRun().relics.length;
  els.runRelics.innerHTML = getActiveRun().relics.length
    ? getActiveRun().relics.map(function (key) { return '<span class="relic-pip" title="' + RELICS[key].text + '">' + RELICS[key].name + '</span>'; }).join('')
    : '<span class="muted" style="font-size:11px">No relics yet</span>';
}

/* A single place to check what you are carrying — deck and relics together,
   reachable from any screen including mid-battle. */
export function renderDeckModal() {
  var byColour = {};
  getActiveRun().deck.forEach(function (entry) {
    var colorKey = CARDS[entry.id].color || 'colourless';
    (byColour[colorKey] = byColour[colorKey] || []).push(entry);
  });
  var order = C.COLOR_KEYS.concat(['colourless']);
  var groups = order.filter(function (colorKey) { return byColour[colorKey]; }).map(function (colorKey) {
    var label = colorKey === 'colourless' ? 'Colourless' : COLORS[colorKey].name;
    return '<div class="deck-group"><span class="lbl">' + label + ' · ' + byColour[colorKey].length + '</span>' +
      '<div class="deck-grid">' + byColour[colorKey].map(function (entry) { return cardMini(entry); }).join('') + '</div></div>';
  }).join('');

  els.deckModalBody.innerHTML =
    '<div class="dm-section"><h3>Relics · ' + getActiveRun().relics.length + '</h3>' +
    (getActiveRun().relics.length
      ? getActiveRun().relics.map(function (key) {
          return '<div class="relic-line"><b>' + RELICS[key].name + '</b><span>' + RELICS[key].text + '</span></div>';
        }).join('')
      : '<p class="muted" style="font-size:12.5px;margin:0">No relics yet. Elites and bosses always drop one.</p>') +
    '</div>' +
    '<div class="dm-section"><h3>Deck · ' + getActiveRun().deck.length + ' cards</h3>' +
    '<p class="screen-lead">A smaller deck draws its best cards more often. Skipping a reward keeps it lean.</p>' +
    groups + '</div>';
  els.deckOverlay.hidden = false;
}
