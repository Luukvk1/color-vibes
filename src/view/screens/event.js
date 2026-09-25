/* The event screen. */

import { chooseEventOption, cutEventCard, getActiveRun } from '../../game/index.js';
import { els } from '../dom.js';
import { cardMini } from './chrome.js';

export function renderEvent() {
  var event = getActiveRun().event;
  /* Some options do not resolve on the tap — they open a picker, because
     *which* card leaves matters more than how many. The event stays on screen
     until the choice is made rather than advancing underneath the player. */
  if (getActiveRun().eventPick) {
    var left = getActiveRun().eventPick.left;
    els.eventBody.innerHTML = '<h2>' + event.title + '</h2>' +
      '<p class="screen-lead">Choose ' + (left > 1 ? left + ' cards' : 'a card') +
      ' to take out of the run for good.</p>' +
      '<div class="deck-grid">' + getActiveRun().deck.map(function (entry, index) {
        return '<button class="swap-card" data-cut="' + index + '">' + cardMini(entry) + '</button>';
      }).join('') + '</div>';
    Array.prototype.forEach.call(els.eventBody.querySelectorAll('[data-cut]'), function (btn) {
      btn.addEventListener('click', function () { cutEventCard(+btn.getAttribute('data-cut')); });
    });
    return;
  }
  els.eventBody.innerHTML = '<h2>' + event.title + '</h2><p class="screen-lead">' + event.text + '</p><div class="lab-opts">' +
    event.options.map(function (option, index) { return '<button class="lab-opt" data-i="' + index + '">' + option.label + '</button>'; }).join('') + '</div>';
  Array.prototype.forEach.call(els.eventBody.querySelectorAll('.lab-opt'), function (btn) {
    btn.addEventListener('click', function () { chooseEventOption(+btn.getAttribute('data-i')); });
  });
}
