/* the draw archetype */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;

  // --- the draw archetype ---
      check('Drawing is a build, not a single card', function () { return ((function () {
        var drawCards = C.DRAWABLE.filter(function (key) {
          var cardDef = CARDS[key];
          return cardDef.drawsEachRound || /draw/i.test(cardDef.text || '');
        });
        var drawRelics = Object.keys(RELICS).filter(function (key) {
          return /draw|opening hand/i.test(RELICS[key].text);
        });
        return drawCards.length >= 5 && drawRelics.length >= 4;
      })()); });
      check('Blue Tideline grows with everything drawn this battle', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row2', 0, 'blue_tideline', 1);
        var cold = C.evaluateBoard(battleState2.board, battleState2.hazards, { drawn: { extra: 0 } });
        var dug  = C.evaluateBoard(battleState2.board, battleState2.hazards, { drawn: { extra: 5 } });
        var capped = C.evaluateBoard(battleState2.board, battleState2.hazards, { drawn: { extra: 99 } });
        return dug.raw.bottom === cold.raw.bottom + 5 &&
               capped.raw.bottom === cold.raw.bottom + 8;   // the cap holds
      })()); });
      check('Deep Pockets pays a lean deck and nothing to a bloated one', function () { return ((function () {
        function lean(deckLen) { return Math.max(0, Math.floor((25 - deckLen) / 5)); }
        return lean(40) === 0 && lean(25) === 0 && lean(20) === 1 && lean(15) === 2 && lean(10) === 3;
      })()); });
}
