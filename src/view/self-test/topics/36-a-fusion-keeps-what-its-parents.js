/* a fusion keeps what its parents were */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var ev, ok, late;

  // --- a fusion keeps what its parents were ---
      check('A fusion inherits what its parents were, instead of erasing it', function () { return ((function () {
        var fused = C.fuseCards({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
        var cardDef = CARDS[fused.id];
        return cardDef.effectSources.length === 2 &&
               cardDef.effectSources.indexOf('red_scout') !== -1 &&
               cardDef.effectSources.indexOf('green_gardener') !== -1 &&
               !cardDef.silenced && !!cardDef.passive && !!cardDef.aura;
      })()); });
      check('An inherited aura actually fires on the board', function () { return ((function () {
        var fused = C.fuseCards({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
        var battleState2 = fresh();
        battleState2.board[PLAYER].row2[0] = { cardId: fused.id, color: CARDS[fused.id].color,
          strength: CARDS[fused.id].strength, temp: 0 };
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 2);
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        // the Gardener's +1 to touching units came along with the fusion
        return ev.strengthOf(ev.view['bottom-row1-0']) === 3;
      })()); });
      check('A fusion chain never carries more than three rules', function () { return ((function () {
        var fused = C.fuseCards({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
        ['yellow_banner', 'green_titan', 'red_scout', 'cyan_shield'].forEach(function (key) {
          fused = C.fuseCards(fused, { id: key, up: false });
        });
        return CARDS[fused.id].effectSources.length === C.FUSED_EFFECT_CAP;
      })()); });
      check('Past the cap, a rule is genuinely lost rather than merged away', function () { return ((function () {
        /* Which rule goes is random, and the incoming one is as droppable as any
           other — that is what makes a late fusion a trade rather than a free
           stack. So the invariant is the shape, not the survival of any
           particular effect: still exactly three, all of them drawn from the two
           parents, and something that was there before is now gone. */
        for (var t = 0; t < 25; t++) {
          var fused = C.fuseCards({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
          fused = C.fuseCards(fused, { id: 'yellow_banner', up: false });
          var beforeSet = CARDS[fused.id].effectSources.slice();
          var union = beforeSet.concat(['green_titan']);
          fused = C.fuseCards(fused, { id: 'green_titan', up: false });
          var afterSet = CARDS[fused.id].effectSources;
          if (afterSet.length !== C.FUSED_EFFECT_CAP) return false;
          if (!afterSet.every(function (key) { return union.indexOf(key) !== -1; })) return false;
          if (!union.some(function (key) { return afterSet.indexOf(key) === -1; })) return false;
        }
        return true;
      })()); });
      check('A fusion survives a save with the exact rules it was holding', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.clearSave();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        var fused = RUN.fuseInDeck({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
        fused = RUN.fuseInDeck(fused, { id: 'yellow_banner', up: false });
        fused = RUN.fuseInDeck(fused, { id: 'green_titan', up: false });   // forces a random drop
        run.deck.push(fused);
        var wantId = fused.id, wantEff = CARDS[fused.id].effectSources.slice();
        RUN.saveRun();
        delete CARDS[wantId];                       // as a page reload would
        var back = RUN.loadRun();
        var got = back && CARDS[wantId] && CARDS[wantId].effectSources;
        var ok = !!got && got.length === wantEff.length &&
                 got.every(function (key, i) { return key === wantEff[i]; });
        RUN.clearSave();
        RUN.setRun(saved);
        return ok;
      })()); });
}
