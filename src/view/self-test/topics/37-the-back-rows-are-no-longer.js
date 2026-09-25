/* the back rows are no longer safe */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var ev, reach;

  // --- the back rows are no longer safe ---
      check('Backline cards reach past the frontline, not through it', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'top', 'row1', 0, 'red_brute', 9);      // the line
        put(battleState2, 'top', 'row3', 0, 'red_brute', 6);      // what it is protecting
        var before = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
        var frontBefore = before.strengthOf(before.view['top-row1-0']);
        CARDS.magenta_lancer.onPlay(battleState2, PLAYER, { row: 'row1', index: 0 }, [],
          RUN.buildApi(battleState2, PLAYER, []));
        var after = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
        return after.strengthOf(after.view['top-row1-0']) === frontBefore &&
               after.strengthOf(after.view['top-row3-0']) < 6;
      })()); });
      check('An enemy row aura lands on the far side only', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'top', 'row1', 0, 'red_brute', 9);
        put(battleState2, 'top', 'row3', 0, 'red_brute', 6);
        put(battleState2, 'bottom', 'row3', 0, 'red_brute', 6);   // our own back row must be untouched
        battleState2.board[PLAYER].row2[0] = { cardId: 'yellow_arclight', color: 'yellow', strength: 3, temp: 0 };
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
        return ev.strengthOf(ev.view['top-row3-0']) === 4 &&
               ev.strengthOf(ev.view['top-row1-0']) === 9 &&
               ev.strengthOf(ev.view['bottom-row3-0']) === 6;
      })()); });
      check('Something in every colour can threaten the back rows', function () { return ((function () {
        var reachers = C.DRAWABLE.filter(function (key) {
          var cardDef = CARDS[key];
          return cardDef.enemyRowAura || /behind the line|back row/i.test(cardDef.text || '');
        });
        var colours = {};
        reachers.forEach(function (key) { colours[CARDS[key].color] = 1; });
        return reachers.length >= 4 && Object.keys(colours).length >= 3;
      })()); });
}
