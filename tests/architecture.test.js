/* The folder boundaries, enforced.

     game/     imports nothing outside itself and touches no browser API, so it can
               be tested by playing it — see game-runs.test.js
     session/  imports nothing from src/
     view/     imports game/ (through game/index.js) but never session/
     main.js   the only place all three meet

   The import graph comes from esbuild's own metafile, so this is checking what
   actually gets bundled rather than what a regex thinks it sees. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

var SRC = 'src/';
var result = await build({
  entryPoints: ['src/main.js'], bundle: true, write: false, metafile: true, format: 'esm',
  splitting: true, outdir: 'out', logLevel: 'silent'
});
var inputs = result.metafile.inputs;
var files = Object.keys(inputs).filter(function (file) { return file.indexOf(SRC) === 0; });
function layer(file) { return file.slice(SRC.length).split('/')[0]; }

test('game/ imports nothing outside game/', function () {
  var breaches = [];
  files.filter(function (file) { return layer(file) === 'game'; }).forEach(function (file) {
    inputs[file].imports.forEach(function (edge) {
      if (edge.path.indexOf(SRC) === 0 && layer(edge.path) !== 'game') breaches.push(file + ' -> ' + edge.path);
    });
  });
  assert.deepEqual(breaches, []);
});

test('session/ imports nothing from src/', function () {
  var breaches = [];
  files.filter(function (file) { return layer(file) === 'session'; }).forEach(function (file) {
    inputs[file].imports.forEach(function (edge) {
      if (edge.path.indexOf(SRC) === 0 && layer(edge.path) !== 'session') breaches.push(file + ' -> ' + edge.path);
    });
  });
  assert.deepEqual(breaches, []);
});

test('view/ reaches the game only through game/index.js, and never the session', function () {
  var breaches = [];
  files.filter(function (file) { return layer(file) === 'view'; }).forEach(function (file) {
    if (file === 'src/view/test-context.js') return;              // the test suite's own wiring
    inputs[file].imports.forEach(function (edge) {
      if (edge.path.indexOf(SRC) !== 0) return;
      if (layer(edge.path) === 'session') breaches.push(file + ' -> ' + edge.path);
      if (layer(edge.path) === 'game' && edge.path !== 'src/game/index.js') breaches.push(file + ' -> ' + edge.path);
    });
  });
  assert.deepEqual(breaches, []);
});

test('game/ never touches the page, timers or storage', function () {
  var forbidden = /\b(window|document|localStorage|sessionStorage|requestAnimationFrame|setTimeout|setInterval|navigator|location|alert)\b/;
  var found = [];
  files.filter(function (file) { return layer(file) === 'game'; }).forEach(function (file) {
    var code = fs.readFileSync(path.resolve(file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
      .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
    var match = forbidden.exec(code);
    if (match) found.push(file + ': ' + match[0]);
  });
  assert.deepEqual(found, []);
});
