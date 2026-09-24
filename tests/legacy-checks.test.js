/* The in-browser self-test suite, run headless.

   The suite (src/view/self-test.js) was written to run in a page, but nearly all
   of its checks are about the rules and the engine. Run here, every check that
   needs no page has to pass; the few that read layout or the DOM cannot, and are
   reported as skipped — they still run in the browser (menu > Self test, or
   `await ColorVibes.selfTest()` in the console). */

import './support/browser-stub.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/game/index.js';
import { createSelfTest } from '../src/view/self-test.js';
import { buildTestContext, isolated } from '../src/view/test-context.js';

/* What a check throws when it went looking for a page that is not there. */
var NEEDS_A_PAGE = /document is not defined|reading '(g|textContent|querySelectorAll|querySelector|hidden|classList|innerHTML|style|dataset|addEventListener|getAttribute|click)'|setting '(innerHTML|textContent|hidden|onclick)'/;

game.start(null);
var results = isolated(createSelfTest(buildTestContext()));

test('the self-test suite, headless (' + results.length + ' checks)', async function (t) {
  var browserOnly = 0;
  for (var result of results) {
    var skip = !result.pass && result.threw && NEEDS_A_PAGE.test(result.threw);
    if (skip) browserOnly++;
    await t.test(result.name, { skip: skip ? 'needs a browser' : false }, function () {
      assert.ok(result.pass, result.detail || 'failed');
    });
  }
  t.diagnostic(results.length - browserOnly + ' ran headless, ' + browserOnly + ' need a browser');
});
