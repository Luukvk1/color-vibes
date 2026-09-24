/* Drives the game the way a player would, with no page anywhere in sight.

   Everything here goes through the game's public surface and nothing else —
   the same calls the view makes when someone taps something — so a game played
   by these helpers exercises the real rules end to end. A bot chooses for the
   player using the engine's own reading of the board (the enemy's AI, pointed
   at the player's side). */

import * as game from '../../src/game/index.js';

var C = game.rules, PLAYER = C.PLAYER, ENEMY = C.ENEMY;

/* mulberry32: small, fast, and the same numbers for the same seed everywhere. */
export function seeded(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A brand-new run whose every roll comes from `seed`. */
export function newSeededGame(seed) {
  game.setRnd(seeded(seed));
  game.setTutorial(false);
  game.start(null);
  game.newGame();
}

/* ---- one battle ---- */

function finishTargets() {
  while (game.getBattleState().pending) {
    var options = game.currentTargetOptions();
    if (!options.length) { game.cancelPending(); return; }
    game.advanceTarget(options[0]);
  }
}

/* The player's move: whatever the engine's own evaluation would do in their seat. */
function playerTurn() {
  var decision = game.decideOpponentMove(PLAYER);
  game.runOpponentMove(decision);
}

/* Play the battle on screen to its end. Returns how many moves it took. */
export function playBattle(maxSteps) {
  maxSteps = maxSteps || 600;
  for (var step = 0; step < maxSteps; step++) {
    if (game.getRun().screen !== 'battle') return step;
    var state = game.getBattleState();
    if (state.roundResult) { game.continueBattle(); continue; }      // the player has read the result
    if (state.turn === ENEMY) { game.opponentMove(); continue; }
    playerTurn();
  }
  throw new Error('the battle never ended');
}

/* ---- the screens between battles ---- */

/* Do the sensible thing on whatever screen the run is on. Returns the screen it was. */
export function playScreen() {
  var run = game.getRun(), screen = run.screen;
  if (screen === 'map') game.enterNode(game.currentNodes()[0]);
  else if (screen === 'battle') playBattle();
  else if (screen === 'reward') {
    if (!run.reward.cardTaken) {
      if (run.reward.cards.length) game.takeRewardCard(0); else game.skipReward();
    }
    if (game.getRun().reward && game.getRun().screen === 'reward' && run.reward.relic && !run.reward.relicTaken) game.takeRewardRelic();
  }
  else if (screen === 'shop') {
    var shop = run.shop;
    if (run.gold >= game.shopRelicPrice(shop.relics[0] || 'x') && shop.relics.length) game.buyShopRelic(0);
    game.advance();
  }
  else if (screen === 'lab') {
    var lab = run.lab, units = game.deckUnits();
    if (lab.kind === 'fuse' && units.length >= 2) { game.toggleLabPick(units[0].index); game.toggleLabPick(units[1].index); game.confirmFusion(); }
    else if (lab.kind === 'boost' && units.length) { game.boostUnit(units[0].index); game.advance(); }
    else if (lab.kind === 'volatile') { game.volatilePress(); game.advance(); }
    else game.advance();
  }
  else if (screen === 'event') {
    game.chooseEventOption(0);
    while (game.getRun().eventPick) game.cutEventCard(0);
  }
  else if (screen === 'act') game.beginAct(run.actOffer[0]);
  else if (screen === 'victory') game.endAsVictory();
  return screen;
}

/* What a finished (or abandoned) run looked like, in numbers that only change
   when the game's behaviour does. */
export function summarise(run) {
  return {
    screen: run.screen, act: run.act, actsCleared: run.actsCleared.length, depth: run.depth,
    battlesWon: run.battlesWon, battlesFought: run.battlesFought, lives: run.lives, gold: run.gold,
    deck: run.deck.length, relics: run.relics.length, fissures: run.fissures.length
  };
}

/* Play a whole run from a seed until it ends or `maxScreens` screens have passed. */
export function playRun(seed, options) {
  options = options || {};
  var maxScreens = options.maxScreens || 400, onScreen = options.onScreen;
  newSeededGame(seed);
  // extra lives let the bot get past the point where it would normally be knocked out
  if (options.lives) { game.getRun().lives = game.getRun().maxLives = options.lives; }
  var trace = [];
  for (var count = 0; count < maxScreens; count++) {
    var run = game.getRun();
    if (run.screen === 'gameover') break;
    if (onScreen) onScreen(run, count);
    trace.push(playScreen());
  }
  return { summary: summarise(game.getRun()), trace: trace };
}
