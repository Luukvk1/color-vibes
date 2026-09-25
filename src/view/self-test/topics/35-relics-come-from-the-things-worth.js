/* relics come from the things worth beating */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var ok;

  // --- relics come from the things worth beating ---
      check('Only elites and bosses drop relics, and they always do', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        var ordinary = 0, ranked = 0;
        for (var i = 0; i < 40; i++) {
          run.relics = [];
          RUN.rollReward({ type: 'battle', depth: 6 });
          if (RUN.getRun().reward.relic) ordinary++;
          run.relics = [];
          RUN.rollReward({ type: i % 2 ? 'elite' : 'boss', depth: 6 });
          if (RUN.getRun().reward.relic) ranked++;
        }
        RUN.setRun(saved);
        // an 18% trickle off ordinary fights made relics background noise
        return ordinary === 0 && ranked === 40;
      })()); });
      check('A ranked reward carries a card AND a relic', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        RUN.getRun().relics = [];
        RUN.rollReward({ type: 'elite', depth: 6 });
        var reward = RUN.getRun().reward;
        var ok = reward.cards.length > 0 && !!reward.relic;
        RUN.setRun(saved);
        return ok;
      })()); });
      check('Shop relics cost more than their printed price', function () { return ((function () {
        return Object.keys(RELICS).every(function (key) {
          return RUN.shopRelicPrice(key) > RELICS[key].cost;
        });
      })()); });
}
