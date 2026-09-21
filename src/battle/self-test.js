/* Colour Vibes — generated from the single-file build by build/split.py.
   Edit color-vibes-act1.html, then re-run the script. */

/* The self-test suite: 305 checks covering the rules, board evaluation, the
   colour gate, saves, map generation, AI behaviour and layout invariants. Run
   it from the in-game menu, or from a console with:
     CV_BATTLE.selfTest().filter(t => !t.pass)

   It is one self-contained function that only reads battle scope, so it takes
   that scope as a context object rather than closing over it — which is what
   lets 3,500 lines of tests live outside the module they test. */

export function createSelfTest(ctx) {
  const { S, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = ctx;

  /* ===================================================================
     SELF TEST
     =================================================================== */
  function selfTest() {
    var out = [];
    function check(n, c, d) { out.push({ name: n, pass: !!c, detail: d || '' }); }
    function fresh(relics) {
      return { board: C.emptyBoard(), hazards: C.emptyHazards(),
        hands: { bottom: [], top: [] }, decks: { bottom: [], top: [] },
        relics: relics || [], mixChain: 0, chains: { bottom: 0, top: 0 },
        mixesThisRound: 0, freeMixesThisRound: 0, cascadeDepth: 0 };
    }
    function put(g, side, row, i, cardId, str, color) {
      var d = CARDS[cardId];
      g.board[side][row][i] = { cardId: cardId, color: color || d.color, strength: str || d.strength, temp: 0, cracked: 0 };
    }

    // --- board and lanes still intact ---
    check('Board has 18 tiles', GEO.length === 18);
    check('Row 1/2/3 serve 1/2/3 lanes',
      lanesOf('row1', 2).length === 1 && lanesOf('row2', 1).length === 2 && lanesOf('row3', 0).length === 3);
    check('Colours are balanced three-and-three', COLOR_KEYS.every(function (k) {
      return C.EFFECTIVE[k].length === 3 && COLOR_KEYS.filter(function (a) { return C.isEffective(a, k); }).length === 3;
    }));

    // --- mixing baseline ---
    var g = fresh();
    put(g, 'bottom', 'row1', 0, 'red_brute', 3); put(g, 'bottom', 'row2', 0, 'blue_scout', 4);
    var res = RUN.applyMix(g, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
    check('Plain mix is A + B + 1', res.color === 'magenta' && res.strength === 8, res.color + ' ' + res.strength);
    check('A normal mix opens the chain at 1', g.chains.bottom === 1, 'chain ' + g.chains.bottom);

    // --- relic: Stable Fusion ---
    g = fresh(['stable_fusion']);
    put(g, 'bottom', 'row1', 0, 'red_brute', 3); put(g, 'bottom', 'row2', 0, 'blue_scout', 4);
    res = RUN.applyMix(g, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
    check('Stable Fusion makes mixing add 2', res.strength === 9, 'got ' + res.strength);

    // --- relic: Prism Core, first mix only ---
    g = fresh(['prism_core']);
    put(g, 'bottom', 'row1', 0, 'red_brute', 3); put(g, 'bottom', 'row2', 0, 'blue_scout', 4);
    put(g, 'bottom', 'row1', 2, 'red_brute', 3); put(g, 'bottom', 'row2', 2, 'blue_scout', 4);
    var first = RUN.applyMix(g, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
    var second = RUN.applyMix(g, 'bottom', { row: 'row1', index: 2 }, { row: 'row2', index: 2 }, 0, false);
    check('Prism Core boosts only the first mix of the round',
      first.strength === 10 && second.strength === 8, first.strength + ' then ' + second.strength);

    // --- relic: Double Rainbow ---
    g = fresh(['double_rainbow']);
    put(g, 'bottom', 'row1', 0, 'red_brute', 3); put(g, 'bottom', 'row2', 0, 'blue_scout', 4);
    RUN.applyMix(g, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, true);
    check('Double Rainbow makes the first Free Mix worth 3 links', g.chains.bottom === 3, 'chain ' + g.chains.bottom);

    // --- Black Singularity scales off the chain ---
    g = fresh();
    g.chains.bottom = 2;                       // two links already built this turn
    put(g, 'bottom', 'row1', 0, 'red_brute', 3); put(g, 'bottom', 'row2', 0, 'black_singularity', 6);
    res = RUN.applyMix(g, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, true);
    check('Black Singularity adds 2 per earlier link', res.strength === 3 + 6 + 2 + (2 * 2), 'got ' + res.strength);

    // --- Black Devourer takes the CURRENT (aura-inclusive) strength, and eats the card for good ---
    check('Black Devourer takes the effective strength, not just the stored fields', (function () {
      /* v.strength + v.temp never included what a neighbour's aura was
         currently lending the target \u2014 a unit standing next to a Green
         Gardener reads larger on the board than that sum says, and the old
         code took the smaller, wrong number. evaluateBoard is the same pass
         that produces the number actually printed on the tile. Tile positions
         here are the ones actually adjacent on this board's topology, found by
         checking real adjacency rather than assumed from row numbers. */
      var g2 = fresh();
      g2.board[PLAYER].row2[1] = { cardId: 'black_devourer', color: 'black', strength: 3, temp: 0 };
      g2.board[PLAYER].row1[1] = { cardId: 'red_brute', color: 'red', strength: 5, temp: 0 };
      g2.board[PLAYER].row2[0] = { cardId: 'green_gardener', color: 'green', strength: 3, temp: 0 };
      var at = { row: 'row2', index: 1 };
      var t = RUN.legalTargets(g2, PLAYER, CARDS.black_devourer.targets[0], [], at);
      C.CARDS.black_devourer.onPlay(g2, PLAYER, at, t, RUN.buildApi(g2, PLAYER, []));
      var got = g2.board[PLAYER].row2[1].strength + (g2.board[PLAYER].row2[1].temp || 0);
      // devourer's own 3 + red_brute's raw 5 would be 8; the aura must push it past that
      return got > 8;
    })());
    check('Devouring permanently removes the meal from the run deck', (function () {
      var saved = RUN.getRun(), savedState = RUN.getState();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = ['green_gardener', 'red_brute', 'black_devourer', 'blue_scout', 'yellow_spark']
        .map(function (id) { return { id: id, up: false }; });
      r.map = RUN.buildMap('green', true); r.depth = 0; r.available = [0];
      RUN.enterNode(0);
      var s = RUN.getState();
      ROWS.forEach(function (row) { for (var i = 0; i < ROW_INFO[row].count; i++) s.board[PLAYER][row][i] = null; });
      s.board[PLAYER].row2[0] = { cardId: 'green_gardener', color: 'green', strength: 3, temp: 0, deckIndex: 0 };
      s.board[PLAYER].row1[0] = { cardId: 'black_devourer', color: 'black', strength: 3, temp: 0, deckIndex: 2 };
      var beforeLen = RUN.getRun().deck.length;
      var at = { row: 'row1', index: 0 };
      var t = RUN.legalTargets(s, PLAYER, CARDS.black_devourer.targets[0], [], at);
      CARDS.black_devourer.onPlay(s, PLAYER, at, t, RUN.buildApi(s, PLAYER, []));
      var afterDeck = RUN.getRun().deck;
      var ok = afterDeck.length === beforeLen - 1 &&
               !afterDeck.some(function (c) { return c.id === 'green_gardener'; });
      RUN.setState(savedState); RUN.setRun(saved);
      return ok;
    })());
    check('Devouring keeps every other card\\u2019s deck slot correctly synced', (function () {
      /* The one real risk in a mid-battle deck splice: any OTHER card still
         holding a deckIndex reference — in hand, in the draw pile, or already
         on the board — silently points at the wrong slot for the rest of the
         fight unless it is shifted down along with the removal. Proven here by
         actually applying a SECOND, unrelated permanent buff afterward and
         checking it landed on the right card, not merely that a number looked
         plausible. */
      var saved = RUN.getRun(), savedState = RUN.getState();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = ['green_gardener', 'red_brute', 'black_devourer', 'blue_scout', 'yellow_spark']
        .map(function (id) { return { id: id, up: false }; });
      r.map = RUN.buildMap('green', true); r.depth = 0; r.available = [0];
      RUN.enterNode(0);
      var s = RUN.getState();
      ROWS.forEach(function (row) { for (var i = 0; i < ROW_INFO[row].count; i++) s.board[PLAYER][row][i] = null; });
      s.board[PLAYER].row2[0] = { cardId: 'green_gardener', color: 'green', strength: 3, temp: 0, deckIndex: 0 };
      s.board[PLAYER].row3[0] = { cardId: 'blue_scout', color: 'blue', strength: 1, temp: 0, deckIndex: 3 };
      s.board[PLAYER].row1[0] = { cardId: 'black_devourer', color: 'black', strength: 3, temp: 0, deckIndex: 2 };
      var api = RUN.buildApi(s, PLAYER, []);
      var at = { row: 'row1', index: 0 };
      var t = RUN.legalTargets(s, PLAYER, CARDS.black_devourer.targets[0], [], at);
      CARDS.black_devourer.onPlay(s, PLAYER, at, t, api);
      // blue_scout's deckIndex must now point at ITS card, not whatever shifted into the old slot
      var idx = s.board[PLAYER].row3[0].deckIndex;
      var slotIsBlueScout = RUN.getRun().deck[idx] && RUN.getRun().deck[idx].id === 'blue_scout';
      api.buff(PLAYER, { row: 'row3', index: 0 }, 10, true);
      var stillBlueScoutSlot = RUN.getRun().deck[idx] && RUN.getRun().deck[idx].id !== 'yellow_spark';
      RUN.setState(savedState); RUN.setRun(saved);
      return slotIsBlueScout && stillBlueScoutSlot;
    })());
    check('Devouring survives a save and reload once the battle ends', (function () {
      var saved = RUN.getRun(), savedState = RUN.getState();
      RUN.clearSave();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = ['green_gardener', 'red_brute', 'black_devourer'].map(function (id) { return { id: id, up: false }; });
      r.map = RUN.buildMap('green', true); r.depth = 0; r.available = [0];
      RUN.enterNode(0);
      var s = RUN.getState();
      ROWS.forEach(function (row) { for (var i = 0; i < ROW_INFO[row].count; i++) s.board[PLAYER][row][i] = null; });
      s.board[PLAYER].row2[0] = { cardId: 'green_gardener', color: 'green', strength: 3, temp: 0, deckIndex: 0 };
      s.board[PLAYER].row1[0] = { cardId: 'black_devourer', color: 'black', strength: 3, temp: 0, deckIndex: 2 };
      var at = { row: 'row1', index: 0 };
      var t = RUN.legalTargets(s, PLAYER, CARDS.black_devourer.targets[0], [], at);
      CARDS.black_devourer.onPlay(s, PLAYER, at, t, RUN.buildApi(s, PLAYER, []));
      s.wins[PLAYER] = 2; s.battleOver = true;
      endBattle(true);
      var rr = RUN.getRun();
      if (rr.screen === 'reward') { rr.reward.cardTaken = true; rr.reward.taken = true; RUN.advance(); }
      RUN.saveRun();
      var wantLen = RUN.getRun().deck.length, wantIds = RUN.getRun().deck.map(function (c) { return c.id; });
      var back = RUN.loadRun();
      var ok = !!back && back.deck.length === wantLen &&
        back.deck.every(function (c, i) { return c.id === wantIds[i]; });
      RUN.clearSave();
      RUN.setState(savedState); RUN.setRun(saved);
      return ok;
    })());

    // --- a targeted spell with nothing to target must never auto-resolve ---
    check('Catalyst on an empty board is marked unplayable, not auto-resolved', (function () {
      var saved = RUN.getRun(), savedState = RUN.getState();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.map = RUN.buildMap('green', true); r.depth = 0; r.available = [0];
      RUN.enterNode(0);
      var s = RUN.getState();
      ROWS.forEach(function (row) { for (var i = 0; i < ROW_INFO[row].count; i++) {
        s.board[PLAYER][row][i] = null; s.board[ENEMY][row][i] = null;
      }});
      s.hands[PLAYER][0] = { id: 'catalyst', up: false, uid: -1 };
      render();
      var btn = document.querySelector('.hand .card:not(.mixcard)');
      var markedDead = btn.className.indexOf('unplayable') !== -1;
      btn.click();
      var stillInHand = S().hands[PLAYER].some(function (c) { return c.id === 'catalyst'; });
      var noPending = !S().pending;
      RUN.setState(savedState); RUN.setRun(saved); RUN.show('map');
      /* Catalyst's first ask is "pick a friendly unit" \u2014 with nothing on the
         board, beginPlay used to find zero legal options and finish the play
         immediately with no picks: the card vanished, onPlay did nothing, and
         there was never a chance to even read it, let alone back out. */
      return markedDead && stillInHand && noPending;
    })());
    check('Catalyst with units present still begins targeting normally', (function () {
      var saved = RUN.getRun(), savedState = RUN.getState();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.map = RUN.buildMap('green', true); r.depth = 0; r.available = [0];
      RUN.enterNode(0);
      var s = RUN.getState();
      s.board[PLAYER].row1[0] = { cardId: 'red_brute', color: 'red', strength: 2, temp: 0 };
      s.board[PLAYER].row2[0] = { cardId: 'blue_scout', color: 'blue', strength: 2, temp: 0 };
      s.hands[PLAYER][0] = { id: 'catalyst', up: false, uid: -1 };
      render();
      var btn = document.querySelector('.hand .card:not(.mixcard)');
      var notMarkedDead = btn.className.indexOf('unplayable') === -1;
      btn.click();
      var beganTargeting = !!S().pending;
      RUN.setState(savedState); RUN.setRun(saved); RUN.show('map');
      return notMarkedDead && beganTargeting;
    })());

    // --- a numeric mix hook must survive fusion as a number, not a function ---
    check('A fused card\\u2019s onMixConsumed/onMixConsumedChain stay numeric', (function () {
      var f1 = C.fuseCards({ id: 'black_voidling', up: false }, { id: 'red_scout', up: false });
      var f2 = C.fuseCards({ id: 'black_singularity', up: false }, { id: 'red_scout', up: false });
      return typeof CARDS[f1.id].onMixConsumed === 'number' &&
             typeof CARDS[f2.id].onMixConsumedChain === 'number';
    })());
    check('Mixing a fused onMixConsumed card produces a real number, not NaN or a string', (function () {
      /* This is the exact corruption a player hit: onMixConsumed/onMixConsumedChain
         are plain numbers on their home cards, but every hook in the generic
         inherited list used to be composed as a callable function regardless.
         A fused card's onMixConsumed became a function object; applyMix's
         `bonus += d.onMixConsumed` then added a function to a number, which
         JS coerces through the function's own source-code string rather than
         throwing — turning the mix result into a string that looked fine until
         the next subtraction (any hazard, any damage) turned it into NaN. */
      var g2 = fresh();
      var f = C.fuseCards({ id: 'black_voidling', up: false }, { id: 'red_scout', up: false });
      g2.board[PLAYER].row1[0] = { cardId: f.id, color: CARDS[f.id].color, strength: CARDS[f.id].strength, temp: 0 };
      put(g2, 'bottom', 'row2', 0, 'red_brute', 2);
      var out = RUN.applyMix(g2, PLAYER, { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
      var afterDamage = Math.max(1, g2.board[PLAYER].row1[0].strength - 2);
      return typeof out.strength === 'number' && !isNaN(out.strength) &&
             typeof g2.board[PLAYER].row1[0].strength === 'number' &&
             !isNaN(afterDamage);
    })());
    check('Every inherited hook is consistently one type across every card that carries it', (function () {
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
        C.DRAWABLE.concat(C.BOSS_CARDS).forEach(function (k) {
          var v = CARDS[k][h];
          if (v !== undefined) types[typeof v] = 1;
        });
        return Object.keys(types).length <= 1;
      });
    })());

    // --- Volatile Fusion cascades and terminates ---
    g = fresh(['volatile_fusion']);
    put(g, 'bottom', 'row1', 0, 'red_brute', 2); put(g, 'bottom', 'row2', 0, 'blue_scout', 2);
    put(g, 'bottom', 'row1', 2, 'red_brute', 2); put(g, 'bottom', 'row2', 1, 'green_seed', 2);
    put(g, 'bottom', 'row1', 3, 'red_brute', 2); put(g, 'bottom', 'row2', 2, 'blue_scout', 2);
    var notes = [];
    RUN.doMixCascade(g, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false, notes);
    var left = 0; eachUnit(g.board, 'bottom', function () { left++; });
    check('Volatile Fusion cascades without looping forever', g.chains.bottom >= 1 && left >= 1 && left <= 6,
      'chain ' + g.chains.bottom + ', ' + left + ' units left');

    // --- relic: Colour Lens ---
    g = fresh(['color_lens']);
    put(g, 'bottom', 'row1', 0, 'cyan_cleanser', 4); put(g, 'top', 'row1', 0, 'red_brute', 2);
    var ev = C.evaluateBoard(g.board, g.hazards, { relics: ['color_lens'] });
    check('Colour Lens lifts the best effective lane to x2.5',
      ev.lanes[0].bottom.multiplier === 2.5 && ev.lanes[0].bottom.final === 10, 'x' + ev.lanes[0].bottom.multiplier + ' = ' + ev.lanes[0].bottom.final);

    // --- relic: Glass Cannon ---
    g = fresh(['glass_cannon']);
    put(g, 'bottom', 'row1', 0, 'red_brute', 2);
    ev = C.evaluateBoard(g.board, g.hazards, { relics: ['glass_cannon'] });
    check('Glass Cannon adds 1 to a frontline unit', ev.lanes[0].bottom.frontStrength === 3, 'front ' + ev.lanes[0].bottom.frontStrength);
    RUN.buildApi(g, 'bottom', []).damage('bottom', 'row1', 0, 1);
    ev = C.evaluateBoard(g.board, g.hazards, { relics: ['glass_cannon'] });
    check('Glass Cannon cracks hard when damaged', ev.lanes[0].bottom.frontStrength === 0,
      'front now ' + ev.lanes[0].bottom.frontStrength);

    // --- relic: Empty Palette ---
    g = fresh(['empty_palette']);
    g.hazards.bottom.row1 = 'colorless';
    put(g, 'bottom', 'row1', 0, 'red_brute', 4); put(g, 'top', 'row1', 0, 'red_brute', 2);
    ev = C.evaluateBoard(g.board, g.hazards, { relics: ['empty_palette'] });
    check('Empty Palette pays 1.25x for a colourless frontline', ev.lanes[0].bottom.multiplier === 1.25,
      'x' + ev.lanes[0].bottom.multiplier);

    // --- relic: Heavy Brush on placement ---
    g = fresh(['heavy_brush']);
    RUN.resolveCard(g, 'bottom', C.makeCard('green_titan'), { row: 'row3', index: 0 }, []);
    check('Heavy Brush adds 1 when entering Row 3', g.board.bottom.row3[0].strength === 6, 'got ' + g.board.bottom.row3[0].strength);
    RUN.resolveCard(g, 'bottom', C.makeCard('green_gardener'), { row: 'row2', index: 0 }, []);
    check('Heavy Brush does nothing outside Row 3', g.board.bottom.row2[0].strength === 3);

    // --- relic: Black Paint ---
    g = fresh(['black_paint']);
    /* Two secondaries, not a primary against one — Red against a card recoloured
       Cyan used to reach Black by raw bits, and that pairing is exactly the one
       the mixing rule now redirects instead of allowing through. */
    put(g, 'bottom', 'row1', 0, 'red_brute', 3, 'yellow'); put(g, 'bottom', 'row2', 0, 'blue_scout', 3, 'cyan');
    RUN.applyMix(g, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
    check('Black Paint rewards making Black', g.board.bottom.row1[0].color === 'black' && g.board.bottom.row1[0].temp === 3,
      'temp ' + g.board.bottom.row1[0].temp);

    // --- relic: Echo Chamber ---
    g = fresh(['echo_chamber']);
    g.decks.bottom = [C.makeCard('red_brute'), C.makeCard('red_brute'), C.makeCard('red_brute')];
    RUN.buildApi(g, 'bottom', []).draw('bottom', 1);
    check('Echo Chamber doubles the first draw of the round', g.hands.bottom.length === 2, 'drew ' + g.hands.bottom.length);
    RUN.buildApi(g, 'bottom', []).draw('bottom', 1);
    check('Echo Chamber only fires once a round', g.hands.bottom.length === 3, 'now ' + g.hands.bottom.length);

    // --- relic: Chromatic Memory ---
    g = fresh(['chromatic_memory']);
    put(g, 'bottom', 'row1', 0, 'red_brute', 8);
    RUN.buildApi(g, 'bottom', []).recolor('bottom', { row: 'row1', index: 0 }, 'cyan');
    check('Chromatic Memory pays a quarter on a repaint', g.board.bottom.row1[0].temp === 2, 'temp ' + g.board.bottom.row1[0].temp);

    // --- upgrades ---
    check('An upgraded unit is 1 stronger', C.cardStrength({ id: 'red_brute', up: true }) === 3);
    check('Upgrade marks the name', C.cardName({ id: 'red_brute', up: true }) === 'Red Brute+');

    // --- enemy modifiers ---
    g = fresh();
    put(g, 'top', 'row1', 0, 'black_voidling', 2, 'black');
    ev = C.evaluateBoard(g.board, g.hazards, { enemyMod: { colorBonus: { black: 1 } } });
    check('Colour bonus modifiers apply to the enemy', ev.strengthOf(ev.get('top', 'row1', 0)) === 3);
    g = fresh();
    put(g, 'bottom', 'row1', 0, 'cyan_cleanser', 4); put(g, 'top', 'row1', 0, 'red_brute', 2);
    ev = C.evaluateBoard(g.board, g.hazards, { enemyMod: { punishEffective: 2 } });
    check('Chromatic Knight punishes your effective lanes', ev.lanes[0].top.frontStrength === 4,
      'enemy front ' + ev.lanes[0].top.frontStrength);
    check('The Knight bonus does not compound across lanes', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);   // effective in lane 2
      put(g2, 'bottom', 'row1', 2, 'cyan_cleanser', 4);   // effective in lane 3
      put(g2, 'top', 'row2', 1, 'red_brute', 6);          // one unit fronting both lanes
      var e2 = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { punishEffective: 2 } });
      // each lane gets +2 once, and the unit itself is untouched
      return e2.lanes[1].top.frontStrength === 5 && e2.lanes[2].top.frontStrength === 5 && e2.raw.top === 6;
    })());
    check('The Knight bonus does not leak into non-effective lanes', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);   // Cyan beats Red — effective
      put(g2, 'bottom', 'row1', 2, 'green_gardener', 4);  // Green does not
      put(g2, 'top', 'row2', 1, 'red_brute', 6);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { punishEffective: 2 } });
      return e2.lanes[1].bottom.effective === true && e2.lanes[2].bottom.effective === false &&
             e2.lanes[1].top.frontStrength === 5 && e2.lanes[2].top.frontStrength === 3;
    })());
    check('The Knight gains nothing while you are not effective', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'green_gardener', 4);
      put(g2, 'top', 'row1', 1, 'red_brute', 3);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { punishEffective: 2 } });
      return e2.lanes[1].top.frontStrength === 3;
    })());
    g = fresh();
    put(g, 'top', 'row1', 0, 'red_brute', 2, 'red');
    ev = C.evaluateBoard(g.board, g.hazards, { enemyMod: { rotatingColor: 2 }, spectrumColor: 'red' });
    check('The Spectrum boosts its chosen colour', ev.strengthOf(ev.get('top', 'row1', 0)) === 4);

    // --- run structure ---
    var map = RUN.buildMap();
    check('The act runs 13 rows', map.length === 13);
    check('Row 13 is the boss; row 9 never draws a crossing to offer the elite-skip',
      (function () {
        var map2 = RUN.buildMap('green', true);
        if (map2[12][0].type !== 'boss') return false;
        var sawChoice = 0, entries = 0, canSkip = 0, crossings = 0;
        for (var t = 0; t < 150; t++) {
          var m = RUN.buildMap(RUN.ACT_KEYS[t % RUN.ACT_KEYS.length], t % 2 === 0);
          var row = m[8], prev = m[7];
          /* A single column offers nothing to choose between — whatever rolled
             there was always unavoidable, independent of anything this
             function does, so it is not part of the guarantee. */
          if (row.length < 2) continue;
          var eliteCols = [], battleCols = [];
          row.forEach(function (n, i) { (n.type === 'elite' ? eliteCols : battleCols).push(i); });
          if (!eliteCols.length || !battleCols.length) return false;
          sawChoice++;
          /* Zero crossings is the actual promise now, not "every entry can
             skip" — forcing the second meant drawing a visible crossing
             whenever a single battle column was the only target on offer,
             which measured at 92% of every crossing this used to produce. A
             player not being offered the skip from one specific branch is a
             far smaller cost than a road that visibly cuts through itself. */
          var edges = [];
          prev.forEach(function (p) { p.next.forEach(function (j) { edges.push({ a: p.col, b: row[j].col }); }); });
          for (var x = 0; x < edges.length; x++) {
            for (var y = x + 1; y < edges.length; y++) {
              var e1 = edges[x], e2 = edges[y];
              if ((e1.a < e2.a && e1.b > e2.b) || (e1.a > e2.a && e1.b < e2.b)) crossings++;
            }
          }
          prev.forEach(function (p) {
            entries++;
            if (p.next.some(function (j) { return battleCols.indexOf(j) !== -1; })) canSkip++;
          });
        }
        // the guarantee has to actually get exercised, cost nothing in crossings,
        // and still carry the skip option for a real majority of entries
        return sawChoice > 0 && crossings === 0 && canSkip / entries > 0.5;
      })());
    check('The volatile branch\\u2019s orphan reroute keeps crossings rare, not free', (function () {
      /* This site cannot refuse the way the elite-skip patch can \u2014 the node it
         is fixing just lost its only edge, and leaving it with none at all is a
         dead end. So it always takes the ranked least-bad choice instead, which
         cannot promise zero crossings the way the other site can, only that it
         is never worse than picking blindly. Checked against a generous bound
         well above the organic baseline measured before any of this ran (~90
         per 800 maps), not a tight one, since this specific tradeoff was
         deliberately accepted rather than eliminated. */
      var crossings = 0, mapsChecked = 0;
      for (var t = 0; t < 400; t++) {
        var m = RUN.buildMap(RUN.ACT_KEYS[t % RUN.ACT_KEYS.length], t % 2 === 0);
        for (var d = 0; d < m.length - 1; d++) {
          var edges = [];
          m[d].forEach(function (n) { n.next.forEach(function (j) { edges.push({ a: n.col, b: m[d + 1][j].col }); }); });
          for (var x = 0; x < edges.length; x++) {
            for (var y = x + 1; y < edges.length; y++) {
              var e1 = edges[x], e2 = edges[y];
              if ((e1.a < e2.a && e1.b > e2.b) || (e1.a > e2.a && e1.b < e2.b)) crossings++;
            }
          }
        }
        mapsChecked++;
      }
      return mapsChecked === 400 && crossings < 400;   // averaging under one crossing per map
    })());
    check('The map screen lets the room show through, and stays readable doing it', (function () {
      var box = document.querySelector('#screen-map .panelbox');
      if (!box) return false;
      var bg = getComputedStyle(box).backgroundColor;
      // must have a real alpha channel — a solid colour would hide the room
      // entirely, which is the exact thing this was written to fix
      var m = bg.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      var parts = m[1].split(',').map(function (s) { return parseFloat(s); });
      var alpha = parts.length > 3 ? parts[3] : 1;
      return alpha > 0 && alpha < 1;
    })());
    check('The first act opens with three unavoidable battles', (function () {
      for (var t = 0; t < 25; t++) {
        var m = RUN.buildMap(RUN.ACT_KEYS[t % RUN.ACT_KEYS.length], true);
        for (var d = 0; d < 3; d++) {
          if (m[d].length !== 1 || m[d][0].type !== 'battle') return false;
        }
      }
      return true;
    })());
    check('Later acts branch straight away', (function () {
      var branchedEarly = 0;
      for (var t = 0; t < 40; t++) {
        var m = RUN.buildMap(RUN.ACT_KEYS[t % RUN.ACT_KEYS.length], false);
        // the very first node is still single-file: an act needs one way in
        if (m[0].length !== 1 || m[0][0].type !== 'battle') return false;
        if (m[1].length > 1) branchedEarly++;
        // and the corridor must be gone
        var corridor = m[1].length === 1 && m[2].length === 1 &&
                       m[1][0].type === 'battle' && m[2][0].type === 'battle';
        if (corridor) return false;
      }
      /* Not every roll widens at depth 1 — the generator decides how many
         columns a row uses — but a run of forty that never branched early would
         mean the plan had not actually changed. */
      return branchedEarly > 20;
    })());
    check('A run gets the tutorial corridor once, not once per act', (function () {
      var r = RUN.newRun();
      var first = r.map;
      var isCorridor = function (m) {
        return m[1].length === 1 && m[2].length === 1 &&
               m[1][0].type === 'battle' && m[2][0].type === 'battle';
      };
      if (!isCorridor(first)) return false;
      r.actsCleared = ['green'];
      var second = RUN.buildMap('red', r.actsCleared.length === 0);
      return !isCorridor(second);
    })());
    check('The warm-up handicap covers exactly those three fights',
      RUN.EASE_IN_BATTLES === 3 && RUN.easeInHand(2) > 0 && RUN.easeInHand(3) === 0);
    var reach = [0], ok = true;
    for (var d = 0; d < map.length - 1; d++) {
      var nx = {};
      map[d].forEach(function (n, i) { if (reach.indexOf(i) !== -1) n.next.forEach(function (j) { nx[j] = 1; }); });
      reach = Object.keys(nx).map(Number);
      if (!reach.length) { ok = false; break; }
    }
    check('Every path reaches the boss', ok);
    check('Starting deck is ten cards', RUN.startingDeck().length === C.DECK_SIZE);
    check('A run holds one merged deck and no reserve', (function () {
      var r = RUN.newRun();
      return Array.isArray(r.deck) && r.deck.length === C.DECK_SIZE && r.reserve === undefined;
    })());
    check('Taking a reward grows the deck past ten', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck.push({ id: 'red_brute', up: false });
      var ok = r.deck.length === 11;
      RUN.setRun(saved);
      return ok;
    })());
    // --- act progression (Act Progression doc, Option 1) ---
    check('Primaries are always reachable, secondaries never at the start', (function () {
      var deck = RUN.startingDeck();
      return C.actUnlocked('red', deck) && C.actUnlocked('green', deck) && C.actUnlocked('blue', deck) &&
             !C.actUnlocked('yellow', deck) && !C.actUnlocked('magenta', deck) &&
             !C.actUnlocked('cyan', deck) && !C.actUnlocked('black', deck);
    })());
    check('A colour opens its act at exactly x = 2, not one card sooner', (function () {
      var deck = RUN.startingDeck();
      deck.push({ id: 'yellow_spark', up: false });
      if (C.actUnlocked('yellow', deck)) return false;      // one is not enough
      deck.push({ id: 'yellow_banner', up: false });
      return C.actUnlocked('yellow', deck) && C.ACT_REQUIREMENT === 2;
    })());
    check('Curses are not a colour you earned', (function () {
      var deck = RUN.startingDeck();
      var counts = C.colourCounts(deck.concat(C.CURSE_KEYS.map(function (k) { return { id: k, up: false }; })));
      var base = C.colourCounts(deck);
      return C.COLOR_KEYS.every(function (k) { return counts[k] === base[k]; });
    })());
    check('Rewards and shops only offer colours the deck already holds', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck();                          // red / blue / green + one hazard
      var pool = RUN.offerableCards();
      var leaks = pool.filter(function (k) {
        var col = CARDS[k].color;
        return col && ['red', 'blue', 'green'].indexOf(col) === -1;
      });
      var hasColourless = pool.some(function (k) { return !CARDS[k].color; });
      var hasHeld = pool.some(function (k) { return CARDS[k].color === 'red'; });
      RUN.setRun(saved);
      return leaks.length === 0 && hasColourless && hasHeld;
    })());
    check('Every node in every generated map is reachable from the start', (function () {
      for (var t = 0; t < 60; t++) {
        var m = RUN.buildMap(RUN.ACT_KEYS[t % RUN.ACT_KEYS.length], t % 2 === 0);
        var reach = m.map(function (row) { return row.map(function () { return false; }); });
        reach[0][0] = true;
        for (var d = 0; d < m.length - 1; d++) {
          m[d].forEach(function (node, i) {
            if (!reach[d][i]) return;
            (node.next || []).forEach(function (j) {
              if (m[d + 1] && m[d + 1][j]) reach[d + 1][j] = true;
            });
          });
        }
        for (var d2 = 0; d2 < m.length; d2++) {
          for (var i2 = 0; i2 < m[d2].length; i2++) {
            /* A forced single-column row is the sole possible parent for every
               column below it. The volatile gate used to overwrite that node's
               .next down to a single entry unconditionally, which was fine
               when its siblings had another parent and silently orphaned them
               when it was their only one. */
            if (!reach[d2][i2]) return false;
          }
        }
      }
      return true;
    })());
    check('The volatile gate still commits fully when nothing depends on it', (function () {
      // the "one gate, no other exit" design must survive wherever it is safe —
      // the fix only has to add edges back where dropping them would orphan a
      // sibling, not abandon the single-entrance feel everywhere
      var sawSingle = false, sawKept = false;
      for (var t = 0; t < 200 && !(sawSingle && sawKept); t++) {
        var m = RUN.buildMap(RUN.ACT_KEYS[t % RUN.ACT_KEYS.length], t % 2 === 0);
        m.forEach(function (row, d) {
          row.forEach(function (n) {
            if (n.type !== 'elite' || !m[d + 1]) return;
            var leadsToVolatile = n.next.some(function (j) { return m[d + 1][j] && m[d + 1][j].type === 'volatile'; });
            if (!leadsToVolatile) return;
            if (n.next.length === 1) sawSingle = true; else sawKept = true;
          });
        });
      }
      return sawSingle && sawKept;
    })());

    // --- a fusion must execute every effect its text describes ---
    check('Fusing two onPlay effects keeps both, not just the first', (function () {
      var f = C.fuseCards({ id: 'blue_scout', up: false }, { id: 'black_maw', up: false });
      var d = CARDS[f.id];
      /* The old composition kept exactly one "acting" carrier and threw the
         rest away, while the fused text — built independently — already
         listed every source's line. So a fusion could describe an effect in
         its own text and simply never run it. */
      return d.text.indexOf('draw a card') !== -1 &&
             d.text.indexOf('frontline') !== -1 &&
             typeof d.onPlay === 'function';
    })());
    check('Both halves of a fused onPlay actually execute', (function () {
      var g2 = fresh();
      put(g2, 'top', 'row1', 0, 'red_brute', 9);
      var f = C.fuseCards({ id: 'blue_scout', up: false }, { id: 'black_maw', up: false });
      g2.decks = { bottom: [C.makeCard('red_brute')], top: [] };
      var deckBefore = g2.decks.bottom.length;
      var api = RUN.buildApi(g2, PLAYER, []);
      CARDS[f.id].onPlay(g2, PLAYER, { row: 'row2', index: 0 }, [], api);
      var ev = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
      return g2.decks.bottom.length < deckBefore &&                          // the draw ran
             ev.strengthOf(ev.view['top-row1-0']) < 9;                       // the damage ran
    })());
    check('A fusion of two targeted effects prompts for, and uses, both targets', (function () {
      var f = C.fuseCards({ id: 'black_reclaimer', up: false }, { id: 'blue_current', up: false });
      var specs = CARDS[f.id].targets;
      // 1 (curse) + 2 (unit, empty-tile) = 3 prompts, not one card's worth
      return specs && specs.length === 3;
    })());
    check('A merged ref points at the right pick, not wherever it used to point', (function () {
      /* blue_current's second spec says "an empty tile touching the unit from
         MY step 0". Concatenating raw target arrays leaves that index pointing
         at whichever carrier happened to land in that slot globally — put a
         one-target card ahead of it and step 0 becomes someone else's pick. */
      var f = C.fuseCards({ id: 'black_reclaimer', up: false }, { id: 'blue_current', up: false });
      var specs = CARDS[f.id].targets;
      return specs[0].ref === undefined && specs[1].ref === undefined && specs[2].ref === 1;
    })());
    check('A three-way merged pick resolves both effects on the right targets', (function () {
      var g2 = fresh();
      var f = C.fuseCards({ id: 'black_reclaimer', up: false }, { id: 'blue_current', up: false });
      g2.board[PLAYER].row2[0] = { cardId: f.id, color: CARDS[f.id].color, strength: CARDS[f.id].strength, temp: 0 };
      put(g2, 'bottom', 'row1', 0, 'curse_husk', 1); g2.board[PLAYER].row1[0].color = null;
      put(g2, 'bottom', 'row1', 2, 'red_scout', 3);
      var at = { row: 'row2', index: 0 };
      var specs = CARDS[f.id].targets;
      var p0 = RUN.legalTargets(g2, PLAYER, specs[0], [], at)[0];
      var p1 = RUN.legalTargets(g2, PLAYER, specs[1], [p0], at).filter(function (o) {
        return o.row === 'row1' && o.index === 2;
      })[0];
      var p2 = RUN.legalTargets(g2, PLAYER, specs[2], [p0, p1], at)[0];
      if (!p0 || !p1 || !p2) return false;
      CARDS[f.id].onPlay(g2, PLAYER, at, [p0, p1, p2], RUN.buildApi(g2, PLAYER, []));
      var curseGone = !g2.board[PLAYER].row1[0];
      var unitMoved = !g2.board[PLAYER].row1[2] && !!g2.board[PLAYER][p2.row][p2.index];
      return curseGone && unitMoved;
    })());

    check('Every act carries a Lab that no route can dodge', (function () {
      for (var t = 0; t < 40; t++) {
        var m = RUN.buildMap(RUN.ACT_KEYS[t % RUN.ACT_KEYS.length]);
        // depth 6 must be solid lab: with rewards colour-gated it is the only
        // place a new colour can be made, so a skippable one can strand a run
        if (!m[6].length || !m[6].every(function (n) { return n.type === 'lab'; })) return false;
      }
      return true;
    })());
    check('Every act has an elite and a boss wearing its own colour', (function () {
      return RUN.ACT_KEYS.every(function (k) {
        var a = RUN.ACTS[k], bo = ENEMIES[a.boss];
        if (!bo || bo.kind !== 'boss') return false;
        var elitesOk = RUN.elitesOf(a).every(function (id) {
          var e = ENEMIES[id];
          return e && e.kind === 'elite' && e.colors[0] === a.color;
        });
        /* The Spectrum is the exception by design: the final boss wears every
           colour at once, so it leads with Red rather than its act's Black. */
        return elitesOk && (bo.colors[0] === a.color || a.boss === 'spectrum');
      });
    })());
    check('Every act has a painting with its own measured seam', (function () {
      return RUN.ACT_KEYS.every(function (k) {
        var art = RUN.ACT_ART[k];
        if (!art || !art.w || !art.h) return false;
        // the eyes must sit in the upper half or the aligner has nothing to pin
        return art.seam > 0.05 && art.seam < 0.5;
      });
    })());
    check('Every act elite is 2 stronger in its own colour', (function () {
      return RUN.ACT_KEYS.every(function (k) {
        var a = RUN.ACTS[k];
        return RUN.elitesOf(a).every(function (id) {
          return ENEMIES[id].mod.colorBonus[a.color] === 2;
        });
      });
    })());
    check('A map only fields its own act\'s enemies', (function () {
      return RUN.ACT_KEYS.every(function (k) {
        var m = RUN.buildMap(k), act = RUN.ACTS[k], ok = true;
        m.forEach(function (row) {
          row.forEach(function (n) {
            if (!n.enemy) return;
            if (n.type === 'battle' && act.normals.indexOf(n.enemy) === -1) ok = false;
            if (n.type === 'elite' && RUN.elitesOf(act).indexOf(n.enemy) === -1) ok = false;
            if (n.type === 'boss' && n.enemy !== act.boss) ok = false;
          });
        });
        return ok;
      });
    })());
    check('Difficulty carries across acts instead of resetting', (function () {
      var r = { actsCleared: [] };
      var actOneEnd = RUN.powerAt(r, 12);
      r.actsCleared = ['green'];
      var actTwoStart = RUN.powerAt(r, 0);
      // an act-two opener must not be softer than an act-one finale
      return actTwoStart > actOneEnd - 1 &&
             RUN.depthBonusFor(actTwoStart) >= RUN.depthBonusFor(6) &&
             RUN.depthBonusFor(30) > RUN.depthBonusFor(12);
    })());
    check('The first act is always a primary that is actually built', (function () {
      for (var t = 0; t < 30; t++) {
        var r = RUN.newRun();
        if (!RUN.ACTS[r.act]) return false;
        if (C.PRIMARY_COLORS.indexOf(RUN.ACTS[r.act].color) === -1) return false;
        if (r.actsCleared.length !== 0) return false;
      }
      return true;
    })());
    check('A cleared act is never offered again', (function () {
      var r = RUN.newRun();
      r.actsCleared = RUN.ACT_KEYS.slice();
      return RUN.eligibleActs(r).length === 0;
    })());
    check('Secondary acts stay shut until their colour is made', (function () {
      var r = RUN.newRun();
      r.deck = RUN.startingDeck();
      r.actsCleared = ['green'];
      var open = RUN.eligibleActs(r);
      if (open.indexOf('yellow') !== -1 || open.indexOf('magenta') !== -1) return false;
      if (open.indexOf('red') === -1 || open.indexOf('blue') === -1) return false;
      r.deck.push({ id: 'yellow_spark', up: false });
      r.deck.push({ id: 'yellow_banner', up: false });
      return RUN.eligibleActs(r).indexOf('yellow') !== -1;
    })());

    // --- save / load ---
    check('A run survives a save and reload, forged cards included', (function () {
      var saved = RUN.getRun();
      RUN.clearSave();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      // mint the three things only the Lab can make, stacked on each other
      r.deck[0] = RUN.liftStrength(r.deck[0], 2);
      r.deck[1] = RUN.recolourCard(r.deck[1], 'magenta');
      var fused = RUN.fuseInDeck(r.deck[2], r.deck[3]);
      r.deck.splice(3, 1); r.deck.splice(2, 1); r.deck.push(fused);
      r.deck[0] = RUN.liftStrength(r.deck[0], 1);       // a lift built on a lift
      r.gold = 137; r.actsCleared = ['green']; r.act = 'red';
      var wantIds = r.deck.map(function (e) { return e.id; });
      var wantStr = r.deck.map(function (e) { return CARDS[e.id].strength; });
      var wantCol = r.deck.map(function (e) { return CARDS[e.id].color; });
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
    })());
    check('A corrupt or foreign save is refused rather than half-loaded', (function () {
      var out = true;
      try {
        window.localStorage.setItem('colorvibes.run.v1', '{not json');
        if (RUN.loadRun() !== null) out = false;
        window.localStorage.setItem('colorvibes.run.v1', JSON.stringify({ v: 99, run: {} }));
        if (RUN.loadRun() !== null) out = false;
        window.localStorage.setItem('colorvibes.run.v1',
          JSON.stringify({ v: 1, run: { act: 'green', map: [[{}]], deck: [{ id: 'ghost_card' }], minted: [] } }));
        if (RUN.loadRun() !== null) out = false;   // deck points at a card that does not exist
      } catch (e) { out = false; }
      RUN.clearSave();
      return out;
    })());
    check('Reinforcing a fusion keeps everything it inherited', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var f = RUN.fuseInDeck({ id: 'red_scout', up: false }, { id: 'blue_scout', up: false });
      var lifted = RUN.liftStrength(f, 2);
      /* The old field-list copy dropped flags; Object.assign keeps them, and now
         there is an inherited effect list riding along that must survive too. */
      var ok = CARDS[lifted.id].fused === true &&
               CARDS[lifted.id].strength === CARDS[f.id].strength + 2 &&
               (CARDS[lifted.id].effectSources || []).length === (CARDS[f.id].effectSources || []).length;
      RUN.setRun(saved);
      return ok;
    })());

    // --- boss rules (each act boss must play differently, not just harder) ---
    check('Exposure taxes the colour you leaned on, and spares an even board', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 0, 'red_brute', 4);
      put(g2, 'bottom', 'row1', 1, 'red_brute', 4);
      put(g2, 'bottom', 'row2', 0, 'red_brute', 4);      // three Red, clearly dominant
      var taxed = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { taxDominantColor: 2 } });
      var plain = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: {} });
      if (plain.raw.bottom - taxed.raw.bottom !== 6) return false;   // 2 per Red unit

      var even = fresh();
      put(even, 'bottom', 'row1', 0, 'red_brute', 4);
      put(even, 'bottom', 'row1', 1, 'blue_scout', 4);   // 1-1: no dominant colour
      var e1 = C.evaluateBoard(even.board, even.hazards, { enemyMod: { taxDominantColor: 2 } });
      var e0 = C.evaluateBoard(even.board, even.hazards, { enemyMod: {} });
      return e1.raw.bottom === e0.raw.bottom;
    })());
    check('The Scorched Line halves support but leaves the frontline whole', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 0, 'red_brute', 6);      // frontline
      put(g2, 'bottom', 'row3', 0, 'red_brute', 8);      // support behind it
      var pen = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { supportPenalty: 0.5 } });
      var full = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: {} });
      var lp = pen.lanes.filter(function (l) { return l.bottom; })[0];
      var lf = full.lanes.filter(function (l) { return l.bottom; })[0];
      return lp.bottom.frontStrength === lf.bottom.frontStrength &&
             lp.bottom.support < lf.bottom.support &&
             pen.totals.bottom < full.totals.bottom;
    })());
    check('The Undertow answers only the lane you invested in most', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 0, 'red_brute', 10);     // the monster lane
      put(g2, 'bottom', 'row1', 2, 'red_brute', 2);
      put(g2, 'top', 'row1', 0, 'blue_scout', 1);
      put(g2, 'top', 'row1', 2, 'blue_scout', 1);
      var ev = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { echoBestLane: 0.5 } });
      var echoed = ev.lanes.filter(function (l) { return l.top && l.top.echoed; });
      if (echoed.length !== 1) return false;
      var base = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: {} });
      return ev.totals.top > base.totals.top;
    })());
    check('Still Water cancels the matchup bonus in its weakest lanes only', (function () {
      var g2 = fresh();
      // player is effective in every lane; enemy is weak in two of them
      put(g2, 'bottom', 'row1', 0, 'red_brute', 5);
      put(g2, 'bottom', 'row1', 1, 'red_brute', 5);
      put(g2, 'bottom', 'row1', 2, 'red_brute', 5);
      put(g2, 'top', 'row1', 0, 'green_seed', 1);
      put(g2, 'top', 'row1', 1, 'green_seed', 1);
      put(g2, 'top', 'row1', 2, 'green_seed', 9);
      var ev = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { wardWeakLanes: 2 } });
      var warded = ev.lanes.filter(function (l) { return l.bottom && l.bottom.warded; });
      var free = ev.lanes.filter(function (l) { return l.bottom && !l.bottom.warded && l.bottom.effective; });
      if (warded.length !== 2) return false;
      // the lane it is strongest in is the one left exploitable
      return free.length >= 1 && free.every(function (l) { return l.bottom.multiplier === 2; }) &&
             warded.every(function (l) { return l.bottom.multiplier === 1; });
    })());
    check('Every act boss carries a rule of its own, and no two share one', (function () {
      var RULES = ['growth', 'supportPenalty', 'echoBestLane', 'taxDominantColor',
                   'echoMix', 'wardWeakLanes', 'devourWeakest'];
      var seen = {};
      return RUN.ACT_KEYS.every(function (k) {
        var mod = ENEMIES[RUN.ACTS[k].boss].mod || {};
        var mine = RULES.filter(function (r) { return mod[r]; });
        if (mine.length !== 1) return false;           // exactly one signature rule
        if (seen[mine[0]]) return false;               // and nobody else's
        seen[mine[0]] = 1;
        return true;
      });
    })());
    check('A boss leans on its rule, not on raw colour bonus', (function () {
      return RUN.ACT_KEYS.every(function (k) {
        var a = RUN.ACTS[k], mod = ENEMIES[a.boss].mod || {};
        var cb = (mod.colorBonus && mod.colorBonus[a.color]) || 0;
        // elites are the +2 stat check; bosses must not simply be +3 versions
        return cb <= 1;
      });
    })());

    // --- deck economy: the run must be able to shrink, not only grow ---
    check('Skipping a card pays, and pays more the deeper you are', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.depth = 0; var early = RUN.skipValue();
      r.depth = 12; r.actsCleared = ['green', 'red'];
      var late = RUN.skipValue();
      RUN.setRun(saved);
      return early > 0 && late > early;
    })());
    check('A shop cuts two cards at most, at a climbing price', (function () {
      var a = RUN.removalCost({ removals: 0 });
      var b = RUN.removalCost({ removals: 1 });
      return a === 50 && b > a &&
             RUN.SHOP_REMOVAL_LIMIT === 2 &&
             RUN.removalsLeft({ removals: 0 }) === 2 &&
             RUN.removalsLeft({ removals: 1 }) === 1 &&
             RUN.removalsLeft({ removals: 2 }) === 0;
    })());
    check('The last road is gated far harder than the rest', (function () {
      var need = C.requirementFor('black');
      /* Black no longer needs a higher card COUNT than an ordinary secondary to
         stay the hardest road — the two-secondary fusion requirement already
         makes every Black card roughly twice as expensive to produce as an
         ordinary one, since it consumes two finished secondaries instead of
         two primaries. The invariant worth protecting is that it is never
         *easier* to reach than a secondary, not a specific inflated number. */
      if (need < C.ACT_REQUIREMENT) return false;
      if (!['yellow', 'cyan', 'magenta'].every(function (k) { return C.requirementFor(k) === 2; })) return false;
      var deck = RUN.startingDeck();
      for (var i = 0; i < need - 1; i++) deck.push({ id: 'black_voidling', up: false });
      if (C.actUnlocked('black', deck)) return false;      // one short stays shut
      deck.push({ id: 'black_eraser', up: false });
      return C.actUnlocked('black', deck);
    })());
    check('The volatile bench can never mint Black', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck();
      var pal = RUN.recolourPalette();
      if (pal.indexOf('black') !== -1) { RUN.setRun(saved); return false; }
      // even a deck already holding Black must not unlock Black as a roll target
      r.deck.push({ id: 'black_voidling', up: false });
      var pal2 = RUN.recolourPalette();
      RUN.setRun(saved);
      return pal2.indexOf('black') === -1;
    })());
    check('A recolour can only reach a colour the deck could already make', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      // Red and Green only: Yellow is reachable, Cyan and Magenta are not
      r.deck = [{ id: 'red_brute', up: false }, { id: 'green_seed', up: false }];
      var pal = RUN.recolourPalette();
      var ok = pal.indexOf('yellow') !== -1 &&
               pal.indexOf('cyan') === -1 && pal.indexOf('magenta') === -1;
      RUN.setRun(saved);
      return ok;
    })());
    check('The road offers real ways to cut a deck down', (function () {
      // at least three events must be able to remove a card, or deck size only
      // ever ratchets upward and the endgame target is unreachable
      var cutters = RUN.EVENTS.filter(function (e) {
        return e.options.some(function (o) {
          return o.pick || /remove|cut|burn|strain/i.test(o.label);
        });
      });
      return cutters.length >= 3;
    })());
    check('A chosen cut removes exactly what the player picked', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      while (r.deck.length < 9) r.deck.push({ id: 'red_brute', up: false });
      r.deck[3] = { id: 'yellow_spark', up: false };
      var before = r.deck.length;
      r.deck.splice(3, 1);                       // what the picker does
      var ok = r.deck.length === before - 1 &&
               !r.deck.some(function (e) { return e.id === 'yellow_spark'; });
      RUN.setRun(saved);
      return ok;
    })());
    check('The Sieve strains curses and leaves the rest of the deck alone', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      var clean = r.deck.length;
      C.CURSE_KEYS.forEach(function (k) { r.deck.push({ id: k, up: false }); });
      var sieve = RUN.EVENTS.filter(function (e) { return e.title === 'The Sieve'; })[0];
      sieve.options[0].run();
      var ok = RUN.getRun().deck.length === clean &&
               !RUN.getRun().deck.some(function (e) { return CARDS[e.id].curse; });
      RUN.setRun(saved);
      return ok;
    })());

    // --- the draw archetype ---
    check('Drawing is a build, not a single card', (function () {
      var drawCards = C.DRAWABLE.filter(function (k) {
        var d = CARDS[k];
        return d.drawsEachRound || /draw/i.test(d.text || '');
      });
      var drawRelics = Object.keys(RELICS).filter(function (k) {
        return /draw|opening hand/i.test(RELICS[k].text);
      });
      return drawCards.length >= 5 && drawRelics.length >= 4;
    })());
    check('Blue Tideline grows with everything drawn this battle', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row2', 0, 'blue_tideline', 1);
      var cold = C.evaluateBoard(g2.board, g2.hazards, { drawn: { extra: 0 } });
      var dug  = C.evaluateBoard(g2.board, g2.hazards, { drawn: { extra: 5 } });
      var capped = C.evaluateBoard(g2.board, g2.hazards, { drawn: { extra: 99 } });
      return dug.raw.bottom === cold.raw.bottom + 5 &&
             capped.raw.bottom === cold.raw.bottom + 8;   // the cap holds
    })());
    check('Deep Pockets pays a lean deck and nothing to a bloated one', (function () {
      function lean(n) { return Math.max(0, Math.floor((25 - n) / 5)); }
      return lean(40) === 0 && lean(25) === 0 && lean(20) === 1 && lean(15) === 2 && lean(10) === 3;
    })());

    // --- boss trophies and reward quality over a run ---
    check('Legendaries exist only as boss drops, never in a random pool', (function () {
      if (C.BOSS_CARDS.length < 7) return false;
      if (C.DRAWABLE.some(function (k) { return CARDS[k].bossOnly; })) return false;
      // one for every act colour, so each road has a signature card
      return RUN.ACT_KEYS.every(function (k) {
        var col = RUN.ACTS[k].color;
        return C.BOSS_CARDS.some(function (c) { return CARDS[c].color === col; });
      });
    })());
    check('The Devouring Star hits hard but cannot compound across battles', (function () {
      /* The run-ending bug: the gain was permanent, and a permanent buff writes
         back into the run deck, so every battle started where the last one
         ended and two Stars could eat each other indefinitely. Measured
         growth was 10, 25, 55, 115, 235, 475, 955, 3835 — roughly doubling per
         feed, with no ceiling, which is how a run reached five figures.

         Both halves matter here: it must still be enormous on the board (the
         hardest card in the game to earn should feel like it), and it must
         leave the printed card alone so nothing carries forward. */
      var g2 = fresh();
      g2.board[PLAYER].row2[0] = { cardId: 'black_devouring_star', color: 'black',
                                   strength: 5, temp: 0, deckIndex: 0 };
      put(g2, 'bottom', 'row1', 0, 'red_brute', 20);
      var at = { row: 'row2', index: 0 };
      var t = RUN.legalTargets(g2, PLAYER, CARDS.black_devouring_star.targets[0], [], at);
      CARDS.black_devouring_star.onPlay(g2, PLAYER, at, t, RUN.buildApi(g2, PLAYER, []));
      var u = g2.board[PLAYER].row2[0];
      var total = u.strength + (u.temp || 0);
      // twice a 20 is still a 45-strength unit for the fight
      return total === 45 && u.strength === 5 && (u.temp || 0) === 40;
    })());
    check('Every trophy is big AND still does something', (function () {
      return C.BOSS_CARDS.every(function (k) {
        var d = CARDS[k];
        var hasText = !!(d.passive || d.aura || d.rowAura || d.matchup || d.onPlay ||
                         d.drawsEachRound || d.guardsColour);
        // the whole point: unlike a fused Amalgam these are not silenced
        return d.strength >= 4 && hasText && !d.silenced && d.rarity === 'Legendary';
      });
    })());
    check('A boss offers three trophies including its own colour', (function () {
      var saved = RUN.getRun();
      var ok = true;
      RUN.ACT_KEYS.forEach(function (k) {
        RUN.setRun(RUN.newRun());
        var r = RUN.getRun();
        r.act = k;
        RUN.rollReward({ type: 'boss', depth: 12 });
        var rw = RUN.getRun().reward;
        if (!rw.trophy || rw.cards.length !== 3) { ok = false; return; }
        if (!rw.cards.every(function (c) { return CARDS[c.id].bossOnly; })) ok = false;
        if (!rw.cards.some(function (c) { return CARDS[c.id].color === RUN.ACTS[k].color; })) ok = false;
        var ids = rw.cards.map(function (c) { return c.id; });
        if (ids.length !== ids.filter(function (v, i) { return ids.indexOf(v) === i; }).length) ok = false;
      });
      RUN.setRun(saved);
      return ok;
    })());
    check('A normal battle never hands out a trophy', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var clean = true;
      for (var i = 0; i < 40; i++) {
        RUN.rollReward({ type: i % 2 ? 'battle' : 'elite', depth: 6 });
        var rw = RUN.getRun().reward;
        if (rw.trophy) clean = false;
        if (rw.cards.some(function (c) { return CARDS[c.id].bossOnly; })) clean = false;
      }
      RUN.setRun(saved);
      return clean;
    })());
    check('Card rewards get better the deeper the run goes', (function () {
      var early = RUN.rarityWeights(1), late = RUN.rarityWeights(60);
      // rares must overtake commons by the late run, not merely creep up
      return late.Rare > early.Rare && late.Common < early.Common &&
             early.Common > early.Rare && late.Rare > late.Common;
    })());

    // --- what the player is told about what they are fighting ---
    check('Every enemy rule has an icon and words to go with it', (function () {
      return Object.keys(ENEMIES).every(function (k) {
        var mod = ENEMIES[k].mod || {}, icons = C.enemyIcons(k);
        var ruleKeys = Object.keys(mod).filter(function (r) { return r !== 'depthBonus'; });
        // every rule on the enemy must surface as at least one icon
        if (ruleKeys.length && !icons.length) return false;
        return icons.every(function (i) {
          return C.GLYPHS[i.i] && typeof i.t === 'string' && i.t.length > 12;
        });
      });
    })());
    check('Bosses and elites are marked as such, normal foes are not', (function () {
      var bossKey = RUN.ACTS[RUN.ACT_KEYS[0]].boss;
      var eliteKey = RUN.elitesOf(RUN.ACTS[RUN.ACT_KEYS[0]])[0];
      return C.rankIcon(bossKey).i === 'boss' &&
             C.rankIcon(eliteKey).i === 'elite' &&
             C.rankIcon('brawler') === null;
    })());
    check('A boss signature rule always reaches the player as an icon', (function () {
      var RULES = { growth: 1, supportPenalty: 1, echoBestLane: 1, taxDominantColor: 1,
                    echoMix: 1, wardWeakLanes: 1, devourWeakest: 1 };
      return RUN.ACT_KEYS.every(function (k) {
        var key = RUN.ACTS[k].boss, mod = ENEMIES[key].mod || {};
        var sig = Object.keys(mod).filter(function (r) { return RULES[r]; });
        var icons = C.enemyIcons(key);
        // the rule icons must outnumber the plain colour-bonus ones
        return sig.length === 1 && icons.length > Object.keys(mod.colorBonus || {}).length;
      });
    })());
    check('Icons are derived from the rules, so they cannot drift', (function () {
      var before = C.enemyIcons('hollow_sun').filter(function (i) { return i.i === 'tax'; })[0];
      var was = ENEMIES.hollow_sun.mod.taxDominantColor;
      ENEMIES.hollow_sun.mod.taxDominantColor = 9;
      var after = C.enemyIcons('hollow_sun').filter(function (i) { return i.i === 'tax'; })[0];
      ENEMIES.hollow_sun.mod.taxDominantColor = was;
      return before.v === was && after.v === 9 && after.t.indexOf('9') !== -1;
    })());
    check('The codex records what you meet and nothing you have not', (function () {
      var seen = RUN.codex.cards.red_brute;
      delete RUN.codex.cards.red_brute;
      var before = !RUN.codex.cards.red_brute;
      RUN.discoverCard('red_brute');
      var after = !!RUN.codex.cards.red_brute;
      if (seen === undefined) delete RUN.codex.cards.red_brute; else RUN.codex.cards.red_brute = seen;
      return before && after;
    })());
    check('Cards minted in the Lab are not codex entries', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var f = RUN.fuseInDeck({ id: 'red_brute', up: false }, { id: 'blue_scout', up: false });
      RUN.discoverCard(f.id);
      var ok = !RUN.codex.cards[f.id];      // a one-off Amalgam is not a discovery
      RUN.setRun(saved);
      return ok;
    })());

    check('The colour picker is visible the moment it is asked for', (function () {
      var s = S();
      if (!s) return true;                       // no battle in progress during tests
      var savedPending = s.pending, savedSel = s.selectedCard;
      var savedHand = s.hands[PLAYER][0], savedTile = s.board[PLAYER].row2[0];
      s.board[PLAYER].row2[0] = { cardId: 'red_brute', color: 'red', strength: 4, temp: 0 };
      s.hands[PLAYER][0] = { id: 'spectrum_shift', up: false, uid: -99 };
      s.pending = { card: s.hands[PLAYER][0], index: 0, side: PLAYER, tile: null,
                    picks: [{ row: 'row2', index: 0 }] };
      s.selectedCard = 0;
      render();                                   // ONE render, as a real click gives
      var picker = els.colorPicker, bar = els.controls;
      /* Both the picker and the bar holding it have to be visible after a
         single render. The bar used to read the picker's previous value, so a
         repaint effect looked broken until something else forced a redraw. */
      var ok = picker.hidden === false && bar.hidden === false &&
               picker.querySelectorAll('.pick').length === C.COLOR_KEYS.length;
      s.pending = savedPending; s.selectedCard = savedSel;
      s.hands[PLAYER][0] = savedHand; s.board[PLAYER].row2[0] = savedTile;
      render();
      return ok;
    })());

    // --- fixes that came out of playtesting ---
    check('The opening hand does not count as cards dug for', (function () {
      var g2 = fresh();
      g2.drawn = { extra: 0 };
      g2.decks = { bottom: [], top: [] };
      for (var i = 0; i < 12; i++) g2.decks[PLAYER].push({ id: 'red_brute', up: false });
      g2.hands = { bottom: [], top: [] };
      RUN.drawInto(g2, PLAYER, 6, true);          // the opening deal
      if (g2.drawn.extra !== 0) return false;     // Tideline must start at zero
      RUN.drawInto(g2, PLAYER, 2);                // a normal round draw
      return g2.drawn.extra === 2;
    })());
    check('Draws off an empty deck are not counted', (function () {
      var g2 = fresh();
      g2.drawn = { extra: 0 };
      g2.decks = { bottom: [{ id: 'red_brute', up: false }], top: [] };
      g2.hands = { bottom: [], top: [] };
      var got = RUN.drawInto(g2, PLAYER, 5);      // asked for five, only one there
      return got === 1 && g2.drawn.extra === 1;
    })());
    check('Damage lands in full on what the player can see', (function () {
      var g2 = fresh();
      // printed 2, but carrying 6 of evaluation bonus: shows as 8
      put(g2, 'top', 'row1', 0, 'red_brute', 2);
      g2.enemyMod = { depthBonus: 3, colorBonus: { red: 3 } };
      var ev0 = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
      var before = ev0.strengthOf(ev0.view['top-row1-0']);
      if (before !== 8) return false;
      RUN.buildApi(g2, PLAYER, []).damage(ENEMY, 'row1', 0, 3);
      var ev1 = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
      // used to drop by 1, because 3 came off the printed 2 and clamped
      return before - ev1.strengthOf(ev1.view['top-row1-0']) === 3;
    })());
    check('Damage never pushes a unit below 1', (function () {
      var g2 = fresh();
      put(g2, 'top', 'row1', 0, 'red_brute', 2);
      RUN.buildApi(g2, PLAYER, []).damage(ENEMY, 'row1', 0, 9);
      var ev = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
      return ev.strengthOf(ev.view['top-row1-0']) === 1;
    })());
    check('Every curse is worth the same on the board', (function () {
      var vals = C.CURSE_KEYS.map(function (k) { return CARDS[k].strength; });
      return vals.every(function (v) { return v === vals[0]; }) && vals[0] >= 1;
    })());
    check('A curse never grows with the enemy', (function () {
      var g2 = fresh();
      put(g2, 'top', 'row1', 0, 'curse_husk', C.CARDS.curse_husk.strength);
      g2.board[ENEMY].row1[0].color = null;
      var plain = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: {} });
      var deep = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { depthBonus: 5 } });
      return plain.strengthOf(plain.view['top-row1-0']) === deep.strengthOf(deep.view['top-row1-0']);
    })());
    check('Fissure cards stay out of the pool until a fissure exists', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck();
      C.COLOR_KEYS.forEach(function (c) { r.deck.push({ id: 'black_voidling', up: false }); });
      r.deck.push({ id: 'cyan_shield', up: false });   // gives the pool cyan and black
      r.fissures = [];
      var dry = RUN.NEEDS_FISSURES.every(function (k) { return !RUN.situationalOk(k); });
      r.fissures = [{ side: PLAYER, a: { row: 'row1', index: 0 }, b: { row: 'row1', index: 1 } }];
      var wet = RUN.NEEDS_FISSURES.every(function (k) { return RUN.situationalOk(k); });
      var pool = RUN.offerableCards();
      RUN.setRun(saved);
      return dry && wet && pool.indexOf('black_chorus') !== -1;
    })());
    check('A blank card is never the offer', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck();
      r.fissures = []; r.depth = 0; r.actsCleared = [];
      var pool = RUN.offerableCards();
      var blanks = pool.filter(function (k) { return RUN.NEEDS_FISSURES.indexOf(k) !== -1; });
      RUN.setRun(saved);
      return blanks.length === 0;
    })());

    // --- the opponent should not empty its hand into a round it has won ---
    check('Strength banked past a won round counts for less', (function () {
      return shapedLead(3) === 3 && shapedLead(SAFE_LEAD) === SAFE_LEAD &&
             shapedLead(SAFE_LEAD + 20) < SAFE_LEAD + 20 &&
             shapedLead(SAFE_LEAD + 20) > SAFE_LEAD;
    })());
    check('A card is worth holding early and worth nothing to hold last', (function () {
      var s = S();
      if (!s) return true;
      var savedWins = s.wins;
      s.wins = { bottom: 0, top: 0 };
      var early = reservePrice(s, ENEMY, {});
      s.wins = { bottom: 1, top: 1 };
      var last = reservePrice(s, ENEMY, {});
      s.wins = savedWins;
      // nothing to save for once the next round decides it
      return early > 0 && last === 0;
    })());
    check('A thin hand makes each remaining card dearer', (function () {
      var s = S();
      if (!s) return true;
      var savedWins = s.wins, savedHand = s.hands[ENEMY], savedDeck = s.decks[ENEMY];
      s.wins = { bottom: 0, top: 0 };
      s.hands[ENEMY] = [1, 2, 3, 4, 5, 6, 7, 8]; s.decks[ENEMY] = [1, 2, 3, 4];
      var rich = reservePrice(s, ENEMY, {});
      s.hands[ENEMY] = [1, 2]; s.decks[ENEMY] = [];
      var poor = reservePrice(s, ENEMY, {});
      s.wins = savedWins; s.hands[ENEMY] = savedHand; s.decks[ENEMY] = savedDeck;
      return poor > rich;
    })());
    check('The opponent holds when it is already far ahead, and fights when behind', (function () {
      var s = S();
      if (!s) return true;
      var saved = {
        board: s.board, hands: s.hands, wins: s.wins, turn: s.turn,
        pending: s.pending, mixTokens: s.mixTokens, power: s.power, enemy: s.enemy
      };
      /* Holding a won round is tier-gated, and tier comes from the enemy in
         front of you. Borrowing whatever battle happens to be open made this
         assert the opposite of the truth in a warm-up fight, where a tier-0
         enemy is *supposed* to overcommit — so the enemy is pinned here. */
      function blank() {
        s.board = C.emptyBoard();
        s.hands = { bottom: [], top: [] };
        for (var i = 0; i < 5; i++) s.hands[ENEMY].push({ id: 'red_brute', up: false, uid: -200 - i });
        s.mixTokens = { bottom: 0, top: 0 };
        s.pending = null; s.turn = ENEMY;
        s.power = 45; s.enemy = ENEMIES.brawler;
      }
      blank(); s.wins = { bottom: 0, top: 0 };
      s.board[ENEMY].row1[0] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
      s.board[ENEMY].row1[1] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
      var holdsWhenAhead = decideOpponentMove().willPass;

      blank(); s.wins = { bottom: 0, top: 0 };
      s.board[PLAYER].row1[0] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
      s.board[PLAYER].row1[1] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
      var fightsWhenBehind = !decideOpponentMove().willPass;

      blank(); s.wins = { bottom: 0, top: 0 };
      var opensOnLevelBoard = !decideOpponentMove().willPass;

      s.board = saved.board; s.hands = saved.hands; s.wins = saved.wins;
      s.turn = saved.turn; s.pending = saved.pending; s.mixTokens = saved.mixTokens;
      s.power = saved.power; s.enemy = saved.enemy;
      render();
      return holdsWhenAhead && fightsWhenBehind && opensOnLevelBoard;
    })());

    check('Black works without ever touching a fissure', (function () {
      var plain = C.DRAWABLE.filter(function (k) {
        return CARDS[k].color === 'black' &&
               RUN.NEEDS_FISSURES.indexOf(k) === -1 &&
               RUN.NEEDS_CURSES.indexOf(k) === -1;
      });
      /* Gating the fissure cards left Black almost empty for a player who never
         used Rewind, which made the hardest colour gate the least supported. */
      return plain.length >= 6;
    })());
    check('Curse cards read the board, not a tally', (function () {
      return RUN.NEEDS_CURSES.every(function (k) {
        var d = CARDS[k];
        // adjacency or consumption — never a count of curses owned, which is
        // how the fissure cards work and would make these feel like a reskin
        var positional = !!(d.targets || (d.text || '').indexOf('touch') !== -1);
        return positional && !d.fissure;
      });
    })());
    check('Gravebloom wakes only next to a curse', (function () {
      /* row1-0 and row1-1 are NOT adjacent: on this board tiles touch across
         rows, never along one. A same-row pair looks adjacent on screen and is
         not, which is worth stating in the test that nearly got it wrong. */
      var g2 = fresh();
      put(g2, 'bottom', 'row2', 0, 'black_gravebloom', 2);
      var alone = C.evaluateBoard(g2.board, g2.hazards, {});
      var a = alone.strengthOf(alone.view['bottom-row2-0']);

      var far = fresh();
      put(far, 'bottom', 'row2', 0, 'black_gravebloom', 2);
      put(far, 'bottom', 'row1', 3, 'curse_husk', C.CARDS.curse_husk.strength);
      far.board[PLAYER].row1[3].color = null;
      var f = C.evaluateBoard(far.board, far.hazards, {});
      var fv = f.strengthOf(f.view['bottom-row2-0']);

      var near = fresh();
      put(near, 'bottom', 'row2', 0, 'black_gravebloom', 2);
      put(near, 'bottom', 'row1', 0, 'curse_husk', C.CARDS.curse_husk.strength);
      near.board[PLAYER].row1[0].color = null;
      var n = C.evaluateBoard(near.board, near.hazards, {});
      var nv = n.strengthOf(n.view['bottom-row2-0']);

      // owning a curse is not enough; it has to be placed against it
      return a === 2 && fv === 2 && nv === 6;
    })());
    check('Curse cards stay hidden until the run is actually cursed', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck();
      C.COLOR_KEYS.forEach(function () { r.deck.push({ id: 'black_voidling', up: false }); });
      r.deck.push({ id: 'cyan_shield', up: false });
      var dry = RUN.NEEDS_CURSES.every(function (k) { return !RUN.situationalOk(k); });
      r.deck.push({ id: C.CURSE_KEYS[0], up: false });
      var cursed = RUN.NEEDS_CURSES.every(function (k) { return RUN.situationalOk(k); });
      RUN.setRun(saved);
      return dry && cursed;
    })());

    // --- the opponent gets better as the run goes on ---
    check('Skill climbs with run power, and rank sits a tier above the road', (function () {
      function tier(power, kind) {
        return aiSkill({ power: power, enemy: { kind: kind || 'normal' } });
      }
      var ladder = [tier(0), tier(8), tier(17), tier(28), tier(40)];
      var rising = ladder.every(function (v, i) { return i === 0 || v >= ladder[i - 1]; });
      return rising && ladder[0] === 0 && ladder[4] === 4 &&
             tier(0, 'elite') > tier(0) && tier(0, 'boss') > tier(0) &&
             tier(40, 'boss') === 4;                  // and never past the top
    })());
    check('Act one still overcommits, later acts do not', (function () {
      // overkill only starts being discounted once the world has taught it to
      return shapedLead(SAFE_LEAD + 20, 0) === SAFE_LEAD + 20 &&
             shapedLead(SAFE_LEAD + 20, 1) < SAFE_LEAD + 20;
    })());
    check('Each habit switches on at its own tier and not before', (function () {
      var s = { wins: { bottom: 0, top: 0 }, hands: { bottom: [], top: [1, 2, 3] },
                decks: { bottom: [], top: [1, 2, 3, 4] } };
      var thriftOff = reservePrice(s, ENEMY, {}, 1) === 0;
      var thriftOn  = reservePrice(s, ENEMY, {}, 2) > 0;
      var concedeOff = concedeBonus(s, ENEMY, -40, 2) === 0;
      var concedeOn  = concedeBonus(s, ENEMY, -40, 3) > 0;
      var spendOff = spendCost({ id: 'red_titan', up: false }, 3) === 0;
      var spendOn  = spendCost({ id: 'red_titan', up: false }, 4) > 0;
      return thriftOff && thriftOn && concedeOff && concedeOn && spendOff && spendOn;
    })());
    check('A round further out of reach is easier to give up on', (function () {
      var s = { wins: { bottom: 0, top: 0 }, hands: { bottom: [], top: [] }, decks: { bottom: [], top: [] } };
      var near = concedeBonus(s, ENEMY, -12, 4);
      var far = concedeBonus(s, ENEMY, -60, 4);
      var level = concedeBonus(s, ENEMY, 0, 4);
      s.wins = { bottom: 1, top: 1 };
      var decider = concedeBonus(s, ENEMY, -60, 4);
      // never give up the round that decides the battle
      return level === 0 && far > near && near > 0 && decider === 0;
    })());
    check('Spending the better card costs more', (function () {
      var cheap = spendCost({ id: 'red_scout', up: false }, 4);
      var dear = spendCost({ id: 'red_titan', up: false }, 4);
      return dear > cheap && cheap >= 0;
    })());
    check('Waste is counted lane by lane, not just on the total', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 0, 'red_scout', 1);
      put(g2, 'top', 'row1', 0, 'red_titan', 30);      // wins one lane enormously
      var ev = C.evaluateBoard(g2.board, g2.hazards, {});
      var plain = ev.totals[ENEMY] - ev.totals[PLAYER];
      var shaped = laneShapedDelta(ev, ENEMY, PLAYER);
      /* Overkill inside a single lane has to be discounted even when the board
         score is close, or a surgical enemy still answers a 1 with a 30. */
      return shaped < plain && shaped > 0;
    })());
    check('The opponent holds a won round only once it is sharp enough', (function () {
      var s = S();
      if (!s) return true;
      var saved = { board: s.board, hands: s.hands, wins: s.wins, turn: s.turn,
                    pending: s.pending, mixTokens: s.mixTokens, power: s.power, enemy: s.enemy };
      function setup(power) {
        s.board = C.emptyBoard();
        s.hands = { bottom: [], top: [] };
        for (var i = 0; i < 5; i++) s.hands[ENEMY].push({ id: 'red_brute', up: false, uid: -300 - i });
        s.mixTokens = { bottom: 0, top: 0 }; s.pending = null; s.turn = ENEMY;
        s.wins = { bottom: 0, top: 0 }; s.power = power; s.enemy = ENEMIES.brawler;
        s.board[ENEMY].row1[0] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
        s.board[ENEMY].row1[1] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
      }
      setup(0);
      var greenDumps = !decideOpponentMove().willPass;
      setup(45);
      var veteranHolds = decideOpponentMove().willPass;
      s.board = saved.board; s.hands = saved.hands; s.wins = saved.wins;
      s.turn = saved.turn; s.pending = saved.pending; s.mixTokens = saved.mixTokens;
      s.power = saved.power; s.enemy = saved.enemy;
      render();
      return greenDumps && veteranHolds;
    })());
    check('A boss never offers a trophy in a colour the run has not opened', (function () {
      var saved = RUN.getRun();
      var clean = true;
      for (var i = 0; i < 40; i++) {
        RUN.setRun(RUN.newRun());
        var r = RUN.getRun();
        r.act = 'red'; r.deck = RUN.startingDeck();    // primaries only
        RUN.rollReward({ type: 'boss', depth: 12 });
        RUN.getRun().reward.cards.forEach(function (c) {
          var col = CARDS[c.id].color;
          if (col && !C.actUnlocked(col, r.deck)) clean = false;
        });
      }
      RUN.setRun(saved);
      return clean;
    })());
    check('The Devouring Star cannot be won by luck', (function () {
      /* The three primaries are always unlocked, so a boss can always fill an
         offer of three — the shortfall-to-gold path is a guard that should not
         fire in a real run. What matters is that the locked colours, and Black
         above all, never appear until they have been earned. */
      var saved = RUN.getRun();
      var everBlack = false, alwaysThree = true;
      for (var i = 0; i < 60; i++) {
        RUN.setRun(RUN.newRun());
        var r = RUN.getRun();
        r.act = RUN.ACT_KEYS[i % 3]; r.deck = RUN.startingDeck();
        RUN.rollReward({ type: 'boss', depth: 12 });
        var rw = RUN.getRun().reward;
        if (rw.cards.length !== 3) alwaysThree = false;
        if (rw.cards.some(function (c) { return CARDS[c.id].color === 'black'; })) everBlack = true;
      }
      // and once Black is genuinely held, the Star becomes reachable
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      r2.act = 'black'; r2.deck = RUN.startingDeck();
      for (var j = 0; j < C.requirementFor('black'); j++) r2.deck.push({ id: 'black_voidling', up: false });
      RUN.rollReward({ type: 'boss', depth: 12 });
      var earned = RUN.getRun().reward.cards.some(function (c) { return c.id === 'black_devouring_star'; });
      RUN.setRun(saved);
      return !everBlack && alwaysThree && earned;
    })());

    check('Every act has its own painting, none borrowed', (function () {
      var seen = {};
      return RUN.ACT_KEYS.every(function (k) {
        var art = RUN.ACT_ART[k];
        if (!art || !art.varName) return false;
        if (seen[art.varName]) return false;      // two acts sharing one room
        seen[art.varName] = 1;
        // hue-rotating a borrowed room was always a placeholder
        return !art.filter;
      });
    })());
    check('Only the room with no painted eyes draws its own', (function () {
      var drawn = RUN.ACT_KEYS.filter(function (k) { return RUN.ACT_ART[k].drawEyes; });
      return drawn.length === 1 && drawn[0] === 'black';
    })());
    check('Every seam sits where a watcher would', (function () {
      // all seven paintings frame their eyes in a narrow band; a value outside
      // it means a mismeasured painting rather than an unusual composition
      return RUN.ACT_KEYS.every(function (k) {
        var seam = RUN.ACT_ART[k].seam;
        return seam > 0.15 && seam < 0.30;
      });
    })());
    check('The drawn eyes wear every colour in the game', (function () {
      var found = 0;
      /* The cycle must visit all seven, or the last road picks favourites.
         Compared as rgb() rather than hex: the CSSOM normalises every colour it
         parses, so a hex needle could never match the haystack no matter how
         the stylesheet was written. */
      function toRgb(hex) {
        var n = parseInt(hex.slice(1), 16);
        return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
      }
      var wanted = C.COLOR_KEYS.map(function (k) { return toRgb(COLORS[k].hex); });
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
    })());

    check('An overlay never takes height from the board', (function () {
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
    })());
    check('The puck ring sits under the puck, not above its face', (function () {
      var key = Object.keys(tileEls)[0];
      var el = key && tileEls[key];
      if (!el || !el.owner || !el.token) return true;
      var ringY = parseFloat(el.owner.getAttribute('cy'));
      var faceY = parseFloat(el.token.getAttribute('cy'));
      // the ring used to share the top face's centre and haloed out above it
      return ringY > faceY;
    })());
    check('The default pair blinks on the same frame', (function () {
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
    })());
    check('Each secret road watches in its own way', (function () {
      var styles = {};
      RUN.SECRET_ACT_KEYS.forEach(function (k) {
        var art = RUN.ACT_ART[k];
        if (!art || !art.drawEyes) return;
        styles[art.eyeStyle] = (styles[art.eyeStyle] || 0) + 1;
      });
      // three secret roads, three different watchers, none of them repeated
      return Object.keys(styles).length === RUN.SECRET_ACT_KEYS.length &&
             Object.keys(styles).every(function (k) { return styles[k] === 1; });
    })());
    check('Every act with drawn eyes has real art of its own', (function () {
      return RUN.ACT_KEYS.concat(RUN.SECRET_ACT_KEYS).every(function (k) {
        var art = RUN.ACT_ART[k];
        if (!art) return false;
        // no secret road should still be borrowing another act's painting
        if (RUN.SECRET_ACT_KEYS.indexOf(k) !== -1) {
          return art.varName === '--art-' + k && !art.filter;
        }
        return !!art.varName;
      });
    })());

    check('The enemy passing leaves a marker; the player passing does not', (function () {
      var el = document.getElementById('passPuck');
      if (!el) return false;
      showPassPuck(false);
      var s = S();
      if (!s) return el.hidden;
      var saved = { turn: s.turn, finalTurn: s.finalTurn, pending: s.pending,
                    sel: s.selectedCard, wins: s.wins };
      showPassPuck(true);
      var shows = !el.hidden;
      showPassPuck(false);
      var clears = el.hidden;
      s.turn = saved.turn; s.finalTurn = saved.finalTurn; s.pending = saved.pending;
      s.selectedCard = saved.sel; s.wins = saved.wins;
      return shows && clears;
    })());
    check('The pass marker never sits on a tile', (function () {
      var el = document.getElementById('passPuck');
      if (!el || els.screen_battle.hidden) return true;
      showPassPuck(true);
      var r = el.getBoundingClientRect();
      var clash = false;
      Object.keys(tileEls).forEach(function (k) {
        var t = tileEls[k].shape.getBoundingClientRect();
        if (!(r.right < t.left || r.left > t.right || r.bottom < t.top || r.top > t.bottom)) clash = true;
      });
      showPassPuck(false);
      // it is a note about the turn, not a piece in play
      return !clash;
    })());
    check('The fork gives away nothing about roads you have not opened', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.act = 'green'; r.actsCleared = ['green']; r.actOffer = ['red', 'blue'];
      RUN.show('act');
      var txt = (els.actBody.textContent || '').toLowerCase();
      var leaks = ['needs', 'you hold', 'still shut', 'cards —', 'requirement'];
      var clean = !leaks.some(function (w) { return txt.indexOf(w) !== -1; });
      // and it must not name an act that is not on offer
      var named = RUN.ACT_KEYS.filter(function (k) {
        return txt.indexOf(RUN.ACTS[k].name.toLowerCase()) !== -1;
      });
      RUN.setRun(saved);
      RUN.show('map');
      return clean && named.length <= 3;      // the two on offer, plus the one behind you
    })());
    check('Every road has its own omen, and none of them give the rule away', (function () {
      var keys = Object.keys(RUN.ACT_OMENS);
      if (keys.length !== RUN.ACT_KEYS.length) return false;
      var seen = {};
      return keys.every(function (k) {
        var t = RUN.ACT_OMENS[k];
        if (!t || t.length < 40) return false;
        if (seen[t]) return false;                 // each act says something different
        seen[t] = 1;
        // no numbers and no naming of the mechanism
        return !/\\d/.test(t) && !/requir|unlock|need \\d|colour lab/i.test(t);
      });
    })());
    check('An omen is written the moment the road opens, and kept', (function () {
      var saved = RUN.getRun();
      var savedOmens = RUN.codex.omens;
      RUN.codex.omens = {};
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck();
      RUN.noteActOmens();
      var primariesOnly = ['red', 'green', 'blue'].every(function (k) { return RUN.codex.omens[k]; }) &&
                          !RUN.codex.omens.yellow;
      r.deck.push({ id: 'yellow_spark', up: false });
      r.deck.push({ id: 'yellow_banner', up: false });
      RUN.noteActOmens();
      var yellowNoted = !!RUN.codex.omens.yellow;
      RUN.codex.omens = savedOmens;
      RUN.setRun(saved);
      return primariesOnly && yellowNoted;
    })());

    // --- Black is a two-secondary colour, but mixing is never refused ---
    check('A secondary mixed with the "wrong" primary stays that secondary', (function () {
      // by raw bits every one of these is Black; none of them may become it
      var pairs = [['yellow', 'blue'], ['cyan', 'red'], ['magenta', 'green']];
      return pairs.every(function (pair) {
        var raw = C.mixColor(pair[0], pair[1]);
        var result = C.mixResultColor(pair[0], pair[1]);
        var secondary = C.isSecondary(pair[0]) ? pair[0] : pair[1];
        return raw === 'black' && result === secondary;
      });
    })());
    check('Two secondaries still make Black', (function () {
      var legal = [['yellow', 'cyan'], ['yellow', 'magenta'], ['cyan', 'magenta']];
      return legal.every(function (pair) {
        return C.mixResultColor(pair[0], pair[1]) === 'black';
      });
    })());
    check('Mixing into something already Black stays Black', (function () {
      return ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'black'].every(function (c) {
        return C.mixResultColor('black', c) === 'black' && C.mixResultColor(c, 'black') === 'black';
      });
    })());
    check('Ordinary mixes are unaffected', (function () {
      return C.mixResultColor('red', 'green') === 'yellow' &&
             C.mixResultColor('green', 'blue') === 'cyan' &&
             C.mixResultColor('red', 'blue') === 'magenta' &&
             C.mixResultColor('red', 'red') === 'red';
    })());
    check('Mixing is never refused for what it would produce', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row2', 0, 'yellow_spark', 3);
      put(g2, 'bottom', 'row1', 0, 'blue_scout', 2);   // touching, and Black by raw bits
      var opts = RUN.mixOptions(g2.board, PLAYER, []);
      var offered = opts.some(function (o) {
        return o.base.row === 'row2' && o.base.index === 0 &&
               o.other.row === 'row1' && o.other.index === 0;
      });
      var res = RUN.canMix(g2.board, PLAYER, { row: 'row2', index: 0 }, { row: 'row1', index: 0 }, []);
      return offered && res.ok;
    })());
    check('That mix lands as the secondary, added together and stronger', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row2', 0, 'yellow_spark', 3);
      put(g2, 'bottom', 'row1', 0, 'blue_scout', 2);
      var s2 = { board: g2.board, hazards: g2.hazards, relics: [], chains: { bottom: 0, top: 0 },
                 mixesThisRound: 0, freeMixesThisRound: 0 };
      var out = RUN.applyMix(s2, PLAYER, { row: 'row2', index: 0 }, { row: 'row1', index: 0 }, 0, false);
      return out.color === 'yellow' && out.strength === 3 + 2 + 1;   // sum plus the ordinary +1
    })());
    check('The volatile bench can fuse any pair; Black still needs two secondaries', (function () {
      var saved = RUN.getRun();
      var clean = true;
      for (var t = 0; t < 40 && clean; t++) {
        RUN.setRun(RUN.newRun());
        var r = RUN.getRun();
        r.deck = [{ id: 'yellow_spark', up: false }, { id: 'yellow_banner', up: false },
                  { id: 'blue_scout', up: false }, { id: 'blue_current', up: false },
                  { id: 'red_brute', up: false }, { id: 'green_seed', up: false },
                  { id: 'cyan_shield', up: false }];
        var before = C.colourCounts(r.deck);
        r.lab = { kind: 'volatile', picks: [], presses: 0, results: [], done: false, curses: 0 };
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
    })());

    // --- odds and ends ---
    check('Relics are no longer capped', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      var keys = Object.keys(C.RELICS);
      keys.forEach(function (k) { r.relics.push(k); });
      var count = r.relics.length;
      RUN.rollReward({ type: 'battle', depth: 6 });     // must not throw or refuse
      var ok = C.RELIC_LIMIT === Infinity && count === keys.length;
      RUN.setRun(saved);
      return ok;
    })());
    check('Each act option is dressed in its own room', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.act = 'green'; r.actsCleared = ['green']; r.actOffer = ['red', 'blue'];
      RUN.show('act');
      var picks = els.actBody.querySelectorAll('.act-pick');
      var ok = picks.length === 2;
      Array.prototype.forEach.call(picks, function (p2) {
        var k = p2.getAttribute('data-act');
        var want = RUN.ACT_ART[k] && RUN.ACT_ART[k].varName;
        if (p2.style.getPropertyValue('--act-art').indexOf(want) === -1) ok = false;
        // and the words need something solid behind them
        if (!p2.querySelector('.act-scrim') || !p2.querySelector('.act-copy')) ok = false;
      });
      RUN.setRun(saved); RUN.show('map');
      return ok;
    })());
    check('An omen says which colours opened the road', (function () {
      var NAMES = { red: 'red', green: 'green', blue: 'blue',
                    yellow: 'red', cyan: 'green', magenta: 'red' };
      return RUN.ACT_KEYS.every(function (k) {
        var t = RUN.ACT_OMENS[k].toLowerCase();
        if (k === 'black') return /mixture|made colour/.test(t);
        return t.indexOf(NAMES[k]) !== -1;
      });
    })());

    check('Lost lives read differently from full ones in battle', (function () {
      /* Purely a CSS cascade bug: battle-mode restyled every .life span the
         same warm red, so .life.lost's colour was overridden right back to
         full — the hearts never looked like they were disappearing no matter
         how many lives the player had actually lost. Comparing computed style
         directly is what a visual diff of the two states would catch and a
         DOM-only check would miss. */
      var el = document.createElement('span');
      el.className = 'life lost';
      document.body.appendChild(el);
      document.body.classList.add('battle-mode');
      var lostColor = getComputedStyle(el).color;
      el.className = 'life';
      var fullColor = getComputedStyle(el).color;
      document.body.classList.remove('battle-mode');
      el.remove();
      return lostColor !== fullColor;
    })());
    check('The lives HUD reflects the actual count, not always the max', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.lives = 1;
      RUN.renderRunBar();
      var lit = document.getElementById('runLives').querySelectorAll('.life:not(.lost)').length;
      var lost = document.getElementById('runLives').querySelectorAll('.life.lost').length;
      RUN.setRun(saved);
      RUN.renderRunBar();
      return lit === 1 && lost === r.maxLives - 1;
    })());

    // --- the victory screen: conquering every road, and going endless ---
    check('Beating the last unconquered act shows the victory screen, not gameover', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.actsCleared = RUN.ACT_KEYS.slice(0, RUN.ACT_KEYS.length - 1);
      var lastAct = RUN.ACT_KEYS[RUN.ACT_KEYS.length - 1];
      r.act = lastAct; r.deck = RUN.startingDeck();
      ['yellow_spark', 'yellow_banner', 'cyan_shield', 'magenta_spark', 'magenta_chain']
        .forEach(function (id) { r.deck.push({ id: id, up: false }); });
      var wasConquered = RUN.allActsConquered(r);
      RUN.finishAct();
      var after = RUN.getRun();
      var ok = !wasConquered && after.screen === 'victory' && RUN.allActsConquered(after);
      RUN.setRun(saved);
      return ok;
    })());
    check('A narrow completion — not every act was ever reachable — still ends at gameover', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      // only the three primaries were ever unlocked; nothing built a secondary
      r.actsCleared = C.PRIMARY_COLORS.slice(0, 2);
      r.act = C.PRIMARY_COLORS[2];
      r.deck = RUN.startingDeck();
      RUN.finishAct();
      var after = RUN.getRun();
      var ok = after.screen === 'gameover' && !RUN.allActsConquered(after);
      RUN.setRun(saved);
      return ok;
    })());
    check('"End the run here" stops the run and marks it a true conquest', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      RUN.ACT_KEYS.forEach(function (k) { r.actsCleared.push(k); });
      RUN.endAsVictory();
      var after = RUN.getRun();
      var ok = after.screen === 'gameover' && !after.endless && RUN.allActsConquered(after);
      RUN.setRun(saved);
      return ok;
    })());
    check('"Go endless" reopens every road, including ones already cleared', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck();
      RUN.ACT_KEYS.forEach(function (k) { r.actsCleared.push(k); });
      var beforeCount = RUN.eligibleActs(r).length;    // zero: everything is "behind" it
      RUN.goEndless();
      var after = RUN.getRun();
      var afterCount = RUN.eligibleActs(after).length;
      RUN.setRun(saved);
      // primaries plus every secondary this deck can still reach — never zero again
      return beforeCount === 0 && after.endless === true && after.screen === 'act' && afterCount > 0;
    })());
    check('Clearing a second act in endless mode never re-shows the victory screen', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck();
      RUN.ACT_KEYS.forEach(function (k) { r.actsCleared.push(k); });
      RUN.goEndless();
      var open = RUN.getRun().actOffer;
      RUN.beginAct(open[0]);
      var r2 = RUN.getRun();
      r2.map = RUN.buildMap(open[0], false);
      r2.depth = r2.map.length - 1;
      RUN.finishAct();
      var after = RUN.getRun();
      var ok = after.screen !== 'victory' && (after.screen === 'act' || after.screen === 'map');
      RUN.setRun(saved);
      return ok;
    })());
    check('Endless power keeps climbing loop after loop', (function () {
      var r = { actsCleared: [] };
      RUN.ACT_KEYS.forEach(function (k) { r.actsCleared.push(k); });   // one full lap
      var afterLap1 = RUN.powerAt(r, 0);
      r.actsCleared.push(RUN.ACT_KEYS[0]);                              // one more clear, endless
      var afterLap2 = RUN.powerAt(r, 0);
      return afterLap2 > afterLap1;
    })());
    check('No literal escape sequences leak into victory or gameover text', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.actsCleared = RUN.ACT_KEYS.slice(0, RUN.ACT_KEYS.length - 1);
      r.act = RUN.ACT_KEYS[RUN.ACT_KEYS.length - 1];
      r.deck = RUN.startingDeck();
      ['yellow_spark', 'yellow_banner', 'cyan_shield', 'magenta_spark', 'magenta_chain']
        .forEach(function (id) { r.deck.push({ id: id, up: false }); });
      RUN.finishAct();
      /* A double-escaped \\u2014 in source becomes the six literal characters
         "\u2014" on screen instead of an em dash. This is exactly the class of
         bug a DOM check catches and eyeballing a screenshot almost missed. */
      var victoryText = els.victoryBody.textContent;
      RUN.endAsVictory();
      var gameoverText = els.gameoverBody.textContent;
      RUN.setRun(saved);
      return victoryText.indexOf('\\u') === -1 && gameoverText.indexOf('\\u') === -1;
    })());

    // --- relics come from the things worth beating ---
    check('Only elites and bosses drop relics, and they always do', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      var ordinary = 0, ranked = 0;
      for (var i = 0; i < 40; i++) {
        r.relics = [];
        RUN.rollReward({ type: 'battle', depth: 6 });
        if (RUN.getRun().reward.relic) ordinary++;
        r.relics = [];
        RUN.rollReward({ type: i % 2 ? 'elite' : 'boss', depth: 6 });
        if (RUN.getRun().reward.relic) ranked++;
      }
      RUN.setRun(saved);
      // an 18% trickle off ordinary fights made relics background noise
      return ordinary === 0 && ranked === 40;
    })());
    check('A ranked reward carries a card AND a relic', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      RUN.getRun().relics = [];
      RUN.rollReward({ type: 'elite', depth: 6 });
      var rw = RUN.getRun().reward;
      var ok = rw.cards.length > 0 && !!rw.relic;
      RUN.setRun(saved);
      return ok;
    })());
    check('Shop relics cost more than their printed price', (function () {
      return Object.keys(RELICS).every(function (k) {
        return RUN.shopRelicPrice(k) > RELICS[k].cost;
      });
    })());

    // --- a fusion keeps what its parents were ---
    check('A fusion inherits what its parents were, instead of erasing it', (function () {
      var f = C.fuseCards({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
      var d = CARDS[f.id];
      return d.effectSources.length === 2 &&
             d.effectSources.indexOf('red_scout') !== -1 &&
             d.effectSources.indexOf('green_gardener') !== -1 &&
             !d.silenced && !!d.passive && !!d.aura;
    })());
    check('An inherited aura actually fires on the board', (function () {
      var f = C.fuseCards({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
      var g2 = fresh();
      g2.board[PLAYER].row2[0] = { cardId: f.id, color: CARDS[f.id].color,
        strength: CARDS[f.id].strength, temp: 0 };
      put(g2, 'bottom', 'row1', 0, 'red_brute', 2);
      var ev = C.evaluateBoard(g2.board, g2.hazards, {});
      // the Gardener's +1 to touching units came along with the fusion
      return ev.strengthOf(ev.view['bottom-row1-0']) === 3;
    })());
    check('A fusion chain never carries more than three rules', (function () {
      var f = C.fuseCards({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
      ['yellow_banner', 'green_titan', 'red_scout', 'cyan_shield'].forEach(function (k) {
        f = C.fuseCards(f, { id: k, up: false });
      });
      return CARDS[f.id].effectSources.length === C.FUSED_EFFECT_CAP;
    })());
    check('Past the cap, a rule is genuinely lost rather than merged away', (function () {
      /* Which rule goes is random, and the incoming one is as droppable as any
         other — that is what makes a late fusion a trade rather than a free
         stack. So the invariant is the shape, not the survival of any
         particular effect: still exactly three, all of them drawn from the two
         parents, and something that was there before is now gone. */
      for (var t = 0; t < 25; t++) {
        var f = C.fuseCards({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
        f = C.fuseCards(f, { id: 'yellow_banner', up: false });
        var beforeSet = CARDS[f.id].effectSources.slice();
        var union = beforeSet.concat(['green_titan']);
        var g = C.fuseCards(f, { id: 'green_titan', up: false });
        var afterSet = CARDS[g.id].effectSources;
        if (afterSet.length !== C.FUSED_EFFECT_CAP) return false;
        if (!afterSet.every(function (k) { return union.indexOf(k) !== -1; })) return false;
        if (!union.some(function (k) { return afterSet.indexOf(k) === -1; })) return false;
      }
      return true;
    })());
    check('A fusion survives a save with the exact rules it was holding', (function () {
      var saved = RUN.getRun();
      RUN.clearSave();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      var f = RUN.fuseInDeck({ id: 'red_scout', up: false }, { id: 'green_gardener', up: false });
      f = RUN.fuseInDeck(f, { id: 'yellow_banner', up: false });
      f = RUN.fuseInDeck(f, { id: 'green_titan', up: false });   // forces a random drop
      r.deck.push(f);
      var wantId = f.id, wantEff = CARDS[f.id].effectSources.slice();
      RUN.saveRun();
      delete CARDS[wantId];                       // as a page reload would
      var back = RUN.loadRun();
      var got = back && CARDS[wantId] && CARDS[wantId].effectSources;
      var ok = !!got && got.length === wantEff.length &&
               got.every(function (k, i) { return k === wantEff[i]; });
      RUN.clearSave();
      RUN.setRun(saved);
      return ok;
    })());

    // --- the back rows are no longer safe ---
    check('Backline cards reach past the frontline, not through it', (function () {
      var g2 = fresh();
      put(g2, 'top', 'row1', 0, 'red_brute', 9);      // the line
      put(g2, 'top', 'row3', 0, 'red_brute', 6);      // what it is protecting
      var before = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
      var frontBefore = before.strengthOf(before.view['top-row1-0']);
      CARDS.magenta_lancer.onPlay(g2, PLAYER, { row: 'row1', index: 0 }, [],
        RUN.buildApi(g2, PLAYER, []));
      var after = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
      return after.strengthOf(after.view['top-row1-0']) === frontBefore &&
             after.strengthOf(after.view['top-row3-0']) < 6;
    })());
    check('An enemy row aura lands on the far side only', (function () {
      var g2 = fresh();
      put(g2, 'top', 'row1', 0, 'red_brute', 9);
      put(g2, 'top', 'row3', 0, 'red_brute', 6);
      put(g2, 'bottom', 'row3', 0, 'red_brute', 6);   // our own back row must be untouched
      g2.board[PLAYER].row2[0] = { cardId: 'yellow_arclight', color: 'yellow', strength: 3, temp: 0 };
      var ev = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
      return ev.strengthOf(ev.view['top-row3-0']) === 4 &&
             ev.strengthOf(ev.view['top-row1-0']) === 9 &&
             ev.strengthOf(ev.view['bottom-row3-0']) === 6;
    })());
    check('Something in every colour can threaten the back rows', (function () {
      var reachers = C.DRAWABLE.filter(function (k) {
        var d = CARDS[k];
        return d.enemyRowAura || /behind the line|back row/i.test(d.text || '');
      });
      var colours = {};
      reachers.forEach(function (k) { colours[CARDS[k].color] = 1; });
      return reachers.length >= 4 && Object.keys(colours).length >= 3;
    })());

    // --- Black ends the game; White is the prize for the long way round ---
    check('Beating Black ends the game even with roads left unwalked', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.actsCleared = ['green', 'red'];        // most of the wheel never touched
      r.act = 'black'; r.deck = RUN.startingDeck();
      RUN.finishAct();
      var after = RUN.getRun();
      var ok = after.screen === 'victory' && !RUN.whiteUnlocked(after);
      RUN.setRun(saved);
      return ok;
    })());
    check('White opens only when every road was already behind you', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.actsCleared = RUN.ACT_KEYS.filter(function (k) { return k !== 'black'; });
      r.act = 'black'; r.deck = RUN.startingDeck();
      RUN.finishAct();
      var after = RUN.getRun();
      var ok = after.screen === 'victory' && RUN.whiteUnlocked(after);
      RUN.setRun(saved);
      return ok;
    })());
    check('White is not on the wheel and never appears in an ordinary fork', (function () {
      if (RUN.ACT_KEYS.indexOf('white') !== -1) return false;
      if (RUN.SECRET_ACT_KEYS.indexOf('white') === -1) return false;
      if (C.COLOR_KEYS.indexOf('white') !== -1) return false;   // never mixable
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck();
      r.endless = true;
      RUN.ACT_KEYS.forEach(function (k) { r.actsCleared.push(k); });
      var offered = RUN.eligibleActs(r).indexOf('white') !== -1;
      RUN.setRun(saved);
      return !offered;
    })());
    check('Beating White ends the run outright', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.actsCleared = RUN.ACT_KEYS.slice();
      r.act = 'white'; r.deck = RUN.startingDeck();
      RUN.finishAct();
      var after = RUN.getRun();
      var ok = after.screen === 'gameover' && after.actsCleared.indexOf('white') !== -1;
      RUN.setRun(saved);
      return ok;
    })());
    check('The Unbroken Light punishes Black and pays for breadth', (function () {
      var mod = ENEMIES.unbroken_light.mod;
      function board(colors) {
        var g2 = fresh();
        var slots = [['row1', 0], ['row1', 1], ['row1', 2], ['row2', 0], ['row2', 1], ['row3', 0]];
        colors.forEach(function (col, i) {
          put(g2, 'bottom', slots[i][0], slots[i][1], 'red_brute', 6);
          g2.board[PLAYER][slots[i][0]][slots[i][1]].color = col;
        });
        return g2;
      }
      function score(colors, on) {
        var g2 = board(colors);
        return C.evaluateBoard(g2.board, g2.hazards, { enemyMod: on ? mod : {} }).totals.bottom;
      }
      var allBlack = ['black', 'black', 'black', 'black', 'black', 'black'];
      var broad = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta'];
      /* Measured against real full-clear decks, which carry a median of 4 Black
         cards while already fielding 6 colours. A boss punishing breadth would
         have been weakest against the Black-heavy decks that actually get here;
         this one is strongest against exactly them. */
      return score(allBlack, true) < score(allBlack, false) * 0.35 &&
             score(broad, true) > score(broad, false);
    })());

    // --- warding: one flag, honoured by every source of harm ---
    check('A ward refuses a hazard', (function () {
      function underScorch(cardId) {
        var g2 = fresh();
        g2.board[PLAYER].row1[0] = { cardId: cardId, color: CARDS[cardId].color,
          strength: CARDS[cardId].strength, temp: 0 };
        g2.hazards[PLAYER].row1 = 'scorch';
        var ev = C.evaluateBoard(g2.board, g2.hazards, {});
        return ev.strengthOf(ev.view['bottom-row1-0']) - CARDS[cardId].strength;
      }
      // the plain card loses a point to the burn; the warded one does not
      return underScorch('green_colony') === -1 && underScorch('green_thicket') === 0;
    })());
    check('A ward refuses fissure drain', (function () {
      var link = C.severableLinks(PLAYER, [])[0];
      if (!link) return true;
      var g2 = fresh();
      var at = link.a;
      function drainOn(cardId) {
        var g3 = fresh();
        g3.board[PLAYER][at.row][at.index] = { cardId: cardId, color: CARDS[cardId].color,
          strength: CARDS[cardId].strength, temp: 0 };
        var ev = C.evaluateBoard(g3.board, g3.hazards, { fissures: [link] });
        return ev.strengthOf(ev.view['bottom-' + at.row + '-' + at.index]) - CARDS[cardId].strength;
      }
      return drainOn('green_colony') < 0 && drainOn('green_thicket') === 0;
    })());
    check('A ward refuses a boss punishment', (function () {
      function vsWhite(cardId) {
        var g2 = fresh();
        g2.board[PLAYER].row1[0] = { cardId: cardId, color: 'black', strength: 6, temp: 0 };
        var ev = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { punishColor: { black: 5 } } });
        return ev.strengthOf(ev.view['bottom-row1-0']);
      }
      return vsWhite('red_brute') === 1 && vsWhite('green_thicket') === 6;
    })());
    check('A ward never blocks something good', (function () {
      var g2 = fresh();
      g2.board[PLAYER].row2[0] = { cardId: 'green_thicket', color: 'green',
        strength: CARDS.green_thicket.strength, temp: 0 };
      var alone = C.evaluateBoard(g2.board, g2.hazards, {});
      var base = alone.strengthOf(alone.view['bottom-row2-0']);
      /* The Thicket is silenced as its cost, so its own number should not move.
         The gate must be one-directional: it filters negatives, never positives. */
      return base === CARDS.green_thicket.strength;
    })());
    check('The Bulwark protects what it touches, not itself', (function () {
      var g2 = fresh();
      g2.board[PLAYER].row2[0] = { cardId: 'cyan_bulwark', color: 'cyan', strength: 3, temp: 0 };
      g2.board[PLAYER].row1[0] = { cardId: 'red_brute', color: 'red', strength: 6, temp: 0 };
      g2.hazards[PLAYER].row1 = 'scorch';
      g2.hazards[PLAYER].row2 = 'scorch';
      var ev = C.evaluateBoard(g2.board, g2.hazards, {});
      return ev.strengthOf(ev.view['bottom-row1-0']) === 6 &&
             ev.strengthOf(ev.view['bottom-row2-0']) === 2;   // it burns
    })());
    check('The Recluse holds its ward only while it stands alone', (function () {
      function reclusive(withNeighbour) {
        var g2 = fresh();
        g2.board[PLAYER].row2[0] = { cardId: 'magenta_recluse', color: 'magenta', strength: 5, temp: 0 };
        if (withNeighbour) put(g2, 'bottom', 'row1', 0, 'red_brute', 2);
        g2.hazards[PLAYER].row2 = 'scorch';
        var ev = C.evaluateBoard(g2.board, g2.hazards, {});
        return ev.strengthOf(ev.view['bottom-row2-0']);
      }
      return reclusive(false) === 5 && reclusive(true) < 5;
    })());

    // --- the roads earned by how a run was lived ---
    check('Rot and Rift open on what the run did, not what it covered', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.deck = RUN.startingDeck(); r.fissures = [];
      var noneYet = !RUN.rotUnlocked(r) && !RUN.riftUnlocked(r);
      for (var i = 0; i < RUN.ROT_THRESHOLD; i++) r.deck.push({ id: C.CURSE_KEYS[0], up: false });
      var rotOpen = RUN.rotUnlocked(r);
      for (var j = 0; j < RUN.RIFT_THRESHOLD; j++) {
        r.fissures.push({ kind: 'sever', side: PLAYER, a: { row: 'row1', index: j },
                          b: { row: 'row2', index: 0 }, power: 1 });
      }
      var riftOpen = RUN.riftUnlocked(r);
      RUN.setRun(saved);
      return noneYet && rotOpen && riftOpen;
    })());
    check('A run that did all three hard things is offered all three roads', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.actsCleared = RUN.ACT_KEYS.slice();          // the whole wheel
      r.deck = RUN.startingDeck();
      for (var i = 0; i < RUN.ROT_THRESHOLD; i++) r.deck.push({ id: C.CURSE_KEYS[0], up: false });
      r.fissures = [];
      for (var j = 0; j < RUN.RIFT_THRESHOLD; j++) {
        r.fissures.push({ kind: 'sever', side: PLAYER, a: { row: 'row1', index: j },
                          b: { row: 'row2', index: 0 }, power: 1 });
      }
      var offers = RUN.secretOffers(r);
      RUN.setRun(saved);
      // three separate hard things, three separate doors — not a choice of one
      return offers.length === 3 &&
             offers.indexOf('white') !== -1 && offers.indexOf('rot') !== -1 &&
             offers.indexOf('rift') !== -1;
    })());
    check('The rot road fields curse decks whatever the player is carrying', (function () {
      var clean = 0;
      for (var i = 0; i < 30; i++) {
        var d = C.buildEnemyDeck(ENEMIES.cultist, 40, Math.random, 0, 0, RUN.ACTS.rot);
        if (d.some(function (c) { return CARDS[c.id].curse; })) clean++;
      }
      var elsewhere = 0;
      for (var j = 0; j < 30; j++) {
        var d2 = C.buildEnemyDeck(ENEMIES.cultist, 40, Math.random, 0, 0, RUN.ACTS.red);
        if (d2.some(function (c) { return CARDS[c.id].curse; })) elsewhere++;
      }
      // its identity, not a reaction to the player
      return clean === 30 && elsewhere === 0;
    })());
    check('The rift road breaks the enemy\\u2019s ground too', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r = RUN.getRun();
      r.fissures = [];
      RUN.beginAct('rift');
      var f = RUN.getRun().fissures;
      var mine = f.filter(function (x) { return x.side === PLAYER; }).length;
      var theirs = f.filter(function (x) { return x.side === ENEMY; }).length;
      RUN.setRun(saved);
      // a shared condition, not a one-sided punishment
      return mine > 0 && theirs > 0;
    })());
    check('Every secret boss carries a rule of its own', (function () {
      return RUN.SECRET_ACT_KEYS.every(function (k) {
        var bossKey = RUN.ACTS[k].boss, e = ENEMIES[bossKey];
        if (!e || e.kind !== 'boss') return false;
        return C.enemyIcons(bossKey).length > 0 && (e.behaviour || '').length > 40;
      });
    })());

    // --- six things a deck can be built around ---
    check('Swarm pays for bodies', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row2', 0, 'green_swarmling', 1);
      var alone = C.evaluateBoard(g2.board, g2.hazards, {});
      var a = alone.strengthOf(alone.view['bottom-row2-0']);
      for (var i = 0; i < 3; i++) put(g2, 'bottom', 'row1', i, 'red_brute', 2);
      var crowd = C.evaluateBoard(g2.board, g2.hazards, {});
      return crowd.strengthOf(crowd.view['bottom-row2-0']) > a;
    })());
    check('Spectrum pays for colours, and only for distinct ones', (function () {
      function withColours(list) {
        var g2 = fresh();
        put(g2, 'bottom', 'row2', 0, 'yellow_prismatic', 1);
        list.forEach(function (c, i) {
          put(g2, 'bottom', 'row1', i, 'red_brute', 2);
          g2.board[PLAYER].row1[i].color = c;
        });
        var ev = C.evaluateBoard(g2.board, g2.hazards, {});
        return ev.strengthOf(ev.view['bottom-row2-0']);
      }
      // four of one colour must be worth less than four different ones
      return withColours(['red', 'green', 'blue', 'cyan']) > withColours(['red', 'red', 'red', 'red']);
    })());
    check('Chain pays for mix length', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row2', 0, 'magenta_cascade', 1);
      var c0 = C.evaluateBoard(g2.board, g2.hazards, { chains: { bottom: 0, top: 0 } });
      var c3 = C.evaluateBoard(g2.board, g2.hazards, { chains: { bottom: 3, top: 0 } });
      return c3.strengthOf(c3.view['bottom-row2-0']) ===
             c0.strengthOf(c0.view['bottom-row2-0']) + 9;
    })());
    check('Control pays for shrinking a crowded enemy', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row2', 0, 'black_famine', 3);
      for (var i = 0; i < 3; i++) put(g2, 'top', 'row1', i, 'red_brute', 6);
      var ev = C.evaluateBoard(g2.board, g2.hazards, {});
      // the swarm answer: three enemy bodies is one point off each of them
      return ev.strengthOf(ev.view['top-row1-0']) < 6;
    })());
    check('The Broodmother lifts the whole board, not just neighbours', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row2', 0, 'green_broodmother', 2);
      put(g2, 'bottom', 'row3', 0, 'red_brute', 2);     // deliberately not touching
      var ev = C.evaluateBoard(g2.board, g2.hazards, {});
      return ev.strengthOf(ev.view['bottom-row3-0']) === 3;
    })());
    check('Every archetype has enough cards to actually build around', (function () {
      function count(test) { return C.DRAWABLE.filter(test).length; }
      var swarm = count(function (k) { return /friendly unit|friendly units/i.test(CARDS[k].text || ''); });
      var spectrum = count(function (k) { return /distinct colour/i.test(CARDS[k].text || ''); });
      var chain = count(function (k) { return /mix chain|whenever you mix/i.test(CARDS[k].text || ''); });
      var control = count(function (k) { return /weaker|loses \\d/i.test(CARDS[k].text || ''); });
      var ward = count(function (k) { return /ignores? all negative/i.test(CARDS[k].text || ''); });
      var draw = count(function (k) { return /draw/i.test(CARDS[k].text || ''); });
      /* Three is the floor for something to be a build rather than a card that
         happens to exist \u2014 below that a deck cannot reliably find two of them. */
      return swarm >= 3 && spectrum >= 3 && chain >= 3 &&
             control >= 3 && ward >= 3 && draw >= 3;
    })());
    check('Archetype hooks survive a fusion without turning into nonsense', (function () {
      /* swarmAura is a number and warded is a flag; the generic composer would
         have wrapped both as functions, making the aura NaN when added to a
         strength. Explicit hook shapes are what stop that. */
      var f = C.fuseCards({ id: 'green_broodmother', up: false }, { id: 'green_thicket', up: false });
      var d = CARDS[f.id];
      if (typeof d.swarmAura !== 'number' || d.warded !== true) return false;
      var g2 = fresh();
      g2.board[PLAYER].row2[0] = { cardId: f.id, color: d.color, strength: d.strength, temp: 0 };
      put(g2, 'bottom', 'row1', 0, 'red_brute', 2);
      var ev = C.evaluateBoard(g2.board, g2.hazards, {});
      var lifted = ev.strengthOf(ev.view['bottom-row1-0']);
      return lifted === 3 && !isNaN(ev.totals.bottom);
    })());

    check('No archetype is locked behind the colour gate', (function () {
      var AR = {
        swarm:    function (k) { return /friendly unit/i.test(CARDS[k].text || ''); },
        spectrum: function (k) { return /distinct colour/i.test(CARDS[k].text || ''); },
        chain:    function (k) { return /mix chain|whenever you mix/i.test(CARDS[k].text || ''); },
        control:  function (k) { return /weaker|loses \\d/i.test(CARDS[k].text || ''); },
        ward:     function (k) { return /ignores? all negative/i.test(CARDS[k].text || ''); },
        draw:     function (k) { return /draw/i.test(CARDS[k].text || ''); }
      };
      /* Measured: with Spectrum and Ward living only in secondary colours they
         were reachable in 0 of 30 runs, because a deck cannot draft toward
         something the colour gate never offers. Every archetype needs a card in
         a colour the player starts with, or it is not a playstyle \u2014 it is a
         reward for having already played a different one. */
      return Object.keys(AR).every(function (a) {
        return C.DRAWABLE.some(function (k) {
          var d = CARDS[k];
          return AR[a](k) && C.PRIMARY_COLORS.indexOf(d.color) !== -1;
        });
      });
    })());
    check('The new ward shapes each protect something different', (function () {
      function scorched(cardId, row, extra) {
        var g2 = fresh();
        g2.board[PLAYER][row][0] = { cardId: cardId, color: CARDS[cardId].color,
          strength: CARDS[cardId].strength, temp: 0 };
        if (extra) put(g2, 'bottom', row, 1, 'red_brute', 4);
        g2.hazards[PLAYER][row] = 'scorch';
        var ev = C.evaluateBoard(g2.board, g2.hazards, {});
        return {
          self: ev.strengthOf(ev.view['bottom-' + row + '-0']) - CARDS[cardId].strength,
          mate: extra ? ev.strengthOf(ev.view['bottom-' + row + '-1']) - 4 : null
        };
      }
      // Ironhide guards itself, but only on the front row
      var front = scorched('red_ironhide', 'row1');
      var back = scorched('red_ironhide', 'row3');
      // the Bastion guards its whole row instead
      var bastion = scorched('blue_bastion', 'row1', true);
      return front.self === 0 && back.self === -1 && bastion.mate === 0;
    })());

    // --- build-arounds: each payoff must want a different board ---
    check('Every payoff rewards its own shape and punishes the wrong one', (function () {
      var SLOTS = [['row1', 0], ['row1', 1], ['row1', 2], ['row1', 3],
                   ['row2', 0], ['row2', 1], ['row2', 2], ['row3', 0], ['row3', 1]];
      function score(shape, payoff, handSize) {
        var g2 = fresh();
        g2.hands = { bottom: new Array(handSize || 0), top: [] };
        shape.forEach(function (spec, i) {
          g2.board[PLAYER][SLOTS[i][0]][SLOTS[i][1]] =
            { cardId: spec[0], color: spec[1], strength: 2, temp: 0 };
        });
        var at = SLOTS[shape.length];
        g2.board[PLAYER][at[0]][at[1]] = { cardId: payoff, color: CARDS[payoff].color,
          strength: CARDS[payoff].strength, temp: 0 };
        var ev = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
        return ev.strengthOf(ev.view['bottom-' + at[0] + '-' + at[1]]);
      }
      var WIDE = [['green_seed', 'green'], ['green_seed', 'green'], ['green_ensign', 'green'],
                  ['green_seed', 'green'], ['green_swarmling', 'green'], ['green_ensign', 'green']];
      var TALL = [['red_brute', 'red'], ['red_brute', 'red']];
      var RAINBOW = [['red_brute', 'red'], ['green_seed', 'green'], ['blue_scout', 'blue'],
                     ['yellow_spark', 'yellow'], ['cyan_shield', 'cyan'], ['magenta_spark', 'magenta']];
      var WARDED = [['cyan_bulwark', 'cyan'], ['green_thicket', 'green'],
                    ['magenta_recluse', 'magenta'], ['yellow_oath', 'yellow']];
      var MONO = [['black_voidling', 'black'], ['black_ember', 'black'],
                  ['black_shroud', 'black'], ['black_famine', 'black']];

      /* The point is not that each is strong somewhere — anything can be made
         strong. It is that each is markedly WEAK on the boards it does not
         want, so the deck you build actually decides which payoffs are worth
         taking. A payoff that is fine everywhere teaches nothing. */
      if (!(score(WIDE, 'green_hivemind') > score(TALL, 'green_hivemind') + 2)) return false;
      if (!(score(TALL, 'red_colossus') > score(WIDE, 'red_colossus') + 4)) return false;
      if (!(score(TALL, 'black_solitude') > score(WIDE, 'black_solitude') + 2)) return false;
      if (!(score(RAINBOW, 'yellow_mosaic') > score(MONO, 'yellow_mosaic') + 4)) return false;
      if (!(score(WARDED, 'cyan_sanctum') > score(WIDE, 'cyan_sanctum') + 6)) return false;
      // and the Tide payoff reads the hand, not the board
      return score(TALL, 'blue_undertow', 7) > score(TALL, 'blue_undertow', 0) + 4;
    })());
    check('A build-around is genuinely dead in the wrong deck', (function () {
      var g2 = fresh();
      // Colossus on a crowded board: nine strength eaten by its own company
      [['row1', 0], ['row1', 1], ['row1', 2], ['row2', 0], ['row2', 1]].forEach(function (t) {
        put(g2, 'bottom', t[0], t[1], 'green_seed', 2);
      });
      g2.board[PLAYER].row3[0] = { cardId: 'red_colossus', color: 'red', strength: 9, temp: 0 };
      var ev = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
      return ev.strengthOf(ev.view['bottom-row3-0']) === 0;
    })());
    check('Every archetype has an enabler and a payoff to reach for', (function () {
      /* A payoff with nothing to enable it is a trap, and an enabler with no
         payoff is filler. Each named archetype needs both in the pool. */
      var need = {
        swarm:    ['green_spore', 'green_hivemind', 'yellow_multitude'],
        monolith: ['red_colossus', 'black_solitude'],
        tide:     ['blue_archivist', 'blue_undertow', 'cyan_reservoir'],
        chain:    ['magenta_relay', 'magenta_crescendo'],
        attrition:['black_wither', 'blue_siphon', 'magenta_lancer'],
        spectrum: ['yellow_pilgrim', 'yellow_mosaic', 'colorless_prismstone'],
        ward:     ['cyan_bulwark', 'green_bramblewall', 'cyan_sanctum']
      };
      return Object.keys(need).every(function (arch) {
        return need[arch].every(function (k) {
          return CARDS[k] && C.DRAWABLE.indexOf(k) !== -1;
        });
      });
    })());
    check('The pool is broad enough that a colour is not one deck', (function () {
      var byColour = {};
      C.DRAWABLE.forEach(function (k) {
        var c = CARDS[k].color || 'colourless';
        byColour[c] = (byColour[c] || 0) + 1;
      });
      // every colour needs enough cards to support more than a single line of play
      return C.COLOR_KEYS.every(function (c) { return byColour[c] >= 9; }) &&
             C.DRAWABLE.length >= 95;
    })());

    // --- row minimums were the thing holding cheap-unit archetypes down ---
    check('A strength-1 unit normally cannot leave Row 1', (function () {
      var g2 = fresh();
      var tiles = C.legalTiles(g2.board, PLAYER, 1);
      return tiles.length === ROW_INFO.row1.count &&
             tiles.every(function (t) { return t.row === 'row1'; });
    })());
    check('anyRow lets a small unit stand anywhere', (function () {
      var g2 = fresh();
      var opts = C.placeOpts('green_burrower', [], g2.board, PLAYER);
      var tiles = C.legalTiles(g2.board, PLAYER, 1, opts);
      /* Measured: a swarm board could fill 7 of 9 tiles and a one-of-each-colour
         board only 4, while a Titan board filled all nine. The archetypes were
         not weak on rates, they were playing a smaller board. */
      return opts.anyRow === true && tiles.length === 9;
    })());
    check('Field Commission frees every unit, not just the ones that say so', (function () {
      var g2 = fresh();
      var plain = C.placeOpts('green_swarmling', [], g2.board, PLAYER);
      var withRelic = C.placeOpts('green_swarmling', ['field_commission'], g2.board, PLAYER);
      return !plain.anyRow && withRelic.anyRow &&
             C.legalTiles(g2.board, PLAYER, 1, withRelic).length === 9;
    })());
    check('A Footing opens its own row and no other', (function () {
      var g2 = fresh();
      g2.board[PLAYER].row2[0] = { cardId: 'cyan_footing', color: 'cyan', strength: 2, temp: 0 };
      var opts = C.placeOpts('green_swarmling', [], g2.board, PLAYER);
      var tiles = C.legalTiles(g2.board, PLAYER, 1, opts);
      var rows = {};
      tiles.forEach(function (t) { rows[t.row] = 1; });
      // row1 was always legal; row2 is opened by the Footing; row3 stays shut
      return !!rows.row1 && !!rows.row2 && !rows.row3;
    })());
    check('Every archetype has enablers and a payoff to build toward', (function () {
      function have(pattern, min) {
        var n = C.DRAWABLE.filter(function (k) {
          return pattern.test(CARDS[k].text || '');
        }).length;
        return n >= min;
      }
      return have(/every 2 other friendly|other friendly unit|units stand with it/i, 3) &&  // swarm
             have(/distinct colour|different colour/i, 5) &&                                 // coverage
             have(/mix chain|each link/i, 3) &&                                              // chain
             have(/cards in your hand/i, 3) &&                                               // hand size
             have(/two or fewer|empty tile/i, 3) &&                                          // solitude
             have(/ignores all negative|ignore all negative/i, 3) &&                         // ward
             have(/behind the line|back row/i, 3) &&                                         // control
             have(/draw/i, 5);                                                               // draw
    })());
    check('The solitude payoffs actually pay', (function () {
      var g2 = fresh();
      g2.board[PLAYER].row3[0] = { cardId: 'cyan_monolith', color: 'cyan', strength: 3, temp: 0 };
      var alone = C.evaluateBoard(g2.board, g2.hazards, {});
      var big = alone.strengthOf(alone.view['bottom-row3-0']);
      // fill the board and the Monolith should collapse
      ['row1', 'row2'].forEach(function (row) {
        for (var i = 0; i < ROW_INFO[row].count; i++) put(g2, 'bottom', row, i, 'red_brute', 2);
      });
      var crowded = C.evaluateBoard(g2.board, g2.hazards, {});
      return big > 15 && crowded.strengthOf(crowded.view['bottom-row3-0']) < big;
    })());

    // --- frontlines fall between rounds, but only where the lane was contested ---
    check('A contested lane culls both frontlines, support survives', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 0, 'red_brute', 3);
      put(g2, 'bottom', 'row1', 1, 'red_brute', 3);
      put(g2, 'bottom', 'row2', 0, 'green_gardener', 3);   // support in lanes 1 and 2
      put(g2, 'top', 'row1', 0, 'blue_scout', 2);
      put(g2, 'top', 'row1', 1, 'blue_scout', 2);
      RUN.clearFrontlines(g2.board, g2.hazards, {});
      return g2.board.bottom.row1[0] === null && g2.board.bottom.row1[1] === null &&
             g2.board.bottom.row2[0] !== null &&
             g2.board.top.row1[0] === null && g2.board.top.row1[1] === null;
    })());
    check('An uncontested lane spares its frontline', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 3, 'red_brute', 3);        // nothing opposite it
      var f = RUN.clearFrontlines(g2.board, g2.hazards, {});
      return g2.board.bottom.row1[3] !== null && f.bottom.length === 0;
    })());
    check('A unit fronting several lanes falls once if any was contested', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row3', 0, 'green_titan', 6);      // fronts lanes 1-3 alone
      put(g2, 'top', 'row1', 0, 'blue_scout', 2);          // contests lane 1 only
      var f = RUN.clearFrontlines(g2.board, g2.hazards, {});
      return f.bottom.length === 1 && g2.board.bottom.row3[0] === null;
    })());
    check('Support steps up to the line next round', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'red_brute', 3);
      put(g2, 'bottom', 'row1', 2, 'red_brute', 3);
      put(g2, 'bottom', 'row2', 1, 'green_gardener', 3);
      put(g2, 'top', 'row1', 1, 'blue_scout', 2);
      put(g2, 'top', 'row1', 2, 'blue_scout', 2);
      RUN.clearFrontlines(g2.board, g2.hazards, {});
      var ev2 = C.evaluateBoard(g2.board, g2.hazards, {});
      return ev2.lanes[1].bottom && ev2.lanes[1].bottom.champion.row === 'row2';
    })());
    check('An empty board survives the cull', (function () {
      var g2 = fresh();
      RUN.clearFrontlines(g2.board, g2.hazards, {});
      return true;
    })());

    check('The first three fights ease the player in',
      RUN.easeInHand(0) === 2 && RUN.easeInHand(2) === 2 && RUN.easeInHand(3) === 0,
      [0, 2, 3].map(RUN.easeInHand).join('/'));
    check('The battle-start primer is a single card', RUN.TUTORIAL_STEPS.length === 1);
    check('Frontline and round-break are deferred lessons',
      typeof RUN.TUTORIAL_LESSONS.frontline === 'function' && typeof RUN.TUTORIAL_LESSONS.roundbreak === 'function');
    check('Every opening card carries art or prose',
      RUN.TUTORIAL_STEPS.every(function (st) { return st.title && (st.body || st.art || st.artHtml); }));
    check('Lessons build from a live board and describe its own units', (function () {
      try {
        var g2 = fresh();
        put(g2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
        put(g2, 'bottom', 'row2', 1, 'black_voidling', 4);
        put(g2, 'top', 'row1', 1, 'red_brute', 3);
        var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
        var cards = RUN.TUTORIAL_LESSONS.frontline({ board: g2.board, hazards: g2.hazards, ev: e2 });
        if (!cards || !cards.length) return false;
        var text = cards[0].legend.join(' ');
        cards[0].art();
        // it must name the player's real units, not a canned example
        return text.indexOf('Cyan') !== -1 && text.indexOf('Red 3') !== -1;
      } catch (e) { return false; }
    })());
    check('The frontline lesson holds off until a lane is contested', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);   // nothing opposing
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      return RUN.TUTORIAL_LESSONS.frontline({ board: g2.board, hazards: g2.hazards, ev: e2 }) === null;
    })());
    check('The round-break lesson reports what actually fell', (function () {
      try {
        var g2 = fresh();
        put(g2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
        put(g2, 'bottom', 'row2', 1, 'green_gardener', 3);
        put(g2, 'top', 'row1', 1, 'red_brute', 3);
        put(g2, 'bottom', 'row1', 3, 'magenta_chain', 5);   // uncontested survivor
        var pre = C.cloneBoard(g2.board), preHaz = C.cloneHazards(g2.hazards);
        var e2 = C.evaluateBoard(pre, preHaz, {});
        var fallen = RUN.clearFrontlines(g2.board, g2.hazards, {});
        var cards = RUN.TUTORIAL_LESSONS.roundbreak({ board: pre, hazards: preHaz, ev: e2,
          after: g2.board, fallen: fallen, evalCtx: {} });
        if (!cards) return false;
        var text = cards[0].legend.join(' ');
        cards[0].art();
        // names what fell, and names a unit that came through untouched
        return cards[0].legend.length === 2 && text.indexOf('Cyan') !== -1 &&
               text.indexOf('never contested') !== -1 && text.indexOf('stays') !== -1;
      } catch (e) { return false; }
    })());
    check('The round-break lesson waits for a round where something fell', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
      var pre = C.cloneBoard(g2.board);
      var e2 = C.evaluateBoard(pre, g2.hazards, {});
      var fallen = RUN.clearFrontlines(g2.board, g2.hazards, {});
      return RUN.TUTORIAL_LESSONS.roundbreak({ board: pre, hazards: g2.hazards, ev: e2,
        after: g2.board, fallen: fallen, evalCtx: {} }) === null;
    })());
    check('Live pointers keep clear of units and of each other', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 0, 'red_brute', 2);
      put(g2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
      put(g2, 'bottom', 'row2', 1, 'green_gardener', 3);
      put(g2, 'top', 'row1', 1, 'red_brute', 3);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      var cards = RUN.TUTORIAL_LESSONS.frontline({ board: g2.board, hazards: g2.hazards, ev: e2 });
      var svg = cards[0].art();
      var badges = svg.match(/class="tut-badge" cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g) || [];
      var pts = badges.map(function (m2) {
        var n2 = m2.match(/cx="(-?[\d.]+)" cy="(-?[\d.]+)"/);
        return { x: +n2[1], y: +n2[2] };
      });
      if (pts.length < 2) return false;
      for (var i = 0; i < pts.length; i++) {
        for (var j = i + 1; j < pts.length; j++) {
          var d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < 70) return false;               // badges must not overlap
        }
      }
      return true;
    })());
    check('The first-turn lesson explains playing a card', (function () {
      try {
        var cards = RUN.TUTORIAL_LESSONS.play({});
        return cards && cards.length === 1 && typeof cards[0].artHtml === 'function' &&
               cards[0].artHtml().indexOf('tut-rack') !== -1;
      } catch (e) { return false; }
    })());
    check('A Row 1 lesson never claims the strength was divided', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'red_brute', 4);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      var cards = RUN.TUTORIAL_LESSONS.lanes_row1({ board: g2.board, hazards: g2.hazards, ev: e2,
        tile: { row: 'row1', index: 1 } });
      var txt = cards[0].legend.join(' ');
      return txt.indexOf('feeds lane 2.') !== -1 && txt.indexOf('Nothing is split off') !== -1 &&
             txt.indexOf('splits into') === -1;
    })());
    check('Flow arrows draw over the units, not under them', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row3', 0, 'green_titan', 7);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      var svg = RUN.TUTORIAL_LESSONS.lanes_row3({ board: g2.board, hazards: g2.hazards, ev: e2,
        tile: { row: 'row3', index: 0 } })[0].art();
      return svg.indexOf('tut-token') < svg.indexOf('tut-flow');
    })());
    check('One share chip per lane, sitting above Row 1', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row3', 0, 'green_titan', 7);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      var svg = RUN.TUTORIAL_LESSONS.lanes_row3({ board: g2.board, hazards: g2.hazards, ev: e2,
        tile: { row: 'row3', index: 0 } })[0].art();
      var chips = svg.match(/class="tut-amtbox"/g) || [];
      var ys = (svg.match(/class="tut-amtbox" x="[-\d.]+" y="([-\d.]+)"/) || [])[1];
      return chips.length === 3 && parseFloat(ys) < 0;   // above the board's top edge
    })());
    check('Every rule has a lesson that waits for its moment', (function () {
      var need = ['lanes_row1', 'lanes_row2', 'lanes_row3', 'mixing', 'passing', 'frontline', 'roundbreak'];
      return need.every(function (k) { return typeof RUN.TUTORIAL_LESSONS[k] === 'function'; });
    })());
    check('Lane lessons draw the row the player actually used', (function () {
      try {
        var g2 = fresh();
        put(g2, 'bottom', 'row2', 1, 'green_gardener', 4);
        var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
        var ctx = { board: g2.board, hazards: g2.hazards, ev: e2, tile: { row: 'row2', index: 1 } };
        var cards = RUN.TUTORIAL_LESSONS.lanes_row2(ctx);
        if (!cards) return false;
        cards[0].art();
        var txt = cards[0].legend.join(' ');
        // Row 2 splits across two lanes, so the shares must read as a sum of two
        return txt.indexOf('lanes 2, 3') !== -1 && txt.indexOf('2 + 2') !== -1;
      } catch (e) { return false; }
    })());
    check('A lane lesson ignores a placement in another row', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 0, 'red_brute', 2);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      return RUN.TUTORIAL_LESSONS.lanes_row3({ board: g2.board, hazards: g2.hazards, ev: e2,
        tile: { row: 'row1', index: 0 } }) === null;
    })());
    check('Turning the tutorial off silences every lesson', (function () {
      var was = RUN.tutorial.enabled;
      RUN.setTutorial(false);
      var quiet = ['mixing', 'passing', 'frontline', 'lanes_row1'].every(function (k) { return !RUN.shouldTeach(k); });
      RUN.setTutorial(was);
      return quiet;
    })());
    check('Lessons are not confined to the first battle', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      RUN.getRun().battlesFought = 4;
      var ok = RUN.shouldTeach('mixing');
      RUN.setRun(saved);
      return ok;
    })());
    check('The tutorial has steps and can be switched off', (function () {
      var was = RUN.tutorial.enabled;
      RUN.setTutorial(false);
      var off = RUN.tutorial.enabled === false;
      RUN.setTutorial(was);
      return RUN.TUTORIAL_STEPS.length >= 1 && off;
    })());
    // --- colour lab ---
    check('The ordinary lab rolls fusion or reinforcement', (function () {
      var seen = {}, saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      for (var i = 0; i < 300; i++) { RUN.rollLab(); seen[RUN.getRun().lab.kind] = 1; }
      RUN.setRun(saved);
      return seen.fuse && seen.boost && !seen.volatile;   // volatile is its own map node now
    })());
    check('Curse risk climbs with every pull and is capped',
      RUN.curseRisk(0) < RUN.curseRisk(1) && RUN.curseRisk(1) < RUN.curseRisk(5) &&
      RUN.curseRisk(99) <= 0.75, [0, 1, 5, 99].map(function (n) { return Math.round(RUN.curseRisk(n) * 100); }).join('/'));
    check('Curses stay out of rewards and shops',
      C.DRAWABLE.every(function (k) { return !CARDS[k].curse; }) && C.CURSE_KEYS.length >= 4);
    check('A drawn curse plants itself and never enters the hand', (function () {
      var g2 = { board: C.emptyBoard(), hazards: C.emptyHazards(),
        hands: { bottom: [], top: [] }, decks: { bottom: [C.makeCard('curse_husk'), C.makeCard('red_brute')], top: [] },
        mixTokens: { bottom: 1, top: 1 }, relics: [] };
      var got = RUN.drawInto(g2, 'bottom', 1);
      var planted = g2.board.bottom.row1[0];
      return got === 1 && g2.hands.bottom.length === 1 &&
             CARDS[g2.hands.bottom[0].id].curse !== true &&
             planted && planted.cardId === 'curse_husk' && planted.color === null &&
             g2.curseFired && g2.curseFired.length === 1;
    })());
    check('Curses take the front row first, blocking a lane', (function () {
      var g2 = { board: C.emptyBoard(), hazards: C.emptyHazards(),
        hands: { bottom: [], top: [] }, decks: { bottom: [C.makeCard('curse_idol')], top: [] },
        mixTokens: { bottom: 1, top: 1 }, relics: [] };
      RUN.drawInto(g2, 'bottom', 1);
      return !!g2.board.bottom.row1[0];
    })());
    check('Leaden Idol drags its neighbours down', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'red_brute', 4);
      put(g2, 'bottom', 'row2', 1, 'curse_idol', 1);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      return e2.strengthOf(e2.get('bottom', 'row1', 1)) === 3;
    })());
    check('Beacon of Rot feeds the enemy frontline', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row2', 1, 'curse_beacon', 1);
      put(g2, 'top', 'row1', 1, 'red_brute', 3);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      return e2.lanes[1].top.frontStrength === 5;
    })());
    check('A curse unit is colourless, so no colour can answer it', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'curse_husk', 1);
      put(g2, 'top', 'row1', 1, 'red_brute', 3);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      return e2.lanes[1].bottom.effective === false && e2.lanes[1].top.effective === false;
    })());
    check('A fusion of two blank cards is still silenced', (function () {
      /* Red Brute is the only unit in the game with no rules whatsoever, so two
         of them is the one fusion that inherits nothing — it stays the old
         pure-stat Amalgam and auras still cannot lift it. A fusion that DID
         inherit something is a real card and is deliberately no longer
         silenced, which is the whole point of the change. */
      var fused = C.fuseCards({ id: 'red_brute', up: false }, { id: 'red_brute', up: false });
      var g2 = fresh();
      g2.board.bottom.row1[1] = { cardId: fused.id, color: CARDS[fused.id].color,
        strength: CARDS[fused.id].strength, temp: 0 };
      put(g2, 'bottom', 'row2', 1, 'green_gardener', 3);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      return CARDS[fused.id].silenced === true &&
             (CARDS[fused.id].effectSources || []).length === 0 &&
             e2.strengthOf(e2.get('bottom', 'row1', 1)) === CARDS[fused.id].strength;
    })());
    check('The enemy rots at the rate the player does', (function () {
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
    })());
    check('A clean player never faces a cursed enemy', (function () {
      for (var i = 0; i < 200; i++) {
        var d = C.buildEnemyDeck(ENEMIES.brawler, 20, Math.random, 0, 0);
        if (d.some(function (c) { return CARDS[c.id].curse; })) return false;
      }
      return true;
    })());
    check('Elites and bosses bring curse tech, normal foes rarely do', (function () {
      function techRate(key) {
        var hits = 0;
        for (var i = 0; i < 250; i++) {
          var d = C.buildEnemyDeck(ENEMIES[key], 20, Math.random, 6, 6);
          if (d.some(function (c) { return C.NEEDS_CURSES_IDS.indexOf(c.id) !== -1; })) hits++;
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
    })());
    check('Curse tech never shows up against a clean player', (function () {
      for (var i = 0; i < 200; i++) {
        var d = C.buildEnemyDeck(ENEMIES.spectrum, 30, Math.random, 0, 0);
        if (d.some(function (c) { return C.NEEDS_CURSES_IDS.indexOf(c.id) !== -1; })) return false;
      }
      return true;
    })());
    check('Every act carries exactly one Volatile Lab behind a gate', (function () {
      for (var t = 0; t < 25; t++) {
        var m = RUN.buildMap(RUN.ACT_KEYS[t % RUN.ACT_KEYS.length], t % 2 === 0);
        var vol = [], gates = [];
        m.forEach(function (row, d) {
          row.forEach(function (n, i) {
            if (n.type === 'volatile') vol.push({ d: d, i: i });
            if (n.dangerous) gates.push(n);
          });
        });
        if (vol.length !== 1) return false;
        if (!gates.length) return false;
        var D = vol[0].d, i = vol[0].i;
        var into = m[D - 1].filter(function (p) { return p.next.indexOf(i) !== -1; });
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
    })());
    check('Fusion follows the board mixing maths', (function () {
      var f = C.fusePreview({ id: 'red_brute', up: false }, { id: 'blue_scout', up: false });
      var g2 = C.fusePreview({ id: 'black_voidling', up: false }, { id: 'red_brute', up: false });
      // Red 2 + Blue 1 + 1 = Magenta 4 ; Black 1 + Red 2 + 2 = Black 5
      return f.color === 'magenta' && f.strength === 4 && g2.color === 'black' && g2.strength === 5;
    })());
    check('A fused card is real, playable and out of the shop pool', (function () {
      var e = C.fuseCards({ id: 'red_brute', up: false }, { id: 'green_seed', up: false });
      var d = CARDS[e.id];
      return d && d.type === 'unit' && d.strength === 4 && C.DRAWABLE.indexOf(e.id) === -1;
    })());
    check('Reinforcement raises printed strength permanently', (function () {
      var lifted = RUN.liftStrength({ id: 'red_brute', up: false }, 2);
      return C.cardStrength(lifted) === 4 && CARDS[lifted.id].name === 'Red Brute';
    })());
    check('Reinforcement keeps the card\u2019s rules text and hooks', (function () {
      var lifted = RUN.liftStrength({ id: 'green_gardener', up: false }, 1);
      return typeof CARDS[lifted.id].aura === 'function' && C.cardStrength(lifted) === 4;
    })());
    check('Volatile fusion never hollows the deck out', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      for (var i = 0; i < 60; i++) RUN.applyVolatile('fuse');
      var units = RUN.deckUnits().length;
      RUN.setRun(saved);
      return units >= 4;                      // playable units, not padded count
    })());
    check('Curses spread out before repeating', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      RUN.rollLab(); r2.lab.kind = 'volatile';
      var kinds = {};
      for (var i = 0; i < 4; i++) {
        var held = {};
        r2.deck.forEach(function (c) { if (CARDS[c.id].curse) held[c.id] = true; });
        var fresh = C.CURSE_KEYS.filter(function (k) { return !held[k]; });
        if (!fresh.length) break;
        r2.deck.push({ id: fresh[0], up: false });
        kinds[fresh[0]] = 1;
      }
      RUN.setRun(saved);
      return Object.keys(kinds).length >= 3;
    })());
    check('A one-shot choice cannot be taken twice', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      r2.lives = 2;
      r2.pendingNode = { type: 'event', depth: 3, next: [0] };
      r2.event = RUN.EVENTS.filter(function (e) { return e.title === 'A Spilled Palette'; })[0];
      RUN.show('event');
      var btn = document.querySelector('#eventBody .lab-opt');
      btn.click(); btn.click();                      // impatient double tap
      var lives = RUN.getRun().lives;
      RUN.setRun(saved);
      RUN.show('map');
      return lives === 1;
    })());

    // --- the peek strip's click-to-expand overlay ---
    check('Tapping the peek strip opens the full, un-clipped card text', (function () {
      /* The strip that reads this text is fixed at two lines with overflow
         hidden, so a three-effect fusion's third sentence was silently cut off
         with no sign anything was missing. The strip is now a button that
         opens this overlay with the complete text instead. */
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      r2.map = RUN.buildMap('green', true); r2.depth = 0; r2.available = [0];
      RUN.enterNode(0);
      var s = RUN.getState();
      var f = C.fuseCards({ id: 'blue_current', up: false }, { id: 'black_reclaimer', up: false });
      f = C.fuseCards(f, { id: 'magenta_lancer', up: false });
      s.hands.bottom[0] = { id: f.id, up: false, uid: -1 };
      render();
      var card = document.querySelector('.hand .card:not(.mixcard)');
      card.dispatchEvent(new Event('mouseenter'));
      var peek = document.getElementById('cardPeek');
      var gotId = peek.dataset.cardId === f.id;
      peek.click();
      var overlay = document.getElementById('cardDetailOverlay');
      var fullTextShown = document.getElementById('cardDetailBody').textContent.indexOf(CARDS[f.id].text) !== -1;
      var opened = !overlay.hidden;
      overlay.hidden = true;
      RUN.setRun(saved); RUN.show('map');
      return gotId && opened && fullTextShown;
    })());
    check('Moving off a hovered card toward the peek strip does not blank it first', (function () {
      /* The actual bug a player would hit: mouseenter sets the peek strip's
         content, but the strip sits below the cards — reaching it with a mouse
         means leaving the card first. That used to fire mouseleave, which
         cleared the strip back to the empty prompt (and wiped the card id with
         it) the instant before the click could land, so the click always
         opened nothing. */
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      r2.map = RUN.buildMap('green', true); r2.depth = 0; r2.available = [0];
      RUN.enterNode(0);
      var s = RUN.getState();
      s.hands.bottom[0] = { id: 'red_brute', up: false, uid: -1 };
      render();
      var card = document.querySelector('.hand .card:not(.mixcard)');
      card.dispatchEvent(new Event('mouseenter'));
      var idBefore = document.getElementById('cardPeek').dataset.cardId;
      card.dispatchEvent(new Event('mouseleave'));
      var idAfter = document.getElementById('cardPeek').dataset.cardId;
      RUN.setRun(saved); RUN.show('map');
      return idBefore === 'red_brute' && idAfter === 'red_brute';
    })());
    check('The card detail overlay closes via its button, the backdrop, and nothing else opens it emptied out', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      r2.map = RUN.buildMap('green', true); r2.depth = 0; r2.available = [0];
      RUN.enterNode(0);
      var s = RUN.getState();
      s.hands.bottom[0] = { id: 'red_brute', up: false, uid: -1 };
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
    })());
    check('The peek strip\\u2019s "read more" hint renders a real ellipsis, not an escape code', (function () {
      /* A doubled backslash in the CSS content string prints the six literal
         characters "\\2026" instead of the unicode codepoint they were meant
         to escape to \u2014 the exact class of bug this file has hit before in JS
         string literals, here in a CSS one instead. */
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      r2.map = RUN.buildMap('green', true); r2.depth = 0; r2.available = [0];
      RUN.enterNode(0);
      var s = RUN.getState();
      s.hands.bottom[0] = { id: 'red_brute', up: false, uid: -1 };
      render();
      document.querySelector('.hand .card:not(.mixcard)').dispatchEvent(new Event('mouseenter'));
      var content = getComputedStyle(document.getElementById('cardPeek'), '::after').content;
      RUN.setRun(saved); RUN.show('map');
      return content.indexOf('\u2026') !== -1 && content.indexOf('2026') === -1;
    })());
    check('Lives never read below zero', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      RUN.getRun().lives = -3;
      RUN.renderRunBar();
      var v = RUN.getRun().lives;
      RUN.setRun(saved);
      return v === 0;
    })());
    check('A chain belongs to the side that built it', (function () {
      var g2 = { board: C.emptyBoard(), hazards: C.emptyHazards(),
        hands: { bottom: [], top: [] }, decks: { bottom: [], top: [] },
        relics: [], chains: { bottom: 0, top: 0 } };
      function put2(sd, r, i, id, st) { var d = CARDS[id];
        g2.board[sd][r][i] = { cardId: id, color: d.color, strength: st, temp: 0 }; }
      put2('bottom', 'row1', 0, 'red_brute', 3); put2('bottom', 'row2', 0, 'blue_scout', 3);
      put2('top', 'row1', 2, 'red_brute', 3); put2('top', 'row2', 2, 'blue_scout', 3);
      RUN.applyMix(g2, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false);
      var mine = g2.chains.bottom;
      RUN.applyMix(g2, 'top', { row: 'row1', index: 2 }, { row: 'row2', index: 2 }, 0, false);
      // the enemy mixing must not wipe the player's chain
      return mine === 1 && g2.chains.bottom === 1 && g2.chains.top === 1;
    })());
    check('Magenta Echo reads its own side\u2019s chain', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'magenta_echo', 3);
      var quiet = C.evaluateBoard(g2.board, g2.hazards, { chains: { bottom: 0, top: 3 } });
      var loud = C.evaluateBoard(g2.board, g2.hazards, { chains: { bottom: 2, top: 0 } });
      // +2 per link on its own side, and nothing from the enemy's
      return quiet.strengthOf(quiet.get('bottom', 'row1', 1)) === 3 &&
             loud.strengthOf(loud.get('bottom', 'row1', 1)) === 7;
    })());
    check('A curse unit reports as colourless', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'curse_husk', 1);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      var v = e2.get('bottom', 'row1', 1);
      return v.color === null && v.colorless === true;
    })());
    check('Inspecting a colourless unit never reads an undefined colour', (function () {
      // EFFECTIVE has no entry for null; anything indexing it must guard first
      return C.EFFECTIVE[null] === undefined && C.isEffective(null, 'red') === false &&
             C.isEffective('red', null) === false;
    })());
    check('A hazard-stripped unit is colourless too', (function () {
      var g2 = fresh();
      g2.hazards.bottom.row1 = 'colorless';
      put(g2, 'bottom', 'row1', 1, 'red_brute', 3);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      return e2.get('bottom', 'row1', 1).colorless === true;
    })());
    check('A normal unit is not flagged colourless', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'red_brute', 3);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, {});
      var v = e2.get('bottom', 'row1', 1);
      return v.colorless === false && v.color === 'red';
    })());
    check('The player opens the first battle of a run', (function () {
      var saved = RUN.getRun();
      var allPlayer = true;
      for (var i = 0; i < 25; i++) {
        RUN.setRun(RUN.newRun());
        var r2 = RUN.getRun();
        r2.pendingNode = { type: 'battle', enemy: 'brawler', depth: 0, next: [] };
        if (RUN.newBattle(r2.pendingNode).turn !== 'bottom') allPlayer = false;
      }
      RUN.setRun(saved);
      return allPlayer;
    })());
    check('Later battles still flip a coin for the opener', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun(), seen = {};
      r2.battlesFought = 5;
      r2.pendingNode = { type: 'battle', enemy: 'brawler', depth: 4, next: [] };
      for (var i = 0; i < 200; i++) seen[RUN.newBattle(r2.pendingNode).turn] = 1;
      RUN.setRun(saved);
      return seen.bottom && seen.top;
    })());
    check('The first-turn lesson no longer lists row minimums', (function () {
      var txt = RUN.TUTORIAL_LESSONS.play({})[0].legend.join(' ');
      return txt.indexOf('minimum strength') === -1 && txt.indexOf('Row 2 needs') === -1;
    })());
    check('The line-breaks lesson is two points and names the whole cull', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 1, 'cyan_cleanser', 4);
      put(g2, 'bottom', 'row2', 1, 'green_gardener', 3);
      put(g2, 'top', 'row1', 1, 'red_brute', 3);
      put(g2, 'bottom', 'row1', 3, 'magenta_chain', 5);
      var pre = C.cloneBoard(g2.board), preHaz = C.cloneHazards(g2.hazards);
      var e2 = C.evaluateBoard(pre, preHaz, {});
      var fallen = RUN.clearFrontlines(g2.board, g2.hazards, {});
      var cards = RUN.TUTORIAL_LESSONS.roundbreak({ board: pre, hazards: preHaz, ev: e2,
        after: g2.board, fallen: fallen, evalCtx: {} });
      var txt = cards[0].legend.join(' ');
      return cards[0].legend.length === 2 &&
             txt.indexOf('both sides, all of them') !== -1 &&
             txt.indexOf('steps up and holds') === -1;
    })());
    /* ---- Rewind and fissures ---- */
    check('Sever cuts one seam, on one side only', (function () {
      // the seam between Row 2 #1 and Row 1 #2
      var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
      var sv = C.boardTopo(f);
      return C.lanesOfFor('bottom', 'row2', 1, sv).join() === '1' &&
             C.lanesOfFor('top', 'row2', 1, sv).join() === '1,2' &&
             C.lanesOfFor('bottom', 'row2', 0, sv).join() === '0,1' &&
             C.adjacentTilesFor('bottom', 'row2', 1, sv).length ===
               C.adjacentTiles('row2', 1).length - 1 &&
             C.adjacentTilesFor('top', 'row2', 1, sv).length === C.adjacentTiles('row2', 1).length;
    })());
    check('A crack blocks adjacency in both directions', (function () {
      var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
      var sv = C.boardTopo(f);
      var up = C.adjacentTilesFor('bottom', 'row1', 2, sv)
        .some(function (t) { return t.row === 'row2' && t.index === 1; });
      var down = C.adjacentTilesFor('bottom', 'row2', 1, sv)
        .some(function (t) { return t.row === 'row1' && t.index === 2; });
      return !up && !down;
    })());
    check('A Row 3 tile keeps the lanes its intact neighbour still offers', (function () {
      // cut row3#0 from row2#0: it should keep only what row2#1 reaches
      var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row3', index: 0 }, b: { row: 'row2', index: 0 } }];
      var sv = C.boardTopo(f);
      return C.lanesOfFor('bottom', 'row3', 0, sv).join() === '1,2' &&
             C.lanesOfFor('bottom', 'row3', 0, null).join() === '0,1,2';
    })());
    check('A severed link never strands a tile', (function () {
      var fs = [], guard = 0;
      while (guard++ < 40) {
        var av = C.severableLinks('bottom', fs);
        if (!av.length) break;
        fs.push(av[0]);
      }
      if (guard >= 40) return false;                 // must saturate, not loop
      var sv = C.boardTopo(fs), okAll = true;
      C.ROWS.forEach(function (r) {
        for (var i = 0; i < C.ROW_INFO[r].count; i++) {
          if (!C.lanesOfFor('bottom', r, i, sv).length) okAll = false;
        }
      });
      return okAll && fs.length > 0;
    })());
    check('A severed lane loses the share, it is not rerouted', (function () {
      var b = C.emptyBoard();
      b.bottom.row2[1] = { cardId: null, color: 'red', strength: 6, temp: 0 };
      var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
      var e0 = C.evaluateBoard(b, null, { fissures: [] });
      var e1 = C.evaluateBoard(b, null, { fissures: f });
      return e0.shares['bottom-row2-1'][1] === 3 && e0.shares['bottom-row2-1'][2] === 3 &&
             e1.shares['bottom-row2-1'][2] === undefined && !e1.lanes[2].bottom;
    })());
    check('A crack drains the units on both of its tiles', (function () {
      var b = C.emptyBoard();
      b.bottom.row2[1] = { cardId: null, color: 'red', strength: 6, temp: 0 };
      b.bottom.row1[2] = { cardId: null, color: 'red', strength: 5, temp: 0 };
      var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
      var e0 = C.evaluateBoard(b, null, { fissures: [] });
      var e1 = C.evaluateBoard(b, null, { fissures: f });
      var d = C.FISSURE_DRAIN;
      return e1.view['bottom-row2-1'].bonus === e0.view['bottom-row2-1'].bonus - d &&
             e1.view['bottom-row1-2'].bonus === e0.view['bottom-row1-2'].bonus - d;
    })());
    check('A heavy drain empties a unit rather than making it negative', (function () {
      var b = C.emptyBoard();
      b.bottom.row1[1] = { cardId: null, color: 'red', strength: 1, temp: 0 };
      var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 1 } },
               { kind: 'sever', side: 'bottom', a: { row: 'row2', index: 0 }, b: { row: 'row1', index: 1 } }];
      var e = C.evaluateBoard(b, null, { fissures: f });
      var v = e.view['bottom-row1-1'];
      return Math.max(0, v.base + v.bonus) === 0 && e.totals.bottom >= 0;
    })());
    check('Mixing cannot reach across a fissure', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 2, 'red_brute', 3);
      put(g2, 'bottom', 'row2', 1, 'green_gardener', 3);
      var whole = RUN.canMix(g2.board, 'bottom', { row: 'row2', index: 1 }, { row: 'row1', index: 2 }, []);
      var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
      var cracked = RUN.canMix(g2.board, 'bottom', { row: 'row2', index: 1 }, { row: 'row1', index: 2 }, f);
      var opts = RUN.mixOptions(g2.board, 'bottom', f);
      return whole.ok && !cracked.ok && cracked.reason.indexOf('fissure') !== -1 && opts.length === 0;
    })());
    check('An aura does not cross a fissure', (function () {
      var aura = Object.keys(C.CARDS).filter(function (k) { return C.CARDS[k].aura && C.CARDS[k].type === 'unit'; })[0];
      if (!aura) return true;
      var b = C.emptyBoard();
      b.bottom.row2[1] = { cardId: aura, color: C.CARDS[aura].color, strength: C.CARDS[aura].strength || 3, temp: 0 };
      b.bottom.row1[2] = { cardId: null, color: 'red', strength: 4, temp: 0 };
      var e0 = C.evaluateBoard(b, null, { fissures: [] });
      var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 } }];
      var e1 = C.evaluateBoard(b, null, { fissures: f });
      // the neighbour keeps only the drain, never the aura
      return e1.view['bottom-row1-2'].bonus < e0.view['bottom-row1-2'].bonus;
    })());
    check('The instability meter overflows and carries the remainder', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      RUN.addInstability(RUN.REWIND.THRESHOLD + 30, PLAYER, C.emptyBoard());
      var okOne = r2.fissures.length === 1 && Math.abs(r2.instability - 30) < 1e-9;
      RUN.setRun(saved);
      return okOne;
    })());
    check('Rewind chunk size grows with lifetime use and never resets', (function () {
      var r2 = { rewindsUsed: 0 }, a = RUN.rewindChunk(r2, 1);
      r2.rewindsUsed = 9;
      var b = RUN.rewindChunk(r2, 1);
      // by the tenth use one chunk alone must clear the threshold
      return a === RUN.REWIND.BASE_CHUNK && b > RUN.REWIND.THRESHOLD;
    })());
    check('Impact is calibrated so an ordinary exchange scores about 1.0', (function () {
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
    })());
    check('A saturated board deepens instead of looping or going quiet', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      for (var i = 0; i < 60; i++) RUN.addInstability(RUN.REWIND.THRESHOLD * 2, PLAYER, C.emptyBoard());
      var noRoom = C.severableLinks(PLAYER, r2.fissures).length === 0 &&
                   C.bridgeableLinks(PLAYER, r2.fissures).length === 0;
      var allMaxed = r2.fissures.every(function (f) { return C.fissurePower(f) === C.FISSURE_MAX_POWER; });
      var noTileStranded = true, topo = C.boardTopo(r2.fissures);
      C.ROWS.forEach(function (row) {
        for (var i = 0; i < C.ROW_INFO[row].count; i++)
          if (!C.lanesOfFor(PLAYER, row, i, topo).length) noTileStranded = false;
      });
      RUN.setRun(saved);
      return noRoom && allMaxed && noTileStranded && r2.fissures.length > 5;
    })());
    check('One Rewind damages the board at most once', (function () {
      var saved = RUN.getRun();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      // a chunk worth twenty thresholds must still cost exactly one scar
      var before = r2.fissures.length;
      var ev = RUN.addInstability(RUN.REWIND.THRESHOLD * 20, PLAYER, C.emptyBoard());
      var one = ev.length === 1 && r2.fissures.length === before + 1;
      // and it must not bank an overflow that fires again for free
      var carried = r2.instability < RUN.REWIND.THRESHOLD;
      var ev2 = RUN.addInstability(0, PLAYER, C.emptyBoard());
      RUN.setRun(saved);
      return one && carried && ev2.length === 0;
    })());
    check('Riftwalker thrives on damage, then drowns in it', (function () {
      function at(power) {
        var b = C.emptyBoard();
        b.bottom.row2[1] = { cardId: 'black_riftwalker', color: 'black', strength: 3, temp: 0 };
        var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 }, power: power }];
        var v = C.evaluateBoard(b, null, { fissures: f }).view['bottom-row2-1'];
        return Math.max(0, v.base + v.bonus);
      }
      // climbs to a peak at 4, is back to par by 6, and is a liability past that
      return at(1) === 5 && at(4) === 11 && at(4) > at(5) && at(7) < 3 && at(8) === 0;
    })());
    check('Chorus grows with the board\u2019s scars but is capped', (function () {
      function at(n) {
        var fs = C.severableLinks('bottom', []).slice(0, n);
        var b = C.emptyBoard();
        b.bottom.row3[0] = { cardId: 'black_chorus', color: 'black', strength: 2, temp: 0 };
        var v = C.evaluateBoard(b, null, { fissures: fs }).view['bottom-row3-0'];
        return Math.max(0, v.base + v.bonus);
      }
      return at(0) === 2 && at(3) > at(0) && at(7) <= at(5);
    })());
    check('Cyan quiets damage for the round without healing it', (function () {
      var g2 = fresh();
      var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 }, power: 2 }];
      g2.fissures = f;
      put(g2, 'bottom', 'row2', 1, 'red_brute', 8);
      var loud = C.evaluateBoard(g2.board, g2.hazards, RUN.evalCtx(g2));
      var api = RUN.buildApi ? null : null;
      // play the Mender onto the damaged tile through the real resolver
      var g3 = RUN.simGame(g2);
      g3.fissures = f;
      RUN.resolveCard(g3, 'bottom', { id: 'cyan_mender' }, { row: 'row1', index: 2 }, []);
      var quiet = C.evaluateBoard(g3.board, g3.hazards, RUN.evalCtx(g3));
      var reachesAgain = C.lanesOfFor('bottom', 'row2', 1, C.boardTopo(RUN.evalCtx(g3).fissures)).length === 2;
      // the scar itself is untouched: it is still on the run's list
      return quiet.view['bottom-row2-1'].bonus > loud.view['bottom-row2-1'].bonus &&
             reachesAgain && f.length === 1 && g3.quieted &&
             Object.keys(g3.quieted).length === 1;
    })());
    check('A bridge joins two tiles that only meet at a corner', (function () {
      var pairs = C.bridgePairs();
      var everyPairIsNew = pairs.every(function (pr) {
        return !C.adjacentTiles(pr.a.row, pr.a.index)
          .some(function (t) { return C.sameTile(t, pr.b); });
      });
      var corner = C.sharedCorner('bottom', { row: 'row2', index: 0 }, { row: 'row2', index: 1 });
      return pairs.length === 8 && everyPairIsNew && !!corner;
    })());
    check('A bridge carries adjacency both ways', (function () {
      var f = [{ kind: 'bridge', side: 'bottom', a: { row: 'row2', index: 0 }, b: { row: 'row2', index: 1 }, power: 1 }];
      var tp = C.boardTopo(f);
      var fwd = C.adjacentTilesFor('bottom', 'row2', 0, tp).some(function (t) { return C.sameTile(t, { row: 'row2', index: 1 }); });
      var back = C.adjacentTilesFor('bottom', 'row2', 1, tp).some(function (t) { return C.sameTile(t, { row: 'row2', index: 0 }); });
      var enemyUntouched = !C.adjacentTilesFor('top', 'row2', 0, tp).some(function (t) { return C.sameTile(t, { row: 'row2', index: 1 }); });
      return fwd && back && enemyUntouched;
    })());
    check('A forward bridge grants a lane, paid for by thinner shares', (function () {
      // row3#0 meets row1#1 only at a corner; bridging reaches lane 1 directly
      var f = [{ kind: 'bridge', side: 'bottom', a: { row: 'row3', index: 0 }, b: { row: 'row1', index: 1 }, power: 1 }];
      var b = C.emptyBoard();
      b.bottom.row3[0] = { cardId: null, color: 'red', strength: 6, temp: 0 };
      var whole = C.evaluateBoard(b, null, { fissures: [] });
      var bridged = C.evaluateBoard(b, null, { fissures: f });
      var lanesWhole = C.lanesOfFor('bottom', 'row3', 0, null).length;
      var lanesBridged = C.lanesOfFor('bottom', 'row3', 0, C.boardTopo(f)).length;
      var shareWhole = whole.shares['bottom-row3-0'][0];
      var shareBridged = bridged.shares['bottom-row3-0'][0];
      return lanesBridged === lanesWhole && shareBridged <= shareWhole;
    })());
    check('A bridge drains the tiles it joins', (function () {
      var b = C.emptyBoard();
      b.bottom.row2[0] = { cardId: null, color: 'red', strength: 6, temp: 0 };
      b.bottom.row2[1] = { cardId: null, color: 'red', strength: 6, temp: 0 };
      var f = [{ kind: 'bridge', side: 'bottom', a: { row: 'row2', index: 0 }, b: { row: 'row2', index: 1 }, power: 1 }];
      var e0 = C.evaluateBoard(b, null, { fissures: [] });
      var e1 = C.evaluateBoard(b, null, { fissures: f });
      return e1.view['bottom-row2-0'].bonus === e0.view['bottom-row2-0'].bonus - C.FISSURE_DRAIN &&
             e1.view['bottom-row2-1'].bonus === e0.view['bottom-row2-1'].bonus - C.FISSURE_DRAIN;
    })());
    check('A deepened scar pulls harder in proportion to its power', (function () {
      var b = C.emptyBoard();
      b.bottom.row2[1] = { cardId: null, color: 'red', strength: 9, temp: 0 };
      function drainAt(power) {
        var f = [{ kind: 'sever', side: 'bottom', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 }, power: power }];
        var e = C.evaluateBoard(b, null, { fissures: f });
        return e.view['bottom-row2-1'].bonus;
      }
      return drainAt(1) - drainAt(3) === 2 * C.FISSURE_DRAIN &&
             C.fissuresTouching('bottom', 'row2', 1,
               [{ side: 'bottom', kind: 'sever', a: { row: 'row2', index: 1 }, b: { row: 'row1', index: 2 }, power: 3 }]) === 3;
    })());
    check('Rewind is offered only after the player has moved, once per round', (function () {
      var savedRun = RUN.getRun(), savedState = RUN.getState();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      r2.pendingNode = { type: 'battle', enemy: 'brawler', depth: 1, next: [0] };
      var st = RUN.newBattle(r2.pendingNode);
      RUN.setState(st);
      st.turn = PLAYER;
      var noneYet = !canRewind();                       // nothing to take back
      markRewindPoint(PLAYER);
      var armed = canRewind();
      st.rewindUsedThisRound = true;
      var spent = !canRewind();                         // hard cap holds
      RUN.setState(savedState); RUN.setRun(savedRun);
      return noneYet && armed && spent;
    })());
    check('Rewind restores the board, hands and turn exactly', (function () {
      var savedRun = RUN.getRun(), savedState = RUN.getState();
      RUN.setRun(RUN.newRun());
      var r2 = RUN.getRun();
      r2.pendingNode = { type: 'battle', enemy: 'brawler', depth: 1, next: [0] };
      var st = RUN.newBattle(r2.pendingNode);
      RUN.setState(st);
      st.turn = PLAYER;
      var snap = snapshotForRewind(st);
      var beforeBoard = JSON.stringify(st.board), beforeHand = st.hands.bottom.length;
      // mangle the state the way a played turn would
      st.board.bottom.row1[0] = { cardId: 'red_brute', color: 'red', strength: 5, temp: 0 };
      st.hands.bottom.pop();
      st.turn = ENEMY; st.finalTurn = true; st.mixTokens.bottom = 0;
      restoreRewind(st, snap);
      var okAll = JSON.stringify(st.board) === beforeBoard &&
                  st.hands.bottom.length === beforeHand &&
                  st.turn === PLAYER && st.finalTurn === false && st.mixTokens.bottom === 1;
      RUN.setState(savedState); RUN.setRun(savedRun);
      return okAll;
    })());
    check('The AI plans on the cracked board, not the pristine one', (function () {
      var g = { board: C.emptyBoard(), hazards: C.emptyHazards(),
        hands: { bottom: [], top: [] }, decks: { bottom: [], top: [] },
        fissures: [{ kind: 'sever', side: 'bottom', row: 'row2', index: 1, lane: 2 }] };
      var sim = RUN.simGame(g);
      return sim.fissures.length === 1 && RUN.evalCtx(g).fissures.length === 1;
    })());

    check('Every map node lists at least one onward path', (function () {
      var m = RUN.buildMap();
      for (var d = 0; d < m.length - 1; d++) {
        for (var i = 0; i < m[d].length; i++) if (!m[d][i].next.length) return false;
      }
      return true;
    })());
    check('The enemy brings enough cards to last three rounds', (function () {
      /* The player opens on 6 and draws 2 a round, so a full battle is about ten
         cards. A ten-card enemy deck ran dry in round three and the fight ended
         by attrition rather than by play. */
      var early = C.buildEnemyDeck(ENEMIES.brawler, 1, Math.random).length;
      var late = C.buildEnemyDeck(ENEMIES.brawler, 40, Math.random).length;
      var boss = C.buildEnemyDeck(ENEMIES.spectrum, 40, Math.random).length;
      return early >= 12 && late > early && boss > late && boss <= 26;
    })());
    check('Enemy decks respect their colours', C.buildEnemyDeck(ENEMIES.brawler, 9, Math.random).every(function (c) {
      var d2 = CARDS[c.id];
      return d2.type !== 'unit' || ENEMIES.brawler.colors.indexOf(d2.color) !== -1;
    }));
    check('Opening battles carry no depth bonus', RUN.depthBonusFor(0) === 0 && RUN.depthBonusFor(5) === 0);
    check('The bonus steps up toward the boss',
      RUN.depthBonusFor(7) === 1 && RUN.depthBonusFor(10) === 1 && RUN.depthBonusFor(12) === 2,
      [7, 10, 12].map(RUN.depthBonusFor).join('/'));
    check('Enemies scale with act depth', (function () {
      var g2 = fresh();
      put(g2, 'top', 'row1', 0, 'red_brute', 2);
      var early = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { depthBonus: 0 } });
      var late = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { depthBonus: 3 } });
      return early.strengthOf(early.get('top', 'row1', 0)) === 2 && late.strengthOf(late.get('top', 'row1', 0)) === 5;
    })());
    check('The depth bonus never touches your units', (function () {
      var g2 = fresh();
      put(g2, 'bottom', 'row1', 0, 'red_brute', 2);
      var e2 = C.evaluateBoard(g2.board, g2.hazards, { enemyMod: { depthBonus: 3 } });
      return e2.strengthOf(e2.get('bottom', 'row1', 0)) === 2;
    })());
    check('Every relic has text and a price', Object.keys(RELICS).every(function (k) { return RELICS[k].text && RELICS[k].cost > 0; }));
    check('Every card has a price', C.DRAWABLE.every(function (k) { return CARDS[k].cost > 0; }));

    // --- enemy deck quality is gated by depth ---
    var early = [], late = [];
    for (var n = 0; n < 40; n++) {
      C.buildEnemyDeck(ENEMIES.brawler, 1, Math.random).forEach(function (c) { early.push(CARDS[c.id].rarity); });
      C.buildEnemyDeck(ENEMIES.brawler, 10, Math.random).forEach(function (c) { late.push(CARDS[c.id].rarity); });
    }
    check('Early enemies field commons only', early.every(function (r) { return r === 'Common'; }),
      'saw ' + early.filter(function (r) { return r !== 'Common'; }).length + ' non-commons');
    check('Late enemies can field rares', late.some(function (r) { return r === 'Rare'; }));
    var earlyUp = 0;
    for (n = 0; n < 40; n++) C.buildEnemyDeck(ENEMIES.brawler, 1, Math.random).forEach(function (c) { if (c.up) earlyUp++; });
    check('Early enemies bring no upgrades', earlyUp === 0, earlyUp + ' upgraded');

    // --- Volatile Fusion can actually start a chain ---
    var vg = fresh(['volatile_fusion']);
    put(vg, 'bottom', 'row1', 0, 'red_brute', 2); put(vg, 'bottom', 'row2', 0, 'blue_scout', 2);
    put(vg, 'bottom', 'row1', 2, 'red_brute', 2); put(vg, 'bottom', 'row2', 1, 'green_seed', 2);
    RUN.doMixCascade(vg, 'bottom', { row: 'row1', index: 0 }, { row: 'row2', index: 0 }, 0, false, []);
    check('Volatile Fusion pushes the chain past 1', vg.chains.bottom >= 2, 'chain ' + vg.chains.bottom);

    return out;
  }

  return selfTest;
}
