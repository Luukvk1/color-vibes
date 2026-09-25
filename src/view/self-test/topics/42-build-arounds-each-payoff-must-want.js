/* build arounds: each payoff must want a different board */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var ev, reach;

  // --- build-arounds: each payoff must want a different board ---
      check('Every payoff rewards its own shape and punishes the wrong one', function () { return ((function () {
        var SLOTS = [['row1', 0], ['row1', 1], ['row1', 2], ['row1', 3],
                     ['row2', 0], ['row2', 1], ['row2', 2], ['row3', 0], ['row3', 1]];
        function score(shape, payoff, handSize) {
          var battleState2 = fresh();
          battleState2.hands = { bottom: new Array(handSize || 0), top: [] };
          shape.forEach(function (spec, i) {
            battleState2.board[PLAYER][SLOTS[i][0]][SLOTS[i][1]] =
              { cardId: spec[0], color: spec[1], strength: 2, temp: 0 };
          });
          var at = SLOTS[shape.length];
          battleState2.board[PLAYER][at[0]][at[1]] = { cardId: payoff, color: CARDS[payoff].color,
            strength: CARDS[payoff].strength, temp: 0 };
          var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
          return ev.strengthOf(ev.view['bottom-' + at[0] + '-' + at[1]]);
        }
        var WIDE = [['green_seed', 'green'], ['green_seed', 'green'], ['green_ensign', 'green'],
                    ['green_seed', 'green'], ['green_swarmling', 'green'], ['green_ensign', 'green']];
        var TALL = [['red_brute', 'red'], ['red_brute', 'red']];
        var RAINBOW = [['red_brute', 'red'], ['green_seed', 'green'], ['blue_scout', 'blue'],
                       ['yellow_spark', 'yellow'], ['cyan_shield', 'cyan'], ['magenta_spark', 'magenta']];
        var WARDED = [['cyan_bulwark', 'cyan'], ['green_thicket', 'green'],
                      ['magenta_recluse', 'magenta'], ['yellow_oath', 'yellow']];
        var MONO = [['black_voidling', 'black'], ['black_ember', 'black'],
                    ['black_shroud', 'black'], ['black_famine', 'black']];

        /* The point is not that each is strong somewhere — anything can be made
           strong. It is that each is markedly WEAK on the boards it does not
           want, so the deck you build actually decides which payoffs are worth
           taking. A payoff that is fine everywhere teaches nothing. */
        if (!(score(WIDE, 'green_hivemind') > score(TALL, 'green_hivemind') + 2)) return false;
        if (!(score(TALL, 'red_colossus') > score(WIDE, 'red_colossus') + 4)) return false;
        if (!(score(TALL, 'black_solitude') > score(WIDE, 'black_solitude') + 2)) return false;
        if (!(score(RAINBOW, 'yellow_mosaic') > score(MONO, 'yellow_mosaic') + 4)) return false;
        if (!(score(WARDED, 'cyan_sanctum') > score(WIDE, 'cyan_sanctum') + 6)) return false;
        // and the Tide payoff reads the hand, not the board
        return score(TALL, 'blue_undertow', 7) > score(TALL, 'blue_undertow', 0) + 4;
      })()); });
      check('A build-around is genuinely dead in the wrong deck', function () { return ((function () {
        var battleState2 = fresh();
        // Colossus on a crowded board: nine strength eaten by its own company
        [['row1', 0], ['row1', 1], ['row1', 2], ['row2', 0], ['row2', 1]].forEach(function (t) {
          put(battleState2, 'bottom', t[0], t[1], 'green_seed', 2);
        });
        battleState2.board[PLAYER].row3[0] = { cardId: 'red_colossus', color: 'red', strength: 9, temp: 0 };
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
        return ev.strengthOf(ev.view['bottom-row3-0']) === 0;
      })()); });
      check('Every archetype has an enabler and a payoff to reach for', function () { return ((function () {
        /* A payoff with nothing to enable it is a trap, and an enabler with no
           payoff is filler. Each named archetype needs both in the pool. */
        var need = {
          swarm:    ['green_spore', 'green_hivemind', 'yellow_multitude'],
          monolith: ['red_colossus', 'black_solitude'],
          tide:     ['blue_archivist', 'blue_undertow', 'cyan_reservoir'],
          chain:    ['magenta_relay', 'magenta_crescendo'],
          attrition:['black_wither', 'blue_siphon', 'magenta_lancer'],
          spectrum: ['yellow_pilgrim', 'yellow_mosaic', 'colorless_prismstone'],
          ward:     ['cyan_bulwark', 'green_bramblewall', 'cyan_sanctum']
        };
        return Object.keys(need).every(function (arch) {
          return need[arch].every(function (key) {
            return CARDS[key] && C.DRAWABLE.indexOf(key) !== -1;
          });
        });
      })()); });
      check('The pool is broad enough that a colour is not one deck', function () { return ((function () {
        var byColour = {};
        C.DRAWABLE.forEach(function (key) {
          var color = CARDS[key].color || 'colourless';
          byColour[color] = (byColour[color] || 0) + 1;
        });
        // every colour needs enough cards to support more than a single line of play
        return C.COLOR_KEYS.every(function (color) { return byColour[color] >= 9; }) &&
               C.DRAWABLE.length >= 95;
      })()); });
}
