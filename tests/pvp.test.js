/* Friendly matches: the deck rules, the relic bans, and whole matches played
   through the same calls the view makes. */

import './support/browser-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/game/index.js';
import { newSeededGame } from './support/play.js';

var C = game.rules, PLAYER = C.PLAYER, ENEMY = C.ENEMY;

function unlock(ids) { ids.forEach(function (id) { game.codex.cards[id] = 1; }); }
function run() { return game.getRun(); }
function match() { return run().pvp; }

function toRelicsAndMatch(relicPick) {
  game.pvpConfirmDeck(); game.pvpContinue(); game.pvpConfirmDeck();
  if (relicPick) match().offer = relicPick;
  game.pvpBan(match().offer[0]); game.pvpBan(match().offer[1]);
  game.pvpContinue(); game.pvpReady(); game.pvpContinue(); game.pvpReady();
}

/* A plain greedy pair of hands: play the first card with a legal place to go,
   with the targets the AI would choose, so every card's effect really runs. */
function playFirstCard(state) {
  var hand = state.hands[PLAYER];
  for (var index = 0; index < hand.length; index++) {
    var cardDef = C.CARDS[hand[index].id], tile = null;
    if (cardDef.type === 'unit') {
      tile = C.legalTiles(state.board, PLAYER, C.cardStrength(hand[index]), C.placeOpts(hand[index].id, state.relics, state.board, PLAYER))[0];
      if (!tile) continue;
    } else if (cardDef.type === 'hazard') {
      var row = C.freeHazardRows(state.hazards, PLAYER)[0];
      if (!row) continue;
      tile = { row: row, index: 0 };
    }
    state.pending = { side: PLAYER, card: hand[index], cardIndex: index, tile: tile, picks: game.autoTargets(state, PLAYER, hand[index], tile) };
    game.finishPlay();
    return true;
  }
  return false;
}

function playMatch(maxSteps) {
  for (var step = 0; step < (maxSteps || 500); step++) {
    var state = game.getBattleState();
    if (!state) return;
    if (state.roundResult) { game.continueBattle(); continue; }
    if (game.needsHandoff(state)) { game.takeSeat(); continue; }
    if (!playFirstCard(state)) game.pass(PLAYER);
  }
  assert.fail('match did not finish');
}

test('the starting deck is always buildable, and undiscovered cards are not', function () {
  newSeededGame(1); game.codex.cards = {};
  var pool = game.pvpPool();
  game.startingDeck().forEach(function (entry) { assert.ok(pool.indexOf(entry.id) !== -1, entry.id); });
  assert.equal(pool.indexOf('red_titan'), -1);
  game.codex.cards.red_titan = 1;
  assert.ok(game.pvpPool().indexOf('red_titan') !== -1 || !C.CARDS.red_titan);
});

test('fissure and curse cards never reach the pool', function () {
  newSeededGame(1);
  unlock(C.DRAWABLE.concat(C.BOSS_CARDS, C.CURSE_KEYS));
  game.pvpPool().forEach(function (id) {
    assert.ok(!/fissure|curse/i.test(C.CARDS[id].text || ''), id);
    assert.ok(!C.CARDS[id].curse, id);
  });
});

test('copy limits: three of a card, one of a rare, counted across deck and reserve', function () {
  newSeededGame(1); unlock(C.DRAWABLE);
  game.enterPvp(); game.pvpChooseMode(game.MODES.BUILD);
  var player = match().players[0];
  player.active = []; player.reserve = [];
  var common = C.DRAWABLE.filter(function (id) { return C.CARDS[id].rarity === 'Common' && game.pvpPool().indexOf(id) !== -1; })[0];
  var rare = C.DRAWABLE.filter(function (id) { return C.CARDS[id].rarity === 'Rare' && game.pvpPool().indexOf(id) !== -1; })[0];
  assert.equal(game.pvpAddCard(common, 'active'), true);
  assert.equal(game.pvpAddCard(common, 'active'), true);
  assert.equal(game.pvpAddCard(common, 'reserve'), true);
  assert.equal(game.pvpAddCard(common, 'active'), false);
  assert.equal(game.pvpAddCard(rare, 'active'), true);
  assert.equal(game.pvpAddCard(rare, 'reserve'), false);
  game.leavePvp();
});

test('a deck under ten is refused and any size above it is fine', function () {
  newSeededGame(1); unlock(C.DRAWABLE);
  game.enterPvp(); game.pvpChooseMode(game.MODES.BUILD);
  var player = match().players[0];
  player.active = player.active.slice(0, 9);
  assert.ok(game.deckProblems(player).length);
  assert.equal(game.pvpConfirmDeck(), false);
  player.active = [];
  game.pvpPool().slice(0, 40).forEach(function (id) { player.active.push(id); });
  assert.deepEqual(game.deckProblems(player), []);
  game.leavePvp();
});

test('five relics are offered, each player bans one, three stay shared', function () {
  newSeededGame(2);
  game.enterPvp(); game.pvpChooseMode(game.MODES.BUILD);
  game.pvpConfirmDeck(); game.pvpContinue(); game.pvpConfirmDeck();
  var offer = match().offer.slice();
  assert.equal(offer.length, 5);
  assert.equal(offer.indexOf('collectors_frame'), -1);
  game.pvpBan(offer[0]);
  assert.equal(game.pvpBan(offer[0]), false, 'the same relic cannot be banned twice');
  game.pvpBan(offer[3]);
  assert.deepEqual(run().relics, [offer[1], offer[2], offer[4]]);
  game.leavePvp();
});

test('a reserve swap trades places, stops at two, and can be undone', function () {
  newSeededGame(3); unlock(C.DRAWABLE);
  game.enterPvp(); game.pvpChooseMode(game.MODES.BUILD);
  var player = match().players[0];
  player.reserve = game.pvpPool().filter(function (id) { return player.active.indexOf(id) === -1; }).slice(0, 3);
  var before = player.active.slice(), reserveBefore = player.reserve.slice();
  assert.equal(game.pvpSwap(0, 0), true);
  assert.equal(player.active[0], reserveBefore[0]);
  assert.equal(game.pvpSwap(1, 1), true);
  assert.equal(game.pvpSwap(2, 2), false);
  game.pvpResetSwaps();
  assert.deepEqual(player.active, before);
  assert.deepEqual(player.reserve, reserveBefore);
  game.leavePvp();
});

test('a match has no Rewind, no fissures and no opponent AI', function () {
  newSeededGame(4);
  game.enterPvp(); game.pvpChooseMode(game.MODES.BUILD); toRelicsAndMatch();
  var state = game.getBattleState();
  assert.equal(state.fissures.length, 0);
  game.takeSeat();
  state = game.getBattleState();
  game.markRewindPoint(PLAYER);
  assert.equal(game.canRewind(), false);
  state.turn = ENEMY;
  assert.equal(game.opponentThink(), null);
  game.leavePvp();
});

test('trading seats puts the other player at the bottom, hand and all', function () {
  newSeededGame(5);
  game.enterPvp(); game.pvpChooseMode(game.MODES.BUILD); toRelicsAndMatch();
  game.takeSeat();
  var state = game.getBattleState(), mine = state.hands.bottom, theirs = state.hands.top, myName = state.seats.bottom.name;
  game.pass(PLAYER);
  assert.ok(game.needsHandoff(state));
  game.takeSeat();
  assert.equal(state.hands.bottom, theirs);
  assert.equal(state.hands.top, mine);
  assert.equal(state.enemy.name, myName);
  assert.equal(state.turn, PLAYER);
  game.leavePvp();
});

test('a shared relic scores for both seats', function () {
  newSeededGame(6);
  game.enterPvp(); game.pvpChooseMode(game.MODES.BUILD); toRelicsAndMatch();
  var state = game.getBattleState();
  state.seats.bottom.relics = ['color_lens']; state.seats.top.relics = ['color_lens']; state.relics = state.seats.bottom.relics;
  state.board.bottom.row1[0] = { cardId: 'red_brute', color: 'red', strength: 4, temp: 0 };
  state.board.top.row1[0] = { cardId: 'red_brute', color: 'red', strength: 4, temp: 0 };
  state.board.bottom.row1[1] = { cardId: 'red_brute', color: 'red', strength: 4, temp: 0 };
  state.board.top.row1[1] = { cardId: 'blue_scout', color: 'green', strength: 4, temp: 0 };
  var bottomSeen = C.evaluateBoard(state.board, state.hazards, game.evalCtx(state));
  assert.ok(bottomSeen.lanes.some(function (lane) { return lane.bottom && lane.bottom.lensed; }));
  // the mirror image scores the same, whichever seat holds the phone
  var mirror = { bottom: state.board.top, top: state.board.bottom };
  var topSeen = C.evaluateBoard(mirror, state.hazards, game.evalCtx(state));
  assert.equal(bottomSeen.totals.bottom, topSeen.totals.top);
  assert.equal(bottomSeen.totals.top, topSeen.totals.bottom);
  game.leavePvp();
});

test('whole matches finish with a winner and leave the saved run untouched', function () {
  for (var seed = 10; seed < 40; seed++) {
    newSeededGame(seed); unlock(C.DRAWABLE);
    game.show('shop');
    var savedBefore = JSON.stringify(game.snapshot().run);
    game.enterPvp(); game.pvpChooseMode(game.MODES.BUILD);
    // both decks hold everything allowed, shuffled, so every card and relic gets its turn over the seeds
    match().players.forEach(function (player) {
      player.active = game.pvpPool().sort(function () { return game.getRnd()() - 0.5; }).slice(0, 25);
    });
    toRelicsAndMatch(C.RELIC_KEYS.filter(function (key) { return key !== 'collectors_frame'; }).sort(function () { return game.getRnd()() - 0.5; }).slice(0, 5));
    playMatch();
    assert.equal(run().fissures.length, 0);
    assert.equal(match().step, 'result');
    assert.ok(match().winner);
    assert.ok(match().wins[0] === 2);
    assert.equal(JSON.stringify(game.snapshot().run), savedBefore);
    game.pvpRematch();
    assert.equal(match().step, 'mode');
    game.leavePvp();
    assert.equal(run().screen, 'shop');
    assert.ok(!run().pvp);
  }
});

test('saved decks come back, trimmed if they no longer fit the rules', function () {
  newSeededGame(7); unlock(C.DRAWABLE);
  game.codex.decks = { one: { name: 'Luuk', active: ['red_brute', 'red_brute', 'red_brute', 'red_brute', 'no_such_card'], reserve: [] } };
  game.enterPvp(); game.pvpChooseMode(game.MODES.BUILD);
  assert.equal(match().players[0].name, 'Luuk');
  assert.deepEqual(match().players[0].active, ['red_brute', 'red_brute', 'red_brute']);
  game.leavePvp(); game.codex.decks = {};
});

test('an enemy card played against you is met', function () {
  newSeededGame(8); game.codex.cards = {};
  game.newGame();
  var run2 = run();
  run2.pendingNode = { depth: 0, col: 0, type: 'battle', enemy: 'brawler', next: [0], done: false };
  game.beginBattle();
  var state = game.getBattleState();
  state.hands.top = [C.makeCard('red_titan' in C.CARDS ? 'red_titan' : 'red_brute', false)];
  var id = state.hands.top[0].id;
  assert.ok(!game.codex.cards[id]);
  state.turn = ENEMY;
  state.pending = { side: ENEMY, card: state.hands.top[0], cardIndex: 0, tile: { row: 'row3', index: 0 }, picks: [] };
  game.finishPlay();
  assert.ok(game.codex.cards[id]);
});

/* ---------------- drafting ---------------- */

function draftAll(mode, chooser) {
  game.enterPvp();
  assert.equal(game.pvpChooseMode(mode), true);
  for (var step = 0; step < 300 && match().step !== 'match'; step++) {
    if (match().step === 'cover') { game.pvpContinue(); continue; }
    game.pvpDraftPick(chooser ? chooser(match().draft.offer) : 0);
  }
  assert.equal(match().step, 'match');
}

[['face up', 'draft-open'], ['hidden packs', 'draft-hidden']].forEach(function (format) {
  test('a ' + format[0] + ' draft gives each player 15 cards, all in the deck, and 3 relics', function () {
    newSeededGame(21); unlock(C.DRAWABLE);
    draftAll(format[1]);
    var picks = match().draft.picks;
    picks.forEach(function (taken) {
      assert.equal(taken.cards.length, 15);
      assert.equal(taken.relics.length, 3);
      taken.cards.forEach(function (id) { assert.ok(game.pvpPool().indexOf(id) !== -1, id); });
    });
    var state = game.getBattleState();
    assert.equal(state.decks.bottom.length + state.hands.bottom.length, 15);
    assert.equal(state.decks.top.length + state.hands.top.length, 15);
    assert.equal(picks[0].relics.filter(function (key) { return picks[1].relics.indexOf(key) !== -1; }).length, 0, 'no relic is held twice');
    game.leavePvp();
  });

  test(format[0] + ' drafts play out to a winner', function () {
    for (var seed = 30; seed < 45; seed++) {
      newSeededGame(seed); unlock(C.DRAWABLE);
      draftAll(format[1], function (offer) { return Math.floor(game.getRnd()() * offer.length); });
      playMatch();
      assert.ok(match().winner);
      assert.equal(run().fissures.length, 0);
      game.leavePvp();
    }
  });

  test(format[0] + ' copy limits hold in the draft', function () {
    newSeededGame(46); unlock(C.DRAWABLE);
    draftAll(format[1]);
    match().draft.picks.forEach(function (taken) {
      taken.cards.forEach(function (id) {
        assert.ok(taken.cards.filter(function (other) { return other === id; }).length <= game.copyLimit(id), id);
      });
    });
    game.leavePvp();
  });
});

test('every offer has enough units and no repeats while the supply allows it', function () {
  newSeededGame(47); unlock(C.DRAWABLE);
  game.enterPvp(); game.pvpChooseMode('draft-open');
  while (match().step === 'draft') {
    var draft = match().draft;
    if (draft.kind === 'card') {
      assert.equal(draft.offer.length, 3);
      assert.ok(draft.offer.filter(function (id) { return C.CARDS[id].type === 'unit'; }).length >= 2);
      assert.equal(new Set(draft.offer).size, 3);
    }
    game.pvpDraftPick(0);
  }
  game.leavePvp();
});

test('a hidden pack is passed: the second player sees what the first left', function () {
  newSeededGame(48); unlock(C.DRAWABLE);
  game.enterPvp(); game.pvpChooseMode('draft-hidden');
  game.pvpDraftPick(0); game.pvpContinue(); game.pvpDraftPick(0); game.pvpContinue();
  var firstSeat = match().seat, firstPack = match().draft.offer.slice();
  assert.equal(firstPack.length, 7);
  game.pvpDraftPick(0); game.pvpContinue();
  var secondSeat = match().seat, secondPack = match().draft.offer.slice();
  assert.notEqual(firstSeat, secondSeat);
  game.pvpDraftPick(0); game.pvpContinue();
  assert.equal(match().seat, firstSeat);
  assert.deepEqual(match().draft.offer, secondPack.slice(1));
  assert.equal(match().draft.offer.length, 6);
  game.leavePvp();
});

test('too few found cards blocks a draft but not the builder', function () {
  newSeededGame(49); game.codex.cards = {};
  game.enterPvp();
  assert.ok(game.draftCardsMissing() > 0);
  assert.equal(game.pvpChooseMode('draft-open'), false);
  assert.equal(game.pvpChooseMode('build'), true);
  game.leavePvp();
});

test('relics are personal: each seat scores only its own', function () {
  newSeededGame(50); unlock(C.DRAWABLE);
  draftAll('draft-open');
  var state = game.getBattleState();
  state.seats.bottom.relics = ['color_lens']; state.seats.top.relics = []; state.relics = state.seats.bottom.relics;
  state.board.bottom.row1[0] = { cardId: 'red_brute', color: 'red', strength: 4, temp: 0 };
  state.board.top.row1[0] = { cardId: 'red_brute', color: 'green', strength: 4, temp: 0 };
  state.board.bottom.row1[1] = { cardId: 'red_brute', color: 'green', strength: 4, temp: 0 };
  state.board.top.row1[1] = { cardId: 'red_brute', color: 'red', strength: 4, temp: 0 };
  var evaluation = C.evaluateBoard(state.board, state.hazards, game.evalCtx(state));
  assert.equal(evaluation.totals.bottom, evaluation.totals.top + 2, 'the lens adds half of 4 for its owner only');
  game.leavePvp();
});

test('the phone changing hands brings the right relics with it', function () {
  newSeededGame(51); unlock(C.DRAWABLE);
  draftAll('draft-open');
  game.takeSeat();
  var state = game.getBattleState(), mine = state.relics;
  assert.equal(run().relics, mine);
  game.pass(PLAYER); game.takeSeat();
  assert.notEqual(state.relics, mine);
  assert.equal(state.seats.top.relics, mine);
  assert.equal(run().relics, state.relics);
  game.leavePvp();
});
