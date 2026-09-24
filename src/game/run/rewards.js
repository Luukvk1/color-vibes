/* What a won battle pays out, and taking it. */

import C from '../rules/index.js';
import { shuffle } from '../battle/setup.js';
import { discoverCard } from '../codex.js';
import { ACTS } from '../content/acts.js';
import { act, store } from '../store.js';
import { advance, curseCount, gainCurse, powerAt } from './flow.js';

var CARDS = C.CARDS;
var RELIC_KEYS = C.RELIC_KEYS;
var hasRelic = C.hasRelic;

/* ---------------- rewards ---------------- */
/* The road only offers you colours you already carry. Colourless cards are
   always on the table — they are the flexibility valve, and gating them would
   turn a narrowing into a strangling. This is what makes the Colour Lab load
   bearing: nothing else in the run can put a colour in your deck that is not
   already there, so a new colour is always something you made, never
   something you were handed. */
/* Cards whose whole text is about something the run has not produced yet.
   Being offered a Riftwalker before a single fissure exists is being offered a
   blank card: the player either takes dead weight or wastes the pick, and
   either way the reward screen lied about being a choice. These stay out of
   the pool until the thing they answer is actually on the board.

   Keyed off the run, not the battle, because a reward is chosen between
   fights — what matters is whether fissures exist at all, not whether any
   were on the last board. */
export var NEEDS_FISSURES = ['black_riftwalker', 'black_chorus', 'cyan_mender', 'cyan_keystone'];

export var NEEDS_HAZARDS  = ['cyan_shield', 'cyan_cleanser'];

export var NEEDS_CURSES   = ['black_gravebloom', 'black_reclaimer', 'cyan_absolver'];

export function situationalOk(cardId) {
  if (NEEDS_FISSURES.indexOf(cardId) !== -1) return (store.run.fissures || []).length > 0;
  if (NEEDS_CURSES.indexOf(cardId) !== -1) return curseCount(store.run.deck) > 0;
  /* Hazards are not permanent like fissures — they are played from cards. So
     the test is whether the run can produce one at all: either you carry a
     hazard card, or you have met enemies deep enough to field them. */
  if (NEEDS_HAZARDS.indexOf(cardId) !== -1) {
    var haveHazard = store.run.deck.some(function (entry) { return CARDS[entry.id].type === 'hazard'; });
    return haveHazard || powerAt(store.run, store.run.depth) >= 6;
  }
  return true;
}

export function offerableCards() {
  var held = C.colourCounts(store.run.deck);
  return C.DRAWABLE.filter(function (cardId) {
    var cardDef = CARDS[cardId];
    if (!situationalOk(cardId)) return false;
    if (!cardDef.color) return true;                 // colourless: always available
    return held[cardDef.color] > 0;
  });
}

/* What declining a card is worth. Skipping used to be a pure loss, so the
   only reason to do it was discipline — and decks ran to forty-plus cards
   because taking something was always weakly better than taking nothing.
   Paying for the skip turns deck size into an economy: a lean deck is
   something you buy, round after round, instead of something you merely
   resist spending. Scales with power so it stays relevant late. */
export function skipValue() {
  return 25 + powerAt(store.run, store.run.depth) * 3;
}

/* Card quality climbs with the run. The weights used to be fixed, so the last
   battle of a seven-act run offered the same wash of Commons as the first,
   and taking a reward stopped being worth the deck slot long before the run
   ended. Rares overtake Commons around the third act. */
export function rarityWeights(power) {
  var progress = Math.min(1, power / 45);        // 0 at the start, 1 by act four or so
  return {
    Common:   Math.max(1, 6 - progress * 5),
    Uncommon: 3 + progress * 2,
    Rare:     1 + progress * 5
  };
}

export function rollReward(node) {
  var count = 3 + (hasRelic(store.run.relics, 'collectors_frame') ? 1 : 0);

  /* An act boss hands over its own road's trophy: one of three Legendaries,
     chosen, never rolled. These are the only cards in the game that are both
     large and still carry text, so the drop is worth planning a route around
     — and because the pick is yours, the boss you beat is the boss you wanted
     to beat. Colour gating does not apply here: you earned it in the field. */
  if (node.type === 'boss') {
    var myColor = ACTS[store.run.act] ? ACTS[store.run.act].color : null;
    var offer, shortfall = 0;
    if (ACTS[store.run.act] && ACTS[store.run.act].secret && C.SECRET_TROPHIES[store.run.act]) {
      /* A secret road drops its own three, unconditionally — never the seven
         colour trophies, never gated, never short. There is nothing to
         filter: these cards answer to no colour, so every run that reaches
         one gets the full choice every time. */
      offer = C.SECRET_TROPHIES[store.run.act].slice();
    } else {
      /* A trophy can only be a colour the run has actually opened. Letting the
         drop ignore the gate meant the Devouring Star could turn up off a
         lucky roll in act two — handing out the last road's signature card to
         someone who had never made a single Black, which is precisely the thing
         the colour gate exists to prevent. The act's own colour always
         qualifies: you just beat that road, so you hold it by definition. */
      var trophies = C.BOSS_CARDS.filter(function (cardId) {
        var cardColor = CARDS[cardId].color;
        return !cardColor || cardColor === myColor || C.actUnlocked(cardColor, store.run.deck);
      });
      var own = trophies.filter(function (cardId) { return CARDS[cardId].color === myColor; });
      var rest = trophies.filter(function (cardId) { return CARDS[cardId].color !== myColor; });
      shuffle(rest);
      offer = own.concat(rest).slice(0, 3);
      /* If the run is still narrow there may not be three unlocked trophies.
         Rather than pad with locked ones, the boss pays the difference in gold —
         a short offer is honest, a padded one is a tease. */
      shortfall = 3 - offer.length;
    }
    offer = offer.map(function (cardId) { return { id: cardId, up: false }; });
    store.run.reward = {
      cards: offer, gold: 140 + Math.floor(store.rnd() * 30) + shortfall * 60, relic: null, node: node,
      taken: false, cardTaken: false, relicTaken: false, rotted: null, trophy: true
    };
    offer.forEach(function (entry) { discoverCard(entry.id); });
    var availableRelics = RELIC_KEYS.filter(function (key) { return !hasRelic(store.run.relics, key); });
    if (availableRelics.length && store.run.relics.length < C.RELIC_LIMIT) {
      store.run.reward.relic = availableRelics[Math.floor(store.rnd() * availableRelics.length)];
    }
    return;
  }

  var pool = offerableCards();
  /* An elite costs more to beat than an ordinary fight, so its card should
     read like it — better than a battle at the same depth, short of a boss's
     trophy pick. Read as fifteen power ahead on the same curve everything
     else already scales on, rather than a separate elite-only table. */
  var effPower = powerAt(store.run, node.depth) + (node.type === 'elite' ? 15 : 0);
  var weight = rarityWeights(effPower);
  var picks = [], guard = 0;
  while (picks.length < count && guard++ < 400) {
    var cardId = pool[Math.floor(store.rnd() * pool.length)];
    if (store.rnd() * 10 > (weight[CARDS[cardId].rarity] || 1)) continue;
    if (picks.some(function (pick) { return pick.id === cardId; })) continue;
    picks.push({ id: cardId, up: false });
  }
  var gold = (node.type === 'boss' ? 120 : node.type === 'elite' ? 80 : 35) + Math.floor(store.rnd() * 20);
  /* Whatever broke in the lab is loose now. The bigger things on the road carry
     it, and hand a little of it back to you. */
  var rotted = null;
  if ((store.run.corruption || 0) > 0 && (node.type === 'elite' || node.type === 'boss')) {
    if (store.rnd() < Math.min(0.65, 0.25 + store.run.corruption * 0.08)) {
      var held = {};
      store.run.deck.forEach(function (entry) { if (CARDS[entry.id].curse) held[entry.id] = true; });
      var fresh = C.CURSE_KEYS.filter(function (key) { return !held[key]; });
      rotted = gainCurse((fresh.length ? fresh : C.CURSE_KEYS)[Math.floor(store.rnd() * (fresh.length ? fresh.length : C.CURSE_KEYS.length))]);
    }
  }
  /* Relics come from the things worth beating, never from a lucky roll on an
     ordinary fight. An 18% trickle off every battle meant relics arrived as
     background noise — you were never *going* anywhere for one, so they never
     redirected a build. Now an elite or a boss always hands one over, next to
     the card, and everything else hands over none. That makes the elite on
     the road a decision ("do I want what it is guarding?") rather than a
     tax, and it makes the shop the only other supply. */
  var relic = null;
  if (node.type === 'elite' || node.type === 'boss') {
    var avail = RELIC_KEYS.filter(function (key) { return !hasRelic(store.run.relics, key); });
    if (avail.length) relic = avail[Math.floor(store.rnd() * avail.length)];
  }
  picks.forEach(function (entry) { discoverCard(entry.id); });
  if (rotted) discoverCard(rotted.id);
  store.run.reward = { cards: picks, gold: gold, relic: relic, node: node, taken: false, cardTaken: false, relicTaken: false, rotted: rotted };
}

/* A reward has two independent prizes, the card slot (taken or skipped) and
   the relic slot (taken, or simply absent). The road only moves on once both
   are settled. */
function settleReward() {
  var reward = store.run.reward;
  if (reward.cardTaken && (!reward.relic || reward.relicTaken)) { reward.taken = true; advance(); }
}

export var takeRewardCard = act(function takeRewardCard(index) {
  var reward = store.run.reward;
  if (!reward || reward.cardTaken) return;
  store.run.deck.push(reward.cards[index]);
  reward.cardTaken = true;
  settleReward();
});

export var takeRewardRelic = act(function takeRewardRelic() {
  var reward = store.run.reward;
  if (!reward || !reward.relic || reward.relicTaken) return;
  store.run.relics.push(reward.relic);
  reward.relicTaken = true;
  settleReward();
});

export var skipReward = act(function skipReward() {
  var reward = store.run.reward;
  // there is no sane reason to decline a trophy, so it carries no price
  if (!reward || reward.cardTaken || reward.trophy) return;
  reward.cardTaken = true;
  store.run.gold += skipValue();
  settleReward();
});
