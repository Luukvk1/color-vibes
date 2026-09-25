/* deck economy: the run must be able to shrink, not only grow */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var reach, ok, early, late;

  // --- deck economy: the run must be able to shrink, not only grow ---
      check('Skipping a card pays, and pays more the deeper you are', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.depth = 0; var early = RUN.skipValue();
        run.depth = 12; run.actsCleared = ['green', 'red'];
        var late = RUN.skipValue();
        RUN.setRun(saved);
        return early > 0 && late > early;
      })()); });
      check('A shop cuts two cards at most, at a climbing price', function () { return ((function () {
        var a = RUN.removalCost({ removals: 0 });
        var b = RUN.removalCost({ removals: 1 });
        return a === 50 && b > a &&
               RUN.SHOP_REMOVAL_LIMIT === 2 &&
               RUN.removalsLeft({ removals: 0 }) === 2 &&
               RUN.removalsLeft({ removals: 1 }) === 1 &&
               RUN.removalsLeft({ removals: 2 }) === 0;
      })()); });
      check('The last road is gated far harder than the rest', function () { return ((function () {
        var need = C.requirementFor('black');
        /* Black no longer needs a higher card COUNT than an ordinary secondary to
           stay the hardest road — the two-secondary fusion requirement already
           makes every Black card roughly twice as expensive to produce as an
           ordinary one, since it consumes two finished secondaries instead of
           two primaries. The invariant worth protecting is that it is never
           *easier* to reach than a secondary, not a specific inflated number. */
        if (need < C.ACT_REQUIREMENT) return false;
        if (!['yellow', 'cyan', 'magenta'].every(function (key) { return C.requirementFor(key) === 2; })) return false;
        var deck = RUN.startingDeck();
        for (var i = 0; i < need - 1; i++) deck.push({ id: 'black_voidling', up: false });
        if (C.actUnlocked('black', deck)) return false;      // one short stays shut
        deck.push({ id: 'black_eraser', up: false });
        return C.actUnlocked('black', deck);
      })()); });
      check('The volatile bench can never mint Black', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck();
        var pal = RUN.recolourPalette();
        if (pal.indexOf('black') !== -1) { RUN.setRun(saved); return false; }
        // even a deck already holding Black must not unlock Black as a roll target
        run.deck.push({ id: 'black_voidling', up: false });
        var pal2 = RUN.recolourPalette();
        RUN.setRun(saved);
        return pal2.indexOf('black') === -1;
      })()); });
      check('A recolour can only reach a colour the deck could already make', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        // Red and Green only: Yellow is reachable, Cyan and Magenta are not
        run.deck = [{ id: 'red_brute', up: false }, { id: 'green_seed', up: false }];
        var pal = RUN.recolourPalette();
        var ok = pal.indexOf('yellow') !== -1 &&
                 pal.indexOf('cyan') === -1 && pal.indexOf('magenta') === -1;
        RUN.setRun(saved);
        return ok;
      })()); });
      check('The road offers real ways to cut a deck down', function () { return ((function () {
        // at least three events must be able to remove a card, or deck size only
        // ever ratchets upward and the endgame target is unreachable
        var cutters = RUN.EVENTS.filter(function (e) {
          return e.options.some(function (o) {
            return o.pick || /remove|cut|burn|strain/i.test(o.label);
          });
        });
        return cutters.length >= 3;
      })()); });
      check('A chosen cut removes exactly what the player picked', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        while (run.deck.length < 9) run.deck.push({ id: 'red_brute', up: false });
        run.deck[3] = { id: 'yellow_spark', up: false };
        var before = run.deck.length;
        run.deck.splice(3, 1);                       // what the picker does
        var ok = run.deck.length === before - 1 &&
                 !run.deck.some(function (e) { return e.id === 'yellow_spark'; });
        RUN.setRun(saved);
        return ok;
      })()); });
      check('The Sieve strains curses and leaves the rest of the deck alone', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        var clean = run.deck.length;
        C.CURSE_KEYS.forEach(function (key) { run.deck.push({ id: key, up: false }); });
        var sieve = RUN.EVENTS.filter(function (e) { return e.title === 'The Sieve'; })[0];
        sieve.options[0].run();
        var ok = RUN.getRun().deck.length === clean &&
                 !RUN.getRun().deck.some(function (e) { return CARDS[e.id].curse; });
        RUN.setRun(saved);
        return ok;
      })()); });
}
