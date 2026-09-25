/* upgrades */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;

  // --- upgrades ---
      check('An upgraded unit is 1 stronger', function () { return (C.cardStrength({ id: 'red_brute', up: true }) === 3); });
      check('Upgrade marks the name', function () { return (C.cardName({ id: 'red_brute', up: true }) === 'Red Brute+'); });
}
