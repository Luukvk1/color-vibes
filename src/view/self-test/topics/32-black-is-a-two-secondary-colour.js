/* Black is a two secondary colour, but mixing is never refused */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var res, ok;

  // --- Black is a two-secondary colour, but mixing is never refused ---
      check('A secondary mixed with the "wrong" primary stays that secondary', function () { return ((function () {
        // by raw bits every one of these is Black; none of them may become it
        var pairs = [['yellow', 'blue'], ['cyan', 'red'], ['magenta', 'green']];
        return pairs.every(function (pair) {
          var raw = C.mixColor(pair[0], pair[1]);
          var result = C.mixResultColor(pair[0], pair[1]);
          var secondary = C.isSecondary(pair[0]) ? pair[0] : pair[1];
          return raw === 'black' && result === secondary;
        });
      })()); });
      check('Two secondaries still make Black', function () { return ((function () {
        var legal = [['yellow', 'cyan'], ['yellow', 'magenta'], ['cyan', 'magenta']];
        return legal.every(function (pair) {
          return C.mixResultColor(pair[0], pair[1]) === 'black';
        });
      })()); });
      check('Mixing into something already Black stays Black', function () { return ((function () {
        return ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'black'].every(function (color) {
          return C.mixResultColor('black', color) === 'black' && C.mixResultColor(color, 'black') === 'black';
        });
      })()); });
      check('Ordinary mixes are unaffected', function () { return ((function () {
        return C.mixResultColor('red', 'green') === 'yellow' &&
               C.mixResultColor('green', 'blue') === 'cyan' &&
               C.mixResultColor('red', 'blue') === 'magenta' &&
               C.mixResultColor('red', 'red') === 'red';
      })()); });
      check('Mixing is never refused for what it would produce', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row2', 0, 'yellow_spark', 3);
        put(battleState2, 'bottom', 'row1', 0, 'blue_scout', 2);   // touching, and Black by raw bits
        var opts = RUN.mixOptions(battleState2.board, PLAYER, []);
        var offered = opts.some(function (o) {
          return o.base.row === 'row2' && o.base.index === 0 &&
                 o.other.row === 'row1' && o.other.index === 0;
        });
        var res = RUN.canMix(battleState2.board, PLAYER, { row: 'row2', index: 0 }, { row: 'row1', index: 0 }, []);
        return offered && res.ok;
      })()); });
      check('That mix lands as the secondary, added together and stronger', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row2', 0, 'yellow_spark', 3);
        put(battleState2, 'bottom', 'row1', 0, 'blue_scout', 2);
        var s2 = { board: battleState2.board, hazards: battleState2.hazards, relics: [], chains: { bottom: 0, top: 0 },
                   mixesThisRound: 0, freeMixesThisRound: 0 };
        var out = RUN.applyMix(s2, PLAYER, { row: 'row2', index: 0 }, { row: 'row1', index: 0 }, 0, false);
        return out.color === 'yellow' && out.strength === 3 + 2 + 1;   // sum plus the ordinary +1
      })()); });
      check('The volatile bench can fuse any pair; Black still needs two secondaries', function () { return ((function () {
        var saved = RUN.getRun();
        var clean = true;
        for (var t = 0; t < 40 && clean; t++) {
          RUN.setRun(RUN.newRun());
          var run = RUN.getRun();
          run.deck = [{ id: 'yellow_spark', up: false }, { id: 'yellow_banner', up: false },
                    { id: 'blue_scout', up: false }, { id: 'blue_current', up: false },
                    { id: 'red_brute', up: false }, { id: 'green_seed', up: false },
                    { id: 'cyan_shield', up: false }];
          var before = C.colourCounts(run.deck);
          run.lab = { kind: 'volatile', picks: [], presses: 0, results: [], done: false, curses: 0 };
          RUN.applyVolatile('fuse');
          var after = C.colourCounts(RUN.getRun().deck);
          if (after.black > before.black) {
            var secondariesLost = (before.yellow - after.yellow) + (before.cyan - after.cyan) +
                                  (before.magenta - after.magenta);
            if (secondariesLost < 2) clean = false;    // Black must have eaten two secondaries
          }
        }
        RUN.setRun(saved);
        return clean;
      })()); });
}
