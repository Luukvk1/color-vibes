/* colour lab */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var first, map;

  // --- colour lab ---
      check('The ordinary lab rolls fusion or reinforcement', function () { return ((function () {
        var seen = {}, saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        for (var i = 0; i < 300; i++) { RUN.rollLab(); seen[RUN.getRun().lab.kind] = 1; }
        RUN.setRun(saved);
        return seen.fuse && seen.boost && !seen.volatile;   // volatile is its own map node now
      })()); });
      check('Curse risk climbs with every pull and is capped',
        function () { return (RUN.curseRisk(0) < RUN.curseRisk(1) && RUN.curseRisk(1) < RUN.curseRisk(5) &&
        RUN.curseRisk(99) <= 0.75); }, function () { return ([0, 1, 5, 99].map(function (pulls) { return Math.round(RUN.curseRisk(pulls) * 100); }).join('/')); });
      check('Curses stay out of rewards and shops',
        function () { return (C.DRAWABLE.every(function (key) { return !CARDS[key].curse; }) && C.CURSE_KEYS.length >= 4); });
      check('A drawn curse plants itself and never enters the hand', function () { return ((function () {
        var battleState2 = { board: C.emptyBoard(), hazards: C.emptyHazards(),
          hands: { bottom: [], top: [] }, decks: { bottom: [C.makeCard('curse_husk'), C.makeCard('red_brute')], top: [] },
          mixTokens: { bottom: 1, top: 1 }, relics: [] };
        var got = RUN.drawInto(battleState2, 'bottom', 1);
        var planted = battleState2.board.bottom.row1[0];
        return got === 1 && battleState2.hands.bottom.length === 1 &&
               CARDS[battleState2.hands.bottom[0].id].curse !== true &&
               planted && planted.cardId === 'curse_husk' && planted.color === null &&
               battleState2.curseFired && battleState2.curseFired.length === 1;
      })()); });
      check('Curses take the front row first, blocking a lane', function () { return ((function () {
        var battleState2 = { board: C.emptyBoard(), hazards: C.emptyHazards(),
          hands: { bottom: [], top: [] }, decks: { bottom: [C.makeCard('curse_idol')], top: [] },
          mixTokens: { bottom: 1, top: 1 }, relics: [] };
        RUN.drawInto(battleState2, 'bottom', 1);
        return !!battleState2.board.bottom.row1[0];
      })()); });
      check('Leaden Idol drags its neighbours down', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'red_brute', 4);
        put(battleState2, 'bottom', 'row2', 1, 'curse_idol', 1);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return e2.strengthOf(e2.get('bottom', 'row1', 1)) === 3;
      })()); });
      check('Beacon of Rot feeds the enemy frontline', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row2', 1, 'curse_beacon', 1);
        put(battleState2, 'top', 'row1', 1, 'red_brute', 3);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return e2.lanes[1].top.frontStrength === 5;
      })()); });
      check('A curse unit is colourless, so no colour can answer it', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'curse_husk', 1);
        put(battleState2, 'top', 'row1', 1, 'red_brute', 3);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return e2.lanes[1].bottom.effective === false && e2.lanes[1].top.effective === false;
      })()); });
      check('A fusion of two blank cards is still silenced', function () { return ((function () {
        /* Red Brute is the only unit in the game with no rules whatsoever, so two
           of them is the one fusion that inherits nothing — it stays the old
           pure-stat Amalgam and auras still cannot lift it. A fusion that DID
           inherit something is a real card and is deliberately no longer
           silenced, which is the whole point of the change. */
        var fused = C.fuseCards({ id: 'red_brute', up: false }, { id: 'red_brute', up: false });
        var battleState2 = fresh();
        battleState2.board.bottom.row1[1] = { cardId: fused.id, color: CARDS[fused.id].color,
          strength: CARDS[fused.id].strength, temp: 0 };
        put(battleState2, 'bottom', 'row2', 1, 'green_gardener', 3);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return CARDS[fused.id].silenced === true &&
               (CARDS[fused.id].effectSources || []).length === 0 &&
               e2.strengthOf(e2.get('bottom', 'row1', 1)) === CARDS[fused.id].strength;
      })()); });
      check('The enemy rots at the rate the player does', function () { return ((function () {
        function avgCurses(playerCurses, corruption) {
          var total = 0;
          for (var i = 0; i < 300; i++) {
            total += C.buildEnemyDeck(ENEMIES.brawler, 4, Math.random, corruption, playerCurses)
              .filter(function (c) { return CARDS[c.id].curse; }).length;
          }
          return total / 300;
        }
        var none = avgCurses(0, 0), few = avgCurses(1, 1), many = avgCurses(6, 6);
        /* The old rule was a step function with no roll in it: from corruption 2
           onward the enemy carried a curse in every single fight. It has to stay
           rare when the player is barely cursed, and it has to scale. */
        return none === 0 && few > 0 && few < 0.6 && many > few * 2;
      })()); });
      check('A clean player never faces a cursed enemy', function () { return ((function () {
        for (var i = 0; i < 200; i++) {
          var deck = C.buildEnemyDeck(ENEMIES.brawler, 20, Math.random, 0, 0);
          if (deck.some(function (c) { return CARDS[c.id].curse; })) return false;
        }
        return true;
      })()); });
      check('Elites and bosses bring curse tech, normal foes rarely do', function () { return ((function () {
        function techRate(key) {
          var hits = 0;
          for (var i = 0; i < 250; i++) {
            var deck = C.buildEnemyDeck(ENEMIES[key], 20, Math.random, 6, 6);
            if (deck.some(function (c) { return C.NEEDS_CURSES_IDS.indexOf(c.id) !== -1; })) hits++;
          }
          return hits / 250;
        }
        var normal = techRate('cultist'), boss = techRate('spectrum');
        /* Sampled, so the bound has to sit clear of the noise. At power 20 a
           normal foe's true rate is about 0.16 with a standard error near 0.023,
           which put a 0.2 ceiling less than two standard errors away and failed
           roughly one run in twenty. The point of the test is the gap between
           ranks, not a tight bound on either. */
        return boss > normal * 1.6 && normal < 0.3;
      })()); });
      check('Curse tech never shows up against a clean player', function () { return ((function () {
        for (var i = 0; i < 200; i++) {
          var deck = C.buildEnemyDeck(ENEMIES.spectrum, 30, Math.random, 0, 0);
          if (deck.some(function (c) { return C.NEEDS_CURSES_IDS.indexOf(c.id) !== -1; })) return false;
        }
        return true;
      })()); });
      check('Every act carries exactly one Volatile Lab behind a gate', function () { return ((function () {
        for (var attempt = 0; attempt < 25; attempt++) {
          var map = RUN.buildMap(RUN.ACT_KEYS[attempt % RUN.ACT_KEYS.length], attempt % 2 === 0);
          var vol = [], gates = [];
          map.forEach(function (row, depth) {
            row.forEach(function (node, i) {
              if (node.type === 'volatile') vol.push({ d: depth, i: i });
              if (node.dangerous) gates.push(node);
            });
          });
          if (vol.length !== 1) return false;
          if (!gates.length) return false;
          var volDepth = vol[0].d, volIndex = vol[0].i;
          var into = map[volDepth - 1].filter(function (parent) { return parent.next.indexOf(volIndex) !== -1; });
          /* Exactly one node leads to the lab, and it is dressed as the elite gate
             the design wants. It is deliberately NOT asserted to have exactly one
             exit any more: that was the invariant behind 149 unreachable nodes in
             400 generated maps, since a forced single-column row is the sole
             parent for everything below it, and enforcing "no other exit" there
             deleted the last path to its own siblings. Full reachability is
             checked directly, by an actual traversal, in the test above — that is
             the property that matters; edge count is not. */
          if (into.length !== 1 || !into[0].hidden || into[0].type !== 'elite') return false;
        }
        return true;
      })()); });
      check('Fusion follows the board mixing maths', function () { return ((function () {
        var preview1 = C.fusePreview({ id: 'red_brute', up: false }, { id: 'blue_scout', up: false });
        var preview2 = C.fusePreview({ id: 'black_voidling', up: false }, { id: 'red_brute', up: false });
        // Red 2 + Blue 1 + 1 = Magenta 4 ; Black 1 + Red 2 + 2 = Black 5
        return preview1.color === 'magenta' && preview1.strength === 4 && preview2.color === 'black' && preview2.strength === 5;
      })()); });
      check('A fused card is real, playable and out of the shop pool', function () { return ((function () {
        var e = C.fuseCards({ id: 'red_brute', up: false }, { id: 'green_seed', up: false });
        var cardDef = CARDS[e.id];
        return cardDef && cardDef.type === 'unit' && cardDef.strength === 4 && C.DRAWABLE.indexOf(e.id) === -1;
      })()); });
      check('Reinforcement raises printed strength permanently', function () { return ((function () {
        var lifted = RUN.liftStrength({ id: 'red_brute', up: false }, 2);
        return C.cardStrength(lifted) === 4 && CARDS[lifted.id].name === 'Red Brute';
      })()); });
      check('Reinforcement keeps the card\u2019s rules text and hooks', function () { return ((function () {
        var lifted = RUN.liftStrength({ id: 'green_gardener', up: false }, 1);
        return typeof CARDS[lifted.id].aura === 'function' && C.cardStrength(lifted) === 4;
      })()); });
      check('Volatile fusion never hollows the deck out', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        for (var i = 0; i < 60; i++) RUN.applyVolatile('fuse');
        var units = RUN.deckUnits().length;
        RUN.setRun(saved);
        return units >= 4;                      // playable units, not padded count
      })()); });
      check('Curses spread out before repeating', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        RUN.rollLab(); run.lab.kind = 'volatile';
        var kinds = {};
        for (var i = 0; i < 4; i++) {
          var held = {};
          run.deck.forEach(function (c) { if (CARDS[c.id].curse) held[c.id] = true; });
          var fresh = C.CURSE_KEYS.filter(function (key) { return !held[key]; });
          if (!fresh.length) break;
          run.deck.push({ id: fresh[0], up: false });
          kinds[fresh[0]] = 1;
        }
        RUN.setRun(saved);
        return Object.keys(kinds).length >= 3;
      })()); });
      check('A one-shot choice cannot be taken twice', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.lives = 2;
        run.pendingNode = { type: 'event', depth: 3, next: [0] };
        run.event = RUN.EVENTS.filter(function (e) { return e.title === 'A Spilled Palette'; })[0];
        RUN.show('event');
        var btn = document.querySelector('#eventBody .lab-opt');
        btn.click(); btn.click();                      // impatient double tap
        var lives = RUN.getRun().lives;
        RUN.setRun(saved);
        RUN.show('map');
        return lives === 1;
      })()); });
}
