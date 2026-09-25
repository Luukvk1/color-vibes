/* relic: Colour Lens */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, ev;

  // --- relic: Colour Lens ---
      battleState = fresh(['color_lens']);
      put(battleState, 'bottom', 'row1', 0, 'cyan_cleanser', 4); put(battleState, 'top', 'row1', 0, 'red_brute', 2);
      var ev = C.evaluateBoard(battleState.board, battleState.hazards, { relics: ['color_lens'] });
      check('Colour Lens lifts the best effective lane to x2.5',
        function () { return (ev.lanes[0].bottom.multiplier === 2.5 && ev.lanes[0].bottom.final === 10); }, function () { return ('x' + ev.lanes[0].bottom.multiplier + ' = ' + ev.lanes[0].bottom.final); });
}
