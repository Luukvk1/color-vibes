/* enemy deck quality is gated by depth */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var early, late, earlyUp;

  // --- enemy deck quality is gated by depth ---
      var early = [], late = [];
      for (var attempt = 0; attempt < 40; attempt++) {
        C.buildEnemyDeck(ENEMIES.brawler, 1, Math.random).forEach(function (c) { early.push(CARDS[c.id].rarity); });
        C.buildEnemyDeck(ENEMIES.brawler, 10, Math.random).forEach(function (c) { late.push(CARDS[c.id].rarity); });
      }
      check('Early enemies field commons only', function () { return (early.every(function (rarity) { return rarity === 'Common'; })); },
        function () { return ('saw ' + early.filter(function (rarity) { return rarity !== 'Common'; }).length + ' non-commons'); });
      check('Late enemies can field rares', function () { return (late.some(function (rarity) { return rarity === 'Rare'; })); });
      var earlyUp = 0;
      for (attempt = 0; attempt < 40; attempt++) C.buildEnemyDeck(ENEMIES.brawler, 1, Math.random).forEach(function (c) { if (c.up) earlyUp++; });
      check('Early enemies bring no upgrades', function () { return (earlyUp === 0); }, function () { return (earlyUp + ' upgraded'); });
}
