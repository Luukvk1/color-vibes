/* a numeric mix hook must survive fusion as a number, not a function */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var left;

  // --- a numeric mix hook must survive fusion as a number, not a function ---
      check('A fused card\\u2019s onMixConsumed/onMixConsumedChain stay numeric', function () { return ((function () {
        var f1 = C.fuseCards({ id: 'black_voidling', up: false }, { id: 'red_scout', up: false });
        var f2 = C.fuseCards({ id: 'black_singularity', up: false }, { id: 'red_scout', up: false });
        return typeof CARDS[f1.id].onMixConsumed === 'number' &&
               typeof CARDS[f2.id].onMixConsumedChain === 'number';
      })()); });
      check('Mixing a fused onMixConsumed card produces a real number, not NaN or a string', function () { return ((function () {
        /* This is the exact corruption a player hit: onMixConsumed/onMixConsumedChain
           are plain numbers on their home cards, but every hook in the generic
           inherited list used to be composed as a callable function regardless.
           A fused card's onMixConsumed became a function object; applyMix's
           `bonus += d.onMixConsumed` then added a function to a number, which
           JS coerces through the function's own source-code string rather than
           throwing — turning the mix result into a string that looked fine until
           the next subtraction (any hazard, any damage) turned it into NaN. */
        var battleState2 = fresh();
        var fused = C.fuseCards({ id: 'black_voidling', up: false }, { id: 'red_scout', up: false });
        battleState2.board[PLAYER].row1[0] = { cardId: fused.id, color: CARDS[fused.id].color, strength: CARDS[fused.id].strength, temp: 0 };
        put(battleState2, 'bottom', 'row2', 0, 'red_brute', 2);
        var out = RUN.applyMix(battleState2, PLAYER, { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
        var afterDamage = Math.max(1, battleState2.board[PLAYER].row1[0].strength - 2);
        return typeof out.strength === 'number' && !isNaN(out.strength) &&
               typeof battleState2.board[PLAYER].row1[0].strength === 'number' &&
               !isNaN(afterDamage);
      })()); });
      check('Every inherited hook is consistently one type across every card that carries it', function () { return ((function () {
        /* The actual gap: a NUMBER_HOOKS registry already existed for exactly
           this failure mode, and two hooks were simply left off it. This checks
           the registry against reality instead of trusting it stays complete —
           if any hook is ever added or reclassified wrong, this catches the
           type split before a fusion ever ships it to a player. */
        var HOOKS = ['passive', 'aura', 'rowAura', 'enemyAura', 'matchup', 'onMixConsumed',
                     'onMixConsumedChain', 'onFriendlyMix', 'fissure', 'mixBonus',
                     'guardsColour', 'drawsEachRound', 'swarmAura'];
        return HOOKS.every(function (h) {
          var types = {};
          C.DRAWABLE.concat(C.BOSS_CARDS).forEach(function (key) {
            var v = CARDS[key][h];
            if (v !== undefined) types[typeof v] = 1;
          });
          return Object.keys(types).length <= 1;
        });
      })()); });
}
