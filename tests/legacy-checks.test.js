/* The self-test suite, run headless — one group per topic.

   The suite (src/view/self-test/) was written to run in a page, but nearly all of
   its checks are about the rules and the engine. Run here, every check that needs
   no page has to pass; the few that read layout or the DOM cannot, and are
   reported as skipped — they still run in the browser (menu > Self test, or
   `await ColorVibes.selfTest()` in the console).

   Each topic starts from a fresh game, so a topic that quietly leans on what an
   earlier one left behind fails here instead of passing by accident. */

import './support/browser-stub.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/game/index.js';
import { TOPICS, createSelfTest } from '../src/view/self-test/index.js';
import { buildTestContext, isolated } from '../src/view/test-context.js';

/* What a check throws when it went looking for a page that is not there. */
var NEEDS_A_PAGE = /document is not defined|reading '(g|textContent|querySelectorAll|querySelector|hidden|classList|innerHTML|style|dataset|addEventListener|getAttribute|click)'|setting '(innerHTML|textContent|hidden|onclick)'/;

var suite = createSelfTest(buildTestContext());

for (var topic of TOPICS) {
  await (function (topic) {
    return test(topic.title, async function (t) {
      game.setRnd(Math.random);
      game.setTutorial(true);
      game.start(null);
      var results = isolated(function () { return suite(topic.name); });
      for (var result of results) {
        var skip = !result.pass && result.threw && NEEDS_A_PAGE.test(result.threw);
        await t.test(result.name, { skip: skip ? 'needs a browser' : false }, function () {
          assert.ok(result.pass, result.detail || 'failed');
        });
      }
    });
  })(topic);
}
