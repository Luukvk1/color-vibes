/* the victory screen: conquering every road, and going endless */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var second, map, reach, ok;

  // --- the victory screen: conquering every road, and going endless ---
      check('Beating the last unconquered act shows the victory screen, not gameover', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.actsCleared = RUN.ACT_KEYS.slice(0, RUN.ACT_KEYS.length - 1);
        var lastAct = RUN.ACT_KEYS[RUN.ACT_KEYS.length - 1];
        run.act = lastAct; run.deck = RUN.startingDeck();
        ['yellow_spark', 'yellow_banner', 'cyan_shield', 'magenta_spark', 'magenta_chain']
          .forEach(function (id) { run.deck.push({ id: id, up: false }); });
        var wasConquered = RUN.allActsConquered(run);
        RUN.finishAct();
        var after = RUN.getRun();
        var ok = !wasConquered && after.screen === 'victory' && RUN.allActsConquered(after);
        RUN.setRun(saved);
        return ok;
      })()); });
      check('A narrow completion — not every act was ever reachable — still ends at gameover', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        // only the three primaries were ever unlocked; nothing built a secondary
        run.actsCleared = C.PRIMARY_COLORS.slice(0, 2);
        run.act = C.PRIMARY_COLORS[2];
        run.deck = RUN.startingDeck();
        RUN.finishAct();
        var after = RUN.getRun();
        var ok = after.screen === 'gameover' && !RUN.allActsConquered(after);
        RUN.setRun(saved);
        return ok;
      })()); });
      check('"End the run here" stops the run and marks it a true conquest', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        RUN.ACT_KEYS.forEach(function (key) { run.actsCleared.push(key); });
        RUN.endAsVictory();
        var after = RUN.getRun();
        var ok = after.screen === 'gameover' && !after.endless && RUN.allActsConquered(after);
        RUN.setRun(saved);
        return ok;
      })()); });
      check('"Go endless" reopens every road, including ones already cleared', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck();
        RUN.ACT_KEYS.forEach(function (key) { run.actsCleared.push(key); });
        var beforeCount = RUN.eligibleActs(run).length;    // zero: everything is "behind" it
        RUN.goEndless();
        var after = RUN.getRun();
        var afterCount = RUN.eligibleActs(after).length;
        RUN.setRun(saved);
        // primaries plus every secondary this deck can still reach — never zero again
        return beforeCount === 0 && after.endless === true && after.screen === 'act' && afterCount > 0;
      })()); });
      check('Clearing a second act in endless mode never re-shows the victory screen', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck();
        RUN.ACT_KEYS.forEach(function (key) { run.actsCleared.push(key); });
        RUN.goEndless();
        var open = RUN.getRun().actOffer;
        RUN.beginAct(open[0]);
        run = RUN.getRun();
        run.map = RUN.buildMap(open[0], false);
        run.depth = run.map.length - 1;
        RUN.finishAct();
        var after = RUN.getRun();
        var ok = after.screen !== 'victory' && (after.screen === 'act' || after.screen === 'map');
        RUN.setRun(saved);
        return ok;
      })()); });
      check('Endless power keeps climbing loop after loop', function () { return ((function () {
        var run = { actsCleared: [] };
        RUN.ACT_KEYS.forEach(function (key) { run.actsCleared.push(key); });   // one full lap
        var afterLap1 = RUN.powerAt(run, 0);
        run.actsCleared.push(RUN.ACT_KEYS[0]);                              // one more clear, endless
        var afterLap2 = RUN.powerAt(run, 0);
        return afterLap2 > afterLap1;
      })()); });
      check('No literal escape sequences leak into victory or gameover text', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.actsCleared = RUN.ACT_KEYS.slice(0, RUN.ACT_KEYS.length - 1);
        run.act = RUN.ACT_KEYS[RUN.ACT_KEYS.length - 1];
        run.deck = RUN.startingDeck();
        ['yellow_spark', 'yellow_banner', 'cyan_shield', 'magenta_spark', 'magenta_chain']
          .forEach(function (id) { run.deck.push({ id: id, up: false }); });
        RUN.finishAct();
        /* A double-escaped \\u2014 in source becomes the six literal characters
           "\u2014" on screen instead of an em dash. This is exactly the class of
           bug a DOM check catches and eyeballing a screenshot almost missed. */
        var victoryText = els.victoryBody.textContent;
        RUN.endAsVictory();
        var gameoverText = els.gameoverBody.textContent;
        RUN.setRun(saved);
        return victoryText.indexOf('\\u') === -1 && gameoverText.indexOf('\\u') === -1;
      })()); });
}
