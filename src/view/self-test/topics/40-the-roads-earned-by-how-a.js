/* the roads earned by how a run was lived */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;

  // --- the roads earned by how a run was lived ---
      check('Rot and Rift open on what the run did, not what it covered', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck(); run.fissures = [];
        var noneYet = !RUN.rotUnlocked(run) && !RUN.riftUnlocked(run);
        for (var i = 0; i < RUN.ROT_THRESHOLD; i++) run.deck.push({ id: C.CURSE_KEYS[0], up: false });
        var rotOpen = RUN.rotUnlocked(run);
        for (var j = 0; j < RUN.RIFT_THRESHOLD; j++) {
          run.fissures.push({ kind: 'sever', side: PLAYER, a: { row: 'row1', index: j },
                            b: { row: 'row2', index: 0 }, power: 1 });
        }
        var riftOpen = RUN.riftUnlocked(run);
        RUN.setRun(saved);
        return noneYet && rotOpen && riftOpen;
      })()); });
      check('A run that did all three hard things is offered all three roads', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.actsCleared = RUN.ACT_KEYS.slice();          // the whole wheel
        run.deck = RUN.startingDeck();
        for (var i = 0; i < RUN.ROT_THRESHOLD; i++) run.deck.push({ id: C.CURSE_KEYS[0], up: false });
        run.fissures = [];
        for (var j = 0; j < RUN.RIFT_THRESHOLD; j++) {
          run.fissures.push({ kind: 'sever', side: PLAYER, a: { row: 'row1', index: j },
                            b: { row: 'row2', index: 0 }, power: 1 });
        }
        var offers = RUN.secretOffers(run);
        RUN.setRun(saved);
        // three separate hard things, three separate doors — not a choice of one
        return offers.length === 3 &&
               offers.indexOf('white') !== -1 && offers.indexOf('rot') !== -1 &&
               offers.indexOf('rift') !== -1;
      })()); });
      check('The rot road fields curse decks whatever the player is carrying', function () { return ((function () {
        var clean = 0;
        for (var i = 0; i < 30; i++) {
          var deck = C.buildEnemyDeck(ENEMIES.cultist, 40, Math.random, 0, 0, RUN.ACTS.rot);
          if (deck.some(function (c) { return CARDS[c.id].curse; })) clean++;
        }
        var elsewhere = 0;
        for (var j = 0; j < 30; j++) {
          var deck = C.buildEnemyDeck(ENEMIES.cultist, 40, Math.random, 0, 0, RUN.ACTS.red);
          if (deck.some(function (c) { return CARDS[c.id].curse; })) elsewhere++;
        }
        // its identity, not a reaction to the player
        return clean === 30 && elsewhere === 0;
      })()); });
      check('The rift road breaks the enemy\\u2019s ground too', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.fissures = [];
        RUN.beginAct('rift');
        var fissures = RUN.getRun().fissures;
        var mine = fissures.filter(function (x) { return x.side === PLAYER; }).length;
        var theirs = fissures.filter(function (x) { return x.side === ENEMY; }).length;
        RUN.setRun(saved);
        // a shared condition, not a one-sided punishment
        return mine > 0 && theirs > 0;
      })()); });
      check('Every secret boss carries a rule of its own', function () { return ((function () {
        return RUN.SECRET_ACT_KEYS.every(function (key) {
          var bossKey = RUN.ACTS[key].boss, e = ENEMIES[bossKey];
          if (!e || e.kind !== 'boss') return false;
          return C.enemyIcons(bossKey).length > 0 && (e.behaviour || '').length > 40;
        });
      })()); });
}
