/* Black ends the game; White is the prize for the long way round */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var left, ok;

  // --- Black ends the game; White is the prize for the long way round ---
      check('Beating Black ends the game even with roads left unwalked', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.actsCleared = ['green', 'red'];        // most of the wheel never touched
        run.act = 'black'; run.deck = RUN.startingDeck();
        RUN.finishAct();
        var after = RUN.getRun();
        var ok = after.screen === 'victory' && !RUN.whiteUnlocked(after);
        RUN.setRun(saved);
        return ok;
      })()); });
      check('White opens only when every road was already behind you', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.actsCleared = RUN.ACT_KEYS.filter(function (key) { return key !== 'black'; });
        run.act = 'black'; run.deck = RUN.startingDeck();
        RUN.finishAct();
        var after = RUN.getRun();
        var ok = after.screen === 'victory' && RUN.whiteUnlocked(after);
        RUN.setRun(saved);
        return ok;
      })()); });
      check('White is not on the wheel and never appears in an ordinary fork', function () { return ((function () {
        if (RUN.ACT_KEYS.indexOf('white') !== -1) return false;
        if (RUN.SECRET_ACT_KEYS.indexOf('white') === -1) return false;
        if (C.COLOR_KEYS.indexOf('white') !== -1) return false;   // never mixable
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck();
        run.endless = true;
        RUN.ACT_KEYS.forEach(function (key) { run.actsCleared.push(key); });
        var offered = RUN.eligibleActs(run).indexOf('white') !== -1;
        RUN.setRun(saved);
        return !offered;
      })()); });
      check('Beating White ends the run outright', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.actsCleared = RUN.ACT_KEYS.slice();
        run.act = 'white'; run.deck = RUN.startingDeck();
        RUN.finishAct();
        var after = RUN.getRun();
        var ok = after.screen === 'gameover' && after.actsCleared.indexOf('white') !== -1;
        RUN.setRun(saved);
        return ok;
      })()); });
      check('The Unbroken Light punishes Black and pays for breadth', function () { return ((function () {
        var mod = ENEMIES.unbroken_light.mod;
        function board(colors) {
          var battleState2 = fresh();
          var slots = [['row1', 0], ['row1', 1], ['row1', 2], ['row2', 0], ['row2', 1], ['row3', 0]];
          colors.forEach(function (col, i) {
            put(battleState2, 'bottom', slots[i][0], slots[i][1], 'red_brute', 6);
            battleState2.board[PLAYER][slots[i][0]][slots[i][1]].color = col;
          });
          return battleState2;
        }
        function score(colors, on) {
          var battleState2 = board(colors);
          return C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: on ? mod : {} }).totals.bottom;
        }
        var allBlack = ['black', 'black', 'black', 'black', 'black', 'black'];
        var broad = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta'];
        /* Measured against real full-clear decks, which carry a median of 4 Black
           cards while already fielding 6 colours. A boss punishing breadth would
           have been weakest against the Black-heavy decks that actually get here;
           this one is strongest against exactly them. */
        return score(allBlack, true) < score(allBlack, false) * 0.35 &&
               score(broad, true) > score(broad, false);
      })()); });
}
