/* Players for the game, at different levels of skill.

   A policy decides what to do on every screen; the battle move itself is either
   the engine's own reading of the board (`ai`) or the first thing that fits
   (`naive`). Balance work needs more than one because a change that helps a
   careful player can be invisible to a careless one. Everything goes through the
   game's public surface, the same calls the view makes. */

import * as game from '../../src/game/index.js';

var C = game.rules, CARDS = C.CARDS, PLAYER = C.PLAYER, ENEMY = C.ENEMY;

var RARITY = { Common: 1, Uncommon: 2, Rare: 3, Legendary: 4, Fused: 2 };

/* ---------------- one battle ---------------- */

function finishTargets() {
  while (game.getBattleState().pending) {
    var options = game.currentTargetOptions();
    if (!options.length) { game.cancelPending(); return; }
    game.advanceTarget(options[0]);
  }
}

/* The first legal thing: a card on the first tile that takes it, else a mix, else pass. */
function naiveMove() {
  var state = game.getBattleState(), hand = state.hands[PLAYER];
  for (var i = 0; i < hand.length; i++) {
    var card = hand[i], def = CARDS[card.id];
    if (def.type === 'unit') {
      var tiles = C.legalTiles(state.board, PLAYER, C.cardStrength(card), C.placeOpts(card.id, state.relics, state.board, PLAYER));
      if (tiles.length) { game.beginPlay(PLAYER, i, tiles[0]); finishTargets(); return; }
    } else if (def.type === 'hazard') {
      var rows = C.freeHazardRows(state.hazards, PLAYER);
      if (rows.length) { game.beginPlay(PLAYER, i, { row: rows[0], index: 0 }); return; }
    } else if (!def.targets || !def.targets.length || game.legalTargets(state, PLAYER, def.targets[0], [], null).length) {
      game.beginPlay(PLAYER, i, null); finishTargets(); return;
    }
  }
  if (state.mixTokens[PLAYER] > 0) {
    var options = game.mixOptions(state.board, PLAYER);
    if (options.length) { game.performMix(PLAYER, options[0].base, options[0].other); return; }
  }
  game.onPass();
}

function lead(state) {
  var evaluation = C.evaluateBoard(state.board, state.hazards, game.evalCtx(state));
  return evaluation.totals[PLAYER] - evaluation.totals[ENEMY];
}

/* Take a move back when the enemy's answer swung the round badly. */
function maybeRewind(state) {
  if (!game.canRewind()) return false;
  var snap = state.rewindSnap;
  var before = C.evaluateBoard(snap.board, snap.hazards, { relics: state.relics, enemyMod: state.enemyMod, chains: snap.chains,
    mixChain: snap.mixChain, spectrumColor: snap.spectrumColor, fissures: state.fissures });
  var swing = lead(state) - (before.totals[PLAYER] - before.totals[ENEMY]);
  if (swing < -8) { game.onRewind(); return true; }
  return false;
}

/* Play the battle on screen to its end and say how it went. */
export function fightBattle(skill) {
  var run = game.getRun(), state = game.getBattleState();
  var record = {
    enemy: state.enemyKey, kind: state.enemy.kind, act: run.act, node: state.node.type, power: state.power,
    depth: run.depth, deck: run.deck.map(function (entry) { return entry.id; }), relics: run.relics.slice(),
    livesBefore: run.lives, rewindsBefore: run.rewindsUsed || 0
  };
  for (var step = 0; step < 800; step++) {
    if (game.getRun().screen !== 'battle') break;
    var live = game.getBattleState();
    if (live.roundResult) { game.continueBattle(); continue; }
    if (live.turn === ENEMY) { game.opponentMove(); continue; }
    if (skill.rewind && maybeRewind(live)) continue;
    if (skill.battle === 'naive') naiveMove();
    else game.runOpponentMove(game.decideOpponentMove(PLAYER));
  }
  if (game.getRun().screen === 'battle') throw new Error('the battle never ended');
  record.won = game.getRun().screen === 'reward';
  record.rounds = state.round;
  record.roundsWon = state.wins[PLAYER];
  record.roundsLost = state.wins[ENEMY];
  record.rewinds = (game.getRun().rewindsUsed || 0) - record.rewindsBefore;
  return record;
}

/* ---------------- the screens between battles ---------------- */

function deckColours(run) { return C.colourCounts(run.deck); }

/* How much a card is worth having, to this deck. */
function cardValue(cardId, run, held) {
  var def = CARDS[cardId], value = RARITY[def.rarity] || 1;
  if (def.type === 'unit') value += def.strength / 4;
  if (def.color && !held[def.color]) value -= 3;                 // a colour the deck cannot use well
  var copies = run.deck.filter(function (entry) { return entry.id === cardId; }).length;
  value -= copies * 1.2;
  if (def.curse) value -= 10;
  return value;
}

function bestCard(cards, run) {
  var held = deckColours(run), best = -1, bestValue = -Infinity;
  cards.forEach(function (entry, index) {
    var value = cardValue(entry.id, run, held);
    if (value > bestValue) { bestValue = value; best = index; }
  });
  return { index: best, value: bestValue };
}

var POLICIES = {
  /* Takes the first of everything and never thinks about the deck. */
  naive: {
    battle: 'naive', rewind: false,
    reward: function (run) { return run.reward.cards.length ? 0 : -1; },
    shop: function () {},
    lab: 'first',
    event: function () { return 0; }
  },
  /* Builds a deck on purpose: picks the best card on offer, skips when the deck
     is fat, spends in the shop, cuts curses, and rewinds a bad exchange. */
  careful: {
    battle: 'ai', rewind: true,
    reward: function (run) {
      var pick = bestCard(run.reward.cards, run);
      if (run.reward.trophy) return pick.index;
      if (run.deck.length >= 20 && pick.value < 3.5) return -1;   // skip and keep the deck lean
      return pick.value < 0.5 ? -1 : pick.index;
    },
    shop: function (run) {
      var shop = run.shop;
      while (game.curseCount(run.deck) > 0 && run.gold >= game.removalCost(shop) && game.removalsLeft(shop) > 0 && run.deck.length > 5) {
        var before = shop.removals || 0;
        game.toggleShopRemoval();
        game.burnShopCard(run.deck.findIndex(function (entry) { return CARDS[entry.id].curse; }));
        if ((shop.removals || 0) === before) break;
      }
      shop.relics.forEach(function (key, index) {
        if (!shop.sold['r' + index] && run.gold >= game.shopRelicPrice(key) && run.relics.length < C.RELIC_LIMIT) game.buyShopRelic(index);
      });
      var held = deckColours(run);
      shop.cards.forEach(function (entry, index) {
        var price = CARDS[entry.id].cost || 30;
        if (!shop.sold['c' + index] && run.gold >= price + 40 && cardValue(entry.id, run, held) >= 3 && run.deck.length < 20) game.buyShopCard(index);
      });
    },
    lab: 'best',
    event: function (run) {
      var options = run.event.options, want = [];
      options.forEach(function (option, index) {
        var label = option.label, score = 0;
        if (/restore 1 life/i.test(label)) score += run.lives < run.maxLives ? 5 : 0;
        if (/remove every curse/i.test(label)) score += game.curseCount(run.deck) * 2;
        if (/upgrade/i.test(label)) score += 2;
        if (/relic/i.test(label) && run.gold >= 40) score += 4;
        if (/gain \d+ gold|take .*gold/i.test(label)) score += 1;
        if (/lose 1 life/i.test(label)) score -= 4;
        if (/burn a card|cut two|weakest/i.test(label)) score += run.deck.length > 14 ? 3 : -2;
        want.push({ index: index, score: score });
      });
      want.sort(function (a, b) { return b.score - a.score; });
      return want[0].index;
    }
  }
};
export var SKILLS = POLICIES;

function pickCutTarget(run) {
  var worst = 0;
  run.deck.forEach(function (entry, index) {
    var mine = CARDS[entry.id], theirs = CARDS[run.deck[worst].id];
    if (mine.curse && !theirs.curse) worst = index;
    else if (!!mine.curse === !!theirs.curse && C.cardStrength(entry) < C.cardStrength(run.deck[worst])) worst = index;
  });
  return worst;
}

function playLab(run, skill) {
  var lab = run.lab, units = game.deckUnits();
  if (lab.kind === 'fuse' && units.length >= 2) {
    var a = 0, b = 1;
    if (skill.lab === 'best') {
      /* Fuse toward a colour the deck does not hold yet — that is what opens new roads —
         and otherwise the two weakest units of one colour. */
      var held = deckColours(run), bestScore = -Infinity;
      for (var i = 0; i < units.length; i++) for (var j = i + 1; j < units.length; j++) {
        var colourA = CARDS[units[i].entry.id].color, colourB = CARDS[units[j].entry.id].color;
        var made = colourA && colourB ? C.mixResultColor(colourA, colourB) : null;
        var score = -(C.cardStrength(units[i].entry) + C.cardStrength(units[j].entry));
        if (made && made !== colourA && made !== colourB) score += 12 - 6 * (held[made] || 0);
        if (score > bestScore) { bestScore = score; a = i; b = j; }
      }
      game.toggleLabPick(units[a].index); game.toggleLabPick(units[b].index);
    } else { game.toggleLabPick(units[0].index); game.toggleLabPick(units[1].index); }
    game.confirmFusion();
  } else if (lab.kind === 'boost' && units.length) {
    var strongest = units.reduce(function (best, unit) { return C.cardStrength(unit.entry) > C.cardStrength(best.entry) ? unit : best; });
    game.boostUnit(skill.lab === 'best' ? strongest.index : units[0].index);
    game.advance();
  } else if (lab.kind === 'volatile') {
    if (skill.lab === 'best') { game.volatilePress(); game.volatilePress(); }   // a little gamble, not a big one
    game.advance();
  } else game.advance();
}

/* Do what this player would do on whatever screen the run is on. Returns the screen it was. */
export function playScreen(skill, hooks) {
  var run = game.getRun(), screen = run.screen;
  if (screen === 'map') {
    var open = game.currentNodes();
    var col = open[0];
    if (skill === POLICIES.careful) {                           // prefer a shop or lab it can use, avoid elites while weak
      var rank = { shop: 3, lab: 3, event: 2, battle: 2, volatile: 0, elite: run.lives >= 3 ? 1 : -1, boss: 5 };
      col = open.reduce(function (best, index) {
        var node = run.map[run.depth][index], bestNode = run.map[run.depth][best];
        return (rank[node.type] || 0) > (rank[bestNode.type] || 0) ? index : best;
      }, open[0]);
    }
    game.enterNode(col);
  } else if (screen === 'battle') {
    var record = fightBattle(skill);
    if (hooks && hooks.onBattle) hooks.onBattle(record);
  } else if (screen === 'reward') {
    var pick = skill.reward(run);
    if (run.reward.relic && !run.reward.relicTaken) game.takeRewardRelic();
    if (game.getRun().screen === 'reward') { if (pick >= 0) game.takeRewardCard(pick); else game.skipReward(); }
  } else if (screen === 'shop') {
    skill.shop(run);
    game.advance();
  } else if (screen === 'lab') playLab(run, skill);
  else if (screen === 'event') {
    game.chooseEventOption(skill.event(run));
    while (game.getRun().eventPick) game.cutEventCard(pickCutTarget(game.getRun()));
  } else if (screen === 'act') game.beginAct(run.actOffer[0]);
  else if (screen === 'victory') game.endAsVictory();
  return screen;
}

/* A whole run from a seed. `lives` overrides the starting lives (to sample deep
   content without dying). Returns the battles fought and how it ended. */
export function simulateRun(seed, skill, options) {
  options = options || {};
  game.setRnd(seededRandom(seed));
  game.setTutorial(false);
  game.start(null);
  game.newGame();
  if (options.lives) game.getRun().lives = game.getRun().maxLives = options.lives;
  var battles = [], screens = 0, limit = options.maxScreens || 2000;
  while (screens++ < limit && game.getRun().screen !== 'gameover') {
    playScreen(skill, { onBattle: function (record) { battles.push(record); } });
  }
  var run = game.getRun();
  return {
    seed: seed, ended: run.screen, actsCleared: run.actsCleared.length, actsWalked: run.actsCleared.slice(),
    battlesWon: run.battlesWon, battlesFought: run.battlesFought, lives: run.lives, gold: run.gold,
    deck: run.deck.length, relics: run.relics.length, curses: game.curseCount(run.deck), fissures: run.fissures.length,
    diedTo: battles.length && run.lives <= 0 ? battles[battles.length - 1].enemy : null,
    battles: battles
  };
}

/* mulberry32: small, fast, and the same numbers for the same seed everywhere. */
export function seededRandom(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
