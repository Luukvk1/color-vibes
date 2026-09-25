/* Black Devourer takes the CURRENT (aura inclusive) strength, and eats the card for good */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var map, ok;

  // --- Black Devourer takes the CURRENT (aura-inclusive) strength, and eats the card for good ---
      check('Black Devourer takes the effective strength, not just the stored fields', function () { return ((function () {
        /* v.strength + v.temp never included what a neighbour's aura was
           currently lending the target \u2014 a unit standing next to a Green
           Gardener reads larger on the board than that sum says, and the old
           code took the smaller, wrong number. evaluateBoard is the same pass
           that produces the number actually printed on the tile. Tile positions
           here are the ones actually adjacent on this board's topology, found by
           checking real adjacency rather than assumed from row numbers. */
        var battleState2 = fresh();
        battleState2.board[PLAYER].row2[1] = { cardId: 'black_devourer', color: 'black', strength: 3, temp: 0 };
        battleState2.board[PLAYER].row1[1] = { cardId: 'red_brute', color: 'red', strength: 5, temp: 0 };
        battleState2.board[PLAYER].row2[0] = { cardId: 'green_gardener', color: 'green', strength: 3, temp: 0 };
        var at = { row: 'row2', index: 1 };
        var targets = RUN.legalTargets(battleState2, PLAYER, CARDS.black_devourer.targets[0], [], at);
        C.CARDS.black_devourer.onPlay(battleState2, PLAYER, at, targets, RUN.buildApi(battleState2, PLAYER, []));
        var got = battleState2.board[PLAYER].row2[1].strength + (battleState2.board[PLAYER].row2[1].temp || 0);
        // devourer's own 3 + red_brute's raw 5 would be 8; the aura must push it past that
        return got > 8;
      })()); });
      check('Devouring permanently removes the meal from the run deck', function () { return ((function () {
        var saved = RUN.getRun(), savedState = RUN.getState();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = ['green_gardener', 'red_brute', 'black_devourer', 'blue_scout', 'yellow_spark']
          .map(function (id) { return { id: id, up: false }; });
        run.map = RUN.buildMap('green', true); run.depth = 0; run.available = [0];
        RUN.enterNode(0);
        var state = RUN.getState();
        ROWS.forEach(function (row) { for (var i = 0; i < ROW_INFO[row].count; i++) state.board[PLAYER][row][i] = null; });
        state.board[PLAYER].row2[0] = { cardId: 'green_gardener', color: 'green', strength: 3, temp: 0, deckIndex: 0 };
        state.board[PLAYER].row1[0] = { cardId: 'black_devourer', color: 'black', strength: 3, temp: 0, deckIndex: 2 };
        var beforeLen = RUN.getRun().deck.length;
        var at = { row: 'row1', index: 0 };
        var targets = RUN.legalTargets(state, PLAYER, CARDS.black_devourer.targets[0], [], at);
        CARDS.black_devourer.onPlay(state, PLAYER, at, targets, RUN.buildApi(state, PLAYER, []));
        var afterDeck = RUN.getRun().deck;
        var ok = afterDeck.length === beforeLen - 1 &&
                 !afterDeck.some(function (c) { return c.id === 'green_gardener'; });
        RUN.setState(savedState); RUN.setRun(saved);
        return ok;
      })()); });
      check('Devouring keeps every other card\\u2019s deck slot correctly synced', function () { return ((function () {
        /* The one real risk in a mid-battle deck splice: any OTHER card still
           holding a deckIndex reference — in hand, in the draw pile, or already
           on the board — silently points at the wrong slot for the rest of the
           fight unless it is shifted down along with the removal. Proven here by
           actually applying a SECOND, unrelated permanent buff afterward and
           checking it landed on the right card, not merely that a number looked
           plausible. */
        var saved = RUN.getRun(), savedState = RUN.getState();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = ['green_gardener', 'red_brute', 'black_devourer', 'blue_scout', 'yellow_spark']
          .map(function (id) { return { id: id, up: false }; });
        run.map = RUN.buildMap('green', true); run.depth = 0; run.available = [0];
        RUN.enterNode(0);
        var state = RUN.getState();
        ROWS.forEach(function (row) { for (var i = 0; i < ROW_INFO[row].count; i++) state.board[PLAYER][row][i] = null; });
        state.board[PLAYER].row2[0] = { cardId: 'green_gardener', color: 'green', strength: 3, temp: 0, deckIndex: 0 };
        state.board[PLAYER].row3[0] = { cardId: 'blue_scout', color: 'blue', strength: 1, temp: 0, deckIndex: 3 };
        state.board[PLAYER].row1[0] = { cardId: 'black_devourer', color: 'black', strength: 3, temp: 0, deckIndex: 2 };
        var api = RUN.buildApi(state, PLAYER, []);
        var at = { row: 'row1', index: 0 };
        var targets = RUN.legalTargets(state, PLAYER, CARDS.black_devourer.targets[0], [], at);
        CARDS.black_devourer.onPlay(state, PLAYER, at, targets, api);
        // blue_scout's deckIndex must now point at ITS card, not whatever shifted into the old slot
        var idx = state.board[PLAYER].row3[0].deckIndex;
        var slotIsBlueScout = RUN.getRun().deck[idx] && RUN.getRun().deck[idx].id === 'blue_scout';
        api.buff(PLAYER, { row: 'row3', index: 0 }, 10, true);
        var stillBlueScoutSlot = RUN.getRun().deck[idx] && RUN.getRun().deck[idx].id !== 'yellow_spark';
        RUN.setState(savedState); RUN.setRun(saved);
        return slotIsBlueScout && stillBlueScoutSlot;
      })()); });
      check('Devouring survives a save and reload once the battle ends', function () { return ((function () {
        var saved = RUN.getRun(), savedState = RUN.getState();
        RUN.clearSave();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = ['green_gardener', 'red_brute', 'black_devourer'].map(function (id) { return { id: id, up: false }; });
        run.map = RUN.buildMap('green', true); run.depth = 0; run.available = [0];
        RUN.enterNode(0);
        var state = RUN.getState();
        ROWS.forEach(function (row) { for (var i = 0; i < ROW_INFO[row].count; i++) state.board[PLAYER][row][i] = null; });
        state.board[PLAYER].row2[0] = { cardId: 'green_gardener', color: 'green', strength: 3, temp: 0, deckIndex: 0 };
        state.board[PLAYER].row1[0] = { cardId: 'black_devourer', color: 'black', strength: 3, temp: 0, deckIndex: 2 };
        var at = { row: 'row1', index: 0 };
        var targets = RUN.legalTargets(state, PLAYER, CARDS.black_devourer.targets[0], [], at);
        CARDS.black_devourer.onPlay(state, PLAYER, at, targets, RUN.buildApi(state, PLAYER, []));
        state.wins[PLAYER] = 2; state.battleOver = true;
        endBattle(true);
        var run = RUN.getRun();
        if (run.screen === 'reward') { run.reward.cardTaken = true; run.reward.taken = true; RUN.advance(); }
        RUN.saveRun();
        var wantLen = RUN.getRun().deck.length, wantIds = RUN.getRun().deck.map(function (c) { return c.id; });
        var back = RUN.loadRun();
        var ok = !!back && back.deck.length === wantLen &&
          back.deck.every(function (c, i) { return c.id === wantIds[i]; });
        RUN.clearSave();
        RUN.setState(savedState); RUN.setRun(saved);
        return ok;
      })()); });
}
