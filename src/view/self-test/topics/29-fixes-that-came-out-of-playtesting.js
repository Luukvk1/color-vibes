/* fixes that came out of playtesting */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var ev, map;

  // --- fixes that came out of playtesting ---
      check('The opening hand does not count as cards dug for', function () { return ((function () {
        var battleState2 = fresh();
        battleState2.drawn = { extra: 0 };
        battleState2.decks = { bottom: [], top: [] };
        for (var i = 0; i < 12; i++) battleState2.decks[PLAYER].push({ id: 'red_brute', up: false });
        battleState2.hands = { bottom: [], top: [] };
        RUN.drawInto(battleState2, PLAYER, 6, true);          // the opening deal
        if (battleState2.drawn.extra !== 0) return false;     // Tideline must start at zero
        RUN.drawInto(battleState2, PLAYER, 2);                // a normal round draw
        return battleState2.drawn.extra === 2;
      })()); });
      check('Draws off an empty deck are not counted', function () { return ((function () {
        var battleState2 = fresh();
        battleState2.drawn = { extra: 0 };
        battleState2.decks = { bottom: [{ id: 'red_brute', up: false }], top: [] };
        battleState2.hands = { bottom: [], top: [] };
        var got = RUN.drawInto(battleState2, PLAYER, 5);      // asked for five, only one there
        return got === 1 && battleState2.drawn.extra === 1;
      })()); });
      check('Damage lands in full on what the player can see', function () { return ((function () {
        var battleState2 = fresh();
        // printed 2, but carrying 6 of evaluation bonus: shows as 8
        put(battleState2, 'top', 'row1', 0, 'red_brute', 2);
        battleState2.enemyMod = { depthBonus: 3, colorBonus: { red: 3 } };
        var ev0 = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
        var before = ev0.strengthOf(ev0.view['top-row1-0']);
        if (before !== 8) return false;
        RUN.buildApi(battleState2, PLAYER, []).damage(ENEMY, 'row1', 0, 3);
        var ev1 = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
        // used to drop by 1, because 3 came off the printed 2 and clamped
        return before - ev1.strengthOf(ev1.view['top-row1-0']) === 3;
      })()); });
      check('Damage never pushes a unit below 1', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'top', 'row1', 0, 'red_brute', 2);
        RUN.buildApi(battleState2, PLAYER, []).damage(ENEMY, 'row1', 0, 9);
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
        return ev.strengthOf(ev.view['top-row1-0']) === 1;
      })()); });
      check('Every curse is worth the same on the board', function () { return ((function () {
        var vals = C.CURSE_KEYS.map(function (key) { return CARDS[key].strength; });
        return vals.every(function (v) { return v === vals[0]; }) && vals[0] >= 1;
      })()); });
      check('A curse never grows with the enemy', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'top', 'row1', 0, 'curse_husk', C.CARDS.curse_husk.strength);
        battleState2.board[ENEMY].row1[0].color = null;
        var plain = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: {} });
        var deep = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { depthBonus: 5 } });
        return plain.strengthOf(plain.view['top-row1-0']) === deep.strengthOf(deep.view['top-row1-0']);
      })()); });
      check('Fissure cards stay out of the pool until a fissure exists', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck();
        C.COLOR_KEYS.forEach(function (c) { run.deck.push({ id: 'black_voidling', up: false }); });
        run.deck.push({ id: 'cyan_shield', up: false });   // gives the pool cyan and black
        run.fissures = [];
        var dry = RUN.NEEDS_FISSURES.every(function (key) { return !RUN.situationalOk(key); });
        run.fissures = [{ side: PLAYER, a: { row: 'row1', index: 0 }, b: { row: 'row1', index: 1 } }];
        var wet = RUN.NEEDS_FISSURES.every(function (key) { return RUN.situationalOk(key); });
        var pool = RUN.offerableCards();
        RUN.setRun(saved);
        return dry && wet && pool.indexOf('black_chorus') !== -1;
      })()); });
      check('A blank card is never the offer', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck();
        run.fissures = []; run.depth = 0; run.actsCleared = [];
        var pool = RUN.offerableCards();
        var blanks = pool.filter(function (key) { return RUN.NEEDS_FISSURES.indexOf(key) !== -1; });
        RUN.setRun(saved);
        return blanks.length === 0;
      })()); });
}
