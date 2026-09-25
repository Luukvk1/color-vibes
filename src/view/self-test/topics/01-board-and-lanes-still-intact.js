/* board and lanes still intact */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;

  // --- board and lanes still intact ---
      check('Board has 18 tiles', function () { return (GEO.length === 18); });
      check('Row 1/2/3 serve 1/2/3 lanes',
        function () { return (lanesOf('row1', 2).length === 1 && lanesOf('row2', 1).length === 2 && lanesOf('row3', 0).length === 3); });
      check('Colours are balanced three-and-three', function () { return (COLOR_KEYS.every(function (key) {
        return C.EFFECTIVE[key].length === 3 && COLOR_KEYS.filter(function (a) { return C.isEffective(a, key); }).length === 3;
      })); });
}
