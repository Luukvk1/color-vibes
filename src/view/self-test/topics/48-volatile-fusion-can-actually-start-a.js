/* Volatile Fusion can actually start a chain */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var vg;

  // --- Volatile Fusion can actually start a chain ---
      var vg = fresh(['volatile_fusion']);
      put(vg, 'bottom', 'row1', 0, 'red_brute', 2); put(vg, 'bottom', 'row2', 0, 'blue_scout', 2);
      put(vg, 'bottom', 'row1', 2, 'red_brute', 2); put(vg, 'bottom', 'row2', 1, 'green_seed', 2);
      RUN.doMixCascade(vg, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false, []);
      check('Volatile Fusion pushes the chain past 1', function () { return (vg.chains.bottom >= 2); }, function () { return ('chain ' + vg.chains.bottom); });
}
