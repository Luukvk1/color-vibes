/* Setting up a friendly match: two decks, the relic bans, the reserve swaps, and
   the result. Each step is drawn from run.pvp; a tap calls an action. */

import { DRAFT, MODES, PVP, coloursOf, draftCardsMissing, pvpChooseMode, pvpDraftPick, pvpSetPlayerName, copyLimit, deckProblems, getActiveRun, leavePvp, pvpAddCard, pvpBan, pvpConfirmDeck, pvpContinue, pvpPool, pvpReady, pvpRematch, pvpRemoveCard, pvpResetSwaps, pvpSetName, pvpSwap, rules as C } from '../../game/index.js';
import { els } from '../dom.js';
import { cardMini, chip } from './chrome.js';

var CARDS = C.CARDS;
var COLORS = C.COLORS;
var RELICS = C.RELICS;

/* How the builder is being looked at. Not game state: nobody loses anything if
   a re-render forgets it, and two players never need to share it. */
var builder = { zone: 'active', color: 'all', pickedOut: null };

function closeButton() { return '<button class="btn pvp-exit" data-exit="1">Back to title</button>'; }

function header(eyebrow, title, lead) {
  return '<div class="pvp-head"><div><span class="eyebrow">' + eyebrow + '</span><h2>' + title + '</h2></div>' + closeButton() + '</div>' +
    (lead ? '<p class="screen-lead">' + lead + '</p>' : '');
}

function colorOf(id) { return CARDS[id].color || 'colourless'; }

function renderDeckStrip(player, zone) {
  if (!player[zone].length) return '<p class="muted pvp-empty">Nothing here yet. Tap a card below to add it.</p>';
  return '<div class="pvp-strip">' + player[zone].map(function (id, index) {
    var colorDef = C.colorInfo(CARDS[id].color);
    return '<button class="pvp-pip" data-remove="' + index + '" style="--card:' + colorDef.hex + ';--card-ink:' + colorDef.ink + '" title="Remove">' + CARDS[id].name + '</button>';
  }).join('') + '</div>';
}

function renderBuild(match) {
  var player = match.players[match.seat], pool = pvpPool();
  var totalFindable = C.DRAWABLE.length;
  var problems = deckProblems(player);
  var filters = ['all'].concat(C.COLOR_KEYS.filter(function (colorKey) {
    return pool.some(function (id) { return CARDS[id].color === colorKey; });
  }), pool.some(function (id) { return !CARDS[id].color; }) ? ['colourless'] : []);
  var shown = pool.filter(function (id) { return builder.color === 'all' || colorOf(id) === builder.color; });
  shown.sort(function (first, second) { return (CARDS[first].strength || 0) - (CARDS[second].strength || 0); });

  els.pvpBody.innerHTML = header('Player ' + (match.seat + 1) + ' of 2', 'Build your deck',
      'At least ' + PVP.MIN_DECK + ' cards, with no upper limit. Up to ' + PVP.COPIES + ' copies of a card, 1 of a Rare or better. ' +
      'You only draw ten in a match, so a bigger deck is a less reliable one.') +
    '<label class="pvp-name"><span class="lbl">Name</span><input id="pvpName" maxlength="16" value="' + player.name + '"></label>' +
    '<div class="pvp-tabs">' +
      '<button class="pvp-tab' + (builder.zone === 'active' ? ' on' : '') + '" data-zone="active">Deck · ' + player.active.length + '</button>' +
      '<button class="pvp-tab' + (builder.zone === 'reserve' ? ' on' : '') + '" data-zone="reserve">Reserve · ' + player.reserve.length + ' / ' + PVP.RESERVE_SIZE + '</button>' +
    '</div>' +
    renderDeckStrip(player, builder.zone) +
    '<h3 class="pvp-sub">Found so far · ' + pool.length + ' of ' + totalFindable + '</h3>' +
    '<div class="pvp-filters">' + filters.map(function (key) {
      var label = key === 'all' ? 'All' : key === 'colourless' ? 'Colourless' : COLORS[key].name;
      return '<button class="pvp-filter' + (builder.color === key ? ' on' : '') + '" data-filter="' + key + '">' + label + '</button>';
    }).join('') + '</div>' +
    '<div class="deck-grid pvp-pool">' + shown.map(function (id) {
      var held = player.active.concat(player.reserve).filter(function (heldId) { return heldId === id; }).length;
      var limit = copyLimit(id), full = held >= limit;
      return '<button class="pvp-card' + (full ? ' full' : '') + '" data-add="' + id + '"' + (full ? ' disabled' : '') + '>' +
        cardMini({ id: id, up: false }) + '<span class="pvp-count">' + held + ' / ' + limit + '</span></button>';
    }).join('') + '</div>' +
    '<div class="pvp-foot"><p class="pvp-problem">' + (problems[0] || '&nbsp;') + '</p>' +
    '<button class="primary" id="pvpDeckDone"' + (problems.length ? ' disabled' : '') + '>' + (match.seat === 0 ? 'Done — hide my deck' : 'Done — on to the relics') + '</button></div>';

  var nameInput = document.getElementById('pvpName');
  nameInput.addEventListener('change', function () { pvpSetName(nameInput.value); });
  on('[data-zone]', function (button) { builder.zone = button.getAttribute('data-zone'); renderPvp(); });
  on('[data-filter]', function (button) { builder.color = button.getAttribute('data-filter'); renderPvp(); });
  on('[data-add]', function (button) { pvpAddCard(button.getAttribute('data-add'), builder.zone); });
  on('[data-remove]', function (button) { pvpRemoveCard(+button.getAttribute('data-remove'), builder.zone); });
  document.getElementById('pvpDeckDone').addEventListener('click', function () { builder.zone = 'active'; builder.color = 'all'; pvpConfirmDeck(); });
}

function renderMode(match) {
  var missing = draftCardsMissing();
  function modeButton(mode, title, text, disabled) {
    return '<button class="lab-opt pvp-mode' + (mode !== MODES.BUILD ? ' main' : '') + '" data-mode="' + mode + '"' + (disabled ? ' disabled' : '') + '>' + title + '<em>' + text + '</em></button>';
  }
  els.pvpBody.innerHTML = header('Play a friend', 'Choose how to play',
      missing ? 'Drafting needs a bigger collection: play on to find about ' + Math.ceil(missing / 3) + ' more cards. You can still build your own decks.' : '') +
    '<div class="pvp-names">' + match.players.map(function (player, index) {
      return '<label class="pvp-name"><span class="lbl">Player ' + (index + 1) + '</span><input data-name="' + index + '" maxlength="16" value="' + player.name + '"></label>';
    }).join('') + '</div>' +
    '<h3 class="pvp-sub">Draft</h3><div class="pvp-relics">' +
      modeButton(MODES.DRAFT_OPEN, 'Face up', 'Take turns choosing from three new options. You both see every pick, so you can counter each other.', missing) +
      modeButton(MODES.DRAFT_HIDDEN, 'Hidden packs', 'Pick from a pack and pass it on. You only see what the other player left. Hand the device over after every pick.', missing) +
    '</div><p class="muted pvp-note">Each player drafts ' + (DRAFT.BLOCKS * DRAFT.CARDS_PER_BLOCK) + ' cards, all in their deck, and ' + DRAFT.BLOCKS + ' personal relics.</p>' +
    '<h3 class="pvp-sub">Build</h3><div class="pvp-relics">' +
      modeButton(MODES.BUILD, 'Build your own deck', 'Build from the cards you have found, with a reserve and three shared relics.', false) +
    '</div>';
  Array.prototype.forEach.call(els.pvpBody.querySelectorAll('[data-name]'), function (input) {
    input.addEventListener('change', function () { pvpSetPlayerName(+input.getAttribute('data-name'), input.value); });
  });
  on('[data-mode]', function (button) { pvpChooseMode(button.getAttribute('data-mode')); });
}

/* Who holds what so far, by colour. A draft is read at a glance or not at all. */
function picksSummary(label, taken) {
  var counts = {};
  taken.cards.forEach(function (id) { var key = colorOf(id); counts[key] = (counts[key] || 0) + 1; });
  var chips = Object.keys(counts).map(function (key) {
    return key === 'colourless' ? '<span class="chip pvp-plain">Colourless ' + counts[key] + '</span>' : chip(key, COLORS[key].name + ' ' + counts[key]);
  }).join(' ');
  return '<div class="pvp-summary"><span class="lbl">' + label + ' · ' + taken.cards.length + ' / ' + (DRAFT.BLOCKS * DRAFT.CARDS_PER_BLOCK) + ' cards</span>' +
    '<div class="pvp-chips">' + (chips || '<span class="muted pvp-empty">No cards yet</span>') + '</div>' +
    taken.relics.map(function (key) { return '<div class="relic-line"><b>' + RELICS[key].name + '</b><span>' + RELICS[key].text + '</span></div>'; }).join('') +
    (taken.cards.length ? '<div class="pvp-strip pvp-taken">' + taken.cards.map(function (id) {
      var colorDef = C.colorInfo(CARDS[id].color);
      return '<span class="pvp-pip static" style="--card:' + colorDef.hex + '">' + CARDS[id].name + '</span>';
    }).join('') + '</div>' : '') + '</div>';
}

function renderDraft(match) {
  var draft = match.draft, player = match.players[match.seat], rival = match.players[1 - match.seat];
  var hidden = match.mode === MODES.DRAFT_HIDDEN, isRelic = draft.kind === 'relic';
  var lead = isRelic ? 'Choose a relic. It works for you only, all match.'
    : hidden ? 'Take one card and pass the rest on.' : 'Take one card. The other two go back.';
  var options = isRelic
    ? '<div class="pvp-relics">' + draft.offer.map(function (key, index) {
        return '<button class="lab-opt pvp-relic" data-pick="' + index + '">' + RELICS[key].name + '<em>' + RELICS[key].text + '</em></button>';
      }).join('') + '</div>'
    : '<div class="deck-grid pvp-pool">' + draft.offer.map(function (id, index) {
        return '<button class="pvp-card" data-pick="' + index + '">' + cardMini({ id: id, up: false }) + '</button>';
      }).join('') + '</div>';
  els.pvpBody.innerHTML = header('Pick ' + (draft.position + 1) + ' of ' + draft.queue.length, player.name + ', your pick', lead) + options +
    '<h3 class="pvp-sub">' + (hidden ? 'Your picks' : 'Picks so far') + '</h3>' + picksSummary(player.name, draft.picks[match.seat]) +
    (hidden ? '' : picksSummary(rival.name, draft.picks[1 - match.seat]));
  on('[data-pick]', function (button) { window.scrollTo(0, 0); pvpDraftPick(+button.getAttribute('data-pick')); });
}

function renderCover(match) {
  var who = match.players[match.next.seat].name;
  els.pvpBody.innerHTML = '<div class="pvp-cover"><span class="eyebrow">Pass the device</span><h2>' + who + '</h2>' +
    '<p class="screen-lead">No peeking. Tap when ' + who + ' is holding it.</p>' +
    '<button class="primary" id="pvpCoverGo">I am ' + who + '</button></div>';
  document.getElementById('pvpCoverGo').addEventListener('click', function () { pvpContinue(); });
}

function renderBan(match) {
  var player = match.players[match.seat], first = match.bans.length === 0;
  els.pvpBody.innerHTML = header('Shared relics', player.name + ', ban one',
      'Five relics are on the table. Each player bans one, and the three left work for both of you all match.' +
      (first ? '' : ' ' + match.players[match.banOrder[0]].name + ' has already banned ' + RELICS[match.bans[0]].name + '.')) +
    '<div class="pvp-relics">' + match.offer.map(function (key) {
      var banned = match.bans.indexOf(key) !== -1;
      return '<button class="lab-opt pvp-relic' + (banned ? ' banned' : '') + '" data-ban="' + key + '"' + (banned ? ' disabled' : '') + '>' +
        RELICS[key].name + (banned ? ' — banned' : '') + '<em>' + RELICS[key].text + '</em></button>';
    }).join('') + '</div>';
  on('[data-ban]', function (button) { pvpBan(button.getAttribute('data-ban')); });
}

function renderSwap(match) {
  var player = match.players[match.seat], opponent = match.players[match.seat === 0 ? 1 : 0];
  var left = PVP.RESERVE_SWAPS - player.swaps;
  function list(ids, zone, picked) {
    if (!ids.length) return '<p class="muted pvp-empty">Your reserve is empty.</p>';
    return '<div class="deck-grid">' + ids.map(function (id, index) {
      return '<button class="swap-card' + (picked === index ? ' picked' : '') + '" data-' + zone + '="' + index + '">' + cardMini({ id: id, up: false }) + '</button>';
    }).join('') + '</div>';
  }
  els.pvpBody.innerHTML = header('Before the match', player.name + ', cover their colours',
      'You may swap up to ' + PVP.RESERVE_SWAPS + ' deck cards with your reserve. Tap a deck card, then the reserve card to bring in.') +
    '<div class="pvp-brief"><span class="lbl">' + opponent.name + ' brings</span><div class="pvp-chips">' +
      coloursOf(opponent.active).map(function (colorKey) { return chip(colorKey); }).join(' ') + '</div>' +
      '<span class="lbl">Shared relics</span>' +
      getActiveRun().relics.map(function (key) { return '<div class="relic-line"><b>' + RELICS[key].name + '</b><span>' + RELICS[key].text + '</span></div>'; }).join('') +
    '</div>' +
    '<h3 class="pvp-sub">Reserve · ' + left + ' swap' + (left === 1 ? '' : 's') + ' left</h3>' + list(player.reserve, 'reserve', null) +
    '<h3 class="pvp-sub">Deck · ' + player.active.length + '</h3>' + list(player.active, 'active', builder.pickedOut) +
    '<div class="pvp-foot">' + (player.swaps ? '<button class="btn" id="pvpUndo">Undo swaps</button>' : '') +
    '<button class="primary" id="pvpReadyBtn">Ready</button></div>';
  on('[data-active]', function (button) {
    var index = +button.getAttribute('data-active');
    builder.pickedOut = builder.pickedOut === index ? null : index; renderPvp();
  });
  on('[data-reserve]', function (button) {
    if (builder.pickedOut === null) return;
    var outIndex = builder.pickedOut; builder.pickedOut = null;
    pvpSwap(outIndex, +button.getAttribute('data-reserve'));
  });
  if (player.swaps) document.getElementById('pvpUndo').addEventListener('click', function () { pvpResetSwaps(); });
  document.getElementById('pvpReadyBtn').addEventListener('click', function () { builder.pickedOut = null; pvpReady(); });
}

function renderResult(match) {
  els.pvpBody.innerHTML = '<div class="pvp-cover"><span class="eyebrow">Match over</span><h2>' + match.winner + ' wins</h2>' +
    '<p class="result-score"><span class="you">' + match.wins[0] + '</span><span class="vs">:</span><span class="opp">' + match.wins[1] + '</span></p>' +
    '<p class="screen-lead">' + match.loser + ' takes the loss, and both of you know how the other builds now.</p>' +
    '<button class="primary" id="pvpAgain">Play again</button>' +
    '<button class="primary ghost-exit" data-exit="1">Back to title</button></div>';
  document.getElementById('pvpAgain').addEventListener('click', function () { pvpRematch(); });
}

/* Set by menu.js, which owns the title screen this one returns to. */
var onExit = function () { leavePvp(); };
export function setPvpExit(handler) { onExit = handler; }

function on(selector, handler) {
  Array.prototype.forEach.call(els.pvpBody.querySelectorAll(selector), function (element) {
    element.addEventListener('click', function () { handler(element); });
  });
}

export function renderPvp() {
  var match = getActiveRun().pvp;
  if (!match || !els.pvpBody) return;
  ({ mode: renderMode, draft: renderDraft, build: renderBuild, cover: renderCover, ban: renderBan, swap: renderSwap, result: renderResult })[match.step](match);
  on('[data-exit]', function () { onExit(); });
}
