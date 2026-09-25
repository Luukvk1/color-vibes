/* relic: Chromatic Memory */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState;

  // --- relic: Chromatic Memory ---
      battleState = fresh(['chromatic_memory']);
      put(battleState, 'bottom', 'row1', 0, 'red_brute', 8);
      RUN.buildApi(battleState, 'bottom', []).recolor('bottom', { row: 'row1', index: 0 }, 'cyan');
      check('Chromatic Memory pays a quarter on a repaint', function () { return (battleState.board.bottom.row1[0].temp === 2); }, function () { return ('temp ' + battleState.board.bottom.row1[0].temp); });
}
