/* the opponent gets better as the run goes on */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var left, ev, map, reach;

  // --- the opponent gets better as the run goes on ---
      check('Skill climbs with run power, and rank sits a tier above the road', function () { return ((function () {
        function tier(power, kind) {
          return aiSkill({ power: power, enemy: { kind: kind || 'normal' } });
        }
        var ladder = [tier(0), tier(8), tier(17), tier(28), tier(40)];
        var rising = ladder.every(function (v, i) { return i === 0 || v >= ladder[i - 1]; });
        return rising && ladder[0] === 0 && ladder[4] === 4 &&
               tier(0, 'elite') > tier(0) && tier(0, 'boss') > tier(0) &&
               tier(40, 'boss') === 4;                  // and never past the top
      })()); });
      check('Act one still overcommits, later acts do not', function () { return ((function () {
        // overkill only starts being discounted once the world has taught it to
        return shapedLead(SAFE_LEAD + 20, 0) === SAFE_LEAD + 20 &&
               shapedLead(SAFE_LEAD + 20, 1) < SAFE_LEAD + 20;
      })()); });
      check('Each habit switches on at its own tier and not before', function () { return ((function () {
        var state = { wins: { bottom: 0, top: 0 }, hands: { bottom: [], top: [1, 2, 3] },
                  decks: { bottom: [], top: [1, 2, 3, 4] } };
        var thriftOff = reservePrice(state, ENEMY, {}, 1) === 0;
        var thriftOn  = reservePrice(state, ENEMY, {}, 2) > 0;
        var concedeOff = concedeBonus(state, ENEMY, -40, 2) === 0;
        var concedeOn  = concedeBonus(state, ENEMY, -40, 3) > 0;
        var spendOff = spendCost({ id: 'red_titan', up: false }, 3) === 0;
        var spendOn  = spendCost({ id: 'red_titan', up: false }, 4) > 0;
        return thriftOff && thriftOn && concedeOff && concedeOn && spendOff && spendOn;
      })()); });
      check('A round further out of reach is easier to give up on', function () { return ((function () {
        var state = { wins: { bottom: 0, top: 0 }, hands: { bottom: [], top: [] }, decks: { bottom: [], top: [] } };
        var near = concedeBonus(state, ENEMY, -12, 4);
        var far = concedeBonus(state, ENEMY, -60, 4);
        var level = concedeBonus(state, ENEMY, 0, 4);
        state.wins = { bottom: 1, top: 1 };
        var decider = concedeBonus(state, ENEMY, -60, 4);
        // never give up the round that decides the battle
        return level === 0 && far > near && near > 0 && decider === 0;
      })()); });
      check('Spending the better card costs more', function () { return ((function () {
        var cheap = spendCost({ id: 'red_scout', up: false }, 4);
        var dear = spendCost({ id: 'red_titan', up: false }, 4);
        return dear > cheap && cheap >= 0;
      })()); });
      check('Waste is counted lane by lane, not just on the total', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 0, 'red_scout', 1);
        put(battleState2, 'top', 'row1', 0, 'red_titan', 30);      // wins one lane enormously
        var ev = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var plain = ev.totals[ENEMY] - ev.totals[PLAYER];
        var shaped = laneShapedDelta(ev, ENEMY, PLAYER);
        /* Overkill inside a single lane has to be discounted even when the board
           score is close, or a surgical enemy still answers a 1 with a 30. */
        return shaped < plain && shaped > 0;
      })()); });
      check('The opponent holds a won round only once it is sharp enough', function () { return ((function () {
        var state = getState();
        if (!state) return true;
        var saved = { board: state.board, hands: state.hands, wins: state.wins, turn: state.turn,
                      pending: state.pending, mixTokens: state.mixTokens, power: state.power, enemy: state.enemy };
        function setup(power) {
          state.board = C.emptyBoard();
          state.hands = { bottom: [], top: [] };
          for (var i = 0; i < 5; i++) state.hands[ENEMY].push({ id: 'red_brute', up: false, uid: -300 - i });
          state.mixTokens = { bottom: 0, top: 0 }; state.pending = null; state.turn = ENEMY;
          state.wins = { bottom: 0, top: 0 }; state.power = power; state.enemy = ENEMIES.brawler;
          state.board[ENEMY].row1[0] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
          state.board[ENEMY].row1[1] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
        }
        setup(0);
        var greenDumps = !decideOpponentMove().willPass;
        setup(45);
        var veteranHolds = decideOpponentMove().willPass;
        state.board = saved.board; state.hands = saved.hands; state.wins = saved.wins;
        state.turn = saved.turn; state.pending = saved.pending; state.mixTokens = saved.mixTokens;
        state.power = saved.power; state.enemy = saved.enemy;
        render();
        return greenDumps && veteranHolds;
      })()); });
      check('A boss never offers a trophy in a colour the run has not opened', function () { return ((function () {
        var saved = RUN.getRun();
        var clean = true;
        for (var i = 0; i < 40; i++) {
          RUN.setRun(RUN.newRun());
          var run = RUN.getRun();
          run.act = 'red'; run.deck = RUN.startingDeck();    // primaries only
          RUN.rollReward({ type: 'boss', depth: 12 });
          RUN.getRun().reward.cards.forEach(function (c) {
            var col = CARDS[c.id].color;
            if (col && !C.actUnlocked(col, run.deck)) clean = false;
          });
        }
        RUN.setRun(saved);
        return clean;
      })()); });
      check('The Devouring Star cannot be won by luck', function () { return ((function () {
        /* The three primaries are always unlocked, so a boss can always fill an
           offer of three — the shortfall-to-gold path is a guard that should not
           fire in a real run. What matters is that the locked colours, and Black
           above all, never appear until they have been earned. */
        var saved = RUN.getRun();
        var everBlack = false, alwaysThree = true;
        for (var i = 0; i < 60; i++) {
          RUN.setRun(RUN.newRun());
          var run = RUN.getRun();
          run.act = RUN.ACT_KEYS[i % 3]; run.deck = RUN.startingDeck();
          RUN.rollReward({ type: 'boss', depth: 12 });
          var reward = RUN.getRun().reward;
          if (reward.cards.length !== 3) alwaysThree = false;
          if (reward.cards.some(function (c) { return CARDS[c.id].color === 'black'; })) everBlack = true;
        }
        // and once Black is genuinely held, the Star becomes reachable
        RUN.setRun(RUN.newRun());
        run = RUN.getRun();
        run.act = 'black'; run.deck = RUN.startingDeck();
        for (var j = 0; j < C.requirementFor('black'); j++) run.deck.push({ id: 'black_voidling', up: false });
        RUN.rollReward({ type: 'boss', depth: 12 });
        var earned = RUN.getRun().reward.cards.some(function (c) { return c.id === 'black_devouring_star'; });
        RUN.setRun(saved);
        return !everBlack && alwaysThree && earned;
      })()); });

      check('Every act has its own painting, none borrowed', function () { return ((function () {
        var seen = {};
        return RUN.ACT_KEYS.every(function (key) {
          var art = RUN.ACT_ART[key];
          if (!art || !art.varName) return false;
          if (seen[art.varName]) return false;      // two acts sharing one room
          seen[art.varName] = 1;
          // hue-rotating a borrowed room was always a placeholder
          return !art.filter;
        });
      })()); });
      check('Only the room with no painted eyes draws its own', function () { return ((function () {
        var drawn = RUN.ACT_KEYS.filter(function (key) { return RUN.ACT_ART[key].drawEyes; });
        return drawn.length === 1 && drawn[0] === 'black';
      })()); });
      check('Every seam sits where a watcher would', function () { return ((function () {
        // all seven paintings frame their eyes in a narrow band; a value outside
        // it means a mismeasured painting rather than an unusual composition
        return RUN.ACT_KEYS.every(function (key) {
          var seam = RUN.ACT_ART[key].seam;
          return seam > 0.15 && seam < 0.30;
        });
      })()); });
      check('The drawn eyes wear every colour in the game', function () { return ((function () {
        var found = 0;
        /* The cycle must visit all seven, or the last road picks favourites.
           Compared as rgb() rather than hex: the CSSOM normalises every colour it
           parses, so a hex needle could never match the haystack no matter how
           the stylesheet was written. */
        function toRgb(hex) {
          var packed = parseInt(hex.slice(1), 16);
          return 'rgb(' + ((packed >> 16) & 255) + ', ' + ((packed >> 8) & 255) + ', ' + (packed & 255) + ')';
        }
        var wanted = C.COLOR_KEYS.map(function (key) { return toRgb(COLORS[key].hex); });
        /* Read through the CSSOM rather than scraping <style> text. The single-file
           build has an inline stylesheet and the split build links an external
           one; styleSheets covers both, so this test does not quietly stop
           checking anything the moment the CSS moves out of the HTML. */
        var block = '';
        Array.prototype.forEach.call(document.styleSheets, function (sheet) {
          var rules;
          try { rules = sheet.cssRules; } catch (e) { return; }   // cross-origin
          if (!rules) return;
          Array.prototype.forEach.call(rules, function (rule) {
            if (rule.type === 7 /* CSSKeyframesRule */ && rule.name === 'eyeColor') {
              Array.prototype.forEach.call(rule.cssRules, function (kf) { block += kf.cssText; });
            }
          });
        });
        if (!block) return false;                   // the keyframes must be findable at all
        wanted.forEach(function (rgb) {
          if (block.indexOf(rgb) !== -1) found++;
        });
        return found >= 6;                          // Black's own hex is near-invisible; a lilac stands in
      })()); });

      check('An overlay never takes height from the board', function () { return ((function () {
        var screen = els.screen_battle;
        if (!screen || screen.hidden) return true;
        /* sizeBoardStage sums its siblings to work out what is left for the board.
           getBoundingClientRect reports a real height for absolutely positioned
           children too, so the enemy rules overlay was counted as chrome: opening
           a boss rule shrank the board on the next re-measure. Anything out of
           flow must be skipped. */
        var counted = [], skipped = [];
        Array.prototype.forEach.call(screen.children, function (child) {
          var cs = getComputedStyle(child);
          if (cs.display === 'none') return;
          (cs.position === 'absolute' || cs.position === 'fixed' ? skipped : counted).push(child);
        });
        if (!skipped.length) return true;                  // nothing overlaid right now
        var before = document.getElementById('board').getBoundingClientRect().height;
        var layer = document.getElementById('enemyRulesLayer');
        var wasHidden = layer.hidden, text = els.enemyRuleText, textHidden = text.hidden;
        layer.hidden = false;
        text.textContent = 'A deliberately long rule description, long enough to wrap ' +
          'onto several lines and take real vertical space in the overlay layer.';
        text.hidden = false;
        sizeBoardStage();
        var after = document.getElementById('board').getBoundingClientRect().height;
        layer.hidden = wasHidden; text.hidden = textHidden;
        sizeBoardStage();
        return Math.abs(before - after) < 0.5;
      })()); });
      check('The puck ring sits under the puck, not above its face', function () { return ((function () {
        var key = Object.keys(tileEls)[0];
        var el = key && tileEls[key];
        if (!el || !el.owner || !el.token) return true;
        var ringY = parseFloat(el.owner.getAttribute('cy'));
        var faceY = parseFloat(el.token.getAttribute('cy'));
        // the ring used to share the top face's centre and haloed out above it
        return ringY > faceY;
      })()); });
      check('The default pair blinks on the same frame', function () { return ((function () {
        /* Scoped to the ordinary two-eye watcher. The Rotting Choir blinks out of
           step ON PURPOSE \u2014 several throats, none of them quite together \u2014 so
           asserting global synchrony would forbid the thing that makes it a
           choir. The extra pairs are hidden outside that act. */
        var layer = document.getElementById('roomEyes');
        if (!layer) return false;
        var wasChoir = layer.classList.contains('eyes-choir');
        layer.classList.remove('eyes-choir');
        var eyes = layer.querySelectorAll('.eye');
        var a = getComputedStyle(eyes[0]), b2 = getComputedStyle(eyes[1]);
        var same = a.animationName === b2.animationName &&
                   a.animationDuration === b2.animationDuration &&
                   parseFloat(a.animationDelay || 0) === parseFloat(b2.animationDelay || 0);
        var extrasHidden = getComputedStyle(eyes[2]).display === 'none';
        if (wasChoir) layer.classList.add('eyes-choir');
        return same && extrasHidden;
      })()); });
      check('Each secret road watches in its own way', function () { return ((function () {
        var styles = {};
        RUN.SECRET_ACT_KEYS.forEach(function (key) {
          var art = RUN.ACT_ART[key];
          if (!art || !art.drawEyes) return;
          styles[art.eyeStyle] = (styles[art.eyeStyle] || 0) + 1;
        });
        // three secret roads, three different watchers, none of them repeated
        return Object.keys(styles).length === RUN.SECRET_ACT_KEYS.length &&
               Object.keys(styles).every(function (key) { return styles[key] === 1; });
      })()); });
      check('Every act with drawn eyes has real art of its own', function () { return ((function () {
        return RUN.ACT_KEYS.concat(RUN.SECRET_ACT_KEYS).every(function (key) {
          var art = RUN.ACT_ART[key];
          if (!art) return false;
          // no secret road should still be borrowing another act's painting
          if (RUN.SECRET_ACT_KEYS.indexOf(key) !== -1) {
            return art.varName === '--art-' + key && !art.filter;
          }
          return !!art.varName;
        });
      })()); });

      check('The enemy passing leaves a marker; the player passing does not', function () { return ((function () {
        var el = document.getElementById('passPuck');
        if (!el) return false;
        showPassPuck(false);
        var state = getState();
        if (!state) return el.hidden;
        var saved = { turn: state.turn, finalTurn: state.finalTurn, pending: state.pending,
                      sel: state.selectedCard, wins: state.wins };
        showPassPuck(true);
        var shows = !el.hidden;
        showPassPuck(false);
        var clears = el.hidden;
        state.turn = saved.turn; state.finalTurn = saved.finalTurn; state.pending = saved.pending;
        state.selectedCard = saved.sel; state.wins = saved.wins;
        return shows && clears;
      })()); });
      check('The pass marker never sits on a tile', function () { return ((function () {
        var el = document.getElementById('passPuck');
        if (!el || els.screen_battle.hidden) return true;
        showPassPuck(true);
        var puckRect = el.getBoundingClientRect();
        var clash = false;
        Object.keys(tileEls).forEach(function (key) {
          var tileRect = tileEls[key].shape.getBoundingClientRect();
          if (!(puckRect.right < tileRect.left || puckRect.left > tileRect.right || puckRect.bottom < tileRect.top || puckRect.top > tileRect.bottom)) clash = true;
        });
        showPassPuck(false);
        // it is a note about the turn, not a piece in play
        return !clash;
      })()); });
      check('The fork gives away nothing about roads you have not opened', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.act = 'green'; run.actsCleared = ['green']; run.actOffer = ['red', 'blue'];
        RUN.show('act');
        var txt = (els.actBody.textContent || '').toLowerCase();
        var leaks = ['needs', 'you hold', 'still shut', 'cards —', 'requirement'];
        var clean = !leaks.some(function (w) { return txt.indexOf(w) !== -1; });
        // and it must not name an act that is not on offer
        var named = RUN.ACT_KEYS.filter(function (key) {
          return txt.indexOf(RUN.ACTS[key].name.toLowerCase()) !== -1;
        });
        RUN.setRun(saved);
        RUN.show('map');
        return clean && named.length <= 3;      // the two on offer, plus the one behind you
      })()); });
      check('Every road has its own omen, and none of them give the rule away', function () { return ((function () {
        var keys = Object.keys(RUN.ACT_OMENS);
        if (keys.length !== RUN.ACT_KEYS.length) return false;
        var seen = {};
        return keys.every(function (key) {
          var omenText = RUN.ACT_OMENS[key];
          if (!omenText || omenText.length < 40) return false;
          if (seen[omenText]) return false;                 // each act says something different
          seen[omenText] = 1;
          // no numbers and no naming of the mechanism
          return !/\\d/.test(omenText) && !/requir|unlock|need \\d|colour lab/i.test(omenText);
        });
      })()); });
      check('An omen is written the moment the road opens, and kept', function () { return ((function () {
        var saved = RUN.getRun();
        var savedOmens = RUN.codex.omens;
        RUN.codex.omens = {};
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck();
        RUN.noteActOmens();
        var primariesOnly = ['red', 'green', 'blue'].every(function (key) { return RUN.codex.omens[key]; }) &&
                            !RUN.codex.omens.yellow;
        run.deck.push({ id: 'yellow_spark', up: false });
        run.deck.push({ id: 'yellow_banner', up: false });
        RUN.noteActOmens();
        var yellowNoted = !!RUN.codex.omens.yellow;
        RUN.codex.omens = savedOmens;
        RUN.setRun(saved);
        return primariesOnly && yellowNoted;
      })()); });
}
