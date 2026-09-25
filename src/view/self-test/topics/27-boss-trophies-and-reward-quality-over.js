/* boss trophies and reward quality over a run */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var map, ok, early, late;

  // --- boss trophies and reward quality over a run ---
      check('Legendaries exist only as boss drops, never in a random pool', function () { return ((function () {
        if (C.BOSS_CARDS.length < 7) return false;
        if (C.DRAWABLE.some(function (key) { return CARDS[key].bossOnly; })) return false;
        // one for every act colour, so each road has a signature card
        return RUN.ACT_KEYS.every(function (key) {
          var col = RUN.ACTS[key].color;
          return C.BOSS_CARDS.some(function (c) { return CARDS[c].color === col; });
        });
      })()); });
      check('The Devouring Star hits hard but cannot compound across battles', function () { return ((function () {
        /* The run-ending bug: the gain was permanent, and a permanent buff writes
           back into the run deck, so every battle started where the last one
           ended and two Stars could eat each other indefinitely. Measured
           growth was 10, 25, 55, 115, 235, 475, 955, 3835 — roughly doubling per
           feed, with no ceiling, which is how a run reached five figures.

           Both halves matter here: it must still be enormous on the board (the
           hardest card in the game to earn should feel like it), and it must
           leave the printed card alone so nothing carries forward. */
        var battleState2 = fresh();
        battleState2.board[PLAYER].row2[0] = { cardId: 'black_devouring_star', color: 'black',
                                     strength: 5, temp: 0, deckIndex: 0 };
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 20);
        var at = { row: 'row2', index: 0 };
        var targets = RUN.legalTargets(battleState2, PLAYER, CARDS.black_devouring_star.targets[0], [], at);
        CARDS.black_devouring_star.onPlay(battleState2, PLAYER, at, targets, RUN.buildApi(battleState2, PLAYER, []));
        var unit = battleState2.board[PLAYER].row2[0];
        var total = unit.strength + (unit.temp || 0);
        // twice a 20 is still a 45-strength unit for the fight
        return total === 45 && unit.strength === 5 && (unit.temp || 0) === 40;
      })()); });
      check('Every trophy is big AND still does something', function () { return ((function () {
        return C.BOSS_CARDS.every(function (key) {
          var cardDef = CARDS[key];
          var hasText = !!(cardDef.passive || cardDef.aura || cardDef.rowAura || cardDef.matchup || cardDef.onPlay ||
                           cardDef.drawsEachRound || cardDef.guardsColour);
          // the whole point: unlike a fused Amalgam these are not silenced
          return cardDef.strength >= 4 && hasText && !cardDef.silenced && cardDef.rarity === 'Legendary';
        });
      })()); });
      check('A boss offers three trophies including its own colour', function () { return ((function () {
        var saved = RUN.getRun();
        var ok = true;
        RUN.ACT_KEYS.forEach(function (key) {
          RUN.setRun(RUN.newRun());
          var run = RUN.getRun();
          run.act = key;
          RUN.rollReward({ type: 'boss', depth: 12 });
          var reward = RUN.getRun().reward;
          if (!reward.trophy || reward.cards.length !== 3) { ok = false; return; }
          if (!reward.cards.every(function (c) { return CARDS[c.id].bossOnly; })) ok = false;
          if (!reward.cards.some(function (c) { return CARDS[c.id].color === RUN.ACTS[key].color; })) ok = false;
          var ids = reward.cards.map(function (c) { return c.id; });
          if (ids.length !== ids.filter(function (v, i) { return ids.indexOf(v) === i; }).length) ok = false;
        });
        RUN.setRun(saved);
        return ok;
      })()); });
      check('A normal battle never hands out a trophy', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var clean = true;
        for (var i = 0; i < 40; i++) {
          RUN.rollReward({ type: i % 2 ? 'battle' : 'elite', depth: 6 });
          var reward = RUN.getRun().reward;
          if (reward.trophy) clean = false;
          if (reward.cards.some(function (c) { return CARDS[c.id].bossOnly; })) clean = false;
        }
        RUN.setRun(saved);
        return clean;
      })()); });
      check('Card rewards get better the deeper the run goes', function () { return ((function () {
        var early = RUN.rarityWeights(1), late = RUN.rarityWeights(60);
        // rares must overtake commons by the late run, not merely creep up
        return late.Rare > early.Rare && late.Common < early.Common &&
               early.Common > early.Rare && late.Rare > late.Common;
      })()); });
}
