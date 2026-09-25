/* The run's own story: starting, resuming, walking the map, finishing acts
   and the secret roads that open on the way. */

import C from '../rules/index.js';
import { drawInto } from '../battle/engine.js';
import { spawnFissure } from '../battle/rewind.js';
import { addLog, flushCurses, newBattle, shuffle } from '../battle/setup.js';
import { codex } from '../codex.js';
import { ACTS, ACT_KEYS, ACT_LENGTH } from '../content/acts.js';
import { act, emit, store } from '../store.js';
import { tutorial, tutorialActive } from '../tutorial.js';
import { EVENTS, rollEvent } from './events.js';
import { rollLab } from './lab.js';
import { buildMap } from './map.js';
import { replayMints } from './mints.js';
import { rollShop } from './shop.js';

var CARDS = C.CARDS;
var ENEMY = C.ENEMY;
var PLAYER = C.PLAYER;
var RELICS = C.RELICS;
var hasRelic = C.hasRelic;
var sideName = C.sideName;

/* Which acts you could walk into next: built, unlocked by your deck, and not
   already behind you — unless the run has gone endless, in which case a
   cleared act is a road again rather than a dead end. The colour gate still
   applies either way; endless removes the "already visited" exclusion, not
   the requirement that earned the visit in the first place. */
export function eligibleActs(runState) {
  return ACT_KEYS.filter(function (key) {
    if (!runState.endless && runState.actsCleared.indexOf(key) !== -1) return false;
    return C.actUnlocked(ACTS[key].color, runState.deck);
  });
}

/* Every act has been beaten at least once — the condition for the run being
   truly finished, as opposed to merely stuck because some colours were never
   made. Checked against the distinct set, since actsCleared accumulates a
   duplicate entry on every loop once a run goes endless. */
export function allActsConquered(runState) {
  return ACT_KEYS.every(function (key) { return runState.actsCleared.indexOf(key) !== -1; });
}

/* A run-wide difficulty level. Cleared acts carry their full length forward,
   so an act-two opener is harder than an act-one finale rather than resetting
   the curve every time the road changes colour. */
export function powerAt(runState, depth) {
  return (runState.actsCleared ? runState.actsCleared.length : 0) * ACT_LENGTH + depth;
}

export function startingDeck() {
  // GDD §23 starting deck, expressed in the current card pool
  var deck = [];
  ['red_brute', 'red_brute', 'red_scout', 'blue_scout', 'blue_current', 'blue_controller',
   'green_seed', 'green_gardener', 'green_colony', 'colorless_row'].forEach(function (cardId) { deck.push({ id: cardId, up: false }); });
  return deck;
}

export function newRun() {
  tutorial.seen = {};      // lessons fire again for a fresh run
  tutorial.list = null;
  /* The first act is rolled, not chosen. You start holding all three
     primaries, so there is nothing to decide yet — the choosing begins once
     the deck you have built starts opening and closing roads. */
  var builtActs = C.PRIMARY_COLORS.filter(function (colorKey) { return !!ACTS[colorKey]; });
  var first = builtActs[Math.floor(store.rnd() * builtActs.length)] || ACT_KEYS[0];
  return {
    act: first, actsCleared: [], actOffer: null, minted: [], endless: false,
    map: buildMap(first, true), depth: 0, col: null, available: [0],
    deck: startingDeck(),
    relics: [], gold: 60, lives: 3, maxLives: 3, corruption: 0,
    /* Fissures outlive the battle that caused them; the meter behind them is
       never shown and never resets its growth. */
    fissures: [], instability: 0, rewindsUsed: 0,
    battlesWon: 0, battlesFought: 0, screen: 'map', pendingNode: null,
    reward: null, shop: null, lab: null, event: null, history: []
  };
}

/* Returns a run or null. Anything unexpected returns null rather than
   throwing: a save from an older build must never be able to brick the game,
   so every failure path ends in a fresh run instead of a blank screen. */
/* Turns whatever the session handed over into a run, or null. Anything
   unexpected returns null rather than throwing: a save from an older build
   must never be able to brick the game, so every failure path ends in a fresh
   run instead of a blank screen. */
export function restoreRun(loadedRun) {
  if (!loadedRun) return null;
  if (!loadedRun.map || !loadedRun.map.length || !Array.isArray(loadedRun.deck) || !ACTS[loadedRun.act]) return null;
  replayMints(loadedRun.minted);
  // every card the deck points at must actually exist after the replay
  var ok = loadedRun.deck.every(function (entry) { return !!CARDS[entry.id]; });
  if (!ok) return null;
  loadedRun.actsCleared = loadedRun.actsCleared || [];
  loadedRun.minted = loadedRun.minted || [];
  loadedRun.relics = (loadedRun.relics || []).filter(function (key) { return !!RELICS[key]; });   // a relic since removed from the game
  if (loadedRun.screen === 'battle') loadedRun.screen = 'map';   // battles are never resumed
  /* An event holds the functions its options run, which do not survive being
     written out; only its title does. Find it again by that. */
  if (loadedRun.event) loadedRun.event = EVENTS.filter(function (event) { return event.title === loadedRun.event.title; })[0] || null;
  if (loadedRun.screen === 'event' && !loadedRun.event) loadedRun.screen = 'map';
  return loadedRun;
}

/* Only screens that can be rebuilt from run state alone are safe to reopen. */
var RESUMABLE_SCREENS = ['map', 'act', 'victory', 'reward', 'shop', 'lab', 'event', 'gameover'];

/* Begin play from a saved run if there is a good one, otherwise from scratch.
   Returns whether it resumed. */
export var start = act(function start(saved) {
  var restored = restoreRun(saved);
  store.run = restored || newRun();
  store.checkpoint = restored ? JSON.stringify(restored) : null;
  store.scaffold = !restored;
  store.state = null;
  store.log.length = 0; emit('log');
  show(restored && RESUMABLE_SCREENS.indexOf(restored.screen) !== -1 ? restored.screen : 'map');
  return !!restored;
});

/* Back to the last moment the run was standing still. */
export var resume = act(function resume() {
  if (!store.checkpoint) return false;
  return start(JSON.parse(store.checkpoint));
});

export var newGame = act(function newGame() {
  store.checkpoint = null;
  store.scaffold = false;
  store.run = newRun();
  store.state = null;
  store.log.length = 0; emit('log');
  show('map');
});

function nodeAt(depth, col) { return store.run.map[depth] && store.run.map[depth][col]; }

export function currentNodes() {
  if (store.run.depth === 0) return store.run.map[0].map(function (node, index) { return index; });
  return store.run.available;
}

/* ===================================================================
   MOVING ABOUT
   =================================================================== */
export var show = act(function show(screen) {
  store.run.screen = screen;
});

/* Every curse that lands in your deck takes a little colour out of the world.
   Nothing announces it; the map, the board and the cards simply go greyer. */
export function gainCurse(id) {
  store.run.deck.push({ id: id, up: false });
  store.run.corruption = (store.run.corruption || 0) + 1;
  return CARDS[id];
}

export var enterNode = act(function enterNode(col) {
  var node = nodeAt(store.run.depth, col);
  store.run.col = col;
  store.run.pendingNode = node;
  store.run.history[store.run.depth] = col;
  if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') beginBattle();
  else if (node.type === 'shop') { rollShop(); show('shop'); }
  else if (node.type === 'lab') { rollLab(); show('lab'); }
  else if (node.type === 'volatile') {
    rollLab();
    store.run.lab = { kind: 'volatile', picks: [], presses: 0, results: [], done: false, curses: 0 };
    show('lab');
  }
  else if (node.type === 'event') { rollEvent(); show('event'); }
});

export var advance = act(function advance() {
  var node = store.run.pendingNode;
  if (!node) { show('map'); return; }
  node.done = true;
  if (store.run.depth >= store.run.map.length - 1) { finishAct(); return; }
  store.run.available = node.next.slice();
  store.run.depth += 1;
  store.run.pendingNode = null;
  show('map');
});

/* Recorded once, the first time a road opens. Kept in the codex rather than
   the run, so it survives the run that earned it. */
export function noteActOmens() {
  ACT_KEYS.forEach(function (key) {
    if (codex.omens[key]) return;
    if (!C.actUnlocked(ACTS[key].color, store.run.deck)) return;
    codex.omens[key] = 1;
  });
}

export var finishAct = act(function finishAct() {
  var justFinished = store.run.act;
  store.run.actsCleared.push(store.run.act);
  store.run.pendingNode = null;
  noteActOmens();
  /* Black is the end of the game, full stop. It is the last colour on the
     wheel and the hardest road to open, so beating it is a finish whether or
     not the player took every other road first — a run that went straight for
     Black and got there has earned an ending, not a shrug and another fork.

     White is the reward for having taken the long way round instead: it only
     appears if every other road was already behind you when Black fell. That
     keeps the completion screen honest for both kinds of run, and keeps White
     a genuine secret rather than a checkbox.

     Not in endless — the whole point of endless is that the endings are
     behind you. */
  if (justFinished === 'black' && !store.run.endless) {
    show('victory');
    return;
  }
  /* White is the last thing there is. Beating it ends the run outright rather
     than returning to a fork — there is no road after the one that was never
     on the map. */
  if (ACTS[justFinished] && ACTS[justFinished].secret) {
    show('gameover');
    return;
  }
  var open = eligibleActs(store.run);
  if (!open.length) { show('gameover'); return; }
  /* Two roads, drawn at random from what your deck has opened. Random keeps
     a run from settling into one memorised route; the choice between them is
     where the deckbuilding pays off. */
  shuffle(open);
  store.run.actOffer = open.slice(0, 2);
  show('act');
});

/* Called from the victory screen. Endless simply lifts the "already visited"
   exclusion in eligibleActs — every act you have ever opened is a road again,
   and run-wide power keeps climbing every loop through the existing
   powerAt() maths, so the game keeps getting harder with no new content
   required to support it. */
export var goEndless = act(function goEndless() {
  store.run.endless = true;
  var open = eligibleActs(store.run);
  if (!open.length) { show('gameover'); return; }
  shuffle(open);
  store.run.actOffer = open.slice(0, 2);
  show('act');
});

/* The other choice on the victory screen: stop here, on your own terms,
   with every road behind you. */
export var endAsVictory = act(function endAsVictory() {
  show('gameover');
});

export var beginAct = act(function beginAct(key) {
  if (!ACTS[key]) return;
  var act = ACTS[key];
  store.run.act = key;
  store.run.actOffer = null;
  store.run.map = buildMap(key, store.run.actsCleared.length === 0);
  store.run.depth = 0; store.run.col = null; store.run.available = [0];
  store.run.history = []; store.run.pendingNode = null;
  store.run.reward = null; store.run.shop = null; store.run.lab = null; store.run.event = null;
  /* The Sundered Ground arrives already broken, on both halves. Fissures are
     run-wide and persistent, so seeding them here means the whole act is
     played on cracked ground rather than the boss being a sudden surprise at
     depth 13 — and the enemy's half is broken too, which is what makes it a
     shared condition instead of a handicap. */
  if (act.alwaysFissures) {
    for (var seedIndex = 0; seedIndex < 3; seedIndex++) { spawnFissure(PLAYER, null); spawnFissure(ENEMY, null); }
  }
  show('map');
});

/* The screen for the moment every act has fallen at least once. It is not
   the same thing as the run ending — the player has choices from here, so it
   gets its own screen rather than folding into the gameover summary, which
   is written for an ending, not a decision. */
/* White is offered only when every road of the wheel was already behind the
   player at the moment Black fell. Checked against the distinct set, so an
   endless run cannot accumulate its way to it by repeating one act. */
export function whiteUnlocked(runState) {
  if (runState.actsCleared.indexOf('white') !== -1) return false;
  return ACT_KEYS.every(function (key) { return runState.actsCleared.indexOf(key) !== -1; });
}

/* Thresholds for the two roads earned by how a run was lived rather than by
   what it covered. Both are read at the moment Black falls.

   Deliberately not exclusive with White or with each other: a run that went
   broad, carried its rot AND broke the ground repeatedly has done three
   different hard things, and should be offered all three. */
export var ROT_THRESHOLD = 3;      // curses still in the deck
export var RIFT_THRESHOLD = 4;     // cracks opened across the run

export function rotUnlocked(runState) {
  if (runState.actsCleared.indexOf('rot') !== -1) return false;
  return curseCount(runState.deck) >= ROT_THRESHOLD;
}

export function riftUnlocked(runState) {
  if (runState.actsCleared.indexOf('rift') !== -1) return false;
  return (runState.fissures || []).length >= RIFT_THRESHOLD;
}

/* Every secret road currently on offer, in a stable order. */
export function secretOffers(runState) {
  var offers = [];
  if (whiteUnlocked(runState)) offers.push('white');
  if (rotUnlocked(runState)) offers.push('rot');
  if (riftUnlocked(runState)) offers.push('rift');
  return offers;
}

export var beginBattle = act(function beginBattle() {
  store.log.length = 0;
  store.state = newBattle(store.run.pendingNode);
  addLog('Battle with ' + store.state.enemy.name + ' begins. ' + sideName(store.state.turn) + ' start' + (store.state.turn === PLAYER ? '' : 's') + '.');
  if (hasRelic(store.state.relics, 'recycling_bin')) { drawInto(store.state, PLAYER, 1); addLog('Recycling Bin drew an extra card.'); }
  flushCurses();
  if (tutorialActive()) tutorial.open = { key: 'intro' };
  store.run.battlesFought++;
  show('battle');
});

export function curseCount(deck) {
  return (deck || []).filter(function (entry) { return CARDS[entry.id] && CARDS[entry.id].curse; }).length;
}
