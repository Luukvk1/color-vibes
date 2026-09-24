/* The reward screen. */

import { rules as C } from '../../game/index.js';
import { skipValue, store, takeRewardCard, takeRewardRelic } from '../../game/index.js';
import { els } from '../dom.js';
import { cardMini } from './chrome.js';

var RELICS = C.RELICS;

export function renderReward() {
  var reward = store.run.reward;

  els.rewardRot.hidden = !reward.rotted;
  els.rewardRot.innerHTML = reward.rotted
    ? 'Something clung to it. <b>' + reward.rotted.name + '</b> is in your deck now — ' + reward.rotted.text
    : '';
  els.rewardCards.innerHTML = reward.cards.map(function (entry, index) {
    return '<button class="reward-pick' + (reward.cardTaken ? ' taken' : '') + '" data-i="' + index + '"' +
      (reward.cardTaken ? ' disabled' : '') + '>' + cardMini(entry) + '</button>';
  }).join('');
  var lead = document.getElementById('rewardLead');
  var head = document.getElementById('rewardHead');
  if (head) head.textContent = reward.trophy ? 'The road gives up its prize' : 'Spoils';
  if (lead) {
    /* A relic is a second, independent prize, not an alternative to the card
       — this line used to sit on both a card AND a relic and the click
       handler quietly let you leave with only one of them, since either
       button advanced past the whole reward on its own. Said plainly here so
       a player who has taken the card still knows the relic is theirs too. */
    var relicNote = reward.relic ? (reward.cardTaken ? ' The relic is still yours to take.' : ' Take the relic too — it is not instead of the card.') : '';
    lead.innerHTML = reward.trophy
      ? 'You earned <b>' + reward.gold + '</b> gold, and the act itself. Take one of these three \u2014 ' +
        'they are the only cards on the road that are both this large and still do something.' + relicNote
      : 'You earned <b>' + reward.gold + '</b> gold. Take one card, or skip to keep your deck lean \u2014 ' +
        'it currently holds <b>' + store.run.deck.length + '</b> cards, and a smaller deck draws its best cards more often.' + relicNote;
  }
  var skipBtn = document.getElementById('skipRewardBtn');
  if (skipBtn) {
    // there is no sane reason to decline a trophy, so do not dangle a price
    skipBtn.hidden = !!reward.trophy || !!reward.cardTaken;
    skipBtn.textContent = 'Skip the card \u2014 take ' + skipValue() + ' gold instead';
  }
  els.screen_reward.classList.toggle('trophy', !!reward.trophy);
  els.rewardRelic.hidden = !reward.relic;
  // Clear it either way — leaving the previous reward's markup in a hidden
  // container leaves a live button behind that can push a null relic.
  els.rewardRelic.innerHTML = reward.relic
    ? '<span class="lbl">Relic on offer' + (reward.relicTaken ? ' \u2014 taken' : '') + '</span>' +
      '<button class="reward-pick relic' + (reward.relicTaken ? ' taken' : '') + '" data-relic="1"' +
      (reward.relicTaken ? ' disabled' : '') + '>' +
      '<div class="mini-card relicbox"><span class="mini-name">' + RELICS[reward.relic].name + '</span>' +
      '<span class="mini-text">' + RELICS[reward.relic].text + '</span></div></button>'
    : '';
  Array.prototype.forEach.call(els.screen_reward.querySelectorAll('.reward-pick'), function (btn) {
    btn.addEventListener('click', function () {
      if (btn.getAttribute('data-relic')) takeRewardRelic();
      else takeRewardCard(+btn.getAttribute('data-i'));
    });
  });
}
