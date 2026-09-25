/* warding: one flag, honoured by every source of harm */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var ev;

  // --- warding: one flag, honoured by every source of harm ---
      check('A ward refuses a hazard', function () { return ((function () {
        function underScorch(cardId) {
          var battleState2 = fresh();
          battleState2.board[PLAYER].row1[0] = { cardId: cardId, color: CARDS[cardId].color,
            strength: CARDS[cardId].strength, temp: 0 };
          battleState2.hazards[PLAYER].row1 = 'scorch';
          var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
          return ev.strengthOf(ev.view['bottom-row1-0']) - CARDS[cardId].strength;
        }
        // the plain card loses a point to the burn; the warded one does not
        return underScorch('green_colony') === -1 && underScorch('green_thicket') === 0;
      })()); });
      check('A ward refuses fissure drain', function () { return ((function () {
        var link = C.severableLinks(PLAYER, [])[0];
        if (!link) return true;
        var battleState2 = fresh();
        var at = link.a;
        function drainOn(cardId) {
          var battleState3 = fresh();
          battleState3.board[PLAYER][at.row][at.index] = { cardId: cardId, color: CARDS[cardId].color,
            strength: CARDS[cardId].strength, temp: 0 };
          var ev = C.evaluateBoard(battleState3.board, battleState3.hazards, { fissures: [link] });
          return ev.strengthOf(ev.view['bottom-' + at.row + '-' + at.index]) - CARDS[cardId].strength;
        }
        return drainOn('green_colony') < 0 && drainOn('green_thicket') === 0;
      })()); });
      check('A ward refuses a boss punishment', function () { return ((function () {
        function vsWhite(cardId) {
          var battleState2 = fresh();
          battleState2.board[PLAYER].row1[0] = { cardId: cardId, color: 'black', strength: 6, temp: 0 };
          var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { punishColor: { black: 5 } } });
          return ev.strengthOf(ev.view['bottom-row1-0']);
        }
        return vsWhite('red_brute') === 1 && vsWhite('green_thicket') === 6;
      })()); });
      check('A ward never blocks something good', function () { return ((function () {
        var battleState2 = fresh();
        battleState2.board[PLAYER].row2[0] = { cardId: 'green_thicket', color: 'green',
          strength: CARDS.green_thicket.strength, temp: 0 };
        var alone = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var base = alone.strengthOf(alone.view['bottom-row2-0']);
        /* The Thicket is silenced as its cost, so its own number should not move.
           The gate must be one-directional: it filters negatives, never positives. */
        return base === CARDS.green_thicket.strength;
      })()); });
      check('The Bulwark protects what it touches, not itself', function () { return ((function () {
        var battleState2 = fresh();
        battleState2.board[PLAYER].row2[0] = { cardId: 'cyan_bulwark', color: 'cyan', strength: 3, temp: 0 };
        battleState2.board[PLAYER].row1[0] = { cardId: 'red_brute', color: 'red', strength: 6, temp: 0 };
        battleState2.hazards[PLAYER].row1 = 'scorch';
        battleState2.hazards[PLAYER].row2 = 'scorch';
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return ev.strengthOf(ev.view['bottom-row1-0']) === 6 &&
               ev.strengthOf(ev.view['bottom-row2-0']) === 2;   // it burns
      })()); });
      check('The Recluse holds its ward only while it stands alone', function () { return ((function () {
        function reclusive(withNeighbour) {
          var battleState2 = fresh();
          battleState2.board[PLAYER].row2[0] = { cardId: 'magenta_recluse', color: 'magenta', strength: 5, temp: 0 };
          if (withNeighbour) put(battleState2, 'bottom', 'row1', 0, 'red_brute', 2);
          battleState2.hazards[PLAYER].row2 = 'scorch';
          var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
          return ev.strengthOf(ev.view['bottom-row2-0']);
        }
        return reclusive(false) === 5 && reclusive(true) < 5;
      })()); });
}
