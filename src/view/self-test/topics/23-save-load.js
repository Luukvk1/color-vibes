/* save / load */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var map, ok;

  // --- save / load ---
      check('A run survives a save and reload, forged cards included', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.clearSave();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        // mint the three things only the Lab can make, stacked on each other
        run.deck[0] = RUN.liftStrength(run.deck[0], 2);
        run.deck[1] = RUN.recolourCard(run.deck[1], 'magenta');
        var fused = RUN.fuseInDeck(run.deck[2], run.deck[3]);
        run.deck.splice(3, 1); run.deck.splice(2, 1); run.deck.push(fused);
        run.deck[0] = RUN.liftStrength(run.deck[0], 1);       // a lift built on a lift
        run.gold = 137; run.actsCleared = ['green']; run.act = 'red';
        var wantIds = run.deck.map(function (e) { return e.id; });
        var wantStr = run.deck.map(function (e) { return CARDS[e.id].strength; });
        var wantCol = run.deck.map(function (e) { return CARDS[e.id].color; });
        RUN.saveRun();

        // wipe every minted definition, as a page reload would
        wantIds.forEach(function (id) { if (/^(lifted|fusion)_/.test(id)) delete CARDS[id]; });

        var back = RUN.loadRun();
        var ok = !!back && back.gold === 137 && back.act === 'red' &&
          back.actsCleared.length === 1 &&
          back.deck.length === wantIds.length &&
          back.deck.every(function (e, i) {
            return e.id === wantIds[i] && CARDS[e.id] &&
                   CARDS[e.id].strength === wantStr[i] && CARDS[e.id].color === wantCol[i];
          });
        RUN.clearSave();
        RUN.setRun(saved);
        return ok;
      })()); });
      check('A corrupt or foreign save is refused rather than half-loaded', function () { return ((function () {
        var out = true;
        try {
          window.localStorage.setItem(RUN.saveKey(), '{not json');
          if (RUN.loadRun() !== null) out = false;
          window.localStorage.setItem(RUN.saveKey(), JSON.stringify({ v: 99, run: {} }));
          if (RUN.loadRun() !== null) out = false;
          window.localStorage.setItem(RUN.saveKey(),
            JSON.stringify({ v: 1, run: { act: 'green', map: [[{}]], deck: [{ id: 'ghost_card' }], minted: [] } }));
          if (RUN.loadRun() !== null) out = false;   // deck points at a card that does not exist
        } catch (e) { out = false; }
        RUN.clearSave();
        return out;
      })()); });
      check('Reinforcing a fusion keeps everything it inherited', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var fused = RUN.fuseInDeck({ id: 'red_scout', up: false }, { id: 'blue_scout', up: false });
        var lifted = RUN.liftStrength(fused, 2);
        /* The old field-list copy dropped flags; Object.assign keeps them, and now
           there is an inherited effect list riding along that must survive too. */
        var ok = CARDS[lifted.id].fused === true &&
                 CARDS[lifted.id].strength === CARDS[fused.id].strength + 2 &&
                 (CARDS[lifted.id].effectSources || []).length === (CARDS[fused.id].effectSources || []).length;
        RUN.setRun(saved);
        return ok;
      })()); });
}
