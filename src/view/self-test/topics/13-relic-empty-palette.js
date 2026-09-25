/* relic: Empty Palette */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, ev;

  // --- relic: Empty Palette ---
      battleState = fresh(['empty_palette']);
      battleState.hazards.bottom.row1 = 'colorless';
      put(battleState, 'bottom', 'row1', 0, 'red_brute', 4); put(battleState, 'top', 'row1', 0, 'red_brute', 2);
      ev = C.evaluateBoard(battleState.board, battleState.hazards, { relics: ['empty_palette'] });
      check('Empty Palette pays 1.25x for a colourless frontline', function () { return (ev.lanes[0].bottom.multiplier === 1.25); },
        function () { return ('x' + ev.lanes[0].bottom.multiplier); });
}
