/* six things a deck can be built around */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var ev;

  // --- six things a deck can be built around ---
      check('Swarm pays for bodies', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row2', 0, 'green_swarmling', 1);
        var alone = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var a = alone.strengthOf(alone.view['bottom-row2-0']);
        for (var i = 0; i < 3; i++) put(battleState2, 'bottom', 'row1', i, 'red_brute', 2);
        var crowd = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return crowd.strengthOf(crowd.view['bottom-row2-0']) > a;
      })()); });
      check('Spectrum pays for colours, and only for distinct ones', function () { return ((function () {
        function withColours(list) {
          var battleState2 = fresh();
          put(battleState2, 'bottom', 'row2', 0, 'yellow_prismatic', 1);
          list.forEach(function (color, i) {
            put(battleState2, 'bottom', 'row1', i, 'red_brute', 2);
            battleState2.board[PLAYER].row1[i].color = color;
          });
          var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
          return ev.strengthOf(ev.view['bottom-row2-0']);
        }
        // four of one colour must be worth less than four different ones
        return withColours(['red', 'green', 'blue', 'cyan']) > withColours(['red', 'red', 'red', 'red']);
      })()); });
      check('Chain pays for mix length', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row2', 0, 'magenta_cascade', 1);
        var c0 = C.evaluateBoard(battleState2.board, battleState2.hazards, { chains: { bottom: 0, top: 0 } });
        var c3 = C.evaluateBoard(battleState2.board, battleState2.hazards, { chains: { bottom: 3, top: 0 } });
        return c3.strengthOf(c3.view['bottom-row2-0']) ===
               c0.strengthOf(c0.view['bottom-row2-0']) + 9;
      })()); });
      check('Control pays for shrinking a crowded enemy', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row2', 0, 'black_famine', 3);
        for (var i = 0; i < 3; i++) put(battleState2, 'top', 'row1', i, 'red_brute', 6);
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        // the swarm answer: three enemy bodies is one point off each of them
        return ev.strengthOf(ev.view['top-row1-0']) < 6;
      })()); });
      check('The Broodmother lifts the whole board, not just neighbours', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row2', 0, 'green_broodmother', 2);
        put(battleState2, 'bottom', 'row3', 0, 'red_brute', 2);     // deliberately not touching
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return ev.strengthOf(ev.view['bottom-row3-0']) === 3;
      })()); });
      check('Every archetype has enough cards to actually build around', function () { return ((function () {
        function count(test) { return C.DRAWABLE.filter(test).length; }
        var swarm = count(function (key) { return /friendly unit|friendly units/i.test(CARDS[key].text || ''); });
        var spectrum = count(function (key) { return /distinct colour/i.test(CARDS[key].text || ''); });
        var chain = count(function (key) { return /mix chain|whenever you mix/i.test(CARDS[key].text || ''); });
        var control = count(function (key) { return /weaker|loses \\d/i.test(CARDS[key].text || ''); });
        var ward = count(function (key) { return /ignores? all negative/i.test(CARDS[key].text || ''); });
        var draw = count(function (key) { return /draw/i.test(CARDS[key].text || ''); });
        /* Three is the floor for something to be a build rather than a card that
           happens to exist \u2014 below that a deck cannot reliably find two of them. */
        return swarm >= 3 && spectrum >= 3 && chain >= 3 &&
               control >= 3 && ward >= 3 && draw >= 3;
      })()); });
      check('Archetype hooks survive a fusion without turning into nonsense', function () { return ((function () {
        /* swarmAura is a number and warded is a flag; the generic composer would
           have wrapped both as functions, making the aura NaN when added to a
           strength. Explicit hook shapes are what stop that. */
        var fused = C.fuseCards({ id: 'green_broodmother', up: false }, { id: 'green_thicket', up: false });
        var cardDef = CARDS[fused.id];
        if (typeof cardDef.swarmAura !== 'number' || cardDef.warded !== true) return false;
        var battleState2 = fresh();
        battleState2.board[PLAYER].row2[0] = { cardId: fused.id, color: cardDef.color, strength: cardDef.strength, temp: 0 };
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 2);
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var lifted = ev.strengthOf(ev.view['bottom-row1-0']);
        return lifted === 3 && !isNaN(ev.totals.bottom);
      })()); });

      check('No archetype is locked behind the colour gate', function () { return ((function () {
        var AR = {
          swarm:    function (key) { return /friendly unit/i.test(CARDS[key].text || ''); },
          spectrum: function (key) { return /distinct colour/i.test(CARDS[key].text || ''); },
          chain:    function (key) { return /mix chain|whenever you mix/i.test(CARDS[key].text || ''); },
          control:  function (key) { return /weaker|loses \\d/i.test(CARDS[key].text || ''); },
          ward:     function (key) { return /ignores? all negative/i.test(CARDS[key].text || ''); },
          draw:     function (key) { return /draw/i.test(CARDS[key].text || ''); }
        };
        /* Measured: with Spectrum and Ward living only in secondary colours they
           were reachable in 0 of 30 runs, because a deck cannot draft toward
           something the colour gate never offers. Every archetype needs a card in
           a colour the player starts with, or it is not a playstyle \u2014 it is a
           reward for having already played a different one. */
        return Object.keys(AR).every(function (a) {
          return C.DRAWABLE.some(function (key) {
            var cardDef = CARDS[key];
            return AR[a](key) && C.PRIMARY_COLORS.indexOf(cardDef.color) !== -1;
          });
        });
      })()); });
      check('The new ward shapes each protect something different', function () { return ((function () {
        function scorched(cardId, row, extra) {
          var battleState2 = fresh();
          battleState2.board[PLAYER][row][0] = { cardId: cardId, color: CARDS[cardId].color,
            strength: CARDS[cardId].strength, temp: 0 };
          if (extra) put(battleState2, 'bottom', row, 1, 'red_brute', 4);
          battleState2.hazards[PLAYER][row] = 'scorch';
          var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
          return {
            self: ev.strengthOf(ev.view['bottom-' + row + '-0']) - CARDS[cardId].strength,
            mate: extra ? ev.strengthOf(ev.view['bottom-' + row + '-1']) - 4 : null
          };
        }
        // Ironhide guards itself, but only on the front row
        var front = scorched('red_ironhide', 'row1');
        var back = scorched('red_ironhide', 'row3');
        // the Bastion guards its whole row instead
        var bastion = scorched('blue_bastion', 'row1', true);
        return front.self === 0 && back.self === -1 && bastion.mate === 0;
      })()); });
}
