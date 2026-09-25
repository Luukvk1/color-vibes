/* relic: Double Rainbow */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, first;

  // --- relic: Double Rainbow ---
      battleState = fresh(['double_rainbow']);
      put(battleState, 'bottom', 'row1', 0, 'red_brute', 3); put(battleState, 'bottom', 'row2', 0, 'blue_scout', 4);
      RUN.applyMix(battleState, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, true);
      check('Double Rainbow makes the first Free Mix worth 3 links', function () { return (battleState.chains.bottom === 3); }, function () { return ('chain ' + battleState.chains.bottom); });
}
