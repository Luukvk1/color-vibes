/* enemy modifiers */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, ev;

  // --- enemy modifiers ---
      battleState = fresh();
      put(battleState, 'top', 'row1', 0, 'black_voidling', 2, 'black');
      ev = C.evaluateBoard(battleState.board, battleState.hazards, { enemyMod: { colorBonus: { black: 1 } } });
      check('Colour bonus modifiers apply to the enemy', function () { return (ev.strengthOf(ev.get('top', 'row1', 0)) === 3); });
      battleState = fresh();
      put(battleState, 'bottom', 'row1', 0, 'cyan_cleanser', 4); put(battleState, 'top', 'row1', 0, 'red_brute', 2);
      ev = C.evaluateBoard(battleState.board, battleState.hazards, { enemyMod: { punishEffective: 2 } });
      check('Chromatic Knight punishes your effective lanes', function () { return (ev.lanes[0].top.frontStrength === 4); },
        function () { return ('enemy front ' + ev.lanes[0].top.frontStrength); });
      check('The Knight bonus does not compound across lanes', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);   // effective in lane 2
        put(battleState2, 'bottom', 'row1', 2, 'cyan_cleanser', 4);   // effective in lane 3
        put(battleState2, 'top', 'row2', 1, 'red_brute', 6);          // one unit fronting both lanes
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { punishEffective: 2 } });
        // each lane gets +2 once, and the unit itself is untouched
        return e2.lanes[1].top.frontStrength === 5 && e2.lanes[2].top.frontStrength === 5 && e2.raw.top === 6;
      })()); });
      check('The Knight bonus does not leak into non-effective lanes', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);   // Cyan beats Red — effective
        put(battleState2, 'bottom', 'row1', 2, 'green_gardener', 4);  // Green does not
        put(battleState2, 'top', 'row2', 1, 'red_brute', 6);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { punishEffective: 2 } });
        return e2.lanes[1].bottom.effective === true && e2.lanes[2].bottom.effective === false &&
               e2.lanes[1].top.frontStrength === 5 && e2.lanes[2].top.frontStrength === 3;
      })()); });
      check('The Knight gains nothing while you are not effective', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'green_gardener', 4);
        put(battleState2, 'top', 'row1', 1, 'red_brute', 3);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { punishEffective: 2 } });
        return e2.lanes[1].top.frontStrength === 3;
      })()); });
      battleState = fresh();
      put(battleState, 'top', 'row1', 0, 'red_brute', 2, 'red');
      ev = C.evaluateBoard(battleState.board, battleState.hazards, { enemyMod: { rotatingColor: 2 }, spectrumColor: 'red' });
      check('The Spectrum boosts its chosen colour', function () { return (ev.strengthOf(ev.get('top', 'row1', 0)) === 4); });
}
