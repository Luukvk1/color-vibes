/* odds and ends */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var map, ok;

  // --- odds and ends ---
      check('Relics are no longer capped', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        var keys = Object.keys(C.RELICS);
        keys.forEach(function (key) { run.relics.push(key); });
        var count = run.relics.length;
        RUN.rollReward({ type: 'battle', depth: 6 });     // must not throw or refuse
        var ok = C.RELIC_LIMIT === Infinity && count === keys.length;
        RUN.setRun(saved);
        return ok;
      })()); });
      check('Each act option is dressed in its own room', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.act = 'green'; run.actsCleared = ['green']; run.actOffer = ['red', 'blue'];
        RUN.show('act');
        var picks = els.actBody.querySelectorAll('.act-pick');
        var ok = picks.length === 2;
        Array.prototype.forEach.call(picks, function (p2) {
          var key = p2.getAttribute('data-act');
          var want = RUN.ACT_ART[key] && RUN.ACT_ART[key].varName;
          if (p2.style.getPropertyValue('--act-art').indexOf(want) === -1) ok = false;
          // and the words need something solid behind them
          if (!p2.querySelector('.act-scrim') || !p2.querySelector('.act-copy')) ok = false;
        });
        RUN.setRun(saved); RUN.show('map');
        return ok;
      })()); });
      check('An omen says which colours opened the road', function () { return ((function () {
        var NAMES = { red: 'red', green: 'green', blue: 'blue',
                      yellow: 'red', cyan: 'green', magenta: 'red' };
        return RUN.ACT_KEYS.every(function (key) {
          var omenText = RUN.ACT_OMENS[key].toLowerCase();
          if (key === 'black') return /mixture|made colour/.test(omenText);
          return omenText.indexOf(NAMES[key]) !== -1;
        });
      })()); });

      check('Lost lives read differently from full ones in battle', function () { return ((function () {
        /* Purely a CSS cascade bug: battle-mode restyled every .life span the
           same warm red, so .life.lost's colour was overridden right back to
           full — the hearts never looked like they were disappearing no matter
           how many lives the player had actually lost. Comparing computed style
           directly is what a visual diff of the two states would catch and a
           DOM-only check would miss. */
        var el = document.createElement('span');
        el.className = 'life lost';
        document.body.appendChild(el);
        document.body.classList.add('battle-mode');
        var lostColor = getComputedStyle(el).color;
        el.className = 'life';
        var fullColor = getComputedStyle(el).color;
        document.body.classList.remove('battle-mode');
        el.remove();
        return lostColor !== fullColor;
      })()); });
      check('The lives HUD reflects the actual count, not always the max', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.lives = 1;
        RUN.renderRunBar();
        var lit = document.getElementById('runLives').querySelectorAll('.life:not(.lost)').length;
        var lost = document.getElementById('runLives').querySelectorAll('.life.lost').length;
        RUN.setRun(saved);
        RUN.renderRunBar();
        return lit === 1 && lost === run.maxLives - 1;
      })()); });
}
