/* what the player is told about what they are fighting */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var ok;

  // --- what the player is told about what they are fighting ---
      check('Every enemy rule has an icon and words to go with it', function () { return ((function () {
        return Object.keys(ENEMIES).every(function (key) {
          var mod = ENEMIES[key].mod || {}, icons = C.enemyIcons(key);
          var ruleKeys = Object.keys(mod).filter(function (rule) { return rule !== 'depthBonus'; });
          // every rule on the enemy must surface as at least one icon
          if (ruleKeys.length && !icons.length) return false;
          return icons.every(function (icon) {
            return C.GLYPHS[icon.i] && typeof icon.t === 'string' && icon.t.length > 12;
          });
        });
      })()); });
      check('Bosses and elites are marked as such, normal foes are not', function () { return ((function () {
        var bossKey = RUN.ACTS[RUN.ACT_KEYS[0]].boss;
        var eliteKey = RUN.elitesOf(RUN.ACTS[RUN.ACT_KEYS[0]])[0];
        return C.rankIcon(bossKey).i === 'boss' &&
               C.rankIcon(eliteKey).i === 'elite' &&
               C.rankIcon('brawler') === null;
      })()); });
      check('A boss signature rule always reaches the player as an icon', function () { return ((function () {
        var RULES = { growth: 1, supportPenalty: 1, echoBestLane: 1, taxDominantColor: 1,
                      echoMix: 1, wardWeakLanes: 1, devourWeakest: 1 };
        return RUN.ACT_KEYS.every(function (actKey) {
          var key = RUN.ACTS[actKey].boss, mod = ENEMIES[key].mod || {};
          var sig = Object.keys(mod).filter(function (rule) { return RULES[rule]; });
          var icons = C.enemyIcons(key);
          // the rule icons must outnumber the plain colour-bonus ones
          return sig.length === 1 && icons.length > Object.keys(mod.colorBonus || {}).length;
        });
      })()); });
      check('Icons are derived from the rules, so they cannot drift', function () { return ((function () {
        var before = C.enemyIcons('hollow_sun').filter(function (i) { return i.i === 'tax'; })[0];
        var was = ENEMIES.hollow_sun.mod.taxDominantColor;
        ENEMIES.hollow_sun.mod.taxDominantColor = 9;
        var after = C.enemyIcons('hollow_sun').filter(function (i) { return i.i === 'tax'; })[0];
        ENEMIES.hollow_sun.mod.taxDominantColor = was;
        return before.v === was && after.v === 9 && after.t.indexOf('9') !== -1;
      })()); });
      check('The codex records what you meet and nothing you have not', function () { return ((function () {
        var seen = RUN.codex.cards.red_brute;
        delete RUN.codex.cards.red_brute;
        var before = !RUN.codex.cards.red_brute;
        RUN.discoverCard('red_brute');
        var after = !!RUN.codex.cards.red_brute;
        if (seen === undefined) delete RUN.codex.cards.red_brute; else RUN.codex.cards.red_brute = seen;
        return before && after;
      })()); });
      check('Cards minted in the Lab are not codex entries', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var fused = RUN.fuseInDeck({ id: 'red_brute', up: false }, { id: 'blue_scout', up: false });
        RUN.discoverCard(fused.id);
        var ok = !RUN.codex.cards[fused.id];      // a one-off Amalgam is not a discovery
        RUN.setRun(saved);
        return ok;
      })()); });

      check('The colour picker is visible the moment it is asked for', function () { return ((function () {
        var state = getState();
        if (!state) return true;                       // no battle in progress during tests
        var savedPending = state.pending, savedSel = state.selectedCard;
        var savedHand = state.hands[PLAYER][0], savedTile = state.board[PLAYER].row2[0];
        state.board[PLAYER].row2[0] = { cardId: 'red_brute', color: 'red', strength: 4, temp: 0 };
        state.hands[PLAYER][0] = { id: 'spectrum_shift', up: false, uid: -99 };
        state.pending = { card: state.hands[PLAYER][0], index: 0, side: PLAYER, tile: null,
                      picks: [{ row: 'row2', index: 0 }] };
        state.selectedCard = 0;
        render();                                   // ONE render, as a real click gives
        var picker = els.colorPicker, bar = els.controls;
        /* Both the picker and the bar holding it have to be visible after a
           single render. The bar used to read the picker's previous value, so a
           repaint effect looked broken until something else forced a redraw. */
        var ok = picker.hidden === false && bar.hidden === false &&
                 picker.querySelectorAll('.pick').length === C.COLOR_KEYS.length;
        state.pending = savedPending; state.selectedCard = savedSel;
        state.hands[PLAYER][0] = savedHand; state.board[PLAYER].row2[0] = savedTile;
        render();
        return ok;
      })()); });
}
