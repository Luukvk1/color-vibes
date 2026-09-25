/* Whole games, played end to end against the real rules with no page involved.

   These are the regression net: play a seeded run with a bot, and the same
   seed must always play out the same way. When a change to the game is meant to
   alter how runs go, the golden numbers move with it — run
     UPDATE_GOLDEN=1 npm test
   and review the diff in tests/golden/runs.json like any other change. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as game from '../src/game/index.js';
import { newSeededGame, playRun, playScreen, summarise } from './support/play.js';

var CARDS = game.rules.CARDS;
var SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
var LONG_SEEDS = [1, 2, 3, 4];
// enough lives to get the bot past where it would be knocked out, so it reaches the deeper acts
var LONG = { lives: 60, maxScreens: 1500 };
var GOLDEN = new URL('./golden/runs.json', import.meta.url);
var SCREENS = ['map', 'act', 'victory', 'battle', 'reward', 'shop', 'lab', 'event', 'gameover'];

test('the same seed plays the same run', function () {
  SEEDS.slice(0, 4).forEach(function (seed) {
    var first = playRun(seed), second = playRun(seed);
    assert.deepEqual(second.summary, first.summary, 'seed ' + seed);
    assert.deepEqual(second.trace, first.trace, 'seed ' + seed);
  });
});

test('different seeds play different runs', function () {
  var seen = {};
  SEEDS.forEach(function (seed) { seen[JSON.stringify(playRun(seed).summary)] = 1; });
  assert.ok(Object.keys(seen).length > 3, 'ten seeds produced only ' + Object.keys(seen).length + ' distinct runs');
});

test('a run never breaks its own rules, screen by screen', function () {
  SEEDS.forEach(function (seed) {
    playRun(seed, {
      onScreen: function (run, count) {
        var where = 'seed ' + seed + ', screen ' + count + ' (' + run.screen + ')';
        assert.ok(SCREENS.indexOf(run.screen) !== -1, where + ': unknown screen');
        assert.ok(run.lives >= 0 && run.lives <= run.maxLives, where + ': lives ' + run.lives);
        assert.ok(run.gold >= 0, where + ': gold ' + run.gold);
        assert.ok(run.deck.length >= 1, where + ': empty deck');
        run.deck.forEach(function (entry) { assert.ok(CARDS[entry.id], where + ': deck points at missing card ' + entry.id); });
        assert.equal(new Set(run.relics).size, run.relics.length, where + ': a relic twice');
        assert.ok(run.depth >= 0 && run.depth < run.map.length, where + ': depth ' + run.depth);
      }
    });
  });
});

test('every action announces once, when it has finished', function () {
  newSeededGame(3);
  var heard = [];
  var stop = game.subscribe(function (type) { heard.push(type); });
  game.enterNode(game.currentNodes()[0]);
  assert.equal(heard.filter(function (type) { return type === 'change'; }).length, 1);
  assert.equal(game.getRun().screen, 'battle');
  assert.ok(heard.indexOf('log') !== -1, 'a battle starting says so in the log');
  stop();
});

test('long runs walk whole acts and meet every kind of screen', function () {
  var met = {}, cleared = 0;
  LONG_SEEDS.forEach(function (seed) {
    var result = playRun(seed, Object.assign({}, LONG, {
      onScreen: function (run) {
        assert.ok(run.lives >= 0 && run.lives <= run.maxLives && run.gold >= 0 && run.deck.length >= 1, 'seed ' + seed + ' on ' + run.screen);
        run.deck.forEach(function (entry) { assert.ok(CARDS[entry.id], 'seed ' + seed + ': deck points at missing card ' + entry.id); });
      }
    }));
    result.trace.forEach(function (screen) { met[screen] = 1; });
    cleared = Math.max(cleared, result.summary.actsCleared);
    assert.equal(result.summary.screen, 'gameover', 'seed ' + seed + ' should have run its course');
  });
  ['map', 'battle', 'reward', 'shop', 'lab', 'event', 'act'].forEach(function (screen) { assert.ok(met[screen], 'never reached ' + screen); });
  assert.ok(cleared >= 2, 'the deepest run cleared only ' + cleared + ' acts');
});

test('the game reports effects instead of drawing them', function () {
  newSeededGame(3);
  var kinds = {};
  var stop = game.subscribe(function (type, payload) { kinds[type === 'fx' ? 'fx:' + payload.kind : type] = 1; });
  game.enterNode(game.currentNodes()[0]);
  for (var step = 0; step < 40 && game.getRun().screen === 'battle' && !game.getBattleState().roundResult; step++) {
    var state = game.getBattleState();
    if (state.turn === game.rules.ENEMY) game.opponentMove();
    else game.runOpponentMove(game.decideOpponentMove(game.rules.PLAYER));
  }
  stop();
  assert.ok(kinds['fx:burst'] || kinds['fx:fly'] || kinds['fx:hazard'], 'a played card is announced as an effect');
  assert.ok(kinds.log && kinds.change);
});

test('the run is never kept mid-battle', function () {
  newSeededGame(5);
  var atMap = JSON.stringify(game.snapshot().run);
  game.enterNode(game.currentNodes()[0]);
  assert.equal(game.getRun().screen, 'battle');
  assert.equal(JSON.stringify(game.snapshot().run), atMap, 'what would be saved is still the map, not the battle');
  assert.equal(game.snapshot().run.screen, 'map');
});

test('a scaffolding run behind the title is never kept', function () {
  game.start(null);
  assert.equal(game.hasCheckpoint(), false);
  assert.equal(game.snapshot().run, null);
  game.newGame();
  assert.equal(game.hasCheckpoint(), true);
});

test('what the game hands the session can be handed back to resume the run', function () {
  SEEDS.slice(0, 5).forEach(function (seed) {
    var checked = 0;
    playRun(seed, {
      onScreen: function (run) {
        if (run.screen === 'battle') return;                   // a battle is never kept, see the test above
        var live = JSON.stringify(run);
        var snap = JSON.parse(JSON.stringify(game.snapshot().run));       // as it comes back from storage
        assert.equal(JSON.stringify(snap), live, 'seed ' + seed + ': the snapshot is the run as it stands');
        var restored = game.restoreRun(JSON.parse(JSON.stringify(snap)));
        assert.ok(restored, 'seed ' + seed + ': a snapshot always restores');
        assert.equal(JSON.stringify(restored), live);
        checked++;
      }
    });
    assert.ok(checked > 3);
  });
});

test('resuming lands on the screen the player left', function () {
  newSeededGame(7);
  playScreen(); playScreen();                                   // a battle and what follows it
  var run = game.getRun();
  var saved = JSON.parse(JSON.stringify(game.snapshot().run));
  game.start(saved);
  assert.equal(game.getRun().screen, run.screen === 'battle' ? 'map' : run.screen);
  assert.equal(game.getRun().gold, run.gold);
  assert.equal(game.getRun().deck.length, run.deck.length);
  assert.equal(game.hasCheckpoint(), true);
  assert.equal(game.resume(), true);
});

test('an event and a reward are still there, and still work, after a save', function () {
  newSeededGame(2);
  var run = game.getRun();
  run.pendingNode = { type: 'event', depth: 0, col: 0, next: [0] };
  game.rollEvent(); game.show('event');
  game.start(JSON.parse(JSON.stringify(game.snapshot().run)));
  assert.equal(game.getRun().screen, 'event');
  assert.equal(typeof game.getRun().event.options[0].run, 'function', 'the event\'s options were relinked');
  game.chooseEventOption(0);                                     // would throw if they were not

  newSeededGame(2);
  game.getRun().pendingNode = { type: 'battle', depth: 0, col: 0, next: [0] };
  game.rollReward({ type: 'battle', depth: 0 }); game.show('reward');
  var cards = game.getRun().reward.cards.length;
  game.start(JSON.parse(JSON.stringify(game.snapshot().run)));
  assert.equal(game.getRun().screen, 'reward');
  assert.equal(game.getRun().reward.cards.length, cards);
  game.takeRewardCard(0);
  assert.equal(game.getRun().screen, 'map');
});

test('a save that does not make sense is refused rather than half-loaded', function () {
  assert.equal(game.restoreRun(null), null);
  assert.equal(game.restoreRun({}), null);
  assert.equal(game.restoreRun({ act: 'green', map: [[{}]], deck: [{ id: 'ghost_card' }], minted: [] }), null);
  assert.equal(game.restoreRun({ act: 'no_such_act', map: [[{}]], deck: [] }), null);
  // and starting from one falls back to a fresh run instead of a blank screen
  game.start({ act: 'no_such_act' });
  assert.equal(game.getRun().screen, 'map');
});

test('golden runs: the numbers only move when the game does', function () {
  var actual = { short: {}, long: {} };
  SEEDS.forEach(function (seed) { actual.short[seed] = playRun(seed).summary; });
  LONG_SEEDS.forEach(function (seed) { actual.long[seed] = playRun(seed, LONG).summary; });
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(GOLDEN)) {
    fs.writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + '\n');
    return;
  }
  assert.deepEqual(actual, JSON.parse(fs.readFileSync(GOLDEN, 'utf8')),
    'runs changed — if that was the point, regenerate with UPDATE_GOLDEN=1 npm test and review the diff');
});
