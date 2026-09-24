/* The shop: what is on the shelf and buying from it. */

import C from '../rules/index.js';
import { shuffle } from '../battle/setup.js';
import { discoverCard } from '../codex.js';
import { act, store } from '../store.js';
import { offerableCards } from './rewards.js';

var CARDS = C.CARDS;
var RELICS = C.RELICS;
var RELIC_KEYS = C.RELIC_KEYS;
var hasRelic = C.hasRelic;

/* Two cuts per shop, at 50 then 75. Unlimited removal let a rich player
   empty their deck at a single bench, which made shops the whole answer to
   deck size and left events and reward-skipping doing nothing. Capping at two
   keeps thinning a steady spend across the run rather than one purge, and the
   rising price still makes the second cut a real decision. */
export var SHOP_REMOVAL_LIMIT = 2;

/* Shop relics cost half again their printed price. With the battle trickle
   gone the shop is one of only two supplies, so a relic on the shelf should
   be a real purchase that competes with cards and removals for the same
   purse — not small change picked up in passing. */
var SHOP_RELIC_MARKUP = 1.5;

export function shopRelicPrice(key) {
  return Math.round((RELICS[key].cost || 80) * SHOP_RELIC_MARKUP);
}

export function removalCost(shop) {
  return 50 + ((shop && shop.removals) || 0) * 25;
}

export function removalsLeft(shop) {
  return SHOP_REMOVAL_LIMIT - ((shop && shop.removals) || 0);
}

/* ---------------- shop ---------------- */
export function rollShop() {
  var cards = [], guard = 0, stock = offerableCards();
  while (cards.length < 5 && guard++ < 200) {
    var cardId = stock[Math.floor(store.rnd() * stock.length)];
    if (cards.some(function (entry) { return entry.id === cardId; })) continue;
    cards.push({ id: cardId, up: false });
  }
  var avail = RELIC_KEYS.filter(function (key) { return !hasRelic(store.run.relics, key); });
  shuffle(avail);
  cards.forEach(function (entry) { discoverCard(entry.id); });
  store.run.shop = { cards: cards, relics: avail.slice(0, 2), removalUsed: false, sold: {} };
}

export var buyShopCard = act(function buyShopCard(index) {
  var shop = store.run.shop, price = CARDS[shop.cards[index].id].cost || 30;
  if (shop.sold['c' + index] || store.run.gold < price) return;
  store.run.gold -= price; shop.sold['c' + index] = true;
  store.run.deck.push(shop.cards[index]);
});

export var buyShopRelic = act(function buyShopRelic(index) {
  // same price function the shelf displays, so the two cannot disagree
  var shop = store.run.shop, relicKey = shop.relics[index], price = shopRelicPrice(relicKey);
  if (shop.sold['r' + index] || store.run.gold < price) return;
  store.run.gold -= price; shop.sold['r' + index] = true; store.run.relics.push(relicKey);
});

/* Removal arms a picker and the player chooses which card goes; a random
   removal is no use to someone trying to cut one specific curse. */
export var toggleShopRemoval = act(function toggleShopRemoval() {
  var shop = store.run.shop;
  if (store.run.gold < removalCost(shop) || store.run.deck.length <= 5) return;
  if (removalsLeft(shop) <= 0) return;
  shop.removing = !shop.removing;
});

export var burnShopCard = act(function burnShopCard(deckIndex) {
  var shop = store.run.shop, cost = removalCost(shop);
  if (store.run.gold < cost || store.run.deck.length <= 5 || removalsLeft(shop) <= 0) return;
  store.run.gold -= cost;
  store.run.deck.splice(deckIndex, 1);
  shop.removals = (shop.removals || 0) + 1; shop.removing = false;
});
