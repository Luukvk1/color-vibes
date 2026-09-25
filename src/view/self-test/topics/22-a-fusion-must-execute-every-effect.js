/* a fusion must execute every effect its text describes */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var first, second, ev, map, ok;

  // --- a fusion must execute every effect its text describes ---
      check('Fusing two onPlay effects keeps both, not just the first', function () { return ((function () {
        var fused = C.fuseCards({ id: 'blue_scout', up: false }, { id: 'black_maw', up: false });
        var cardDef = CARDS[fused.id];
        /* The old composition kept exactly one "acting" carrier and threw the
           rest away, while the fused text — built independently — already
           listed every source's line. So a fusion could describe an effect in
           its own text and simply never run it. */
        return cardDef.text.indexOf('draw a card') !== -1 &&
               cardDef.text.indexOf('frontline') !== -1 &&
               typeof cardDef.onPlay === 'function';
      })()); });
      check('Both halves of a fused onPlay actually execute', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'top', 'row1', 0, 'red_brute', 9);
        var fused = C.fuseCards({ id: 'blue_scout', up: false }, { id: 'black_maw', up: false });
        battleState2.decks = { bottom: [C.makeCard('red_brute')], top: [] };
        var deckBefore = battleState2.decks.bottom.length;
        var api = RUN.buildApi(battleState2, PLAYER, []);
        CARDS[fused.id].onPlay(battleState2, PLAYER, { row: 'row2', index: 0 }, [], api);
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
        return battleState2.decks.bottom.length < deckBefore &&                          // the draw ran
               ev.strengthOf(ev.view['top-row1-0']) < 9;                       // the damage ran
      })()); });
      check('A fusion of two targeted effects prompts for, and uses, both targets', function () { return ((function () {
        var fused = C.fuseCards({ id: 'black_reclaimer', up: false }, { id: 'blue_current', up: false });
        var specs = CARDS[fused.id].targets;
        // 1 (curse) + 2 (unit, empty-tile) = 3 prompts, not one card's worth
        return specs && specs.length === 3;
      })()); });
      check('A merged ref points at the right pick, not wherever it used to point', function () { return ((function () {
        /* blue_current's second spec says "an empty tile touching the unit from
           MY step 0". Concatenating raw target arrays leaves that index pointing
           at whichever carrier happened to land in that slot globally — put a
           one-target card ahead of it and step 0 becomes someone else's pick. */
        var fused = C.fuseCards({ id: 'black_reclaimer', up: false }, { id: 'blue_current', up: false });
        var specs = CARDS[fused.id].targets;
        return specs[0].ref === undefined && specs[1].ref === undefined && specs[2].ref === 1;
      })()); });
      check('A three-way merged pick resolves both effects on the right targets', function () { return ((function () {
        var battleState2 = fresh();
        var fused = C.fuseCards({ id: 'black_reclaimer', up: false }, { id: 'blue_current', up: false });
        battleState2.board[PLAYER].row2[0] = { cardId: fused.id, color: CARDS[fused.id].color, strength: CARDS[fused.id].strength, temp: 0 };
        put(battleState2, 'bottom', 'row1', 0, 'curse_husk', 1); battleState2.board[PLAYER].row1[0].color = null;
        put(battleState2, 'bottom', 'row1', 2, 'red_scout', 3);
        var at = { row: 'row2', index: 0 };
        var specs = CARDS[fused.id].targets;
        var p0 = RUN.legalTargets(battleState2, PLAYER, specs[0], [], at)[0];
        var p1 = RUN.legalTargets(battleState2, PLAYER, specs[1], [p0], at).filter(function (o) {
          return o.row === 'row1' && o.index === 2;
        })[0];
        var p2 = RUN.legalTargets(battleState2, PLAYER, specs[2], [p0, p1], at)[0];
        if (!p0 || !p1 || !p2) return false;
        CARDS[fused.id].onPlay(battleState2, PLAYER, at, [p0, p1, p2], RUN.buildApi(battleState2, PLAYER, []));
        var curseGone = !battleState2.board[PLAYER].row1[0];
        var unitMoved = !battleState2.board[PLAYER].row1[2] && !!battleState2.board[PLAYER][p2.row][p2.index];
        return curseGone && unitMoved;
      })()); });

      check('Every act carries a Lab that no route can dodge', function () { return ((function () {
        for (var attempt = 0; attempt < 40; attempt++) {
          var map = RUN.buildMap(RUN.ACT_KEYS[attempt % RUN.ACT_KEYS.length]);
          // depth 6 must be solid lab: with rewards colour-gated it is the only
          // place a new colour can be made, so a skippable one can strand a run
          if (!map[6].length || !map[6].every(function (node) { return node.type === 'lab'; })) return false;
        }
        return true;
      })()); });
      check('Every act has an elite and a boss wearing its own colour', function () { return ((function () {
        return RUN.ACT_KEYS.every(function (key) {
          var a = RUN.ACTS[key], bo = ENEMIES[a.boss];
          if (!bo || bo.kind !== 'boss') return false;
          var elitesOk = RUN.elitesOf(a).every(function (id) {
            var e = ENEMIES[id];
            return e && e.kind === 'elite' && e.colors[0] === a.color;
          });
          /* The Spectrum is the exception by design: the final boss wears every
             colour at once, so it leads with Red rather than its act's Black. */
          return elitesOk && (bo.colors[0] === a.color || a.boss === 'spectrum');
        });
      })()); });
      check('Every act has a painting with its own measured seam', function () { return ((function () {
        return RUN.ACT_KEYS.every(function (key) {
          var art = RUN.ACT_ART[key];
          if (!art || !art.w || !art.h) return false;
          // the eyes must sit in the upper half or the aligner has nothing to pin
          return art.seam > 0.05 && art.seam < 0.5;
        });
      })()); });
      check('Every act elite is 2 stronger in its own colour', function () { return ((function () {
        return RUN.ACT_KEYS.every(function (key) {
          var a = RUN.ACTS[key];
          return RUN.elitesOf(a).every(function (id) {
            return ENEMIES[id].mod.colorBonus[a.color] === 2;
          });
        });
      })()); });
      check('A map only fields its own act\'s enemies', function () { return ((function () {
        return RUN.ACT_KEYS.every(function (key) {
          var map = RUN.buildMap(key), act = RUN.ACTS[key], ok = true;
          map.forEach(function (row) {
            row.forEach(function (node) {
              if (!node.enemy) return;
              if (node.type === 'battle' && act.normals.indexOf(node.enemy) === -1) ok = false;
              if (node.type === 'elite' && RUN.elitesOf(act).indexOf(node.enemy) === -1) ok = false;
              if (node.type === 'boss' && node.enemy !== act.boss) ok = false;
            });
          });
          return ok;
        });
      })()); });
      check('Difficulty carries across acts instead of resetting', function () { return ((function () {
        var run = { actsCleared: [] };
        var actOneEnd = RUN.powerAt(run, 12);
        run.actsCleared = ['green'];
        var actTwoStart = RUN.powerAt(run, 0);
        // an act-two opener must not be softer than an act-one finale
        return actTwoStart > actOneEnd - 1 &&
               RUN.depthBonusFor(actTwoStart) >= RUN.depthBonusFor(6) &&
               RUN.depthBonusFor(30) > RUN.depthBonusFor(12);
      })()); });
      check('The first act is always a primary that is actually built', function () { return ((function () {
        for (var t = 0; t < 30; t++) {
          var run = RUN.newRun();
          if (!RUN.ACTS[run.act]) return false;
          if (C.PRIMARY_COLORS.indexOf(RUN.ACTS[run.act].color) === -1) return false;
          if (run.actsCleared.length !== 0) return false;
        }
        return true;
      })()); });
      check('A cleared act is never offered again', function () { return ((function () {
        var run = RUN.newRun();
        run.actsCleared = RUN.ACT_KEYS.slice();
        return RUN.eligibleActs(run).length === 0;
      })()); });
      check('Secondary acts stay shut until their colour is made', function () { return ((function () {
        var run = RUN.newRun();
        run.deck = RUN.startingDeck();
        run.actsCleared = ['green'];
        var open = RUN.eligibleActs(run);
        if (open.indexOf('yellow') !== -1 || open.indexOf('magenta') !== -1) return false;
        if (open.indexOf('red') === -1 || open.indexOf('blue') === -1) return false;
        run.deck.push({ id: 'yellow_spark', up: false });
        run.deck.push({ id: 'yellow_banner', up: false });
        return RUN.eligibleActs(run).indexOf('yellow') !== -1;
      })()); });
}
