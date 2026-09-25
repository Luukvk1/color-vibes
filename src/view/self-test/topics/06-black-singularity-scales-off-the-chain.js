/* Black Singularity scales off the chain */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, res;

  // --- Black Singularity scales off the chain ---
      battleState = fresh();
      battleState.chains.bottom = 2;                       // two links already built this turn
      put(battleState, 'bottom', 'row1', 0, 'red_brute', 3); put(battleState, 'bottom', 'row2', 0, 'black_singularity', 6);
      res = RUN.applyMix(battleState, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, true);
      check('Black Singularity adds 2 per earlier link', function () { return (res.strength === 3 + 6 + 2 + (2 * 2)); }, function () { return ('got ' + res.strength); });
}
