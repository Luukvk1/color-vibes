/* Volatile Fusion cascades and terminates */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, notes, left;

  // --- Volatile Fusion cascades and terminates ---
      battleState = fresh(['volatile_fusion']);
      put(battleState, 'bottom', 'row1', 0, 'red_brute', 2); put(battleState, 'bottom', 'row2', 0, 'blue_scout', 2);
      put(battleState, 'bottom', 'row1', 2, 'red_brute', 2); put(battleState, 'bottom', 'row2', 1, 'green_seed', 2);
      put(battleState, 'bottom', 'row1', 3, 'red_brute', 2); put(battleState, 'bottom', 'row2', 2, 'blue_scout', 2);
      var notes = [];
      RUN.doMixCascade(battleState, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false, notes);
      var left = 0; eachUnit(battleState.board, 'bottom', function () { left++; });
      check('Volatile Fusion cascades without looping forever', function () { return (battleState.chains.bottom >= 1 && left >= 1 && left <= 6); },
        function () { return ('chain ' + battleState.chains.bottom + ', ' + left + ' units left'); });
}
