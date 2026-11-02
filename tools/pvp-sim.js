/* Draft balance: bots draft and play friendly matches, and the report says what wins.

     node tools/pvp-sim.js                 1000 matches, hidden and face-up mixed
     node tools/pvp-sim.js --matches 3000

   Relics are picked at random, on purpose: a relic's win rate then measures the
   relic rather than how good the bot is at choosing it. Cards are picked by plain
   value, so colours and curves look like a person's. Both seats play with the
   engine's own opponent AI at its sharpest. Read small differences as noise; the
   margin column is roughly two standard errors. */

import '../tests/support/browser-stub.js';
import * as game from '../src/game/index.js';
import { newSeededGame } from '../tests/support/play.js';

var args = process.argv.slice(2);
var at = args.indexOf('--matches');
var MATCHES = at === -1 ? 1000 : +args[at + 1];
var SHARP_POWER = 60;
var C = game.rules, CARDS = C.CARDS, PLAYER = C.PLAYER;
var RARITY = { Common: 1, Uncommon: 2, Rare: 3, Legendary: 4 };

function cardValue(id, taken) {
  var cardDef = CARDS[id], colour = taken.filter(function (held) { return CARDS[held].color === cardDef.color; }).length;
  return (RARITY[cardDef.rarity] || 1) + (cardDef.strength || 0) / 3 + colour * 0.25 + game.getRnd()();
}

function draftPick() {
  var match = game.getRun().pvp, draft = match.draft;
  if (draft.kind === 'relic') return Math.floor(game.getRnd()() * draft.offer.length);
  var taken = draft.picks[match.seat].cards, best = 0, bestValue = -Infinity;
  draft.offer.forEach(function (id, index) {
    var value = cardValue(id, taken);
    if (value > bestValue) { bestValue = value; best = index; }
  });
  return best;
}

function playOut() {
  for (var step = 0; step < 2000; step++) {
    var state = game.getBattleState();
    if (!state) return true;
    if (state.roundResult) { game.continueBattle(); continue; }
    if (game.needsHandoff(state)) { game.takeSeat(); continue; }
    game.runOpponentMove(game.decideOpponentMove(PLAYER));
  }
  return false;
}

var relicStats = {}, cardStats = {}, colourStats = {}, totals = { played: 0, unfinished: 0, draftFirstWins: 0, sweeps: 0, deciders: 0 };
var formats = { 'draft-open': { first: 0, played: 0 }, 'draft-hidden': { first: 0, played: 0 } };

function tally(table, key, won) {
  var entry = table[key] = table[key] || { played: 0, won: 0 };
  entry.played++; if (won) entry.won++;
}

for (var seed = 1; seed <= MATCHES; seed++) {
  newSeededGame(seed);
  C.DRAWABLE.concat(C.BOSS_CARDS).forEach(function (id) { game.codex.cards[id] = 1; });
  game.enterPvp();
  var mode = seed % 2 ? 'draft-open' : 'draft-hidden';
  game.pvpChooseMode(mode);
  var match = game.getRun().pvp, firstDrafter = match.draft.queue[0].seat;
  while (match.step !== 'match') {
    if (match.step === 'cover') game.pvpContinue(); else game.pvpDraftPick(draftPick());
  }
  game.getBattleState().power = SHARP_POWER;
  var picks = match.draft.picks;
  if (!playOut()) { totals.unfinished++; game.leavePvp(); continue; }
  var winnerIndex = match.winner === match.players[0].name ? 0 : 1;
  totals.played++;
  if (match.wins[1] === 0) totals.sweeps++; else totals.deciders++;
  formats[mode].played++;
  if (winnerIndex === firstDrafter) { totals.draftFirstWins++; formats[mode].first++; }
  picks.forEach(function (taken, playerIndex) {
    var won = playerIndex === winnerIndex;
    taken.relics.forEach(function (key) { tally(relicStats, key, won); });
    new Set(taken.cards).forEach(function (id) { tally(cardStats, id, won); });
    var counts = {};
    taken.cards.forEach(function (id) { var key = CARDS[id].color || 'colourless'; counts[key] = (counts[key] || 0) + 1; });
    Object.keys(counts).forEach(function (key) { if (counts[key] >= 5) tally(colourStats, key, won); });
  });
  game.leavePvp();
}

function percent(part, whole) { return whole ? (100 * part / whole).toFixed(1) : '-'; }
function table(title, stats, names, limit) {
  var rows = Object.keys(stats).map(function (key) { return { key: key, played: stats[key].played, rate: stats[key].won / stats[key].played }; })
    .sort(function (first, second) { return second.rate - first.rate; });
  console.log('\n' + title);
  (limit ? rows.slice(0, limit).concat(rows.slice(-limit)) : rows).forEach(function (row) {
    var margin = 200 * Math.sqrt(0.25 / row.played);
    console.log('  ' + (names(row.key) + ' '.repeat(26)).slice(0, 26) + (row.rate * 100).toFixed(1).padStart(5) + '%  +-' + margin.toFixed(1).padStart(4) + '  n=' + row.played);
  });
}

console.log(totals.played + ' matches, ' + totals.unfinished + ' unfinished');
console.log('2-0 finishes ' + percent(totals.sweeps, totals.played) + '%, went to round 3 ' + percent(totals.deciders, totals.played) + '%');
console.log('first drafter wins: face up ' + percent(formats['draft-open'].first, formats['draft-open'].played) + '%, hidden ' + percent(formats['draft-hidden'].first, formats['draft-hidden'].played) + '%');
table('Relics, win rate when held', relicStats, function (key) { return C.RELICS[key].name; });
table('Colours, win rate with 5+ cards of it', colourStats, function (key) { return key; });
table('Cards, best and worst 10 (at least 150 decks)', Object.keys(cardStats).reduce(function (kept, id) {
  if (cardStats[id].played >= 150) kept[id] = cardStats[id];
  return kept;
}, {}), function (id) { return CARDS[id].name; }, 10);
