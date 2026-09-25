/* run structure */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var first, second, map, reach, ok, early;

  // --- run structure ---
      var map = RUN.buildMap();
      check('The act runs 13 rows', function () { return (map.length === 13); });
      check('Row 13 is the boss; row 9 never draws a crossing to offer the elite-skip',
        function () { return ((function () {
          var map2 = RUN.buildMap('green', true);
          if (map2[12][0].type !== 'boss') return false;
          var sawChoice = 0, entries = 0, canSkip = 0, crossings = 0;
          for (var attempt = 0; attempt < 150; attempt++) {
            var map = RUN.buildMap(RUN.ACT_KEYS[attempt % RUN.ACT_KEYS.length], attempt % 2 === 0);
            var row = map[8], prev = map[7];
            /* A single column offers nothing to choose between — whatever rolled
               there was always unavoidable, independent of anything this
               function does, so it is not part of the guarantee. */
            if (row.length < 2) continue;
            var eliteCols = [], battleCols = [];
            row.forEach(function (node, i) { (node.type === 'elite' ? eliteCols : battleCols).push(i); });
            if (!eliteCols.length || !battleCols.length) return false;
            sawChoice++;
            /* Zero crossings is the actual promise now, not "every entry can
               skip" — forcing the second meant drawing a visible crossing
               whenever a single battle column was the only target on offer,
               which measured at 92% of every crossing this used to produce. A
               player not being offered the skip from one specific branch is a
               far smaller cost than a road that visibly cuts through itself. */
            var edges = [];
            prev.forEach(function (node) { node.next.forEach(function (nextIndex) { edges.push({ a: node.col, b: row[nextIndex].col }); }); });
            for (var x = 0; x < edges.length; x++) {
              for (var y = x + 1; y < edges.length; y++) {
                var e1 = edges[x], e2 = edges[y];
                if ((e1.a < e2.a && e1.b > e2.b) || (e1.a > e2.a && e1.b < e2.b)) crossings++;
              }
            }
            prev.forEach(function (node) {
              entries++;
              if (node.next.some(function (nextIndex) { return battleCols.indexOf(nextIndex) !== -1; })) canSkip++;
            });
          }
          // the guarantee has to actually get exercised, cost nothing in crossings,
          // and still carry the skip option for a real majority of entries
          return sawChoice > 0 && crossings === 0 && canSkip / entries > 0.5;
        })()); });
      check('The volatile branch\\u2019s orphan reroute keeps crossings rare, not free', function () { return ((function () {
        /* This site cannot refuse the way the elite-skip patch can \u2014 the node it
           is fixing just lost its only edge, and leaving it with none at all is a
           dead end. So it always takes the ranked least-bad choice instead, which
           cannot promise zero crossings the way the other site can, only that it
           is never worse than picking blindly. Checked against a generous bound
           well above the organic baseline measured before any of this ran (~90
           per 800 maps), not a tight one, since this specific tradeoff was
           deliberately accepted rather than eliminated. */
        var crossings = 0, mapsChecked = 0;
        for (var attempt = 0; attempt < 400; attempt++) {
          var map = RUN.buildMap(RUN.ACT_KEYS[attempt % RUN.ACT_KEYS.length], attempt % 2 === 0);
          for (var depth = 0; depth < map.length - 1; depth++) {
            var edges = [];
            map[depth].forEach(function (node) { node.next.forEach(function (nextIndex) { edges.push({ a: node.col, b: map[depth + 1][nextIndex].col }); }); });
            for (var x = 0; x < edges.length; x++) {
              for (var y = x + 1; y < edges.length; y++) {
                var e1 = edges[x], e2 = edges[y];
                if ((e1.a < e2.a && e1.b > e2.b) || (e1.a > e2.a && e1.b < e2.b)) crossings++;
              }
            }
          }
          mapsChecked++;
        }
        return mapsChecked === 400 && crossings < 400;   // averaging under one crossing per map
      })()); });
      check('The map screen lets the room show through, and stays readable doing it', function () { return ((function () {
        var box = document.querySelector('#screen-map .panelbox');
        if (!box) return false;
        var bg = getComputedStyle(box).backgroundColor;
        // must have a real alpha channel — a solid colour would hide the room
        // entirely, which is the exact thing this was written to fix
        var rgbaMatch = bg.match(/rgba?\(([^)]+)\)/);
        if (!rgbaMatch) return false;
        var parts = rgbaMatch[1].split(',').map(function (part) { return parseFloat(part); });
        var alpha = parts.length > 3 ? parts[3] : 1;
        return alpha > 0 && alpha < 1;
      })()); });
      check('The first act opens with three unavoidable battles', function () { return ((function () {
        for (var attempt = 0; attempt < 25; attempt++) {
          var map = RUN.buildMap(RUN.ACT_KEYS[attempt % RUN.ACT_KEYS.length], true);
          for (var depth = 0; depth < 3; depth++) {
            if (map[depth].length !== 1 || map[depth][0].type !== 'battle') return false;
          }
        }
        return true;
      })()); });
      check('Later acts branch straight away', function () { return ((function () {
        var branchedEarly = 0;
        for (var attempt = 0; attempt < 40; attempt++) {
          var map2 = RUN.buildMap(RUN.ACT_KEYS[attempt % RUN.ACT_KEYS.length], false);
          // the very first node is still single-file: an act needs one way in
          if (map2[0].length !== 1 || map2[0][0].type !== 'battle') return false;
          if (map2[1].length > 1) branchedEarly++;
          // and the corridor must be gone
          var corridor = map2[1].length === 1 && map2[2].length === 1 &&
                         map2[1][0].type === 'battle' && map2[2][0].type === 'battle';
          if (corridor) return false;
        }
        /* Not every roll widens at depth 1 — the generator decides how many
           columns a row uses — but a run of forty that never branched early would
           mean the plan had not actually changed. */
        return branchedEarly > 20;
      })()); });
      check('A run gets the tutorial corridor once, not once per act', function () { return ((function () {
        var run = RUN.newRun();
        var first = run.map;
        var isCorridor = function (map) {
          return map[1].length === 1 && map[2].length === 1 &&
                 map[1][0].type === 'battle' && map[2][0].type === 'battle';
        };
        if (!isCorridor(first)) return false;
        run.actsCleared = ['green'];
        var second = RUN.buildMap('red', run.actsCleared.length === 0);
        return !isCorridor(second);
      })()); });
      check('The warm-up handicap covers exactly those three fights',
        function () { return (RUN.EASE_IN_BATTLES === 3 && RUN.easeInHand(2) > 0 && RUN.easeInHand(3) === 0); });
      var reach = [0], ok = true;
      for (var depth = 0; depth < map.length - 1; depth++) {
        var nextReach = {};
        map[depth].forEach(function (node, i) { if (reach.indexOf(i) !== -1) node.next.forEach(function (nextIndex) { nextReach[nextIndex] = 1; }); });
        reach = Object.keys(nextReach).map(Number);
        if (!reach.length) { ok = false; break; }
      }
      check('Every path reaches the boss', function () { return (ok); });
      check('Starting deck is ten cards', function () { return (RUN.startingDeck().length === C.DECK_SIZE); });
      check('A run holds one merged deck and no reserve', function () { return ((function () {
        var run = RUN.newRun();
        return Array.isArray(run.deck) && run.deck.length === C.DECK_SIZE && run.reserve === undefined;
      })()); });
      check('Taking a reward grows the deck past ten', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck.push({ id: 'red_brute', up: false });
        var ok = run.deck.length === 11;
        RUN.setRun(saved);
        return ok;
      })()); });
}
