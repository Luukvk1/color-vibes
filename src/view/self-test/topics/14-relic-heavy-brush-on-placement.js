/* relic: Heavy Brush on placement */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState;

  // --- relic: Heavy Brush on placement ---
      battleState = fresh(['heavy_brush']);
      RUN.resolveCard(battleState, 'bottom', C.makeCard('green_titan'), { row: 'row3', index: 0 }, []);
      check('Heavy Brush adds 1 when entering Row 3', function () { return (battleState.board.bottom.row3[0].strength === 6); }, function () { return ('got ' + battleState.board.bottom.row3[0].strength); });
      RUN.resolveCard(battleState, 'bottom', C.makeCard('green_gardener'), { row: 'row2', index: 0 }, []);
      check('Heavy Brush does nothing outside Row 3', function () { return (battleState.board.bottom.row2[0].strength === 3); });
}
