/* frontlines fall between rounds, but only where the lane was contested */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var first, ev, map, ok;

  // --- frontlines fall between rounds, but only where the lane was contested ---
      check('A contested lane culls both frontlines, support survives', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 3);
        put(battleState2, 'bottom', 'row1', 1, 'red_brute', 3);
        put(battleState2, 'bottom', 'row2', 0, 'green_gardener', 3);   // support in lanes 1 and 2
        put(battleState2, 'top', 'row1', 0, 'blue_scout', 2);
        put(battleState2, 'top', 'row1', 1, 'blue_scout', 2);
        RUN.clearFrontlines(battleState2.board, battleState2.hazards, {});
        return battleState2.board.bottom.row1[0] === null && battleState2.board.bottom.row1[1] === null &&
               battleState2.board.bottom.row2[0] !== null &&
               battleState2.board.top.row1[0] === null && battleState2.board.top.row1[1] === null;
      })()); });
      check('An uncontested lane spares its frontline', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 3, 'red_brute', 3);        // nothing opposite it
        var fallen = RUN.clearFrontlines(battleState2.board, battleState2.hazards, {});
        return battleState2.board.bottom.row1[3] !== null && fallen.bottom.length === 0;
      })()); });
      check('A unit fronting several lanes falls once if any was contested', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row3', 0, 'green_titan', 6);      // fronts lanes 1-3 alone
        put(battleState2, 'top', 'row1', 0, 'blue_scout', 2);          // contests lane 1 only
        var fallen = RUN.clearFrontlines(battleState2.board, battleState2.hazards, {});
        return fallen.bottom.length === 1 && battleState2.board.bottom.row3[0] === null;
      })()); });
      check('Support steps up to the line next round', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'red_brute', 3);
        put(battleState2, 'bottom', 'row1', 2, 'red_brute', 3);
        put(battleState2, 'bottom', 'row2', 1, 'green_gardener', 3);
        put(battleState2, 'top', 'row1', 1, 'blue_scout', 2);
        put(battleState2, 'top', 'row1', 2, 'blue_scout', 2);
        RUN.clearFrontlines(battleState2.board, battleState2.hazards, {});
        var ev2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return ev2.lanes[1].bottom && ev2.lanes[1].bottom.champion.row === 'row2';
      })()); });
      check('An empty board survives the cull', function () { return ((function () {
        var battleState2 = fresh();
        RUN.clearFrontlines(battleState2.board, battleState2.hazards, {});
        return true;
      })()); });

      check('The first three fights ease the player in',
        function () { return (RUN.easeInHand(0) === 2 && RUN.easeInHand(2) === 2 && RUN.easeInHand(3) === 0); },
        function () { return ([0, 2, 3].map(RUN.easeInHand).join('/')); });
      check('The battle-start primer is a single card', function () { return (RUN.TUTORIAL_STEPS.length === 1); });
      check('Frontline and round-break are deferred lessons',
        function () { return (typeof RUN.TUTORIAL_LESSONS.frontline === 'function' && typeof RUN.TUTORIAL_LESSONS.roundbreak === 'function'); });
      check('Every opening card carries art or prose',
        function () { return (RUN.TUTORIAL_STEPS.every(function (step) { return step.title && (step.body || step.art || step.artHtml); })); });
      check('Lessons build from a live board and describe its own units', function () { return ((function () {
        try {
          var battleState2 = fresh();
          put(battleState2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
          put(battleState2, 'bottom', 'row2', 1, 'black_voidling', 4);
          put(battleState2, 'top', 'row1', 1, 'red_brute', 3);
          var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
          var cards = RUN.TUTORIAL_LESSONS.frontline({ board: battleState2.board, hazards: battleState2.hazards, ev: e2 });
          if (!cards || !cards.length) return false;
          var text = cards[0].legend.join(' ');
          cards[0].art();
          // it must name the player's real units, not a canned example
          return text.indexOf('Cyan') !== -1 && text.indexOf('Red 3') !== -1;
        } catch (e) { return false; }
      })()); });
      check('The frontline lesson holds off until a lane is contested', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);   // nothing opposing
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return RUN.TUTORIAL_LESSONS.frontline({ board: battleState2.board, hazards: battleState2.hazards, ev: e2 }) === null;
      })()); });
      check('The round-break lesson reports what actually fell', function () { return ((function () {
        try {
          var battleState2 = fresh();
          put(battleState2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
          put(battleState2, 'bottom', 'row2', 1, 'green_gardener', 3);
          put(battleState2, 'top', 'row1', 1, 'red_brute', 3);
          put(battleState2, 'bottom', 'row1', 3, 'magenta_chain', 5);   // uncontested survivor
          var pre = C.cloneBoard(battleState2.board), preHaz = C.cloneHazards(battleState2.hazards);
          var e2 = C.evaluateBoard(pre, preHaz, {});
          var fallen = RUN.clearFrontlines(battleState2.board, battleState2.hazards, {});
          var cards = RUN.TUTORIAL_LESSONS.roundbreak({ board: pre, hazards: preHaz, ev: e2,
            after: battleState2.board, fallen: fallen, evalCtx: {} });
          if (!cards) return false;
          var text = cards[0].legend.join(' ');
          cards[0].art();
          // names what fell, and names a unit that came through untouched
          return cards[0].legend.length === 2 && text.indexOf('Cyan') !== -1 &&
                 text.indexOf('never contested') !== -1 && text.indexOf('stays') !== -1;
        } catch (e) { return false; }
      })()); });
      check('The round-break lesson waits for a round where something fell', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
        var pre = C.cloneBoard(battleState2.board);
        var e2 = C.evaluateBoard(pre, battleState2.hazards, {});
        var fallen = RUN.clearFrontlines(battleState2.board, battleState2.hazards, {});
        return RUN.TUTORIAL_LESSONS.roundbreak({ board: pre, hazards: battleState2.hazards, ev: e2,
          after: battleState2.board, fallen: fallen, evalCtx: {} }) === null;
      })()); });
      check('Live pointers keep clear of units and of each other', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 2);
        put(battleState2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
        put(battleState2, 'bottom', 'row2', 1, 'green_gardener', 3);
        put(battleState2, 'top', 'row1', 1, 'red_brute', 3);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var cards = RUN.TUTORIAL_LESSONS.frontline({ board: battleState2.board, hazards: battleState2.hazards, ev: e2 });
        var svg = cards[0].art();
        var badges = svg.match(/class="tut-badge" cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g) || [];
        var pts = badges.map(function (m2) {
          var n2 = m2.match(/cx="(-?[\d.]+)" cy="(-?[\d.]+)"/);
          return { x: +n2[1], y: +n2[2] };
        });
        if (pts.length < 2) return false;
        for (var i = 0; i < pts.length; i++) {
          for (var j = i + 1; j < pts.length; j++) {
            var d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
            if (d < 70) return false;               // badges must not overlap
          }
        }
        return true;
      })()); });
      check('The first-turn lesson explains playing a card', function () { return ((function () {
        try {
          var cards = RUN.TUTORIAL_LESSONS.play({});
          return cards && cards.length === 1 && typeof cards[0].artHtml === 'function' &&
                 cards[0].artHtml().indexOf('tut-rack') !== -1;
        } catch (e) { return false; }
      })()); });
      check('A Row 1 lesson never claims the strength was divided', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'red_brute', 4);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var cards = RUN.TUTORIAL_LESSONS.lanes_row1({ board: battleState2.board, hazards: battleState2.hazards, ev: e2,
          tile: { row: 'row1', index: 1 } });
        var txt = cards[0].legend.join(' ');
        return txt.indexOf('feeds lane 2.') !== -1 && txt.indexOf('Nothing is split off') !== -1 &&
               txt.indexOf('splits into') === -1;
      })()); });
      check('Flow arrows draw over the units, not under them', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row3', 0, 'green_titan', 7);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var svg = RUN.TUTORIAL_LESSONS.lanes_row3({ board: battleState2.board, hazards: battleState2.hazards, ev: e2,
          tile: { row: 'row3', index: 0 } })[0].art();
        return svg.indexOf('tut-token') < svg.indexOf('tut-flow');
      })()); });
      check('One share chip per lane, sitting above Row 1', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row3', 0, 'green_titan', 7);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var svg = RUN.TUTORIAL_LESSONS.lanes_row3({ board: battleState2.board, hazards: battleState2.hazards, ev: e2,
          tile: { row: 'row3', index: 0 } })[0].art();
        var chips = svg.match(/class="tut-amtbox"/g) || [];
        var ys = (svg.match(/class="tut-amtbox" x="[-\d.]+" y="([-\d.]+)"/) || [])[1];
        return chips.length === 3 && parseFloat(ys) < 0;   // above the board's top edge
      })()); });
      check('Every rule has a lesson that waits for its moment', function () { return ((function () {
        var need = ['lanes_row1', 'lanes_row2', 'lanes_row3', 'mixing', 'passing', 'frontline', 'roundbreak'];
        return need.every(function (key) { return typeof RUN.TUTORIAL_LESSONS[key] === 'function'; });
      })()); });
      check('Lane lessons draw the row the player actually used', function () { return ((function () {
        try {
          var battleState2 = fresh();
          put(battleState2, 'bottom', 'row2', 1, 'green_gardener', 4);
          var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
          var ctx = { board: battleState2.board, hazards: battleState2.hazards, ev: e2, tile: { row: 'row2', index: 1 } };
          var cards = RUN.TUTORIAL_LESSONS.lanes_row2(ctx);
          if (!cards) return false;
          cards[0].art();
          var txt = cards[0].legend.join(' ');
          // Row 2 splits across two lanes, so the shares must read as a sum of two
          return txt.indexOf('lanes 2, 3') !== -1 && txt.indexOf('2 + 2') !== -1;
        } catch (e) { return false; }
      })()); });
      check('A lane lesson ignores a placement in another row', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 2);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return RUN.TUTORIAL_LESSONS.lanes_row3({ board: battleState2.board, hazards: battleState2.hazards, ev: e2,
          tile: { row: 'row1', index: 0 } }) === null;
      })()); });
      check('Turning the tutorial off silences every lesson', function () { return ((function () {
        var was = RUN.tutorial.enabled;
        RUN.setTutorial(false);
        var quiet = ['mixing', 'passing', 'frontline', 'lanes_row1'].every(function (key) { return !RUN.shouldTeach(key); });
        RUN.setTutorial(was);
        return quiet;
      })()); });
      check('Lessons are not confined to the first battle', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        RUN.getRun().battlesFought = 4;
        var ok = RUN.shouldTeach('mixing');
        RUN.setRun(saved);
        return ok;
      })()); });
      check('The tutorial has steps and can be switched off', function () { return ((function () {
        var was = RUN.tutorial.enabled;
        RUN.setTutorial(false);
        var off = RUN.tutorial.enabled === false;
        RUN.setTutorial(was);
        return RUN.TUTORIAL_STEPS.length >= 1 && off;
      })()); });
}
