/* a targeted spell with nothing to target must never auto resolve */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var first, map;

  // --- a targeted spell with nothing to target must never auto-resolve ---
      check('Catalyst on an empty board is marked unplayable, not auto-resolved', function () { return ((function () {
        var saved = RUN.getRun(), savedState = RUN.getState();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.map = RUN.buildMap('green', true); run.depth = 0; run.available = [0];
        RUN.enterNode(0);
        var state = RUN.getState();
        ROWS.forEach(function (row) { for (var i = 0; i < ROW_INFO[row].count; i++) {
          state.board[PLAYER][row][i] = null; state.board[ENEMY][row][i] = null;
        }});
        state.hands[PLAYER][0] = { id: 'catalyst', up: false, uid: -1 };
        render();
        var btn = document.querySelector('.hand .card:not(.mixcard)');
        var markedDead = btn.className.indexOf('unplayable') !== -1;
        btn.click();
        var stillInHand = getState().hands[PLAYER].some(function (c) { return c.id === 'catalyst'; });
        var noPending = !getState().pending;
        RUN.setState(savedState); RUN.setRun(saved); RUN.show('map');
        /* Catalyst's first ask is "pick a friendly unit" \u2014 with nothing on the
           board, beginPlay used to find zero legal options and finish the play
           immediately with no picks: the card vanished, onPlay did nothing, and
           there was never a chance to even read it, let alone back out. */
        return markedDead && stillInHand && noPending;
      })()); });
      check('Catalyst with units present still begins targeting normally', function () { return ((function () {
        var saved = RUN.getRun(), savedState = RUN.getState();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.map = RUN.buildMap('green', true); run.depth = 0; run.available = [0];
        RUN.enterNode(0);
        var state = RUN.getState();
        state.board[PLAYER].row1[0] = { cardId: 'red_brute', color: 'red', strength: 2, temp: 0 };
        state.board[PLAYER].row2[0] = { cardId: 'blue_scout', color: 'blue', strength: 2, temp: 0 };
        state.hands[PLAYER][0] = { id: 'catalyst', up: false, uid: -1 };
        render();
        var btn = document.querySelector('.hand .card:not(.mixcard)');
        var notMarkedDead = btn.className.indexOf('unplayable') === -1;
        btn.click();
        var beganTargeting = !!getState().pending;
        RUN.setState(savedState); RUN.setRun(saved); RUN.show('map');
        return notMarkedDead && beganTargeting;
      })()); });
}
