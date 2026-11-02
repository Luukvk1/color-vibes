/* A friendly match on one device: two self-made decks, shared relics, no Rewind
   and no fissures.

   The rest of the engine is written from the point of view of whoever sits at
   the bottom of the board, and on a shared phone that is exactly right: the
   board should face the person holding it. So nothing here teaches the engine
   about two humans. When the phone changes hands the two seats trade places in
   the battle state (takeSeat), and whoever is acting is always PLAYER. The few
   rules that still have to care — an effect that lands on the other seat, and
   scoring — read that seat's own relics.

   A match borrows store.run and gives it back. It never reaches the checkpoint,
   so abandoning one, or refreshing halfway through, cannot touch a saved run. */

import C from './rules/index.js';
import { drawInto } from './battle/engine.js';
import { shuffle } from './battle/setup.js';
import { codex } from './codex.js';
import { startingDeck } from './run/flow.js';
import { act, emit, getBattleState, store } from './store.js';

var CARDS = C.CARDS;
var ENEMY = C.ENEMY;
var PLAYER = C.PLAYER;
var eachUnit = C.eachUnit;
var hasRelic = C.hasRelic;

export var MODES = { BUILD: 'build', DRAFT_OPEN: 'draft-open', DRAFT_HIDDEN: 'draft-hidden' };

/* A draft is fifteen cards and three relics each. The relics come at the head of
   each block of five so a pick can be built around them. All fifteen are the deck:
   draw effects make a ten-card deck run dry, and nothing is held in reserve. */
export var DRAFT = { BLOCKS: 3, CARDS_PER_BLOCK: 5, OFFER: 3, OFFER_UNITS: 2, PACK: 7, PACK_UNITS: 4, MIN_SUPPLY: 42 };

export var PVP = { MIN_DECK: 10, RESERVE_SIZE: 5, COPIES: 3, COPIES_RARE: 1, RELICS_OFFERED: 5, RELICS_ACTIVE: 3, RESERVE_SWAPS: 2 };

/* Nothing in a match can make a fissure or a curse, so a card about either would
   be a blank. Read from the rules text rather than listed, so a new fissure card
   cannot slip in by someone forgetting a list; Collector's Frame pays out between
   battles and a match has no between. */
var DEAD_TEXT = /fissure|curse|the ground/i;
var RUN_ONLY_RELICS = ['collectors_frame'];

function allowedCard(id) {
  var cardDef = CARDS[id];
  return !!cardDef && !cardDef.curse && !cardDef.fused && !cardDef.reforged && !DEAD_TEXT.test(cardDef.text || '');
}

/* What both players may build from. The deck every run starts with counts as met,
   or a first-time player could not build anything at all. */
export function pvpPool() {
  var starters = {};
  startingDeck().forEach(function (entry) { starters[entry.id] = 1; });
  return C.DRAWABLE.concat(C.BOSS_CARDS).filter(function (id, index, all) {
    return all.indexOf(id) === index && allowedCard(id) && (starters[id] || codex.cards[id]);
  });
}

export function copyLimit(id) {
  var rarity = CARDS[id] && CARDS[id].rarity;
  return rarity === 'Common' || rarity === 'Uncommon' ? PVP.COPIES : PVP.COPIES_RARE;
}

function copiesHeld(player, id) {
  return player.active.concat(player.reserve).filter(function (held) { return held === id; }).length;
}

/* Empty when the deck may be played; otherwise what to tell the player. */
export function deckProblems(player) {
  var problems = [];
  if (player.active.length < PVP.MIN_DECK) problems.push('Add ' + (PVP.MIN_DECK - player.active.length) + ' more to reach ' + PVP.MIN_DECK + '.');
  if (player.reserve.length > PVP.RESERVE_SIZE) problems.push('The reserve holds at most ' + PVP.RESERVE_SIZE + '.');
  var pool = pvpPool();
  player.active.concat(player.reserve).forEach(function (id) {
    if (pool.indexOf(id) === -1 && problems.indexOf(id) === -1) problems.push(CARDS[id] ? CARDS[id].name + ' has not been found yet.' : 'Unknown card.');
    else if (copiesHeld(player, id) > copyLimit(id)) {
      var message = 'Too many copies of ' + CARDS[id].name + '.';
      if (problems.indexOf(message) === -1) problems.push(message);
    }
  });
  return problems;
}

/* A saved deck may name a card from an older build, or one past a changed limit;
   it is trimmed rather than refused, so a balance patch never loses someone's list. */
function savedPlayer(slot, fallbackName) {
  var saved = codex.decks[slot] || {}, pool = pvpPool();
  var player = { name: saved.name || fallbackName, active: [], reserve: [], swaps: 0, swapped: [] };
  function keep(zone) {
    (saved[zone] || []).forEach(function (id) {
      if (pool.indexOf(id) !== -1 && copiesHeld(player, id) < copyLimit(id)) player[zone].push(id);
    });
  }
  keep('active'); keep('reserve');
  if (!player.active.length) player.active = startingDeck().map(function (entry) { return entry.id; });
  return player;
}

function matchRun(players) {
  return {
    pvp: { step: 'mode', mode: null, seat: 0, players: players, offer: [], bans: [], banOrder: [], next: null, winner: null, draft: null },
    act: C.PRIMARY_COLORS[0], actsCleared: [], actOffer: null, minted: [], endless: false,
    map: [[]], depth: 0, col: null, available: [], deck: [], relics: [], gold: 0, lives: 0, maxLives: 0,
    corruption: 0, fissures: [], instability: 0, rewindsUsed: 0,
    battlesWon: 0, battlesFought: 99, screen: 'pvp', pendingNode: null,
    reward: null, shop: null, lab: null, event: null, history: []
  };
}

export var enterPvp = act(function enterPvp() {
  if (!store.pvpReturn) store.pvpReturn = { run: store.run, state: store.state };
  store.run = matchRun([savedPlayer('one', 'Player 1'), savedPlayer('two', 'Player 2')]);
  store.state = null;
  store.log.length = 0; emit('log');
});

export var leavePvp = act(function leavePvp() {
  if (!store.pvpReturn) return;
  store.run = store.pvpReturn.run; store.state = store.pvpReturn.state;
  store.pvpReturn = null;
  store.log.length = 0; emit('log');
});

function draftSupply() {
  var supply = [];
  pvpPool().forEach(function (id) { for (var copy = 0; copy < copyLimit(id); copy++) supply.push(id); });
  return supply;
}

/* Below this a hidden draft would run out of cards before both decks were full. */
export function draftCardsMissing() { return Math.max(0, DRAFT.MIN_SUPPLY - draftSupply().length); }

export var pvpChooseMode = act(function pvpChooseMode(mode) {
  var match = store.run.pvp;
  if (match.step !== 'mode') return false;
  if (mode === MODES.BUILD) { match.mode = mode; match.step = 'build'; match.seat = 0; return true; }
  if (draftCardsMissing()) return false;
  match.mode = mode;
  match.draft = newDraft(mode);
  match.step = 'draft';
  openNextPick(match);
  return true;
});

export var pvpSetPlayerName = act(function pvpSetPlayerName(playerIndex, name) {
  store.run.pvp.players[playerIndex].name = cleanName(name) || 'Player ' + (playerIndex + 1);
});

function blockOrder(blockIndex, firstSeat) { return blockIndex % 2 === 0 ? [firstSeat, 1 - firstSeat] : [1 - firstSeat, firstSeat]; }

/* Face up: every pick is a fresh three, and the first pick of each round swaps so
   nobody always chooses first. */
function openQueue(firstSeat) {
  var queue = [], roundIndex = 0;
  function round(kind) {
    blockOrder(roundIndex++, firstSeat).forEach(function (seat) { queue.push({ seat: seat, kind: kind }); });
  }
  for (var block = 0; block < DRAFT.BLOCKS; block++) {
    round('relic');
    for (var pick = 0; pick < DRAFT.CARDS_PER_BLOCK; pick++) round('card');
  }
  return queue;
}

/* Hidden: two packs travel between the players, so each of you sees what the other
   left and never what they took. Five picks each leaves two cards per pack unseen
   by the end, which keeps the last pick a choice rather than a leftover. */
function hiddenQueue(firstSeat) {
  var queue = [];
  for (var block = 0; block < DRAFT.BLOCKS; block++) {
    var order = blockOrder(block, firstSeat), packOf = {};
    packOf[order[0]] = 0; packOf[order[1]] = 1;
    queue.push({ seat: order[0], kind: 'relic' }, { seat: order[1], kind: 'relic' });
    for (var pick = 0; pick < DRAFT.CARDS_PER_BLOCK; pick++) {
      order.forEach(function (seat) {
        queue.push({ seat: seat, kind: 'card', pack: pick % 2 === 0 ? packOf[seat] : 1 - packOf[seat], opensPacks: pick === 0 && seat === order[0] });
      });
    }
  }
  return queue;
}

function newDraft(mode) {
  var firstSeat = store.rnd() < 0.5 ? 0 : 1;
  return {
    supply: shuffle(draftSupply()),
    relicSupply: shuffle(C.RELIC_KEYS.filter(function (key) { return RUN_ONLY_RELICS.indexOf(key) === -1; })),
    queue: mode === MODES.DRAFT_HIDDEN ? hiddenQueue(firstSeat) : openQueue(firstSeat),
    position: 0, packs: [[], []], offer: [], kind: 'card', totalPicks: 0,
    picks: [{ cards: [], relics: [] }, { cards: [], relics: [] }]
  };
}

function isUnit(id) { return CARDS[id].type === 'unit'; }

/* Takes `size` cards off the supply: different cards wherever the supply allows
   it, with enough units that nobody is ever offered only spells. */
function dealCards(supply, size, minUnits) {
  var dealt = [];
  function take(accepts) {
    for (var index = 0; index < supply.length && dealt.length < size; index++) {
      if (accepts(supply[index])) { dealt.push(supply[index]); supply.splice(index, 1); index--; }
    }
  }
  var unitsWanted = minUnits;
  take(function (id) {
    if (unitsWanted <= 0 || !isUnit(id) || dealt.indexOf(id) !== -1) return false;
    unitsWanted--; return true;
  });
  take(function (id) { return dealt.indexOf(id) === -1; });
  take(function () { return true; });
  return shuffle(dealt);
}

function openNextPick(match) {
  var draft = match.draft, turn = draft.queue[draft.position];
  draft.kind = turn.kind;
  match.seat = turn.seat;
  if (turn.opensPacks) {
    draft.packs = [dealCards(draft.supply, DRAFT.PACK, DRAFT.PACK_UNITS), dealCards(draft.supply, DRAFT.PACK, DRAFT.PACK_UNITS)];
  }
  if (turn.kind === 'relic') draft.offer = draft.relicSupply.splice(0, DRAFT.OFFER);
  else if (turn.pack !== undefined) draft.offer = draft.packs[turn.pack];
  else draft.offer = dealCards(draft.supply, DRAFT.OFFER, DRAFT.OFFER_UNITS);
}

export var pvpDraftPick = act(function pvpDraftPick(offerIndex) {
  var match = store.run.pvp, draft = match.draft;
  if (match.step !== 'draft' || !draft.offer[offerIndex]) return false;
  var turn = draft.queue[draft.position], chosen = draft.offer.splice(offerIndex, 1)[0], taken = draft.picks[match.seat];
  if (turn.kind === 'relic') {
    taken.relics.push(chosen);
    draft.relicSupply = shuffle(draft.relicSupply.concat(draft.offer));
  } else {
    taken.cards.push(chosen);
    if (turn.pack === undefined) draft.supply = shuffle(draft.supply.concat(draft.offer));
  }
  draft.offer = [];
  draft.position++;
  if (draft.position >= draft.queue.length) { startMatch(match); return true; }
  openNextPick(match);
  if (match.mode === MODES.DRAFT_HIDDEN) { var seatNow = match.seat; coverThen('draft', seatNow); }
  return true;
});

function currentPlayer() { var match = store.run.pvp; return match.players[match.seat]; }

// names reach the page as markup, so they lose anything that could be read as such
function cleanName(name) { return String(name || '').replace(/[<>&"']/g, '').trim().slice(0, 16); }

export var pvpSetName = act(function pvpSetName(name) {
  currentPlayer().name = cleanName(name) || 'Player ' + (store.run.pvp.seat + 1);
});

export var pvpAddCard = act(function pvpAddCard(id, zone) {
  var player = currentPlayer();
  if (pvpPool().indexOf(id) === -1 || copiesHeld(player, id) >= copyLimit(id)) return false;
  if (zone === 'reserve' && player.reserve.length >= PVP.RESERVE_SIZE) return false;
  player[zone].push(id);
  return true;
});

export var pvpRemoveCard = act(function pvpRemoveCard(index, zone) { currentPlayer()[zone].splice(index, 1); });

function saveDeck(player, slot) {
  codex.decks[slot] = { name: player.name, active: player.active.slice(), reserve: player.reserve.slice() };
}

/* Covers between steps exist because the next screen is secret from whoever is
   holding the phone right now. */
function coverThen(step, seat) { var match = store.run.pvp; match.step = 'cover'; match.next = { step: step, seat: seat }; }

export var pvpConfirmDeck = act(function pvpConfirmDeck() {
  var match = store.run.pvp, player = currentPlayer();
  if (deckProblems(player).length) return false;
  saveDeck(player, match.seat === 0 ? 'one' : 'two');
  if (match.seat === 0) { coverThen('build', 1); return true; }
  rollRelicOffer(match);
  match.step = 'ban'; match.seat = match.banOrder[0];
  return true;
});

export var pvpContinue = act(function pvpContinue() {
  var match = store.run.pvp;
  if (match.step !== 'cover') return;
  match.step = match.next.step; match.seat = match.next.seat; match.next = null;
});

function rollRelicOffer(match) {
  var pool = shuffle(C.RELIC_KEYS.filter(function (key) { return RUN_ONLY_RELICS.indexOf(key) === -1; }));
  match.offer = pool.slice(0, PVP.RELICS_OFFERED);
  match.bans = [];
  match.banOrder = store.rnd() < 0.5 ? [0, 1] : [1, 0];
}

export var pvpBan = act(function pvpBan(key) {
  var match = store.run.pvp;
  if (match.step !== 'ban' || match.offer.indexOf(key) === -1 || match.bans.indexOf(key) !== -1) return false;
  match.bans.push(key);
  if (match.bans.length < 2) { match.seat = match.banOrder[1]; return true; }
  store.run.relics = match.offer.filter(function (offered) { return match.bans.indexOf(offered) === -1; });
  coverThen('swap', match.banOrder[0]);
  return true;
});

export var pvpSwap = act(function pvpSwap(activeIndex, reserveIndex) {
  var player = currentPlayer();
  if (player.swaps >= PVP.RESERVE_SWAPS || !player.active[activeIndex] || !player.reserve[reserveIndex]) return false;
  var goingOut = player.active[activeIndex];
  player.swapped.push({ out: goingOut, in: player.reserve[reserveIndex] });
  player.active[activeIndex] = player.reserve[reserveIndex];
  player.reserve[reserveIndex] = goingOut;
  player.swaps++;
  return true;
});

export var pvpResetSwaps = act(function pvpResetSwaps() {
  var player = currentPlayer();
  player.swapped.forEach(function (swap) {
    player.active[player.active.indexOf(swap.in)] = swap.out;
    player.reserve[player.reserve.indexOf(swap.out)] = swap.in;
  });
  player.swapped = []; player.swaps = 0;
});

/* The reserve swap is the coverage decision, so both players make it knowing the
   other's colours, and before either has seen the other's choice. */
export var pvpReady = act(function pvpReady() {
  var match = store.run.pvp;
  if (match.seat === match.banOrder[0]) { coverThen('swap', match.banOrder[1]); return; }
  startMatch(match);
});

function coloursOf(ids) {
  var seen = {};
  ids.forEach(function (id) { if (CARDS[id].color) seen[id && CARDS[id].color] = 1; });
  return C.COLOR_KEYS.filter(function (colorKey) { return seen[colorKey]; });
}
export { coloursOf };

function deckFor(cards) {
  return shuffle(cards.map(function (id, index) { return C.makeCard(id, false, index); }));
}

/* What each player brings: a drafted list with its own relics, or a built deck
   with the relics both kept after the bans. */
function matchLoadout(match, playerIndex) {
  if (match.draft) return { cards: match.draft.picks[playerIndex].cards, relics: match.draft.picks[playerIndex].relics };
  return { cards: match.players[playerIndex].active, relics: store.run.relics.slice() };
}

function openingHand(relics) { return C.OPENING_HAND + (hasRelic(relics, 'open_ledger') ? 2 : 0); }

function startMatch(match) {
  var one = match.players[0], two = match.players[1];
  var loadoutOne = matchLoadout(match, 0), loadoutTwo = matchLoadout(match, 1);
  var starter = store.rnd() < 0.5 ? PLAYER : ENEMY;
  var state = {
    pvp: true, freshSeat: true,
    seats: {
      bottom: { name: one.name, colors: coloursOf(loadoutOne.cards), deck: loadoutOne.cards.map(toEntry), relics: loadoutOne.relics },
      top: { name: two.name, colors: coloursOf(loadoutTwo.cards), deck: loadoutTwo.cards.map(toEntry), relics: loadoutTwo.relics }
    },
    otherSeat: { mixesThisRound: 0, freeMixesThisRound: 0, echoUsedThisRound: false, quickStudyUsed: false, wildPaletteUsed: false },
    board: C.emptyBoard(), hazards: C.emptyHazards(),
    decks: { bottom: deckFor(loadoutOne.cards), top: deckFor(loadoutTwo.cards) },
    hands: { bottom: [], top: [] },
    relics: loadoutOne.relics,
    enemyMod: {}, power: 0, playerCurses: 0, node: null,
    fissures: store.run.fissures,
    rewindSnap: null, rewindUsedThisRound: false, quieted: null,
    drawn: { extra: 0, top: 0 },
    mixTokens: { bottom: 1, top: 1 },
    mixChain: 0, chains: { bottom: 0, top: 0 },
    mixesThisRound: 0, freeMixesThisRound: 0, echoUsedThisRound: false, cascadeDepth: 0,
    wildPaletteUsed: false, easeIn: false,
    round: 1, wins: { bottom: 0, top: 0 },
    turn: starter, roundStarter: starter,
    finalTurn: false, resolving: false, battleOver: false, opponentThinking: false,
    mode: 'place', selectedCard: null, mixBase: null, pending: null,
    inspected: null, lastPlaced: null, bestChain: 0
  };
  faceOpponent(state);
  store.state = state;
  store.run.deck = state.seats.bottom.deck;
  store.run.relics = state.relics;
  store.log.length = 0; emit('log');
  drawInto(state, PLAYER, openingHand(loadoutOne.relics), true);
  drawInto(state, ENEMY, openingHand(loadoutTwo.relics), true);
  match.step = 'match';
  store.run.screen = 'battle';
  emit('passPuck', false);
}

function toEntry(id) { return { id: id, up: false }; }

function faceOpponent(state) {
  var opponent = state.seats.top;
  state.enemy = { name: opponent.name, colors: opponent.colors };
  // the view rebuilds the opponent's chips when this key changes
  state.enemyKey = 'pvp:' + opponent.name;
}

function trade(holder, first, second) { var held = holder[first]; holder[first] = holder[second]; holder[second] = held; }

function tradeSeats(state) {
  ['board', 'hazards', 'hands', 'decks', 'mixTokens', 'chains', 'wins', 'seats'].forEach(function (field) { trade(state[field], 'bottom', 'top'); });
  trade(state.drawn, 'extra', 'top');
  var mine = state.otherSeat;
  state.otherSeat = {};
  Object.keys(mine).forEach(function (field) { state.otherSeat[field] = state[field]; state[field] = mine[field]; });
  state.turn = state.turn === PLAYER ? ENEMY : PLAYER;
  state.roundStarter = state.roundStarter === PLAYER ? ENEMY : PLAYER;
  if (state.lastRoundWinner) state.lastRoundWinner = state.lastRoundWinner === PLAYER ? ENEMY : PLAYER;
  state.lastPlaced = null; state.inspected = null; state.inspectedHazard = null;
  faceOpponent(state);
  state.relics = state.seats.bottom.relics;
  store.run.deck = state.seats.bottom.deck;
  store.run.relics = state.relics;
}

/* Whether the phone has to change hands before the game can go on. A fresh round
   is covered too, even when the same person starts it: the round result was read
   by both of them, and the hand behind it is one player's secret. */
export function needsHandoff(state) {
  return !!state && !!state.pvp && !state.roundResult && !state.resolving && !state.battleOver && (state.turn === ENEMY || !!state.freshSeat);
}
export function canTakeSeat() { return needsHandoff(getBattleState()); }

/* Who the cover is asking for. */
export var takeSeat = act(function takeSeat() {
  var state = getBattleState();
  if (!needsHandoff(state)) return;
  if (state.turn === ENEMY) tradeSeats(state);
  state.freshSeat = false;
  if (state.finalTurn) emit('passPuck', true);
});

export function seatLabel(state, side) {
  return state && state.pvp ? state.seats[side].name : C.sideName(side);
}

/* The same draw for both seats, each reading its own board and its own deck. */
export function drawPvpRound(state) {
  [PLAYER, ENEMY].forEach(function (side) {
    var wellsprings = 0;
    eachUnit(state.board, side, function (unit) {
      var cardDef = CARDS[unit.cardId];
      if (cardDef && cardDef.drawsEachRound) wellsprings += cardDef.drawsEachRound;
    });
    var relics = state.seats[side].relics;
    var lean = hasRelic(relics, 'deep_pockets') ? Math.max(0, Math.floor((25 - state.seats[side].deck.length) / 5)) : 0;
    drawInto(state, side, C.ROUND_DRAW + wellsprings + lean + (hasRelic(relics, 'recycling_bin') ? 1 : 0));
  });
}

export function finishPvpMatch(state, bottomWon) {
  var match = store.run.pvp;
  match.winner = state.seats[bottomWon ? PLAYER : ENEMY].name;
  match.wins = bottomWon ? [state.wins.bottom, state.wins.top] : [state.wins.top, state.wins.bottom];
  match.loser = state.seats[bottomWon ? ENEMY : PLAYER].name;
  match.step = 'result';
  store.state = null;
  store.run.screen = 'pvp';
}

export var pvpRematch = act(function pvpRematch() {
  var match = store.run.pvp;
  match.players.forEach(function (player) { player.swaps = 0; player.swapped = []; });
  var keep = match.players;
  store.run = matchRun([keep[0], keep[1]]);
  store.log.length = 0; emit('log');
});
