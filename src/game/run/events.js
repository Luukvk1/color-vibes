/* Events on the road, and resolving the choice they offer. */

import C from '../rules/index.js';
import { act, store } from '../store.js';
import { advance, show } from './flow.js';

var CARDS = C.CARDS;
var RELIC_KEYS = C.RELIC_KEYS;
var hasRelic = C.hasRelic;

/* ---------------- events ---------------- */
export var EVENTS = [
  { title: 'A Spilled Palette', text: 'Pigment pools across the road. You can scoop some up, or step around it.',
    options: [
      { label: 'Scoop it — gain 45 gold, lose 1 life', run: function () { store.run.gold += 45; store.run.lives--; } },
      { label: 'Step around — nothing happens', run: function () {} }
    ] },
  { title: 'The Grinder', text: 'A stone wheel offers to sharpen one card, but it wears the rest.',
    options: [
      { label: 'Sharpen — upgrade a random active card', run: function () { var index = Math.floor(store.rnd() * store.run.deck.length); store.run.deck[index].up = true; } },
      { label: 'Walk on — gain 20 gold', run: function () { store.run.gold += 20; } }
    ] },
  { title: 'Colour Merchant', text: 'A trader will take a card off your hands for coin.',
    options: [
      { label: 'Sell a card — remove one at random, gain 60 gold', run: function () { if (store.run.deck.length > 5) { store.run.deck.splice(Math.floor(store.rnd() * store.run.deck.length), 1); store.run.gold += 60; } } },
      { label: 'Decline', run: function () {} }
    ] },
  { title: 'Abandoned Studio', text: 'Someone left their tools behind.',
    options: [
      { label: 'Take the relic — pay 40 gold', run: function () {
          if (store.run.gold < 40) return;
          store.run.gold -= 40;
          var avail = RELIC_KEYS.filter(function (key) { return !hasRelic(store.run.relics, key); });
          if (avail.length && store.run.relics.length < C.RELIC_LIMIT) store.run.relics.push(avail[Math.floor(store.rnd() * avail.length)]);
        } },
      { label: 'Rest instead \u2014 restore 1 life', run: function () { store.run.lives = Math.min(store.run.maxLives, store.run.lives + 1); } }
    ] },

  /* Deck-thinning events. The road grows a deck every single battle, so it
     needs places that shrink one back. These let a player choose *which* card
     goes, which matters far more than the count \u2014 a random cull is a tax, a
     chosen cull is deckbuilding. */
  { title: 'The Kiln', text: 'A furnace burns hot enough to take a card out of a run for good. It asks nothing for it.',
    options: [
      { label: 'Burn a card of your choosing', pick: 'remove', run: function () {} },
      { label: 'Leave it cold \u2014 gain 30 gold', run: function () { store.run.gold += 30; } }
    ] },
  { title: 'The Winnower', text: 'A figure sorts your deck without asking, and offers to keep only what is working.',
    options: [
      { label: 'Let it cut two \u2014 you choose both', pick: 'remove2', run: function () {} },
      { label: 'Refuse \u2014 upgrade a random card instead', run: function () {
          if (store.run.deck.length) store.run.deck[Math.floor(store.rnd() * store.run.deck.length)].up = true; } }
    ] },
  { title: 'Dead Weight', text: 'Your pack is heavier than it was. Something in it has stopped pulling its weight.',
    options: [
      { label: 'Cut the weakest card \u2014 and gain 40 gold', run: function () {
          if (store.run.deck.length <= 5) { store.run.gold += 40; return; }
          var worst = 0;
          store.run.deck.forEach(function (entry, index) {
            if (C.cardStrength(entry) < C.cardStrength(store.run.deck[worst])) worst = index;
          });
          store.run.deck.splice(worst, 1); store.run.gold += 40;
        } },
      { label: 'Carry it all \u2014 restore 1 life', run: function () { store.run.lives = Math.min(store.run.maxLives, store.run.lives + 1); } }
    ] },
  { title: 'The Sieve', text: 'Fine mesh, endlessly patient. It will strain the curses out \u2014 and a little else besides.',
    options: [
      { label: 'Strain it \u2014 remove every curse from your deck', run: function () {
          store.run.deck = store.run.deck.filter(function (entry) { return !CARDS[entry.id].curse; });
        } },
      { label: 'Trust your own hands \u2014 gain 50 gold', run: function () { store.run.gold += 50; } }
    ] }
];

export function rollEvent() {
  store.run.event = EVENTS[Math.floor(store.rnd() * EVENTS.length)];
  store.run.eventTaken = false;
  store.run.eventPick = null;
}

export var chooseEventOption = act(function chooseEventOption(index) {
  // A fast double tap used to resolve the same option twice — and cost two lives.
  if (store.run.eventTaken) return;
  store.run.eventTaken = true;
  var opt = store.run.event.options[index];
  opt.run();
  if (store.run.lives < 0) store.run.lives = 0;
  if (store.run.lives <= 0) { show('gameover'); return; }
  /* Some options do not resolve on the tap — they open a picker, because
     *which* card leaves matters more than how many. */
  if (opt.pick && store.run.deck.length > 5) {
    store.run.eventPick = { left: opt.pick === 'remove2' ? 2 : 1 };
    return;
  }
  advance();
});

export var cutEventCard = act(function cutEventCard(deckIndex) {
  if (!store.run.eventPick) return;
  if (store.run.deck.length <= 5) { store.run.eventPick = null; advance(); return; }
  store.run.deck.splice(deckIndex, 1);
  store.run.eventPick.left--;
  if (store.run.eventPick.left <= 0) { store.run.eventPick = null; advance(); }
});
