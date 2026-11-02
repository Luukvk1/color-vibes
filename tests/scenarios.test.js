/* Particular situations, played out with real actions.

   The whole-run tests say the game holds together; these say a specific rule
   still does what its text promises, by way of the same actions a player uses.
   Balance work changes numbers; these catch it changing behaviour. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/game/index.js';
import { battleAgainst, endRound, giveCard, put, unitsOn, C, PLAYER, ENEMY } from './support/scenario.js';

/* ------------------------------------------------------------------ playing a card */

test('playing a unit puts it on the tile, spends the card and passes the turn', function () {
  var state = battleAgainst('brawler');
  giveCard(state, 'red_brute');
  game.selectCard(0);
  assert.equal(game.onTileActivate(PLAYER, 'row1', 0), 'play');
  assert.equal(state.board[PLAYER].row1[0].cardId, 'red_brute');
  assert.equal(state.hands[PLAYER].length, 0);
  assert.equal(state.turn, ENEMY);
});

test('a tile that cannot take the card refuses it and logs why', function () {
  var state = battleAgainst('brawler');
  giveCard(state, 'red_brute');                                   // 2 strength is too little for row 3
  game.selectCard(0);
  var logged = game.getLog().length;
  game.onTileActivate(PLAYER, 'row3', 0);
  assert.equal(state.hands[PLAYER].length, 1, 'the card is still in hand');
  assert.equal(state.turn, PLAYER);
  assert.ok(game.getLog().length > logged, 'the refusal is explained');
});

test('the enemy takes its turn and the turn comes back', function () {
  var state = battleAgainst('brawler');
  giveCard(state, 'red_brute');
  state.hands[ENEMY] = [C.makeCard('red_brute')];
  game.selectCard(0); game.onTileActivate(PLAYER, 'row1', 0);
  game.opponentMove();
  assert.equal(state.turn, PLAYER);
  assert.equal(unitsOn(state, ENEMY).length, 1);
});

/* ------------------------------------------------------------------ mixing */

test('a mix absorbs a touching unit, spends the token and opens the chain', function () {
  var state = battleAgainst('brawler');
  put(state, PLAYER, 'row1', 0, 'red_brute', 3);
  put(state, PLAYER, 'row2', 0, 'blue_scout', 4);
  game.onMixToggle();
  assert.equal(game.onTileActivate(PLAYER, 'row1', 0), 'mixBase');
  assert.equal(game.onTileActivate(PLAYER, 'row2', 0), 'mix');
  var made = state.board[PLAYER].row1[0];
  assert.equal(made.color, 'magenta');
  assert.equal(made.strength, 3 + 4 + 1);
  assert.equal(state.board[PLAYER].row2[0], null);
  assert.equal(state.mixTokens[PLAYER], 0);
  assert.equal(state.chains[PLAYER], 1);
  assert.equal(state.turn, ENEMY);
});

test('mixing two tiles that do not touch is refused', function () {
  var state = battleAgainst('brawler');
  put(state, PLAYER, 'row1', 0, 'red_brute', 3);
  put(state, PLAYER, 'row1', 2, 'blue_scout', 4);
  game.onMixToggle();
  game.onTileActivate(PLAYER, 'row1', 0);
  game.onTileActivate(PLAYER, 'row1', 2);
  assert.equal(state.board[PLAYER].row1[0].cardId, 'red_brute', 'nothing was absorbed');
  assert.equal(state.mixTokens[PLAYER], 1);
});

test('a chain belongs to the side that built it and resets when a card is played', function () {
  var state = battleAgainst('brawler');
  put(state, PLAYER, 'row1', 0, 'red_brute', 3);
  put(state, PLAYER, 'row2', 0, 'blue_scout', 4);
  game.performMix(PLAYER, { row: 'row1', index: 0 }, { row: 'row2', index: 0 });
  assert.equal(state.chains[PLAYER], 1);
  assert.equal(state.chains[ENEMY], 0, 'the enemy is not credited');
  state.turn = PLAYER; state.finalTurn = false;
  giveCard(state, 'red_brute');
  game.selectCard(0); game.onTileActivate(PLAYER, 'row2', 1);
  assert.equal(state.chains[PLAYER], 0, 'a card play breaks the chain');
});

/* ------------------------------------------------------------------ rewind */

function playAndAnswer() {
  var state = battleAgainst('brawler');
  giveCard(state, 'red_brute');
  state.hands[ENEMY] = [C.makeCard('red_brute')];
  game.selectCard(0); game.onTileActivate(PLAYER, 'row1', 0);
  game.opponentMove();
  return state;
}

test('rewind takes back the move and the enemy\'s answer, once per round', function () {
  var state = playAndAnswer();
  assert.equal(game.canRewind(), true);
  var run = game.getRun();
  game.onRewind();
  assert.equal(state.board[PLAYER].row1[0], null, 'the player\'s unit is off the board');
  assert.equal(unitsOn(state, ENEMY).length, 0, 'so is the enemy\'s reply');
  assert.equal(state.hands[PLAYER].length, 1, 'the card is back in hand');
  assert.equal(state.turn, PLAYER);
  assert.equal(game.canRewind(), false, 'only once a round');
  assert.equal(run.rewindsUsed, 1);
  assert.ok(run.instability > 0, 'the board wrote it down');
});

test('rewind is gone once the round is scored', function () {
  var state = playAndAnswer();
  game.resolveRound();
  assert.equal(game.canRewind(), false);
  assert.equal(state.rewindSnap, null);
});

test('every rewind costs more than the last', function () {
  var costs = [0, 1, 2, 3, 6].map(function (used) { return game.rewindChunk({ rewindsUsed: used }, 1); });
  costs.forEach(function (cost, index) { if (index) assert.ok(cost > costs[index - 1]); });
});

test('a rewind that overflows the meter tears the board, and says so', function () {
  var state = playAndAnswer();
  var run = game.getRun(), heard = [];
  run.instability = 99;
  var stop = game.subscribe(function (type) { heard.push(type); });
  game.onRewind();
  stop();
  assert.equal(run.fissures.length, 1);
  assert.ok(heard.indexOf('fissure') !== -1 && heard.indexOf('announce') !== -1);
  assert.ok(run.instability < 100);
});

/* ------------------------------------------------------------------ wild palette */

test('the Wild Palette repaints a unit for free, once per battle', function () {
  var state = battleAgainst('brawler', { relics: ['wild_palette'] });
  put(state, PLAYER, 'row1', 0, 'red_brute', 3);
  game.beginWild();
  assert.ok(state.pending);
  game.advanceTarget({ row: 'row1', index: 0 });
  game.advanceTarget({ color: 'blue' });
  assert.equal(state.board[PLAYER].row1[0].color, 'blue');
  assert.equal(state.turn, PLAYER, 'it costs no turn');
  assert.equal(state.wildPaletteUsed, true);
  game.beginWild();
  assert.equal(state.pending, null, 'and it is spent');
});

/* ------------------------------------------------------------------ boss rules */

test('a boss that mixes twice starts with two tokens', function () {
  var state = battleAgainst('cinder_tyrant');
  assert.equal(state.mixTokens[ENEMY], 2);
  assert.equal(state.mixTokens[PLAYER], 1);
});

test('the Riven Prism answers every mix you land', function () {
  var state = battleAgainst('riven_prism');
  put(state, PLAYER, 'row1', 0, 'red_brute', 3);
  put(state, PLAYER, 'row2', 0, 'blue_scout', 4);
  var theirs = put(state, ENEMY, 'row1', 1, 'red_brute', 5);
  game.performMix(PLAYER, { row: 'row1', index: 0 }, { row: 'row2', index: 0 });
  assert.equal(theirs.strength, 5 + Math.max(1, Math.floor(8 * 0.5)));
});

test('the Verdant Crown grows what survives the break, every round', function () {
  var state = battleAgainst('verdant_crown');
  var unit = put(state, ENEMY, 'row1', 0, 'red_brute', 4);      // uncontested: the player has nothing in that lane
  endRound();
  assert.equal(unit.strength, 4 + 2);
});

test('the Spectrum devours your weakest unit and turns a colour each round', function () {
  var state = battleAgainst('spectrum');
  put(state, PLAYER, 'row1', 0, 'red_brute', 5);
  put(state, PLAYER, 'row1', 1, 'red_scout', 2);
  endRound();
  var left = unitsOn(state, PLAYER).map(function (found) { return found.unit.strength; });
  assert.deepEqual(left, [5], 'the weaker of the two is gone');
  assert.ok(state.spectrumColor && C.COLORS[state.spectrumColor]);
});

test('the Chorus Eternal plants a curse on your board each round', function () {
  var state = battleAgainst('the_chorus_eternal');
  endRound();
  var curses = unitsOn(state, PLAYER).filter(function (found) { return C.CARDS[found.unit.cardId].curse; });
  assert.equal(curses.length, 1);
  assert.equal(game.getRun().deck.some(function (entry) { return C.CARDS[entry.id].curse; }), false, 'and never in the run\'s deck');
});

test('the Long Crack breaks the ground on both halves each round', function () {
  battleAgainst('the_long_crack');
  var before = game.getRun().fissures.length;
  endRound();
  var fissures = game.getRun().fissures;
  assert.ok(fissures.length > before);
  assert.ok(fissures.some(function (f) { return f.side === PLAYER; }) && fissures.some(function (f) { return f.side === ENEMY; }));
});

/* ------------------------------------------------------------------ rounds and battles */

test('a battle is best of three: two round wins end it, and a win pays out', function () {
  var state = battleAgainst('brawler');
  var run = game.getRun(), gold = run.gold;
  put(state, PLAYER, 'row1', 0, 'red_brute', 9);                 // the enemy has nothing: the round is ours
  endRound();
  assert.equal(state.wins[PLAYER], 1);
  assert.equal(state.battleOver, false);
  assert.equal(state.round, 2);
  put(state, PLAYER, 'row1', 0, 'red_brute', 9);
  endRound();
  assert.equal(run.screen, 'reward');
  assert.ok(run.gold > gold);
  assert.equal(run.battlesWon, 1);
});

test('losing a battle costs a life and the run moves on; the last life ends it', function () {
  var state = battleAgainst('brawler');
  var run = game.getRun();
  state.wins[ENEMY] = 1;
  put(state, ENEMY, 'row1', 0, 'red_brute', 9);
  endRound();
  assert.equal(run.lives, 2);
  assert.equal(run.screen, 'map');
  battleAgainst('brawler');
  game.getRun().lives = 1;
  game.getBattleState().wins[ENEMY] = 1;
  put(game.getBattleState(), ENEMY, 'row1', 0, 'red_brute', 9);
  endRound();
  assert.equal(game.getRun().screen, 'gameover');
});

test('contested frontlines fall between rounds; uncontested units stay', function () {
  var state = battleAgainst('brawler');
  put(state, PLAYER, 'row1', 0, 'red_brute', 3); put(state, ENEMY, 'row1', 0, 'red_brute', 2);   // a fight in lane 1
  put(state, PLAYER, 'row1', 2, 'red_scout', 3);                                                     // nobody opposes lane 4
  endRound();
  assert.equal(state.board[PLAYER].row1[0], null);
  assert.equal(state.board[ENEMY].row1[0], null);
  assert.ok(state.board[PLAYER].row1[2], 'the uncontested unit holds its ground');
});

/* ------------------------------------------------------------------ acts and secret roads */

function runAt(act, cleared, deck) {
  battleAgainst('brawler');
  var run = game.getRun();
  run.act = act; run.actsCleared = cleared.slice(); run.pendingNode = null; run.screen = 'map';
  if (deck) run.deck = deck.map(function (id) { return { id: id, up: false }; });
  return run;
}

test('beating Black ends the game, even with roads left unwalked', function () {
  var run = runAt('black', ['green', 'red']);
  game.finishAct();
  assert.equal(run.screen, 'victory');
});

test('White is offered only after every road of the wheel', function () {
  var run = runAt('black', ['green']);
  assert.equal(game.whiteUnlocked(run), false);
  run.actsCleared = game.ACT_KEYS.filter(function (key) { return key !== 'black'; }).concat(['black']);
  assert.equal(game.whiteUnlocked(run), true);
  assert.ok(game.secretOffers(run).indexOf('white') !== -1);
});

test('the rot and rift roads open by how the run was lived', function () {
  var run = runAt('black', ['green'], ['red_brute', 'curse_husk', 'curse_husk', 'curse_husk', 'red_scout']);
  assert.ok(game.curseCount(run.deck) >= game.ROT_THRESHOLD);
  assert.equal(game.rotUnlocked(run), true);
  assert.equal(game.riftUnlocked(run), false);
  run.fissures = new Array(game.RIFT_THRESHOLD).fill({ kind: 'sever', side: PLAYER, a: { row: 'row1', index: 0 }, b: { row: 'row1', index: 1 } });
  assert.equal(game.riftUnlocked(run), true);
});

test('beating a secret road ends the run outright', function () {
  var run = runAt('white', ['green', 'red', 'blue', 'black']);
  game.finishAct();
  assert.equal(run.screen, 'gameover');
});

test('the Sundered Ground arrives already broken on both halves', function () {
  var run = runAt('black', ['green']);
  game.beginAct('rift');
  assert.equal(run.act, 'rift');
  assert.ok(run.fissures.some(function (f) { return f.side === PLAYER; }));
  assert.ok(run.fissures.some(function (f) { return f.side === ENEMY; }));
});

test('going endless reopens every road you have walked', function () {
  var run = runAt('black', ['green', 'red', 'blue', 'yellow', 'cyan', 'magenta', 'black'],
    ['red_brute', 'green_seed', 'blue_scout', 'yellow_spark', 'cyan_mender', 'magenta_lancer', 'black_voidling', 'black_maw']);
  run.screen = 'victory';
  game.goEndless();
  assert.equal(run.endless, true);
  assert.equal(run.screen, 'act');
  assert.ok(run.actOffer.length >= 1);
});

test('a road opens only for a deck that holds its colour', function () {
  var primaries = ['red_brute', 'red_scout', 'green_seed', 'green_gardener', 'blue_scout', 'blue_current'];
  var run = runAt('green', [], primaries);
  var open = game.eligibleActs(run);
  assert.ok(open.indexOf('red') !== -1 && open.indexOf('blue') !== -1);
  assert.equal(open.indexOf('black'), -1);
});

test('a boss on a secret road drops that road\'s own trophies, whatever the deck', function () {
  var run = runAt('white', []);
  game.rollReward({ type: 'boss', depth: 12 });
  var offered = run.reward.cards.map(function (entry) { return entry.id; });
  assert.deepEqual(offered.sort(), C.SECRET_TROPHIES.white.slice().sort());
});

test('an act boss drops a trophy of a colour the run has actually opened', function () {
  var primaries = ['red_brute', 'red_scout', 'green_seed', 'green_gardener', 'blue_scout', 'blue_current'];
  var run = runAt('green', [], primaries);
  game.rollReward({ type: 'boss', depth: 12 });
  run.reward.cards.forEach(function (entry) {
    var color = C.CARDS[entry.id].color;
    assert.ok(!color || color === 'green' || C.actUnlocked(color, run.deck), entry.id + ' is a colour this run never opened');
  });
});

test('Glass Cannon: an enemy hit cracks your unit, and the crack costs 2 at scoring', function () {
  var state = battleAgainst('brawler', { relics: ['glass_cannon'] });
  var unit = put(state, PLAYER, 'row1', 0, 'red_brute', 6);
  put(state, ENEMY, 'row1', 0, 'red_brute', 2);
  function frontline() {
    return C.evaluateBoard(state.board, state.hazards, game.evalCtx(state)).lanes[0].bottom.frontStrength;
  }
  var before = frontline();
  game.buildApi(state, ENEMY, []).damage(PLAYER, 'row1', 0, 1);
  assert.equal(unit.cracked, 1);
  assert.equal(frontline(), before - 1 - 2, 'one from the damage, two from the crack');
});

test('Glass Cannon: enemy units are not cracked by your relic', function () {
  var state = battleAgainst('brawler', { relics: ['glass_cannon'] });
  var enemyUnit = put(state, ENEMY, 'row1', 0, 'red_brute', 6);
  game.buildApi(state, PLAYER, []).damage(ENEMY, 'row1', 0, 1);
  assert.ok(!enemyUnit.cracked);
});

