/* boss rules (each act boss must play differently, not just harder) */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var left, ev;

  // --- boss rules (each act boss must play differently, not just harder) ---
      check('Exposure taxes the colour you leaned on, and spares an even board', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 4);
        put(battleState2, 'bottom', 'row1', 1, 'red_brute', 4);
        put(battleState2, 'bottom', 'row2', 0, 'red_brute', 4);      // three Red, clearly dominant
        var taxed = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { taxDominantColor: 2 } });
        var plain = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: {} });
        if (plain.raw.bottom - taxed.raw.bottom !== 6) return false;   // 2 per Red unit

        var even = fresh();
        put(even, 'bottom', 'row1', 0, 'red_brute', 4);
        put(even, 'bottom', 'row1', 1, 'blue_scout', 4);   // 1-1: no dominant colour
        var e1 = C.evaluateBoard(even.board, even.hazards, { enemyMod: { taxDominantColor: 2 } });
        var e0 = C.evaluateBoard(even.board, even.hazards, { enemyMod: {} });
        return e1.raw.bottom === e0.raw.bottom;
      })()); });
      check('The Scorched Line halves support but leaves the frontline whole', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 6);      // frontline
        put(battleState2, 'bottom', 'row3', 0, 'red_brute', 8);      // support behind it
        var pen = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { supportPenalty: 0.5 } });
        var full = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: {} });
        var lanePenalized = pen.lanes.filter(function (lane) { return lane.bottom; })[0];
        var laneFull = full.lanes.filter(function (lane) { return lane.bottom; })[0];
        return lanePenalized.bottom.frontStrength === laneFull.bottom.frontStrength &&
               lanePenalized.bottom.support < laneFull.bottom.support &&
               pen.totals.bottom < full.totals.bottom;
      })()); });
      check('The Undertow answers only the lane you invested in most', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 10);     // the monster lane
        put(battleState2, 'bottom', 'row1', 2, 'red_brute', 2);
        put(battleState2, 'top', 'row1', 0, 'blue_scout', 1);
        put(battleState2, 'top', 'row1', 2, 'blue_scout', 1);
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { echoBestLane: 0.5 } });
        var echoed = ev.lanes.filter(function (l) { return l.top && l.top.echoed; });
        if (echoed.length !== 1) return false;
        var base = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: {} });
        return ev.totals.top > base.totals.top;
      })()); });
      check('Still Water cancels the matchup bonus in its weakest lanes only', function () { return ((function () {
        var battleState2 = fresh();
        // player is effective in every lane; enemy is weak in two of them
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 5);
        put(battleState2, 'bottom', 'row1', 1, 'red_brute', 5);
        put(battleState2, 'bottom', 'row1', 2, 'red_brute', 5);
        put(battleState2, 'top', 'row1', 0, 'green_seed', 1);
        put(battleState2, 'top', 'row1', 1, 'green_seed', 1);
        put(battleState2, 'top', 'row1', 2, 'green_seed', 9);
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { wardWeakLanes: 2 } });
        var warded = ev.lanes.filter(function (l) { return l.bottom && l.bottom.warded; });
        var free = ev.lanes.filter(function (l) { return l.bottom && !l.bottom.warded && l.bottom.effective; });
        if (warded.length !== 2) return false;
        // the lane it is strongest in is the one left exploitable
        return free.length >= 1 && free.every(function (l) { return l.bottom.multiplier === 2; }) &&
               warded.every(function (l) { return l.bottom.multiplier === 1; });
      })()); });
      check('Every act boss carries a rule of its own, and no two share one', function () { return ((function () {
        var RULES = ['growth', 'supportPenalty', 'echoBestLane', 'taxDominantColor',
                     'echoMix', 'wardWeakLanes', 'devourWeakest'];
        var seen = {};
        return RUN.ACT_KEYS.every(function (key) {
          var mod = ENEMIES[RUN.ACTS[key].boss].mod || {};
          var mine = RULES.filter(function (rule) { return mod[rule]; });
          if (mine.length !== 1) return false;           // exactly one signature rule
          if (seen[mine[0]]) return false;               // and nobody else's
          seen[mine[0]] = 1;
          return true;
        });
      })()); });
      check('A boss leans on its rule, not on raw colour bonus', function () { return ((function () {
        return RUN.ACT_KEYS.every(function (key) {
          var a = RUN.ACTS[key], mod = ENEMIES[a.boss].mod || {};
          var colorBonus = (mod.colorBonus && mod.colorBonus[a.color]) || 0;
          // elites are the +2 stat check; bosses must not simply be +3 versions
          return colorBonus <= 1;
        });
      })()); });
}
