/* The shop screen. */

import { getActiveRun, rules as C } from '../../game/index.js';
import { SHOP_REMOVAL_LIMIT, burnShopCard, buyShopCard, buyShopRelic, removalCost, removalsLeft, shopRelicPrice } from '../../game/index.js';
import { els } from '../dom.js';
import { cardMini } from './chrome.js';

var CARDS = C.CARDS;
var RELICS = C.RELICS;

export function renderShop() {
  var shop = getActiveRun().shop;
  els.shopCards.innerHTML = shop.cards.map(function (entry, index) {
    var price = CARDS[entry.id].cost || 30;
    var owned = shop.sold['c' + index];
    return '<button class="shop-item" data-c="' + index + '"' + (owned || getActiveRun().gold < price ? ' disabled' : '') + '>' +
      cardMini(entry) + '<span class="price">' + (owned ? 'Sold' : price + 'g') + '</span></button>';
  }).join('');
  els.shopRelics.innerHTML = shop.relics.map(function (relicKey, index) {
    var price = shopRelicPrice(relicKey), owned = shop.sold['r' + index];
    return '<button class="shop-item" data-r="' + index + '"' + (owned || getActiveRun().gold < price ? ' disabled' : '') + '>' +
      '<div class="mini-card relicbox"><span class="mini-name">' + RELICS[relicKey].name + '</span><span class="mini-text">' + RELICS[relicKey].text + '</span></div>' +
      '<span class="price">' + (owned ? 'Sold' : price + 'g') + '</span></button>';
  }).join('');
  /* Removal is repeatable now, at a price that climbs each time. One removal
     per shop could not keep pace with a deck growing every battle, but making
     it flatly unlimited would trivialise deck size instead. A rising cost
     lets a player who is committed to a lean deck spend their whole purse on
     it, while still charging real money for the privilege. */
  var cost = removalCost(shop), left = removalsLeft(shop);
  els.shopRemove.disabled = getActiveRun().gold < cost || getActiveRun().deck.length <= 5 || left <= 0;
  els.shopRemove.textContent = left <= 0 ? 'This bench has cut all it will'
    : getActiveRun().deck.length <= 5 ? 'Deck is as lean as it goes'
    : shop.removing ? 'Pick a card to burn \u2014 or tap to cancel'
    : 'Remove a card \u2014 ' + cost + 'g' + (left < SHOP_REMOVAL_LIMIT ? ' (last one here)' : '');
  els.shopRemove.classList.toggle('armed', !!shop.removing);

  /* The picker lives under the button rather than in a modal: it is a deck
     view with one extra job, and the deck is already the thing the player is
     looking at when they decide something has to go. */
  var pick = document.getElementById('shopRemovePick');
  if (pick) {
    pick.hidden = !shop.removing || left <= 0;
    pick.innerHTML = pick.hidden ? '' :
      '<p class="screen-lead">' + cost + ' gold and it is gone from the run for good. ' +
      (left > 1 ? 'This bench will cut ' + left + ' cards in all.' : 'This is the last cut on offer here.') + '</p>' +
      '<div class="deck-grid">' + getActiveRun().deck.map(function (entry, index) {
        return '<button class="swap-card" data-burn="' + index + '">' + cardMini(entry) + '</button>';
      }).join('') + '</div>';
    Array.prototype.forEach.call(pick.querySelectorAll('[data-burn]'), function (btn) {
      btn.addEventListener('click', function () { burnShopCard(+btn.getAttribute('data-burn')); });
    });
  }

  Array.prototype.forEach.call(els.shopCards.querySelectorAll('.shop-item'), function (btn) {
    btn.addEventListener('click', function () { buyShopCard(+btn.getAttribute('data-c')); });
  });
  Array.prototype.forEach.call(els.shopRelics.querySelectorAll('.shop-item'), function (btn) {
    btn.addEventListener('click', function () { buyShopRelic(+btn.getAttribute('data-r')); });
  });
}
