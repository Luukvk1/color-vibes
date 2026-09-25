/* relic: Echo Chamber */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, first;

  // --- relic: Echo Chamber ---
      battleState = fresh(['echo_chamber']);
      battleState.decks.bottom = [C.makeCard('red_brute'), C.makeCard('red_brute'), C.makeCard('red_brute')];
      RUN.buildApi(battleState, 'bottom', []).draw('bottom', 1);
      check('Echo Chamber doubles the first draw of the round', function () { return (battleState.hands.bottom.length === 2); }, function () { return ('drew ' + battleState.hands.bottom.length); });
      RUN.buildApi(battleState, 'bottom', []).draw('bottom', 1);
      check('Echo Chamber only fires once a round', function () { return (battleState.hands.bottom.length === 3); }, function () { return ('now ' + battleState.hands.bottom.length); });
}
