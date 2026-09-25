/* One worker of the balance simulation: plays its share of seeded runs.
   Each worker is its own process-like isolate, so the game's single global state
   never leaks between runs or between workers. */

import { parentPort, workerData } from 'node:worker_threads';
import { SKILLS, simulateRun } from '../tests/support/bots.js';

var results = [];
workerData.seeds.forEach(function (seed) {
  var run = simulateRun(seed, SKILLS[workerData.skill], { lives: workerData.lives });
  // decks are only needed to see which cards were on the table; keep them, drop nothing else
  results.push(run);
});
parentPort.postMessage(results);
