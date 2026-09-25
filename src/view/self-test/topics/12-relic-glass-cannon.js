/* relic: Glass Cannon */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, ev;

  // --- relic: Glass Cannon ---
      battleState = fresh(['glass_cannon']);
      put(battleState, 'bottom', 'row1', 0, 'red_brute', 2);
      ev = C.evaluateBoard(battleState.board, battleState.hazards, { relics: ['glass_cannon'] });
      check('Glass Cannon adds 1 to a frontline unit', function () { return (ev.lanes[0].bottom.frontStrength === 3); }, function () { return ('front ' + ev.lanes[0].bottom.frontStrength); });
      RUN.buildApi(battleState, 'bottom', []).damage('bottom', 'row1', 0, 1);
      ev = C.evaluateBoard(battleState.board, battleState.hazards, { relics: ['glass_cannon'] });
      check('Glass Cannon cracks hard when damaged', function () { return (ev.lanes[0].bottom.frontStrength === 0); },
        function () { return ('front now ' + ev.lanes[0].bottom.frontStrength); });
}
