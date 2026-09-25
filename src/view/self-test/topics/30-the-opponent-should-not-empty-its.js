/* the opponent should not empty its hand into a round it has won */

export default function (t) {
  const { S: getState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD } = t.ctx;
  const check = t.check, fresh = t.fresh, put = t.put;
  var left, early;

  // --- the opponent should not empty its hand into a round it has won ---
      check('Strength banked past a won round counts for less', function () { return ((function () {
        return shapedLead(3) === 3 && shapedLead(SAFE_LEAD) === SAFE_LEAD &&
               shapedLead(SAFE_LEAD + 20) < SAFE_LEAD + 20 &&
               shapedLead(SAFE_LEAD + 20) > SAFE_LEAD;
      })()); });
      check('A card is worth holding early and worth nothing to hold last', function () { return ((function () {
        var state = getState();
        if (!state) return true;
        var savedWins = state.wins;
        state.wins = { bottom: 0, top: 0 };
        var early = reservePrice(state, ENEMY, {});
        state.wins = { bottom: 1, top: 1 };
        var last = reservePrice(state, ENEMY, {});
        state.wins = savedWins;
        // nothing to save for once the next round decides it
        return early > 0 && last === 0;
      })()); });
      check('A thin hand makes each remaining card dearer', function () { return ((function () {
        var state = getState();
        if (!state) return true;
        var savedWins = state.wins, savedHand = state.hands[ENEMY], savedDeck = state.decks[ENEMY];
        state.wins = { bottom: 0, top: 0 };
        state.hands[ENEMY] = [1, 2, 3, 4, 5, 6, 7, 8]; state.decks[ENEMY] = [1, 2, 3, 4];
        var rich = reservePrice(state, ENEMY, {});
        state.hands[ENEMY] = [1, 2]; state.decks[ENEMY] = [];
        var poor = reservePrice(state, ENEMY, {});
        state.wins = savedWins; state.hands[ENEMY] = savedHand; state.decks[ENEMY] = savedDeck;
        return poor > rich;
      })()); });
      check('The opponent holds when it is already far ahead, and fights when behind', function () { return ((function () {
        var state = getState();
        if (!state) return true;
        var saved = {
          board: state.board, hands: state.hands, wins: state.wins, turn: state.turn,
          pending: state.pending, mixTokens: state.mixTokens, power: state.power, enemy: state.enemy
        };
        /* Holding a won round is tier-gated, and tier comes from the enemy in
           front of you. Borrowing whatever battle happens to be open made this
           assert the opposite of the truth in a warm-up fight, where a tier-0
           enemy is *supposed* to overcommit — so the enemy is pinned here. */
        function blank() {
          state.board = C.emptyBoard();
          state.hands = { bottom: [], top: [] };
          for (var i = 0; i < 5; i++) state.hands[ENEMY].push({ id: 'red_brute', up: false, uid: -200 - i });
          state.mixTokens = { bottom: 0, top: 0 };
          state.pending = null; state.turn = ENEMY;
          state.power = 45; state.enemy = ENEMIES.brawler;
        }
        blank(); state.wins = { bottom: 0, top: 0 };
        state.board[ENEMY].row1[0] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
        state.board[ENEMY].row1[1] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
        var holdsWhenAhead = decideOpponentMove().willPass;

        blank(); state.wins = { bottom: 0, top: 0 };
        state.board[PLAYER].row1[0] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
        state.board[PLAYER].row1[1] = { cardId: 'red_brute', color: 'red', strength: 9, temp: 0 };
        var fightsWhenBehind = !decideOpponentMove().willPass;

        blank(); state.wins = { bottom: 0, top: 0 };
        var opensOnLevelBoard = !decideOpponentMove().willPass;

        state.board = saved.board; state.hands = saved.hands; state.wins = saved.wins;
        state.turn = saved.turn; state.pending = saved.pending; state.mixTokens = saved.mixTokens;
        state.power = saved.power; state.enemy = saved.enemy;
        render();
        return holdsWhenAhead && fightsWhenBehind && opensOnLevelBoard;
      })()); });

      check('Black works without ever touching a fissure', function () { return ((function () {
        var plain = C.DRAWABLE.filter(function (key) {
          return CARDS[key].color === 'black' &&
                 RUN.NEEDS_FISSURES.indexOf(key) === -1 &&
                 RUN.NEEDS_CURSES.indexOf(key) === -1;
        });
        /* Gating the fissure cards left Black almost empty for a player who never
           used Rewind, which made the hardest colour gate the least supported. */
        return plain.length >= 6;
      })()); });
      check('Curse cards read the board, not a tally', function () { return ((function () {
        return RUN.NEEDS_CURSES.every(function (key) {
          var cardDef = CARDS[key];
          // adjacency or consumption — never a count of curses owned, which is
          // how the fissure cards work and would make these feel like a reskin
          var positional = !!(cardDef.targets || (cardDef.text || '').indexOf('touch') !== -1);
          return positional && !cardDef.fissure;
        });
      })()); });
      check('Gravebloom wakes only next to a curse', function () { return ((function () {
        /* row1-0 and row1-1 are NOT adjacent: on this board tiles touch across
           rows, never along one. A same-row pair looks adjacent on screen and is
           not, which is worth stating in the test that nearly got it wrong. */
        var battleState2 = fresh();
        put(battleState2, 'bottom', 'row2', 0, 'black_gravebloom', 2);
        var alone = C.evaluateBoard(battleState2.board, battleState2.hazards, {});
        var a = alone.strengthOf(alone.view['bottom-row2-0']);

        var far = fresh();
        put(far, 'bottom', 'row2', 0, 'black_gravebloom', 2);
        put(far, 'bottom', 'row1', 3, 'curse_husk', C.CARDS.curse_husk.strength);
        far.board[PLAYER].row1[3].color = null;
        var farEval = C.evaluateBoard(far.board, far.hazards, {});
        var fv = farEval.strengthOf(farEval.view['bottom-row2-0']);

        var near = fresh();
        put(near, 'bottom', 'row2', 0, 'black_gravebloom', 2);
        put(near, 'bottom', 'row1', 0, 'curse_husk', C.CARDS.curse_husk.strength);
        near.board[PLAYER].row1[0].color = null;
        var nearEval = C.evaluateBoard(near.board, near.hazards, {});
        var nv = nearEval.strengthOf(nearEval.view['bottom-row2-0']);

        // owning a curse is not enough; it has to be placed against it
        return a === 2 && fv === 2 && nv === 6;
      })()); });
      check('Curse cards stay hidden until the run is actually cursed', function () { return ((function () {
        var saved = RUN.getRun();
        RUN.setRun(RUN.newRun());
        var run = RUN.getRun();
        run.deck = RUN.startingDeck();
        C.COLOR_KEYS.forEach(function () { run.deck.push({ id: 'black_voidling', up: false }); });
        run.deck.push({ id: 'cyan_shield', up: false });
        var dry = RUN.NEEDS_CURSES.every(function (key) { return !RUN.situationalOk(key); });
        run.deck.push({ id: C.CURSE_KEYS[0], up: false });
        var cursed = RUN.NEEDS_CURSES.every(function (key) { return RUN.situationalOk(key); });
        RUN.setRun(saved);
        return dry && cursed;
      })()); });
}
