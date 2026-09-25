/* Balance report: play many seeded runs with bots and say how the game plays.

     npm run balance                       a report for the current code
     npm run balance -- --save             ...and keep it as the baseline
     npm run balance -- --compare          ...and show what moved since the baseline
     npm run balance -- --runs 400 --skills careful

   Two kinds of sample per skill level. "standard" is the game as played — three
   lives — and says how far a player gets. "deep" gives the bot many lives so it
   keeps meeting late enemies, which is where per-enemy and per-card numbers come
   from. Same seeds every time, so a report only changes when the game does; but a
   change that alters what happens in a run changes every run after it, so read
   differences as a statistical signal, not a diff (--compare does that). */

import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';

var args = process.argv.slice(2);
function option(name, fallback) {
  var at = args.indexOf('--' + name);
  return at === -1 ? fallback : (args[at + 1] && args[at + 1].indexOf('--') !== 0 ? args[at + 1] : true);
}
var RUNS = +option('runs', 120);
var SKILL_NAMES = String(option('skills', 'careful,naive')).split(',');
var DEEP_LIVES = 40;
var BASELINE = new URL('./balance-baseline.json', import.meta.url);
var SAVE = option('save', false), COMPARE = option('compare', false);
var WORKERS = Math.max(1, Math.min(os.cpus().length - 1, 8));

/* ------------------------------------------------------------------ running */

function playAll(skill, lives, runs, firstSeed) {
  var seeds = [];
  for (var i = 0; i < runs; i++) seeds.push(firstSeed + i);
  var groups = [];
  for (var w = 0; w < WORKERS; w++) groups.push(seeds.filter(function (seed, index) { return index % WORKERS === w; }));
  return Promise.all(groups.filter(function (group) { return group.length; }).map(function (group) {
    return new Promise(function (resolve, reject) {
      var worker = new Worker(new URL('./balance-worker.js', import.meta.url), { workerData: { seeds: group, skill: skill, lives: lives } });
      worker.on('message', resolve); worker.on('error', reject);
    });
  })).then(function (parts) { return [].concat.apply([], parts); });
}

/* ------------------------------------------------------------------ metrics */

/* A metric is { kind: 'rate' | 'mean', value, n, sd }. */
function rate(successes, n) { return { kind: 'rate', value: n ? successes / n : 0, n: n }; }
function mean(values) {
  var n = values.length, m = n ? values.reduce(function (a, b) { return a + b; }, 0) / n : 0;
  var variance = n > 1 ? values.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (n - 1) : 0;
  return { kind: 'mean', value: m, n: n, sd: Math.sqrt(variance) };
}

function measure(runs) {
  var metrics = {}, battles = [];
  runs.forEach(function (run) { battles = battles.concat(run.battles); });
  metrics['runs.actsCleared'] = mean(runs.map(function (run) { return run.actsCleared; }));
  metrics['runs.battlesWon'] = mean(runs.map(function (run) { return run.battlesWon; }));
  metrics['runs.gold'] = mean(runs.map(function (run) { return run.gold; }));
  metrics['runs.deckSize'] = mean(runs.map(function (run) { return run.deck; }));
  metrics['runs.relics'] = mean(runs.map(function (run) { return run.relics; }));
  metrics['runs.curses'] = mean(runs.map(function (run) { return run.curses; }));
  [1, 2, 3].forEach(function (acts) {
    metrics['runs.clearedAtLeast' + acts + 'Acts'] = rate(runs.filter(function (run) { return run.actsCleared >= acts; }).length, runs.length);
  });
  metrics['battles.win'] = rate(battles.filter(function (b) { return b.won; }).length, battles.length);
  metrics['battles.rounds'] = mean(battles.map(function (b) { return b.rounds; }));
  metrics['battles.rewindsPerBattle'] = mean(battles.map(function (b) { return b.rewinds; }));

  var byEnemy = {}, byPower = {}, cards = {}, relics = {};
  battles.forEach(function (b) {
    (byEnemy[b.enemy] = byEnemy[b.enemy] || []).push(b);
    var bucket = 'p' + String(Math.min(5, Math.floor(b.power / 13))) ;
    (byPower[bucket] = byPower[bucket] || []).push(b);
    var seen = {};
    b.deck.forEach(function (id) { var key = /^(lifted|fusion)_/.test(id) ? '(minted)' : id; if (!seen[key]) { seen[key] = 1; (cards[key] = cards[key] || []).push(b.won); } });
    b.relics.forEach(function (key) { (relics[key] = relics[key] || []).push(b.won); });
  });
  Object.keys(byEnemy).forEach(function (key) {
    metrics['enemy.' + key + '.win'] = rate(byEnemy[key].filter(function (b) { return b.won; }).length, byEnemy[key].length);
    metrics['enemy.' + key + '.rounds'] = mean(byEnemy[key].map(function (b) { return b.rounds; }));
  });
  Object.keys(byPower).forEach(function (key) {
    metrics['power.' + key + '.win'] = rate(byPower[key].filter(function (b) { return b.won; }).length, byPower[key].length);
  });
  Object.keys(cards).forEach(function (key) {
    if (cards[key].length >= 40) metrics['card.' + key + '.win'] = rate(cards[key].filter(Boolean).length, cards[key].length);
  });
  Object.keys(relics).forEach(function (key) {
    if (relics[key].length >= 40) metrics['relic.' + key + '.win'] = rate(relics[key].filter(Boolean).length, relics[key].length);
  });
  var deaths = {};
  runs.forEach(function (run) { if (run.diedTo) deaths[run.diedTo] = (deaths[run.diedTo] || 0) + 1; });
  return { metrics: metrics, deaths: deaths, enemyKinds: enemyKinds(battles) };
}
function enemyKinds(battles) {
  var kinds = {};
  battles.forEach(function (b) { kinds[b.enemy] = b.kind; });
  return kinds;
}

/* ------------------------------------------------------------------ reporting */

function pct(x) { return (x * 100).toFixed(1).padStart(5) + '%'; }
function num(x) { return x.toFixed(2).padStart(6); }
function show(metric) { return metric.kind === 'rate' ? pct(metric.value) : num(metric.value); }

function report(name, sample) {
  var m = sample.metrics;
  console.log('\n' + '='.repeat(72) + '\n' + name + '\n' + '='.repeat(72));
  console.log('acts cleared per run      ' + show(m['runs.actsCleared']) + '   (>=1: ' + pct(m['runs.clearedAtLeast1Acts'].value) + ', >=2: ' + pct(m['runs.clearedAtLeast2Acts'].value) + ', >=3: ' + pct(m['runs.clearedAtLeast3Acts'].value) + ')');
  console.log('battles won per run       ' + show(m['runs.battlesWon']) + '   battle win rate ' + pct(m['battles.win'].value) + ' over ' + m['battles.win'].n + ' battles');
  console.log('end of run                gold ' + show(m['runs.gold']) + '  deck ' + show(m['runs.deckSize']) + '  relics ' + show(m['runs.relics']) + '  curses ' + show(m['runs.curses']));
  console.log('rounds per battle         ' + show(m['battles.rounds']) + '   rewinds per battle ' + show(m['battles.rewindsPerBattle']));
  var deathList = Object.keys(sample.deaths).sort(function (a, b) { return sample.deaths[b] - sample.deaths[a]; }).slice(0, 6);
  if (deathList.length) console.log('killed by                 ' + deathList.map(function (k) { return k + ' ' + sample.deaths[k]; }).join(', '));

  console.log('\nby enemy                     fights   win   rounds');
  var order = { boss: 0, elite: 1, normal: 2 };
  Object.keys(sample.enemyKinds).sort(function (a, b) {
    return (order[sample.enemyKinds[a]] - order[sample.enemyKinds[b]]) || a.localeCompare(b);
  }).forEach(function (key) {
    var win = m['enemy.' + key + '.win'];
    console.log('  ' + (key + ' (' + sample.enemyKinds[key] + ')').padEnd(28) + String(win.n).padStart(5) + '  ' + pct(win.value) + '  ' + num(m['enemy.' + key + '.rounds'].value));
  });
  console.log('\nby run progress (power)      win');
  Object.keys(m).filter(function (k) { return /^power\./.test(k); }).sort().forEach(function (k) {
    console.log('  ' + k.replace('.win', '').padEnd(27) + pct(m[k].value) + '  n=' + m[k].n);
  });
  ['card', 'relic'].forEach(function (kind) {
    var keys = Object.keys(m).filter(function (k) { return k.indexOf(kind + '.') === 0; });
    if (!keys.length) return;
    var overall = m['battles.win'].value;
    keys.sort(function (a, b) { return m[b].value - m[a].value; });
    var line = function (k) { return k.split('.')[1] + ' ' + pct(m[k].value) + ' (n=' + m[k].n + ')'; };
    console.log('\n' + kind + 's in the deck, win rate vs ' + pct(overall).trim() + ' overall (biased: strong runs hold more of everything)');
    console.log('  highest: ' + keys.slice(0, 5).map(line).join('; '));
    console.log('  lowest:  ' + keys.slice(-5).map(line).join('; '));
  });
}

/* Two samples differ if the gap is both real (a z / Welch test) and big enough to matter. */
function significant(a, b) {
  if (a.kind === 'rate') {
    var pooled = (a.value * a.n + b.value * b.n) / (a.n + b.n);
    var se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
    return se > 0 && Math.abs(a.value - b.value) >= 0.04 && Math.abs(a.value - b.value) / se > 2.5;
  }
  var se2 = Math.sqrt(a.sd * a.sd / a.n + b.sd * b.sd / b.n);
  return se2 > 0 && Math.abs(a.value - b.value) / se2 > 3 && Math.abs(a.value - b.value) > 0.03 * Math.max(1, Math.abs(b.value));
}
function compare(name, now, before) {
  var moved = [];
  Object.keys(now.metrics).forEach(function (key) {
    var was = before.metrics[key];
    if (!was || was.n < 20 || now.metrics[key].n < 20) return;
    if (significant(now.metrics[key], was)) moved.push({ key: key, was: was, now: now.metrics[key] });
  });
  console.log('\n' + '-'.repeat(72) + '\nchanged since the baseline: ' + name + '\n' + '-'.repeat(72));
  if (!moved.length) { console.log('  nothing that stands out from noise'); return; }
  moved.sort(function (a, b) { return a.key.localeCompare(b.key); }).forEach(function (row) {
    var d = row.now.value - row.was.value;
    console.log('  ' + row.key.padEnd(44) + show(row.was) + ' -> ' + show(row.now) + '  (' + (d > 0 ? '+' : '') + (row.now.kind === 'rate' ? (d * 100).toFixed(1) + ' pts' : d.toFixed(2)) + ')');
  });
}

/* ------------------------------------------------------------------ main */

var started = Date.now(), results = {};
for (var skill of SKILL_NAMES) {
  var standard = await playAll(skill, undefined, RUNS, 1000);
  var deep = await playAll(skill, DEEP_LIVES, Math.max(20, Math.round(RUNS / 3)), 5000);
  results[skill + '/standard'] = measure(standard);
  results[skill + '/deep'] = measure(deep);
}
Object.keys(results).forEach(function (name) { report(name + (/standard/.test(name) ? '  (three lives: how far a player gets)' : '  (' + DEEP_LIVES + ' lives: many late fights)'), results[name]); });

if (COMPARE) {
  if (!fs.existsSync(BASELINE)) console.log('\nno baseline yet — run with --save first');
  else {
    var before = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    Object.keys(results).forEach(function (name) { if (before[name]) compare(name, results[name], before[name]); });
  }
}
if (SAVE) { fs.writeFileSync(BASELINE, JSON.stringify(results)); console.log('\nbaseline saved to tools/balance-baseline.json'); }
console.log('\n' + ((Date.now() - started) / 1000).toFixed(0) + 's, ' + WORKERS + ' workers');
