/* Turn flow: playing a card, mixing, passing, the opponent's turn, and closing
   a round or a battle. Every entry point is an action — it changes state and
   the engine announces once it has finished. */

import C from '../rules/index.js';
import { advance, show } from '../run/flow.js';
import { rollReward } from '../run/rewards.js';
import { act, emit, getActiveRun, getBattleState, getRnd } from '../store.js';
import { teach, teachNow } from '../tutorial.js';
import { decideOpponentMove, decisionDelay } from './ai.js';
import { buildApi, canMix, doMixCascade, drawInto, evalCtx } from './engine.js';
import { markRewindPoint, spawnFissure } from './rewind.js';
import { addLog, clearFrontlines, resetChain } from './setup.js';
import { currentTargetOptions, legalTargets, pendingSpec, resolveCard } from './targeting.js';

var CARDS = C.CARDS;
var COLORS = C.COLORS;
var COLOR_KEYS = C.COLOR_KEYS;
var ENEMY = C.ENEMY;
var PLAYER = C.PLAYER;
var canPlace = C.canPlace;
var cardName = C.cardName;
var cardStrength = C.cardStrength;
var colorInfo = C.colorInfo;
var decideRound = C.decideRound;
var eachUnit = C.eachUnit;
var evaluateBoard = C.evaluateBoard;
var hasRelic = C.hasRelic;
var otherSide = C.otherSide;
var sideName = C.sideName;
var slotName = C.slotName;
var unitAt = C.unitAt;

export var beginPlay = act(function beginPlay(side, cardIndex, tile) {
  var state = getBattleState(), card = state.hands[side][cardIndex], cardDef = CARDS[card.id];
  state.pending = { side: side, card: card, cardIndex: cardIndex, tile: tile, picks: [] };
  if (cardDef.targets && cardDef.targets.length) {
    if (!currentTargetOptions().length) finishPlay();
    return;
  }
  finishPlay();
});

export var beginWild = act(function beginWild() {
  var state = getBattleState();
  if (state.wildPaletteUsed || state.turn !== PLAYER) return;
  state.pending = { side: PLAYER, kind: 'wild', picks: [] };
  if (!currentTargetOptions().length) state.pending = null;
});

export var advanceTarget = act(function advanceTarget(pick) {
  var state = getBattleState();
  if (!state.pending) return;
  state.pending.picks.push(pick);
  var total = state.pending.kind === 'wild' ? 2 : CARDS[state.pending.card.id].targets.length;
  if (state.pending.picks.length >= total) { finishPlay(); return; }
  if (!currentTargetOptions().length) finishPlay();
});

export var finishPlay = act(function finishPlay() {
  emit('passPuck', false);
  var state = getBattleState(), pendingAction = state.pending;
  if (!pendingAction) return;

  if (pendingAction.kind === 'wild') {
    if (pendingAction.picks.length >= 2) {
      buildApi(state, PLAYER, []).recolor(PLAYER, pendingAction.picks[0], pendingAction.picks[1].color);
      state.wildPaletteUsed = true;
      addLog('Wild Palette repainted ' + slotName(pendingAction.picks[0].row, pendingAction.picks[0].index) + ' ' + COLORS[pendingAction.picks[1].color].name + '. Free action.');
    }
    state.pending = null;      // Wild Palette costs neither turn nor token
    return;
  }

  var card = pendingAction.card, cardDef = CARDS[card.id], side = pendingAction.side;
  markRewindPoint(side);
  resetChain(side);
  state.hands[side].splice(pendingAction.cardIndex, 1);
  var notes = resolveCard(state, side, card, pendingAction.tile, pendingAction.picks);
  state.pending = null; state.selectedCard = null;
  if (pendingAction.tile) { state.lastPlaced = { side: side, row: pendingAction.tile.row, index: pendingAction.tile.index }; state.inspected = { side: side, row: pendingAction.tile.row, index: pendingAction.tile.index }; }
  if (cardDef.type === 'hazard' && pendingAction.tile) emit('fx', { kind: 'hazard', row: pendingAction.tile.row, hazardKind: cardDef.hazardKind });
  else if (cardDef.type === 'unit' && pendingAction.tile) emit('fx', { kind: 'burst', side: side, row: pendingAction.tile.row, index: pendingAction.tile.index, color: cardDef.color });
  /* Quick Study fires on the first unit of the round only, so it rewards
     committing a body early rather than sitting on a full hand. */
  if (side === PLAYER && cardDef.type === 'unit' && hasRelic(state.relics, 'quick_study') && !state.quickStudyUsed) {
    state.quickStudyUsed = true;
    if (drawInto(state, PLAYER, 1)) notes.push('Quick Study drew a card');
  }
  if (state.chains[PLAYER] > state.bestChain) state.bestChain = state.chains[PLAYER];
  addLog(sideName(side) + ' played ' + cardName(card) + (pendingAction.tile && cardDef.type !== 'hazard' ? ' \u2192 ' + slotName(pendingAction.tile.row, pendingAction.tile.index) : '') +
    (notes.length ? ' — ' + notes.join('; ') : '') + '.');
  endTurn(side);
});

export var cancelPending = act(function cancelPending() { var state = getBattleState(); if (!state.pending) return; state.pending = null; state.selectedCard = null; });

export var performMix = act(function performMix(side, base, other) {
  if (side === PLAYER) emit('passPuck', false);
  var state = getBattleState();
  var unitA = unitAt(state.board, side, base.row, base.index), unitB = unitAt(state.board, side, other.row, other.index);
  var before = colorInfo(unitA.color).name + ' ' + unitA.strength + ' + ' + colorInfo(unitB.color).name + ' ' + unitB.strength;
  markRewindPoint(side);
  resetChain(side);
  var notes = [];
  emit('fx', { kind: 'fly', side: side, from: other, to: base, color: unitB.color, label: unitB.strength + (unitB.temp || 0) });
  var mixResult = doMixCascade(state, side, base, other, 0, false, notes);
  state.mixTokens[side]--;
  state.mode = 'place'; state.mixBase = null;
  state.lastPlaced = { side: side, row: base.row, index: base.index };
  state.inspected = { side: side, row: base.row, index: base.index };
  if (state.chains[PLAYER] > state.bestChain) state.bestChain = state.chains[PLAYER];
  addLog(sideName(side) + ' mixed ' + before + ' \u2192 ' + colorInfo(mixResult.color).name + ' ' + mixResult.strength +
    ' (+' + mixResult.bonus + ', chain ' + state.chains[side] + ')' + (notes.length > 1 ? ' — ' + notes.slice(1).join('; ') : '') + '.');
  /* BOSS RULE — echoMix (The Riven Prism). Every mix the player lands is
     answered: its own strongest unit takes a share of what you just made. The
     bigger the fusion the bigger the reply, so the boss turns the game's
     central mechanic into a decision rather than a free action. Small mixes
     and mixless rounds both become real lines of play. */
  if (side === PLAYER && state.enemyMod && state.enemyMod.echoMix) {
    var strongest = null;
    eachUnit(state.board, ENEMY, function (enemyUnit, row, index) {
      if (!strongest || enemyUnit.strength > strongest.unit.strength) strongest = { unit: enemyUnit, row: row, index: index };
    });
    if (strongest) {
      var gain = Math.max(1, Math.floor(mixResult.strength * state.enemyMod.echoMix));
      strongest.unit.strength += gain;
      emit('fx', { kind: 'burst', side: ENEMY, row: strongest.row, index: strongest.index, color: strongest.unit.color });
      addLog(state.enemy.name + ' echoes the mix — its strongest unit gains ' + gain + '.');
    }
  }
  endTurn(side);
});

/* What a tap on a tile did: 'target' (a pick towards a pending play), 'mix'
   (a mix landed), 'play' (a card was committed), 'mixBase' / 'mixCancel'
   (choosing the unit that absorbs), 'blocked' (a pick that was not on offer),
   or 'inspect' (nothing to do with it but look — which is also where a
   refused placement ends up, after its reason has been logged). */
export var onTileActivate = act(function onTileActivate(side, row, index) {
  var state = getBattleState();
  if (!state) return null;
  var locked = state.resolving || state.battleOver || state.opponentThinking;
  var unit = unitAt(state.board, side, row, index);

  if (state.pending) {
    var opts = currentTargetOptions(), spec = pendingSpec();
    if (spec && spec.kind === 'hazard') {
      var hazardTarget = opts.filter(function (opt) { return opt.side === side && opt.row === row; })[0];
      if (hazardTarget) { advanceTarget(hazardTarget); return 'target'; }
    } else {
      var tileTarget = opts.filter(function (opt) { return opt.row === row && opt.index === index; })[0];
      if (tileTarget && side === state.pending.side) { advanceTarget(tileTarget); return 'target'; }
    }
    return 'blocked';
  }

  if (!locked && state.turn === PLAYER && side === PLAYER) {
    if (state.mode === 'mix') {
      if (!unit) { /* nothing here to absorb or be absorbed */ }
      else if (!state.mixBase) { state.mixBase = { row: row, index: index }; return 'mixBase'; }
      else if (state.mixBase.row === row && state.mixBase.index === index) { state.mixBase = null; return 'mixCancel'; }
      else {
        var mixCheck = canMix(state.board, PLAYER, state.mixBase, { row: row, index: index });
        if (mixCheck.ok) { performMix(PLAYER, state.mixBase, { row: row, index: index }); return 'mix'; }
        addLog('Mix blocked — ' + mixCheck.reason);
      }
    } else if (state.selectedCard !== null) {
      var card = state.hands[PLAYER][state.selectedCard], cardDef = CARDS[card.id];
      if (cardDef.type === 'hazard') {
        if (!state.hazards[PLAYER][row]) { beginPlay(PLAYER, state.selectedCard, { row: row, index: index }); return 'play'; }
      } else if (cardDef.type === 'unit' && !unit) {
        var placeCheck = canPlace(state.board, side, row, index, cardStrength(card), C.placeOpts(card.id, side === PLAYER ? state.relics : [], state.board, side));
        if (placeCheck.ok) { beginPlay(PLAYER, state.selectedCard, { row: row, index: index }); return 'play'; }
        addLog('Blocked — ' + placeCheck.reason);
      }
    }
  }
  state.inspected = { side: side, row: row, index: index };
  state.inspectedHazard = null;
  return 'inspect';
});

/* Selection is engine state too: which card is lifted, whether a mix is being
   built, what the player is looking at. */
export var selectCard = act(function selectCard(cardIndex) {
  var state = getBattleState();
  if (!state.hands[PLAYER][cardIndex]) return;
  state.mode = 'place'; state.mixBase = null;
  state.selectedCard = state.selectedCard === cardIndex ? null : cardIndex;
  var card = state.hands[PLAYER][state.selectedCard];
  var cardDef = card && CARDS[card.id];
  /* A spell has no placement step — tapping it goes straight into
     targeting, unlike a unit, which only starts targeting once it has a
     tile to stand on. So when its first ask has nothing to offer at all
     (Catalyst wants a friendly unit and the board is empty), beginPlay
     used to find nothing to prompt for and finish the play immediately
     with zero picks — the card vanished, nothing happened, and there
     was never a chance to even read it first, let alone back out.
     Selecting it without resolving matches how an unplayable unit
     already behaves: visible, chosen, inert until something changes. */
  var canTarget = !cardDef || !cardDef.targets || !cardDef.targets.length ||
    legalTargets(state, PLAYER, cardDef.targets[0], [], null).length > 0;
  if (cardDef && cardDef.type === 'spell' && state.selectedCard !== null && canTarget) beginPlay(PLAYER, state.selectedCard, null);
});

export var cancelSelection = act(function cancelSelection() {
  var state = getBattleState();
  if (state.pending) cancelPending();
  else if (state.mode === 'mix') { state.mode = 'place'; state.mixBase = null; }
});

export var inspectHazard = act(function inspectHazard(row, kind, owner) {
  var state = getBattleState();
  state.inspectedHazard = { row: row, kind: kind, owner: owner };
  state.inspected = null;
});

export var clearInspection = act(function clearInspection() {
  var state = getBattleState();
  if (state) { state.inspected = null; state.inspectedHazard = null; }
});

export var pass = act(function pass(side) {
  var state = getBattleState();
  markRewindPoint(side);
  addLog(sideName(side) + ' passed.');
  /* The enemy's pass is the one that needs saying out loud — the player knows
     perfectly well when they passed themselves. The marker stays down until
     something else happens, so it is still there to read when the turn comes
     back rather than vanishing on a timer the player might miss. */
  if (side === ENEMY) emit('passPuck', true);
  resetChain();
  state.selectedCard = null; state.mode = 'place'; state.mixBase = null; state.pending = null;
  if (state.finalTurn) { resolveRound(); return; }
  state.finalTurn = true; state.turn = otherSide(side);
});

var endTurn = act(function endTurn(side) {
  var state = getBattleState();
  if (state.finalTurn) { resolveRound(); return; }
  state.turn = otherSide(side); state.selectedCard = null; state.mode = 'place'; state.mixBase = null;
  teachNow();
});

export var onPass = act(function onPass() { var state = getBattleState(); if (state.turn !== PLAYER || state.resolving || state.battleOver || state.opponentThinking || state.pending) return; pass(PLAYER); });

export var onMixToggle = act(function onMixToggle() {
  var state = getBattleState();
  if (state.turn !== PLAYER || state.resolving || state.battleOver || state.opponentThinking || state.pending) return;
  state.mode = state.mode === 'mix' ? 'place' : 'mix'; state.mixBase = null; state.selectedCard = null;
});

export function runOpponentMove(decision) {
  var side = decision.side, best = decision.best;
  if (decision.willPass) { pass(side); return; }
  if (best.type === 'mix') { performMix(side, best.base, best.other); return; }
  var state = getBattleState();
  state.pending = { side: side, card: state.hands[side][best.cardIndex], cardIndex: best.cardIndex, tile: best.tile, picks: best.targets };
  finishPlay();
}

/* Weigh the move and mark the enemy as thinking; returns how long the view
   should let it look like it is deciding, or null when it is nobody's business. */
export function opponentThink() {
  var state = getBattleState();
  if (!state || state.turn !== ENEMY || state.resolving || state.battleOver || state.opponentThinking) return null;
  state.opponentThinking = true;
  state.decision = decideOpponentMove();
  return decisionDelay(state.decision.margin);
}

export var opponentAct = act(function opponentAct() {
  var state = getBattleState();
  if (!state || !state.opponentThinking) return;
  var decision = state.decision;
  state.opponentThinking = false; state.decision = null;
  if (state.resolving || state.battleOver) return;
  runOpponentMove(decision);
  teachNow();
});

/* Both halves at once, for anything that does not need to watch it think. */
export function opponentMove() { if (opponentThink() !== null) opponentAct(); }

/* ===================================================================
   ROUND / BATTLE RESOLUTION
   =================================================================== */
export var resolveRound = act(function resolveRound() {
  var state = getBattleState();
  var ev = evaluateBoard(state.board, state.hazards, evalCtx(state));
  var result = decideRound(ev, state.roundStarter);
  state.wins[result.winner]++;
  state.lastRoundWinner = result.winner;
  state.resolving = true; state.opponentThinking = false;
  /* Once a round is scored it is out of reach for good. */
  state.rewindSnap = null;
  state.mode = 'place'; state.mixBase = null; state.selectedCard = null; state.pending = null;
  if (state.wins[result.winner] >= 2) state.battleOver = true;
  state.roundResult = { ev: ev, result: result };
  addLog('Round ' + state.round + ' — You ' + result.bottom + ' : ' + result.top + '. ' + sideName(result.winner) + ' won it.');
});

/* The player has read the result: on to the next round, or out of the battle. */
export var continueBattle = act(function continueBattle() {
  var state = getBattleState();
  if (!state || !state.roundResult) return;
  var result = state.roundResult.result;
  state.roundResult = null;
  if (state.battleOver) endBattle(state.wins.bottom >= 2);
  else nextRound(result.winner);
});

export var nextRound = act(function nextRound(winner) {
  emit('passPuck', false);
  var state = getBattleState();
  // The line breaks: frontline units in contested lanes are spent. Snapshot the
  // board first so the tutorial can show the player exactly what fell and why.
  var ctxNow = evalCtx(state);
  var preBoard = C.cloneBoard(state.board), preHaz = C.cloneHazards(state.hazards);
  var preEv = evaluateBoard(preBoard, preHaz, ctxNow);
  var fallen = clearFrontlines(state.board, state.hazards, ctxNow);
  state.round++; state.roundStarter = winner; state.turn = winner;
  state.finalTurn = false; state.resolving = false;
  // one Rewind per round, and it can never reach across the boundary
  state.rewindSnap = null; state.rewindUsedThisRound = false;
  state.inspected = null; state.lastPlaced = null;
  state.mixTokens = { bottom: 1, top: (state.enemyMod && state.enemyMod.mixTokens) || 1 };
  state.mixChain = 0; state.chains = { bottom: 0, top: 0 };
  state.mixesThisRound = 0; state.freeMixesThisRound = 0; state.echoUsedThisRound = false; state.cascadeDepth = 0;
  state.quickStudyUsed = false;
  state.quieted = null;                              // Cyan's reprieve lasts one round
  ['bottom', 'top'].forEach(function (side) { eachUnit(state.board, side, function (unit) { unit.temp = 0; }); });
  /* BOSS RULE — growth (The Verdant Crown). Everything of its that survived
     the break comes back bigger, permanently. A long battle is a losing
     battle: the answer is to take rounds one and two quickly rather than
     grinding, which inverts the usual advice about playing for the long game. */
  if (state.enemyMod && state.enemyMod.growth) {
    var grown = 0;
    eachUnit(state.board, ENEMY, function (unit) { unit.strength += state.enemyMod.growth; grown++; });
    if (grown) addLog(state.enemy.name + ' puts out new growth — ' + grown +
      ' surviving unit' + (grown === 1 ? '' : 's') + ' gain ' + state.enemyMod.growth + '.');
  }
  if (state.enemyMod && state.enemyMod.rotatingColor) {
    state.spectrumColor = COLOR_KEYS[Math.floor(getRnd()() * COLOR_KEYS.length)];
    addLog(state.enemy.name + ' turns ' + COLORS[state.spectrumColor].name + ' this round.');
  }
  /* BOSS RULE — devourWeakest (The Spectrum). It eats your weakest surviving
     unit at the start of every round. Chaff you were holding for board
     presence becomes a liability, and the usual habit of padding the back
     rows with cheap bodies actively feeds it. */
  if (state.enemyMod && state.enemyMod.devourWeakest) {
    var weakest = null;
    eachUnit(state.board, PLAYER, function (unit, row, index) {
      if (!weakest || unit.strength < weakest.unit.strength) weakest = { unit: unit, row: row, index: index };
    });
    if (weakest) {
      state.board[PLAYER][weakest.row][weakest.index] = null;
      addLog(state.enemy.name + ' devours your weakest unit — ' +
        colorInfo(weakest.unit.color).name + ' ' + weakest.unit.strength + ' is gone.');
    }
  }
  /* BOSS RULE — plantsCurse (The Chorus Eternal). It puts a curse on the
     player's board every round, so the deck-level rot the boss feeds on keeps
     growing during the fight. Board-only: it does not add to the run deck,
     because the boss should not permanently worsen a run you might still
     lose and retry. */
  if (state.enemyMod && state.enemyMod.plantsCurse) {
    var curseId = C.CURSE_KEYS[Math.floor(getRnd()() * C.CURSE_KEYS.length)];
    var note = C.plantCurse(state, PLAYER, buildApi(state, PLAYER, []), curseId);
    addLog(state.enemy.name + ' adds its voice \u2014 ' + CARDS[curseId].name + ': ' + note + '.');
  }

  /* BOSS RULE — sunderEachRound (The Long Crack). The ground keeps breaking,
     on BOTH halves. Splitting it evenly is what makes this a shared handicap
     rather than a one-sided punishment \u2014 the fight is about who plays broken
     ground better. */
  if (state.enemyMod && state.enemyMod.sunderEachRound) {
    for (var i = 0; i < state.enemyMod.sunderEachRound; i++) {
      var side1 = spawnFissure(PLAYER, state.board);
      var side2 = spawnFissure(ENEMY, state.board);
      if (side1 || side2) addLog('The ground gives way further on both halves.');
    }
  }

  /* Units that dig every round. Counted off the board, so keeping a
     Wellspring alive is the cost of the engine \u2014 it is a frontline body like
     any other and the line still breaks around it. */
  var engineDraw = 0;
  eachUnit(state.board, PLAYER, function (unit) {
    var cardDef = CARDS[unit.cardId];
    if (cardDef && cardDef.drawsEachRound) engineDraw += cardDef.drawsEachRound;
  });
  if (engineDraw) addLog('Your wellsprings draw ' + engineDraw + ' extra.');
  /* Deep Pockets pays a lean deck directly: every five cards under 25 is
     another card each round. At 15 cards that is two extra draws a round, so
     the endgame target size is something the relic actively argues for. */
  var lean = 0;
  if (hasRelic(state.relics, 'deep_pockets')) {
    lean = Math.max(0, Math.floor((25 - getActiveRun().deck.length) / 5));
    if (lean) addLog('Deep Pockets draws ' + lean + ' extra \u2014 your deck is lean.');
  }
  drawInto(state, PLAYER, C.ROUND_DRAW + engineDraw + lean + (hasRelic(state.relics, 'recycling_bin') ? 1 : 0));
  drawInto(state, ENEMY, C.ROUND_DRAW);
  if (fallen.bottom.length || fallen.top.length) {
    addLog('The contested lines break — ' + fallen.bottom.length + ' of yours and ' +
      fallen.top.length + ' enemy frontline unit' + (fallen.top.length === 1 ? '' : 's') + ' fall.');
  } else addLog('No lane was contested, so every unit holds its ground.');
  addLog('Round ' + state.round + ' begins. ' + sideName(winner) + ' starts.');
  teach('roundbreak', { board: preBoard, hazards: preHaz, ev: preEv,
    after: state.board, fallen: fallen, evalCtx: ctxNow });
});

export var endBattle = act(function endBattle(won) {
  var state = getBattleState(), run = getActiveRun();
  if (won) {
    run.battlesWon++;
    rollReward(state.node);
    run.gold += run.reward.gold;
    show('reward');
  } else {
    run.lives = Math.max(0, run.lives - 1);
    if (run.lives <= 0) { show('gameover'); return; }
    advance();
  }
});
