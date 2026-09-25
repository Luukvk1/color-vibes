/* Wide sanity bands on how the game plays, so a change that breaks balance
   outright fails here instead of being noticed three playtests later.

   These are deliberately loose: ordinary tuning should never trip them. For the
   real picture — per enemy, per card, what moved since last time — use
     npm run balance -- --compare
   The runs are seeded, so a failure here is a real change in the game, not luck. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, simulateRun } from './support/bots.js';

var SEEDS = [];
for (var seed = 300; seed < 324; seed++) SEEDS.push(seed);

function sample(skill) {
  var runs = SEEDS.map(function (s) { return simulateRun(s, SKILLS[skill]); });
  var battles = [].concat.apply([], runs.map(function (run) { return run.battles; }));
  return {
    runs: runs,
    battlesWonPerRun: runs.reduce(function (sum, run) { return sum + run.battlesWon; }, 0) / runs.length,
    winRate: battles.filter(function (b) { return b.won; }).length / battles.length,
    actsCleared: runs.map(function (run) { return run.actsCleared; })
  };
}

var careful = sample('careful'), naive = sample('naive');

test('every simulated run reaches an ending', function () {
  careful.runs.concat(naive.runs).forEach(function (run) { assert.ok(run.ended === 'gameover', 'seed ' + run.seed + ' ended on ' + run.ended); });
});

test('skill matters: a player who builds a deck goes further than one who does not', function () {
  assert.ok(careful.battlesWonPerRun > naive.battlesWonPerRun * 1.3,
    'careful won ' + careful.battlesWonPerRun.toFixed(1) + ' battles a run, naive ' + naive.battlesWonPerRun.toFixed(1));
});

test('a careful player wins most ordinary fights but is not untouchable', function () {
  assert.ok(careful.winRate > 0.4 && careful.winRate < 0.92, 'win rate ' + (careful.winRate * 100).toFixed(0) + '%');
});

test('the opening is winnable and the game is not a walkover', function () {
  var opening = [].concat.apply([], careful.runs.map(function (run) { return run.battles.slice(0, 2); }));
  var openingWin = opening.filter(function (b) { return b.won; }).length / opening.length;
  assert.ok(openingWin > 0.5, 'the first two fights were won only ' + (openingWin * 100).toFixed(0) + '% of the time');
  assert.ok(careful.actsCleared.filter(function (n) { return n >= 3; }).length < SEEDS.length * 0.5, 'half of all careful runs clear three acts');
});

test('a run can get past the first act', function () {
  assert.ok(careful.actsCleared.filter(function (n) { return n >= 1; }).length >= SEEDS.length * 0.15);
});
