/* mixing baseline */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, res;

  // --- mixing baseline ---
      var battleState = fresh();
      put(battleState, 'bottom', 'row1', 0, 'red_brute', 3); put(battleState, 'bottom', 'row2', 0, 'blue_scout', 4);
      var res = RUN.applyMix(battleState, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
      check('Plain mix is A + B + 1', function () { return (res.color === 'magenta' && res.strength === 8); }, function () { return (res.color + ' ' + res.strength); });
      check('A normal mix opens the chain at 1', function () { return (battleState.chains.bottom === 1); }, function () { return ('chain ' + battleState.chains.bottom); });
}
