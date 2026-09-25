/* the peek strip's click to expand overlay */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var battleState, first, left, ev, map, reach, ok, early, late;

  // --- the peek strip's click-to-expand overlay ---
      check('Tapping the peek strip opens the full, un-clipped card text', function () { return ((function () {
        /* The strip that reads this text is fixed at two lines with overflow
           hidden, so a three-effect fusion's third sentence was silently cut off
           with no sign anything was missing. The strip is now a button that
           opens this overlay with the complete text instead. */
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.map = RUN.buildMap('green', true); run.depth = 0; run.available = [0];
        RUN.enterNode(0);
        var state = RUN.getState();
        var fused = C.fuseCards({ id: 'blue_current', up: false }, { id: 'black_reclaimer', up: false });
        fused = C.fuseCards(fused, { id: 'magenta_lancer', up: false });
        state.hands.bottom[0] = { id: fused.id, up: false, uid: -1 };
        render();
        var card = document.querySelector('.hand .card:not(.mixcard)');
        card.dispatchEvent(new Event('mouseenter'));
        var peek = document.getElementById('cardPeek');
        var gotId = peek.dataset.cardId === fused.id;
        peek.click();
        var overlay = document.getElementById('cardDetailOverlay');
        var fullTextShown = document.getElementById('cardDetailBody').textContent.indexOf(CARDS[fused.id].text) !== -1;
        var opened = !overlay.hidden;
        overlay.hidden = true;
        RUN.setRun(saved); RUN.show('map');
        return gotId && opened && fullTextShown;
      })()); });
      check('Moving off a hovered card toward the peek strip does not blank it first', function () { return ((function () {
        /* The actual bug a player would hit: mouseenter sets the peek strip's
           content, but the strip sits below the cards — reaching it with a mouse
           means leaving the card first. That used to fire mouseleave, which
           cleared the strip back to the empty prompt (and wiped the card id with
           it) the instant before the click could land, so the click always
           opened nothing. */
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.map = RUN.buildMap('green', true); run.depth = 0; run.available = [0];
        RUN.enterNode(0);
        var state = RUN.getState();
        state.hands.bottom[0] = { id: 'red_brute', up: false, uid: -1 };
        render();
        var card = document.querySelector('.hand .card:not(.mixcard)');
        card.dispatchEvent(new Event('mouseenter'));
        var idBefore = document.getElementById('cardPeek').dataset.cardId;
        card.dispatchEvent(new Event('mouseleave'));
        var idAfter = document.getElementById('cardPeek').dataset.cardId;
        RUN.setRun(saved); RUN.show('map');
        return idBefore === 'red_brute' && idAfter === 'red_brute';
      })()); });
      check('The card detail overlay closes via its button, the backdrop, and nothing else opens it emptied out', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.map = RUN.buildMap('green', true); run.depth = 0; run.available = [0];
        RUN.enterNode(0);
        var state = RUN.getState();
        state.hands.bottom[0] = { id: 'red_brute', up: false, uid: -1 };
        render();
        var card = document.querySelector('.hand .card:not(.mixcard)');
        card.dispatchEvent(new Event('mouseenter'));
        var overlay = document.getElementById('cardDetailOverlay');
        document.getElementById('cardPeek').click();
        var openedOk = !overlay.hidden;
        document.getElementById('cardDetailCloseBtn').click();
        var closedByButton = overlay.hidden;
        RUN.setRun(saved); RUN.show('map');
        // a cardId of '' or undefined must never open an empty overlay
        var before = overlay.hidden;
        openCardDetailForTest();
        var stillClosed = overlay.hidden === before;
        function openCardDetailForTest() {
          var evt = document.createEvent('Event'); evt.initEvent('click', true, true);
          var fakePeek = document.getElementById('cardPeek');
          delete fakePeek.dataset.cardId;
          fakePeek.dispatchEvent(evt);
        }
        return openedOk && closedByButton && stillClosed;
      })()); });
      check('The peek strip\\u2019s "read more" hint renders a real ellipsis, not an escape code', function () { return ((function () {
        /* A doubled backslash in the CSS content string prints the six literal
           characters "\\2026" instead of the unicode codepoint they were meant
           to escape to \u2014 the exact class of bug this file has hit before in JS
           string literals, here in a CSS one instead. */
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.map = RUN.buildMap('green', true); run.depth = 0; run.available = [0];
        RUN.enterNode(0);
        var state = RUN.getState();
        state.hands.bottom[0] = { id: 'red_brute', up: false, uid: -1 };
        render();
        document.querySelector('.hand .card:not(.mixcard)').dispatchEvent(new Event('mouseenter'));
        var content = getComputedStyle(document.getElementById('cardPeek'), '::after').content;
        RUN.setRun(saved); RUN.show('map');
        return content.indexOf('\u2026') !== -1 && content.indexOf('2026') === -1;
      })()); });
      check('Lives never read below zero', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.lives = 0;                                  // a costly choice made with nothing left to pay it
        run.pendingNode = { type: 'event', depth: 3, next: [0] };
        run.event = RUN.EVENTS.filter(function (e) { return e.title === 'A Spilled Palette'; })[0];
        run.eventTaken = false;
        RUN.chooseEventOption(0);
        var v = RUN.getRun().lives;
        RUN.setRun(saved);
        RUN.show('map');
        return v === 0;
      })()); });
      check('A chain belongs to the side that built it', function () { return ((function () {
        var battleState2 = { board: C.emptyBoard(), hazards: C.emptyHazards(),
          hands: { bottom: [], top: [] }, decks: { bottom: [], top: [] },
          relics: [], chains: { bottom: 0, top: 0 } };
        function put2(side, row, index, id, strength) { var cardDef = CARDS[id];
          battleState2.board[side][row][index] = { cardId: id, color: cardDef.color, strength: strength, temp: 0 }; }
        put2('bottom', 'row1', 0, 'red_brute', 3); put2('bottom', 'row2', 0, 'blue_scout', 3);
        put2('top', 'row1', 2, 'red_brute', 3); put2('top', 'row2', 2, 'blue_scout', 3);
        RUN.applyMix(battleState2, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
        var mine = battleState2.chains.bottom;
        RUN.applyMix(battleState2, 'top', { row: 'row1', index: 2 }, { row: 'row2', index: 2 }, 0, false);
        // the enemy mixing must not wipe the player's chain
        return mine === 1 && battleState2.chains.bottom === 1 && battleState2.chains.top === 1;
      })()); });
      check('Magenta Echo reads its own side\u2019s chain', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'magenta_echo', 3);
        var quiet = C.evaluateBoard(battleState2.board, battleState2.hazards, { chains: { bottom: 0, top: 3 } });
        var loud = C.evaluateBoard(battleState2.board, battleState2.hazards, { chains: { bottom: 2, top: 0 } });
        // +2 per link on its own side, and nothing from the enemy's
        return quiet.strengthOf(quiet.get('bottom', 'row1', 1)) === 3 &&
               loud.strengthOf(loud.get('bottom', 'row1', 1)) === 7;
      })()); });
      check('A curse unit reports as colourless', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'curse_husk', 1);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var v = e2.get('bottom', 'row1', 1);
        return v.color === null && v.colorless === true;
      })()); });
      check('Inspecting a colourless unit never reads an undefined colour', function () { return ((function () {
        // EFFECTIVE has no entry for null; anything indexing it must guard first
        return C.EFFECTIVE[null] === undefined && C.isEffective(null, 'red') === false &&
               C.isEffective('red', null) === false;
      })()); });
      check('A hazard-stripped unit is colourless too', function () { return ((function () {
        var battleState2 = fresh();
        battleState2.hazards.bottom.row1 = 'colorless';
        put(battleState2, 'bottom', 'row1', 1, 'red_brute', 3);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        return e2.get('bottom', 'row1', 1).colorless === true;
      })()); });
      check('A normal unit is not flagged colourless', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'red_brute', 3);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var v = e2.get('bottom', 'row1', 1);
        return v.colorless === false && v.color === 'red';
      })()); });
      check('The player opens the first battle of a run', function () { return ((function () {
        var saved = RUN.getRun();
        var allPlayer = true;
        for (var i = 0; i < 25; i++) {
          RUN.setRun(RUN.newRun());
          var run = RUN.getRun();
          run.pendingNode = { type: 'battle', enemy: 'brawler', depth: 0, next: [] };
          if (RUN.newBattle(run.pendingNode).turn !== 'bottom') allPlayer = false;
        }
        RUN.setRun(saved);
        return allPlayer;
      })()); });
      check('Later battles still flip a coin for the opener', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun(), seen = {};
        run.battlesFought = 5;
        run.pendingNode = { type: 'battle', enemy: 'brawler', depth: 4, next: [] };
        for (var i = 0; i < 200; i++) seen[RUN.newBattle(run.pendingNode).turn] = 1;
        RUN.setRun(saved);
        return seen.bottom && seen.top;
      })()); });
      check('The first-turn lesson no longer lists row minimums', function () { return ((function () {
        var txt = RUN.TUTORIAL_LESSONS.play({})[0].legend.join(' ');
        return txt.indexOf('minimum strength') === -1 && txt.indexOf('Row 2 needs') === -1;
      })()); });
      check('The line-breaks lesson is two points and names the whole cull', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
        put(battleState2, 'bottom', 'row2', 1, 'green_gardener', 3);
        put(battleState2, 'top', 'row1', 1, 'red_brute', 3);
        put(battleState2, 'bottom', 'row1', 3, 'magenta_chain', 5);
        var pre = C.cloneBoard(battleState2.board), preHaz = C.cloneHazards(battleState2.hazards);
        var e2 = C.evaluateBoard(pre, preHaz, {});
        var fallen = RUN.clearFrontlines(battleState2.board, battleState2.hazards, {});
        var cards = RUN.TUTORIAL_LESSONS.roundbreak({ board: pre, hazards: preHaz, ev: e2,
          after: battleState2.board, fallen: fallen, evalCtx: {} });
        var txt = cards[0].legend.join(' ');
        return cards[0].legend.length === 2 &&
               txt.indexOf('both sides, all of them') !== -1 &&
               txt.indexOf('steps up and holds') === -1;
      })()); });
      /* ---- Rewind and fissures ---- */
      check('Sever cuts one seam, on one side only', function () { return ((function () {
        // the seam between Row 2 #1 and Row 1 #2
        var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
        var topology = C.boardTopo(fissures);
        return C.lanesOfFor('bottom', 'row2', 1, topology).join() === '1' &&
               C.lanesOfFor('top', 'row2', 1, topology).join() === '1,2' &&
               C.lanesOfFor('bottom', 'row2', 0, topology).join() === '0,1' &&
               C.adjacentTilesFor('bottom', 'row2', 1, topology).length ===
                 C.adjacentTiles('row2', 1).length - 1 &&
               C.adjacentTilesFor('top', 'row2', 1, topology).length === C.adjacentTiles('row2', 1).length;
      })()); });
      check('A crack blocks adjacency in both directions', function () { return ((function () {
        var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
        var topology = C.boardTopo(fissures);
        var up = C.adjacentTilesFor('bottom', 'row1', 2, topology)
          .some(function (t) { return t.row === 'row2' && t.index === 1; });
        var down = C.adjacentTilesFor('bottom', 'row2', 1, topology)
          .some(function (t) { return t.row === 'row1' && t.index === 2; });
        return !up && !down;
      })()); });
      check('A Row 3 tile keeps the lanes its intact neighbour still offers', function () { return ((function () {
        // cut row3#0 from row2#0: it should keep only what row2#1 reaches
        var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row3', index: 0 }, b: { row: 'row2', index: 0 } }];
        var topology = C.boardTopo(fissures);
        return C.lanesOfFor('bottom', 'row3', 0, topology).join() === '1,2' &&
               C.lanesOfFor('bottom', 'row3', 0, null).join() === '0,1,2';
      })()); });
      check('A severed link never strands a tile', function () { return ((function () {
        var fissures = [], guard = 0;
        while (guard++ < 40) {
          var available = C.severableLinks('bottom', fissures);
          if (!available.length) break;
          fissures.push(available[0]);
        }
        if (guard >= 40) return false;                 // must saturate, not loop
        var topology = C.boardTopo(fissures), okAll = true;
        C.ROWS.forEach(function (row) {
          for (var i = 0; i < C.ROW_INFO[row].count; i++) {
            if (!C.lanesOfFor('bottom', row, i, topology).length) okAll = false;
          }
        });
        return okAll && fissures.length > 0;
      })()); });
      check('A severed lane loses the share, it is not rerouted', function () { return ((function () {
        var b = C.emptyBoard();
        b.bottom.row2[1] = { cardId: null, color: 'red', strength: 6, temp: 0 };
        var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
        var e0 = C.evaluateBoard(b, null, { fissures: [] });
        var e1 = C.evaluateBoard(b, null, { fissures: fissures });
        return e0.shares['bottom-row2-1'][1] === 3 && e0.shares['bottom-row2-1'][2] === 3 &&
               e1.shares['bottom-row2-1'][2] === undefined && !e1.lanes[2].bottom;
      })()); });
      check('A crack drains the units on both of its tiles', function () { return ((function () {
        var b = C.emptyBoard();
        b.bottom.row2[1] = { cardId: null, color: 'red', strength: 6, temp: 0 };
        b.bottom.row1[2] = { cardId: null, color: 'red', strength: 5, temp: 0 };
        var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
        var e0 = C.evaluateBoard(b, null, { fissures: [] });
        var e1 = C.evaluateBoard(b, null, { fissures: fissures });
        var drainAmount = C.FISSURE_DRAIN;
        return e1.view['bottom-row2-1'].bonus === e0.view['bottom-row2-1'].bonus - drainAmount &&
               e1.view['bottom-row1-2'].bonus === e0.view['bottom-row1-2'].bonus - drainAmount;
      })()); });
      check('A heavy drain empties a unit rather than making it negative', function () { return ((function () {
        var b = C.emptyBoard();
        b.bottom.row1[1] = { cardId: null, color: 'red', strength: 1, temp: 0 };
        var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 1 } },
                 { kind: 'sever', side: 'bottom', a: { row: 'row2', index: 0 }, b: { row: 'row1', index: 1 } }];
        var e = C.evaluateBoard(b, null, { fissures: fissures });
        var v = e.view['bottom-row1-1'];
        return Math.max(0, v.base + v.bonus) === 0 && e.totals.bottom >= 0;
      })()); });
      check('Mixing cannot reach across a fissure', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 2, 'red_brute', 3);
        put(battleState2, 'bottom', 'row2', 1, 'green_gardener', 3);
        var whole = RUN.canMix(battleState2.board, 'bottom', { row: 'row2', index: 1 }, { row: 'row1', index: 2 }, []);
        var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
        var cracked = RUN.canMix(battleState2.board, 'bottom', { row: 'row2', index: 1 }, { row: 'row1', index: 2 }, fissures);
        var opts = RUN.mixOptions(battleState2.board, 'bottom', fissures);
        return whole.ok && !cracked.ok && cracked.reason.indexOf('fissure') !== -1 && opts.length === 0;
      })()); });
      check('An aura does not cross a fissure', function () { return ((function () {
        var aura = Object.keys(C.CARDS).filter(function (key) { return C.CARDS[key].aura && C.CARDS[key].type === 'unit'; })[0];
        if (!aura) return true;
        var b = C.emptyBoard();
        b.bottom.row2[1] = { cardId: aura, color: C.CARDS[aura].color, strength: C.CARDS[aura].strength || 3, temp: 0 };
        b.bottom.row1[2] = { cardId: null, color: 'red', strength: 4, temp: 0 };
        var e0 = C.evaluateBoard(b, null, { fissures: [] });
        var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
        var e1 = C.evaluateBoard(b, null, { fissures: fissures });
        // the neighbour keeps only the drain, never the aura
        return e1.view['bottom-row1-2'].bonus < e0.view['bottom-row1-2'].bonus;
      })()); });
      check('The instability meter overflows and carries the remainder', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        RUN.addInstability(RUN.REWIND.THRESHOLD + 30, PLAYER, C.emptyBoard());
        var okOne = run.fissures.length === 1 && Math.abs(run.instability - 30) < 1e-9;
        RUN.setRun(saved);
        return okOne;
      })()); });
      check('Rewind chunk size grows with lifetime use and never resets', function () { return ((function () {
        var run = { rewindsUsed: 0 }, a = RUN.rewindChunk(run, 1);
        run.rewindsUsed = 9;
        var b = RUN.rewindChunk(run, 1);
        // by the tenth use one chunk alone must clear the threshold
        return a === RUN.REWIND.BASE_CHUNK && b > RUN.REWIND.THRESHOLD;
      })()); });
      check('Impact is calibrated so an ordinary exchange scores about 1.0', function () { return ((function () {
        function imp(cardsGone, mixes, unitsBefore, unitsAfter, swing) {
          return RUN.rewindImpact(
            { handCount: { bottom: 6, top: 6 }, mixesThisRound: 0 },
            { hands: { bottom: new Array(6 - cardsGone), top: new Array(6) }, mixesThisRound: mixes },
            { totals: { bottom: 10, top: 10 }, units: { bottom: unitsBefore, top: 2 } },
            { totals: { bottom: 10 + swing, top: 10 }, units: { bottom: unitsAfter, top: 2 } });
        }
        var nothing = imp(0, 0, 2, 2, 0);          // took back a pass answered by a pass
        var ordinary = imp(2, 0, 2, 2, 2);         // one card each way, nothing died
        var big = imp(2, 1, 3, 2, 24);             // a mix, a death and a big swing
        return Math.abs(nothing - 0.5) < 1e-9 &&
               ordinary > 0.9 && ordinary < 1.15 &&
               big > ordinary && big <= RUN.REWIND.MAX_IMPACT;
      })()); });
      check('A saturated board deepens instead of looping or going quiet', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        for (var i = 0; i < 60; i++) RUN.addInstability(RUN.REWIND.THRESHOLD * 2, PLAYER, C.emptyBoard());
        var noRoom = C.severableLinks(PLAYER, run.fissures).length === 0 &&
                     C.bridgeableLinks(PLAYER, run.fissures).length === 0;
        var allMaxed = run.fissures.every(function (fissure) { return C.fissurePower(fissure) === C.FISSURE_MAX_POWER; });
        var noTileStranded = true, topo = C.boardTopo(run.fissures);
        C.ROWS.forEach(function (row) {
          for (var i = 0; i < C.ROW_INFO[row].count; i++)
            if (!C.lanesOfFor(PLAYER, row, i, topo).length) noTileStranded = false;
        });
        RUN.setRun(saved);
        return noRoom && allMaxed && noTileStranded && run.fissures.length > 5;
      })()); });
      check('One Rewind damages the board at most once', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        // a chunk worth twenty thresholds must still cost exactly one scar
        var before = run.fissures.length;
        var ev = RUN.addInstability(RUN.REWIND.THRESHOLD * 20, PLAYER, C.emptyBoard());
        var one = ev.length === 1 && run.fissures.length === before + 1;
        // and it must not bank an overflow that fires again for free
        var carried = run.instability < RUN.REWIND.THRESHOLD;
        var ev2 = RUN.addInstability(0, PLAYER, C.emptyBoard());
        RUN.setRun(saved);
        return one && carried && ev2.length === 0;
      })()); });
      check('Riftwalker thrives on damage, then drowns in it', function () { return ((function () {
        function at(power) {
          var board = C.emptyBoard();
          board.bottom.row2[1] = { cardId: 'black_riftwalker', color: 'black', strength: 3, temp: 0 };
          var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 }, power: power }];
          var view = C.evaluateBoard(board, null, { fissures: fissures }).view['bottom-row2-1'];
          return Math.max(0, view.base + view.bonus);
        }
        // climbs to a peak at 4, is back to par by 6, and is a liability past that
        return at(1) === 5 && at(4) === 11 && at(4) > at(5) && at(7) < 3 && at(8) === 0;
      })()); });
      check('Chorus grows with the board\u2019s scars but is capped', function () { return ((function () {
        function at(power) {
          var fissures = C.severableLinks('bottom', []).slice(0, power);
          var board = C.emptyBoard();
          board.bottom.row3[0] = { cardId: 'black_chorus', color: 'black', strength: 2, temp: 0 };
          var view = C.evaluateBoard(board, null, { fissures: fissures }).view['bottom-row3-0'];
          return Math.max(0, view.base + view.bonus);
        }
        return at(0) === 2 && at(3) > at(0) && at(7) <= at(5);
      })()); });
      check('Cyan quiets damage for the round without healing it', function () { return ((function () {
        var battleState2 = fresh();
        var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 }, power: 2 }];
        battleState2.fissures = fissures;
        put(battleState2, 'bottom', 'row2', 1, 'red_brute', 8);
        var loud = C.evaluateBoard(battleState2.board, battleState2.hazards, RUN.evalCtx(battleState2));
        var api = RUN.buildApi ? null : null;
        // play the Mender onto the damaged tile through the real resolver
        var battleState3 = RUN.simGame(battleState2);
        battleState3.fissures = fissures;
        RUN.resolveCard(battleState3, 'bottom', { id: 'cyan_mender' }, { row: 'row1', index: 2 }, []);
        var quiet = C.evaluateBoard(battleState3.board, battleState3.hazards, RUN.evalCtx(battleState3));
        var reachesAgain = C.lanesOfFor('bottom', 'row2', 1, C.boardTopo(RUN.evalCtx(battleState3).fissures)).length === 2;
        // the scar itself is untouched: it is still on the run's list
        return quiet.view['bottom-row2-1'].bonus > loud.view['bottom-row2-1'].bonus &&
               reachesAgain && fissures.length === 1 && battleState3.quieted &&
               Object.keys(battleState3.quieted).length === 1;
      })()); });
      check('A bridge joins two tiles that only meet at a corner', function () { return ((function () {
        var pairs = C.bridgePairs();
        var everyPairIsNew = pairs.every(function (pr) {
          return !C.adjacentTiles(pr.a.row, pr.a.index)
            .some(function (t) { return C.sameTile(t, pr.b); });
        });
        var corner = C.sharedCorner('bottom', { row: 'row2', index: 0 }, { row: 'row2', index: 1 });
        return pairs.length === 8 && everyPairIsNew && !!corner;
      })()); });
      check('A bridge carries adjacency both ways', function () { return ((function () {
        var fissures = [{ kind: 'bridge', side: 'bottom', a: { row: 'row2', index: 0 }, b: { row: 'row2', index: 1 }, power: 1 }];
        var topology = C.boardTopo(fissures);
        var fwd = C.adjacentTilesFor('bottom', 'row2', 0, topology).some(function (t) { return C.sameTile(t, { row: 'row2', index: 1 }); });
        var back = C.adjacentTilesFor('bottom', 'row2', 1, topology).some(function (t) { return C.sameTile(t, { row: 'row2', index: 0 }); });
        var enemyUntouched = !C.adjacentTilesFor('top', 'row2', 0, topology).some(function (t) { return C.sameTile(t, { row: 'row2', index: 1 }); });
        return fwd && back && enemyUntouched;
      })()); });
      check('A forward bridge grants a lane, paid for by thinner shares', function () { return ((function () {
        // row3#0 meets row1#1 only at a corner; bridging reaches lane 1 directly
        var fissures = [{ kind: 'bridge', side: 'bottom', a: { row: 'row3', index: 0 }, b: { row: 'row1', index: 1 }, power: 1 }];
        var b = C.emptyBoard();
        b.bottom.row3[0] = { cardId: null, color: 'red', strength: 6, temp: 0 };
        var whole = C.evaluateBoard(b, null, { fissures: [] });
        var bridged = C.evaluateBoard(b, null, { fissures: fissures });
        var lanesWhole = C.lanesOfFor('bottom', 'row3', 0, null).length;
        var lanesBridged = C.lanesOfFor('bottom', 'row3', 0, C.boardTopo(fissures)).length;
        var shareWhole = whole.shares['bottom-row3-0'][0];
        var shareBridged = bridged.shares['bottom-row3-0'][0];
        return lanesBridged === lanesWhole && shareBridged <= shareWhole;
      })()); });
      check('A bridge drains the tiles it joins', function () { return ((function () {
        var b = C.emptyBoard();
        b.bottom.row2[0] = { cardId: null, color: 'red', strength: 6, temp: 0 };
        b.bottom.row2[1] = { cardId: null, color: 'red', strength: 6, temp: 0 };
        var fissures = [{ kind: 'bridge', side: 'bottom', a: { row: 'row2', index: 0 }, b: { row: 'row2', index: 1 }, power: 1 }];
        var e0 = C.evaluateBoard(b, null, { fissures: [] });
        var e1 = C.evaluateBoard(b, null, { fissures: fissures });
        return e1.view['bottom-row2-0'].bonus === e0.view['bottom-row2-0'].bonus - C.FISSURE_DRAIN &&
               e1.view['bottom-row2-1'].bonus === e0.view['bottom-row2-1'].bonus - C.FISSURE_DRAIN;
      })()); });
      check('A deepened scar pulls harder in proportion to its power', function () { return ((function () {
        var b = C.emptyBoard();
        b.bottom.row2[1] = { cardId: null, color: 'red', strength: 9, temp: 0 };
        function drainAt(power) {
          var fissures = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 }, power: power }];
          var e = C.evaluateBoard(b, null, { fissures: fissures });
          return e.view['bottom-row2-1'].bonus;
        }
        return drainAt(1) - drainAt(3) === 2 * C.FISSURE_DRAIN &&
               C.fissuresTouching('bottom', 'row2', 1,
                 [{ side: 'bottom', kind: 'sever', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 }, power: 3 }]) === 3;
      })()); });
      check('Rewind is offered only after the player has moved, once per round', function () { return ((function () {
        var savedRun = RUN.getRun(), savedState = RUN.getState();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.pendingNode = { type: 'battle', enemy: 'brawler', depth: 1, next: [0] };
        var newState = RUN.newBattle(run.pendingNode);
        RUN.setState(newState);
        newState.turn = PLAYER;
        var noneYet = !canRewind();                       // nothing to take back
        markRewindPoint(PLAYER);
        var armed = canRewind();
        newState.rewindUsedThisRound = true;
        var spent = !canRewind();                         // hard cap holds
        RUN.setState(savedState); RUN.setRun(savedRun);
        return noneYet && armed && spent;
      })()); });
      check('Rewind restores the board, hands and turn exactly', function () { return ((function () {
        var savedRun = RUN.getRun(), savedState = RUN.getState();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.pendingNode = { type: 'battle', enemy: 'brawler', depth: 1, next: [0] };
        var newState = RUN.newBattle(run.pendingNode);
        RUN.setState(newState);
        newState.turn = PLAYER;
        var snap = snapshotForRewind(newState);
        var beforeBoard = JSON.stringify(newState.board), beforeHand = newState.hands.bottom.length;
        // mangle the state the way a played turn would
        newState.board.bottom.row1[0] = { cardId: 'red_brute', color: 'red', strength: 5, temp: 0 };
        newState.hands.bottom.pop();
        newState.turn = ENEMY; newState.finalTurn = true; newState.mixTokens.bottom = 0;
        restoreRewind(newState, snap);
        var okAll = JSON.stringify(newState.board) === beforeBoard &&
                    newState.hands.bottom.length === beforeHand &&
                    newState.turn === PLAYER && newState.finalTurn === false && newState.mixTokens.bottom === 1;
        RUN.setState(savedState); RUN.setRun(savedRun);
        return okAll;
      })()); });
      check('The AI plans on the cracked board, not the pristine one', function () { return ((function () {
        var battleState = { board: C.emptyBoard(), hazards: C.emptyHazards(),
          hands: { bottom: [], top: [] }, decks: { bottom: [], top: [] },
          fissures: [{ kind: 'sever', side: 'bottom', row: 'row2', index: 1, lane: 2 }] };
        var sim = RUN.simGame(battleState);
        return sim.fissures.length === 1 && RUN.evalCtx(battleState).fissures.length === 1;
      })()); });

      check('Every map node lists at least one onward path', function () { return ((function () {
        var map = RUN.buildMap();
        for (var depth = 0; depth < map.length - 1; depth++) {
          for (var i = 0; i < map[depth].length; i++) if (!map[depth][i].next.length) return false;
        }
        return true;
      })()); });
      check('The enemy brings enough cards to last three rounds', function () { return ((function () {
        /* The player opens on 6 and draws 2 a round, so a full battle is about ten
           cards. A ten-card enemy deck ran dry in round three and the fight ended
           by attrition rather than by play. */
        var early = C.buildEnemyDeck(ENEMIES.brawler, 1, Math.random).length;
        var late = C.buildEnemyDeck(ENEMIES.brawler, 40, Math.random).length;
        var boss = C.buildEnemyDeck(ENEMIES.spectrum, 40, Math.random).length;
        return early >= 12 && late > early && boss > late && boss <= 26;
      })()); });
      check('Enemy decks respect their colours', function () { return (C.buildEnemyDeck(ENEMIES.brawler, 9, Math.random).every(function (c) {
        var cardDef = CARDS[c.id];
        return cardDef.type !== 'unit' || ENEMIES.brawler.colors.indexOf(cardDef.color) !== -1;
      })); });
      check('Opening battles carry no depth bonus', function () { return (RUN.depthBonusFor(0) === 0 && RUN.depthBonusFor(5) === 0); });
      check('The bonus steps up toward the boss',
        function () { return (RUN.depthBonusFor(7) === 1 && RUN.depthBonusFor(10) === 1 && RUN.depthBonusFor(12) === 2); },
        function () { return ([7, 10, 12].map(RUN.depthBonusFor).join('/')); });
      check('Enemies scale with act depth', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'top', 'row1', 0, 'red_brute', 2);
        var early = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { depthBonus: 0 } });
        var late = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { depthBonus: 3 } });
        return early.strengthOf(early.get('top', 'row1', 0)) === 2 && late.strengthOf(late.get('top', 'row1', 0)) === 5;
      })()); });
      check('The depth bonus never touches your units', function () { return ((function () {
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row1', 0, 'red_brute', 2);
        var e2 = C.evaluateBoard(battleState2.board, battleState2.hazards, { enemyMod: { depthBonus: 3 } });
        return e2.strengthOf(e2.get('bottom', 'row1', 0)) === 2;
      })()); });
      check('Every relic has text and a price', function () { return (Object.keys(RELICS).every(function (key) { return RELICS[key].text && RELICS[key].cost > 0; })); });
      check('Every card has a price', function () { return (C.DRAWABLE.every(function (key) { return CARDS[key].cost > 0; })); });
}
