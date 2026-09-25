/* relic: Black Paint */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, reach;

  // --- relic: Black Paint ---
      battleState = fresh(['black_paint']);
      /* Two secondaries, not a primary against one — Red against a card recoloured
         Cyan used to reach Black by raw bits, and that pairing is exactly the one
         the mixing rule now redirects instead of allowing through. */
      put(battleState, 'bottom', 'row1', 0, 'red_brute', 3, 'yellow'); put(battleState, 'bottom', 'row2', 0, 'blue_scout', 3, 'cyan');
      RUN.applyMix(battleState, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
      check('Black Paint rewards making Black', function () { return (battleState.board.bottom.row1[0].color === 'black' && battleState.board.bottom.row1[0].temp === 3); },
        function () { return ('temp ' + battleState.board.bottom.row1[0].temp); });
}
