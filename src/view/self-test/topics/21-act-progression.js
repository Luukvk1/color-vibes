/* act progression (Act Progression doc, Option 1) */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var map, reach;

  // --- act progression (Act Progression doc, Option 1) ---
      check('Primaries are always reachable, secondaries never at the start', function () { return ((function () {
        var deck = RUN.startingDeck();
        return C.actUnlocked('red', deck) && C.actUnlocked('green', deck) && C.actUnlocked('blue', deck) &&
               !C.actUnlocked('yellow', deck) && !C.actUnlocked('magenta', deck) &&
               !C.actUnlocked('cyan', deck) && !C.actUnlocked('black', deck);
      })()); });
      check('A colour opens its act at exactly x = 2, not one card sooner', function () { return ((function () {
        var deck = RUN.startingDeck();
        deck.push({ id: 'yellow_spark', up: false });
        if (C.actUnlocked('yellow', deck)) return false;      // one is not enough
        deck.push({ id: 'yellow_banner', up: false });
        return C.actUnlocked('yellow', deck) && C.ACT_REQUIREMENT === 2;
      })()); });
      check('Curses are not a colour you earned', function () { return ((function () {
        var deck = RUN.startingDeck();
        var counts = C.colourCounts(deck.concat(C.CURSE_KEYS.map(function (key) { return { id: key, up: false }; })));
        var base = C.colourCounts(deck);
        return C.COLOR_KEYS.every(function (key) { return counts[key] === base[key]; });
      })()); });
      check('Rewards and shops only offer colours the deck already holds', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck();                          // red / blue / green + one hazard
        var pool = RUN.offerableCards();
        var leaks = pool.filter(function (cardId) {
          var col = CARDS[cardId].color;
          return col && ['red', 'blue', 'green'].indexOf(col) === -1;
        });
        var hasColourless = pool.some(function (cardId) { return !CARDS[cardId].color; });
        var hasHeld = pool.some(function (cardId) { return CARDS[cardId].color === 'red'; });
        RUN.setRun(saved);
        return leaks.length === 0 && hasColourless && hasHeld;
      })()); });
      check('Every node in every generated map is reachable from the start', function () { return ((function () {
        for (var attempt = 0; attempt < 60; attempt++) {
          var map = RUN.buildMap(RUN.ACT_KEYS[attempt % RUN.ACT_KEYS.length], attempt % 2 === 0);
          var reach = map.map(function (row) { return row.map(function () { return false; }); });
          reach[0][0] = true;
          for (var depth = 0; depth < map.length - 1; depth++) {
            map[depth].forEach(function (node, i) {
              if (!reach[depth][i]) return;
              (node.next || []).forEach(function (nextIndex) {
                if (map[depth + 1] && map[depth + 1][nextIndex]) reach[depth + 1][nextIndex] = true;
              });
            });
          }
          for (var depth2 = 0; depth2 < map.length; depth2++) {
            for (var i2 = 0; i2 < map[depth2].length; i2++) {
              /* A forced single-column row is the sole possible parent for every
                 column below it. The volatile gate used to overwrite that node's
                 .next down to a single entry unconditionally, which was fine
                 when its siblings had another parent and silently orphaned them
                 when it was their only one. */
              if (!reach[depth2][i2]) return false;
            }
          }
        }
        return true;
      })()); });
      check('The volatile gate still commits fully when nothing depends on it', function () { return ((function () {
        // the "one gate, no other exit" design must survive wherever it is safe —
        // the fix only has to add edges back where dropping them would orphan a
        // sibling, not abandon the single-entrance feel everywhere
        var sawSingle = false, sawKept = false;
        for (var attempt = 0; attempt < 200 && !(sawSingle && sawKept); attempt++) {
          var map = RUN.buildMap(RUN.ACT_KEYS[attempt % RUN.ACT_KEYS.length], attempt % 2 === 0);
          map.forEach(function (row, depth) {
            row.forEach(function (node) {
              if (node.type !== 'elite' || !map[depth + 1]) return;
              var leadsToVolatile = node.next.some(function (nextIndex) { return map[depth + 1][nextIndex] && map[depth + 1][nextIndex].type === 'volatile'; });
              if (!leadsToVolatile) return;
              if (node.next.length === 1) sawSingle = true; else sawKept = true;
            });
          });
        }
        return sawSingle && sawKept;
      })()); });
}
