/* row minimums were the thing holding cheap unit archetypes down */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;

  // --- row minimums were the thing holding cheap-unit archetypes down ---
      check('A strength-1 unit normally cannot leave Row 1', function () { return ((function () {
        var battleState2 = fresh();
        var tiles = C.legalTiles(battleState2.board, PLAYER, 1);
        return tiles.length === ROW_INFO.row1.count &&
               tiles.every(function (t) { return t.row === 'row1'; });
      })()); });
      check('anyRow lets a small unit stand anywhere', function () { return ((function () {
        var battleState2 = fresh();
        var opts = C.placeOpts('green_burrower', [], battleState2.board, PLAYER);
        var tiles = C.legalTiles(battleState2.board, PLAYER, 1, opts);
        /* Measured: a swarm board could fill 7 of 9 tiles and a one-of-each-colour
           board only 4, while a Titan board filled all nine. The archetypes were
           not weak on rates, they were playing a smaller board. */
        return opts.anyRow === true && tiles.length === 9;
      })()); });
      check('Field Commission frees every unit, not just the ones that say so', function () { return ((function () {
        var battleState2 = fresh();
        var plain = C.placeOpts('green_swarmling', [], battleState2.board, PLAYER);
        var withRelic = C.placeOpts('green_swarmling', ['field_commission'], battleState2.board, PLAYER);
        return !plain.anyRow && withRelic.anyRow &&
               C.legalTiles(battleState2.board, PLAYER, 1, withRelic).length === 9;
      })()); });
      check('A Footing opens its own row and no other', function () { return ((function () {
        var battleState2 = fresh();
        battleState2.board[PLAYER].row2[0] = { cardId: 'cyan_footing', color: 'cyan', strength: 2, temp: 0 };
        var opts = C.placeOpts('green_swarmling', [], battleState2.board, PLAYER);
        var tiles = C.legalTiles(battleState2.board, PLAYER, 1, opts);
        var rows = {};
        tiles.forEach(function (t) { rows[t.row] = 1; });
        // row1 was always legal; row2 is opened by the Footing; row3 stays shut
        return !!rows.row1 && !!rows.row2 && !rows.row3;
      })()); });
      check('Every archetype has enablers and a payoff to build toward', function () { return ((function () {
        function have(pattern, min) {
          var count = C.DRAWABLE.filter(function (key) {
            return pattern.test(CARDS[key].text || '');
          }).length;
          return count >= min;
        }
        return have(/every 2 other friendly|other friendly unit|units stand with it/i, 3) &&  // swarm
               have(/distinct colour|different colour/i, 5) &&                                 // coverage
               have(/mix chain|each link/i, 3) &&                                              // chain
               have(/cards in your hand/i, 3) &&                                               // hand size
               have(/two or fewer|empty tile/i, 3) &&                                          // solitude
               have(/ignores all negative|ignore all negative/i, 3) &&                         // ward
               have(/behind the line|back row/i, 3) &&                                         // control
               have(/draw/i, 5);                                                               // draw
      })()); });
      check('The solitude payoffs actually pay', function () { return ((function () {
        var battleState2 = fresh();
        battleState2.board[PLAYER].row3[0] = { cardId: 'cyan_monolith', color: 'cyan', strength: 3, temp: 0 };
        var alone = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var big = alone.strengthOf(alone.view['bottom-row3-0']);
        // fill the board and the Monolith should collapse
        ['row1', 'row2'].forEach(function (row) {
          for (var i = 0; i < ROW_INFO[row].count; i++) put(battleState2, 'bottom', row, i, 'red_brute', 2);
        });
        var crowded = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return big > 15 && crowded.strengthOf(crowded.view['bottom-row3-0']) < big;
      })()); });
}
