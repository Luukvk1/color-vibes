/* The player's hand and the enemy's card backs. */

import { rules as C } from '../../game/index.js';
import { getBattleState, legalTargets, mixOptions, onMixToggle, selectCard } from '../../game/index.js';
import { els } from '../dom.js';
import { iconRow } from '../icons.js';

var CARDS = C.CARDS;
var ENEMY = C.ENEMY;
var PLAYER = C.PLAYER;
var cardName = C.cardName;
var cardStrength = C.cardStrength;
var colorInfo = C.colorInfo;
var freeHazardRows = C.freeHazardRows;
var legalTiles = C.legalTiles;

var lastEnemyHandCount = -1;

/* Rebuilding the card-backs is what makes them re-deal (each .card-back
   plays a dealIn entrance animation on creation) — worth it when the hand
   actually changes, wasted motion when a render just fires because the
   player tapped one of their own cards. Skip the rebuild when the count
   hasn't moved; the deck/hand tally text still updates either way. */
export function resetEnemyHand() { lastEnemyHandCount = -1; }

export function renderEnemyHand() {
  var state = getBattleState(), handCount = state.hands[ENEMY].length;
  els.enemyDeckCount.textContent = handCount + ' in hand · ' + state.decks[ENEMY].length + ' in deck';
  if (handCount === lastEnemyHandCount) return;
  lastEnemyHandCount = handCount;
  var backs = '';
  for (var i = 0; i < handCount; i++) backs += '<span class="card-back" style="--i:' + i + '"></span>';
  els.enemyHand.innerHTML = backs || '<span class="muted" style="font-size:11.5px">Empty hand</span>';
}

export function renderHand() {
  var state = getBattleState(), hand = state.hands[PLAYER];
  var canAct = state.turn === PLAYER && !state.resolving && !state.battleOver && !state.opponentThinking && !state.pending;
  els.handCount.textContent = hand.length + ' card' + (hand.length === 1 ? '' : 's') + ' · ' + state.decks[PLAYER].length + ' in deck';

  var html = hand.map(function (card, index) {
    var cardDef = CARDS[card.id], colorDef = colorInfo(cardDef.color);
    var sel = state.selectedCard === index && state.mode === 'place' ? ' selected' : '';
    var dead = '';
    if (canAct) {
      if (cardDef.type === 'unit' && !legalTiles(state.board, PLAYER, cardStrength(card), C.placeOpts(card.id, state.relics, state.board, PLAYER)).length) dead = ' unplayable';
      if (cardDef.type === 'hazard' && !freeHazardRows(state.hazards, PLAYER).length) dead = ' unplayable';
      /* A spell's target picking begins the instant the card is tapped —
         there is no board placement step first, unlike a unit — so if the
         very first thing it needs to ask for has no legal answer at all
         (Catalyst wants a friendly unit to start from, and there are none),
         beginPlay found nothing to prompt for and finished the play on the
         spot with zero picks: the card was gone and nothing had happened,
         with no confirmation and no chance to back out. Marking it
         unplayable here catches it before the tap ever lands, the same way
         a unit with no legal tile already is. Scoped to spells only —
         a unit's own on-play targets can depend on the tile it is about to
         occupy, which does not exist yet at this point, so checking them
         here would wrongly flag units that are perfectly playable. */
      if (cardDef.type === 'spell' && cardDef.targets && cardDef.targets.length &&
          !legalTargets(state, PLAYER, cardDef.targets[0], [], null).length) dead = ' unplayable';
    }
    return '<button class="card ' + cardDef.type + sel + dead + '" data-card="' + index + '"' + (canAct ? '' : ' disabled') +
      ' style="--card:' + colorDef.hex + ';--card-ink:' + colorDef.ink + '">' +
      '<span class="card-top">' + (cardDef.type === 'unit' ? cardStrength(card) : cardDef.type === 'hazard' ? 'HAZ' : 'SPL') + '</span>' +
      '<span class="card-name">' + cardName(card) + '</span>' +
      iconRow(card.id) +
      '<span class="card-blurb">' + cardDef.text + '</span></button>';
  }).join('');

  /* Mixing is a card you play, not a button off to one side. */
  var tokens = state.mixTokens[PLAYER];
  var canMixNow = canAct && tokens > 0 && mixOptions(state.board, PLAYER).length > 0;
  html += '<button class="card mixcard' + (state.mode === 'mix' ? ' selected' : '') +
    (canMixNow ? '' : ' unplayable') + '" data-mix="1"' + (canMixNow ? '' : ' disabled') + '>' +
    '<span class="card-top">' + tokens + '</span>' +
    '<span class="card-name">' + (state.mode === 'mix' ? 'Cancel mix' : 'Mix') + '</span>' +
    iconRow('__mix__') +
    '<span class="card-blurb">Fuse two touching friendly units. Colours combine, strengths add plus one.</span></button>';

  els.hand.innerHTML = html;

  /* The strip now doubles as a button, so what it shows has to travel with
     what a tap on it should open — `info.cardId` is that link. `.has-more`
     is the one honest signal that the two-line strip is a summary, not the
     whole card: it goes on only once a real card is loaded, never on the
     empty "hover or tap" prompt. */
  function peek(info) {
    if (!info) {
      els.cardPeek.innerHTML = '<span class="peek-empty">Hover or tap a card to read it</span>';
      els.cardPeek.classList.remove('has-more');
      delete els.cardPeek.dataset.cardId;
      return;
    }
    els.cardPeek.innerHTML = info.html;
    els.cardPeek.classList.add('has-more');
    els.cardPeek.dataset.cardId = info.cardId;
  }
  /* Name lives on the card itself; the peek strip is just icons + the full
     rules text, so it stays short and never needs to guess how much room a
     neighbouring button will take. */
  function peekFor(btn) {
    if (btn.getAttribute('data-mix')) {
      return { cardId: '__mix__', html: iconRow('__mix__') +
        '<span>Fuse two touching friendly units — colours combine, strengths add plus one.</span>' };
    }
    var card = getBattleState().hands[PLAYER][+btn.getAttribute('data-card')];
    if (!card) return null;
    var cardDef = CARDS[card.id];
    return { cardId: card.id, html: iconRow(card.id) + '<span>' + cardDef.text + '</span>' };
  }
  // a re-render must not wipe what the player is currently reading
  var selNow = els.hand.querySelector('.card.selected');
  peek(selNow ? peekFor(selNow) : null);

  Array.prototype.forEach.call(els.hand.querySelectorAll('.card'), function (btn) {
    btn.addEventListener('mouseenter', function () { peek(peekFor(btn)); });
    btn.addEventListener('mouseleave', function () {
      var selBtn = els.hand.querySelector('.card.selected');
      /* Reverting to the selected card on mouseleave is still right; blanking
         the strip when nothing is selected is not — moving the cursor toward
         the peek strip to click it means leaving the card first, and that
         used to clear the very thing you were reaching for before the click
         could ever land. Leaving the last-peeked card in place until
         something else replaces it fixes the click and reads better besides:
         no flicker back to the empty prompt every time the mouse drifts off. */
      if (selBtn) peek(peekFor(selBtn));
    });
    btn.addEventListener('click', function () {
      peek(peekFor(btn));
      if (btn.getAttribute('data-mix')) { onMixToggle(); return; }
      selectCard(+btn.getAttribute('data-card'));
    });
  });
}
