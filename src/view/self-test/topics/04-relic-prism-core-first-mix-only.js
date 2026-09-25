/* relic: Prism Core, first mix only */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, first, second;

  // --- relic: Prism Core, first mix only ---
      battleState = fresh(['prism_core']);
      put(battleState, 'bottom', 'row1', 0, 'red_brute', 3); put(battleState, 'bottom', 'row2', 0, 'blue_scout', 4);
      put(battleState, 'bottom', 'row1', 2, 'red_brute', 3); put(battleState, 'bottom', 'row2', 2, 'blue_scout', 4);
      var first = RUN.applyMix(battleState, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
      var second = RUN.applyMix(battleState, 'bottom', { row: 'row1', index: 2 }, { row: 'row2', index: 2 }, 0, false);
      check('Prism Core boosts only the first mix of the round',
        function () { return (first.strength === 10 && second.strength === 8); }, function () { return (first.strength + ' then ' + second.strength); });
}
