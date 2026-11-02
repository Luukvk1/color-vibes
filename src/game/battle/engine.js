/* The battle engine's core: what mixing does, how cards are drawn, the api a
   card's rules text is written against, and the one evaluation context every
   scoring pass shares. Nothing here knows a screen exists. */

import C from '../rules/index.js';
import { liftStrength } from '../run/mints.js';
import { store } from '../store.js';
import { spawnFissure } from './rewind.js';

var CARDS = C.CARDS;
var PLAYER = C.PLAYER;
var ROWS = C.ROWS;
var ROW_INFO = C.ROW_INFO;
var adjacentTiles = C.adjacentTiles;
var adjacentTilesFor = C.adjacentTilesFor;
var colorInfo = C.colorInfo;
var eachUnit = C.eachUnit;
var evaluateBoard = C.evaluateBoard;
var hasRelic = C.hasRelic;
var mixResultColor = C.mixResultColor;
var otherSide = C.otherSide;
var unitAt = C.unitAt;

/* ===================================================================
   MIXING — Free Mix and Mix Chain (GDD §17, §18)
   =================================================================== */
/* In a run only the player has relics. In a friendly match each seat has its own. */
function relicsFor(battleState, side) {
  if (battleState.pvp) return battleState.seats[side].relics;
  return (side === PLAYER && battleState.relics) ? battleState.relics : [];
}

export function canMix(board, side, base, other, fissures) {
  var unitA = unitAt(board, side, base.row, base.index), unitB = unitAt(board, side, other.row, other.index);
  if (!unitA || !unitB) return { ok: false, reason: 'Both tiles need a unit.' };
  if (base.row === other.row && base.index === other.index) return { ok: false, reason: 'Pick two different units.' };
  var topology = C.boardTopo(fissures || (store.run && store.run.fissures));
  if (!adjacentTilesFor(side, base.row, base.index, topology).some(function (tile) { return tile.row === other.row && tile.index === other.index; })) {
    /* Distinguish the two failures: tiles that never touched, and tiles a
       fissure has since pulled apart. The second needs explaining. */
    var everAdjacent = adjacentTiles(base.row, base.index).some(function (tile) { return tile.row === other.row && tile.index === other.index; });
    return { ok: false, reason: everAdjacent ? 'A fissure runs between those tiles.' : 'Those tiles do not touch.' };
  }
  return { ok: true };
}

export function mixOptions(board, side, fissures) {
  var options = [], topology = C.boardTopo(fissures || (store.run && store.run.fissures));
  ROWS.forEach(function (row) {
    for (var index = 0; index < ROW_INFO[row].count; index++) {
      if (!unitAt(board, side, row, index)) continue;
      adjacentTilesFor(side, row, index, topology).forEach(function (tile) {
        if (unitAt(board, side, tile.row, tile.index)) options.push({ base: { row: row, index: index }, other: { row: tile.row, index: tile.index } });
      });
    }
  });
  return options;
}

/* battleState needs: board, hazards, hands, decks, relics (player), mixChain, mixesThisRound, freeMixesThisRound */
export function applyMix(battleState, side, base, other, extra, isFree) {
  var relics = relicsFor(battleState, side);
  var unitA = unitAt(battleState.board, side, base.row, base.index), unitB = unitAt(battleState.board, side, other.row, other.index);
  var color = mixResultColor(unitA.color, unitB.color);
  /* Chains belong to the side that built them. A shared counter meant the enemy
     taking a turn wiped yours — and Magenta Echo, which scales off it, lost its
     bonus before scoring ever happened. */
  battleState.chains = battleState.chains || { bottom: 0, top: 0 };
  var chainBefore = battleState.chains[side] || 0;

  var bonus = (unitA.color === 'black' || unitB.color === 'black') ? 2 : 1;
  if (hasRelic(relics, 'stable_fusion')) bonus += 1;
  if (hasRelic(relics, 'prism_core') && (battleState.mixesThisRound || 0) === 0) bonus += 2;
  [unitA, unitB].forEach(function (unit) {
    var cardDef = CARDS[unit.cardId];
    if (!cardDef) return;
    if (cardDef.onMixConsumed) bonus += cardDef.onMixConsumed;
    if (cardDef.onMixConsumedChain) bonus += cardDef.onMixConsumedChain * chainBefore;
  });
  eachUnit(battleState.board, side, function (unit) {
    var cardDef = CARDS[unit.cardId];
    if (cardDef && cardDef.mixBonus) bonus += cardDef.mixBonus;
  });
  bonus += (extra || 0);

  var strength = (unitA.strength + (unitA.temp || 0)) + (unitB.strength + (unitB.temp || 0)) + bonus;
  battleState.board[side][base.row][base.index] = { cardId: null, color: color, strength: strength, temp: 0, cracked: 0 };
  battleState.board[side][other.row][other.index] = null;

  battleState.mixesThisRound = (battleState.mixesThisRound || 0) + 1;
  var links = 1;
  if (isFree && side === PLAYER && hasRelic(relics, 'double_rainbow') && (battleState.freeMixesThisRound || 0) === 0) links = 3;
  if (isFree) battleState.freeMixesThisRound = (battleState.freeMixesThisRound || 0) + 1;
  battleState.chains[side] = chainBefore + links;
  battleState.mixChain = battleState.chains[side];

  // Black Paint fires whenever something becomes Black
  if (side === PLAYER && color === 'black' && hasRelic(relics, 'black_paint')) {
    battleState.board[side][base.row][base.index].temp += 3;
  }
  return { color: color, strength: strength, bonus: bonus, chain: battleState.mixChain, links: links };
}

/* Curses never reach a hand: drawing one resolves it against you immediately
   and burns the draw. Everything else behaves as before. */
/* Everything drawn *past the opening hand* is counted, because Blue Tideline
   scales off it. Tracked on the battle state rather than the run: the count
   measures how hard this battle has been dug through, and resets with the fight.

   Two things were wrong here. The opening deal goes through this same
   function, so Tideline began every battle already six cards up — eight with
   the Open Ledger — which is its cap of 8 reached before a single turn was
   taken. And the counter was incremented by the number of cards *asked for*
   rather than the number actually drawn, so an empty deck still paid it.
   `opening` skips the count, and the tally now happens at the end from the
   real total. */
export function drawInto(battleState, side, count, opening) {
  var got = 0, guard = 0;
  for (var drawIndex = 0; drawIndex < count; drawIndex++) {
    while (guard++ < 60) {
      if (!battleState.decks[side].length) { countDraws(battleState, side, got, opening); return got; }
      var card = battleState.decks[side].shift();
      var cardDef = CARDS[card.id];
      if (cardDef && cardDef.curse) {
        var note = cardDef.onDraw ? cardDef.onDraw(battleState, side, buildApi(battleState, side, [])) : '';
        (battleState.curseFired = battleState.curseFired || []).push({ side: side, name: cardDef.name, note: note });
        continue;                        // burned the draw, try the next card
      }
      if (battleState.hands[side].length >= C.HAND_LIMIT) continue;
      battleState.hands[side].push(card);
      got++;
      break;
    }
  }
  countDraws(battleState, side, got, opening);
  return got;
}

function countDraws(battleState, side, got, opening) {
  if (opening || !got) return;
  if (!battleState.drawn) return;
  if (side === PLAYER) battleState.drawn.extra += got;
  else if (battleState.pvp) battleState.drawn.top += got;
}

export function buildApi(battleState, side, notes) {
  var relics = relicsFor(battleState, side);
  var api = {
    draw: function (drawSide, count) {
      var extra = 0;
      if (drawSide === PLAYER && hasRelic(relics, 'echo_chamber') && !battleState.echoUsedThisRound) { extra = 1; battleState.echoUsedThisRound = true; }
      return drawInto(battleState, drawSide, count + extra);
    },
    /* Damage is written into `temp`, a persistent negative, rather than
       clamped off the printed strength.

       The old version did `u.strength = max(1, u.strength - amount)`. An
       enemy's *displayed* strength is its printed value plus evaluation
       bonuses — depth bonus, the act boss's colour bonus, auras — none of
       which live on `u.strength`. So a frontline reading 8 might be printed 2,
       and Black Eraser's promised 3 became `max(1, 2-3)` = 1: a single point
       off the number on screen, for a card that says three. The weaker the
       printed value the worse it got, and the Eraser deliberately picks the
       weakest frontline, so it almost always looked broken.

       Subtracting through `temp` means the full amount always lands, and the
       floor is applied to what the player can actually see: effective
       strength stops at 1 instead of the printed value doing so. */
    damage: function (side2, row, index, amount) {
      var unit = unitAt(battleState.board, side2, row, index);
      if (!unit) return 0;
      var evaluation = evaluateBoard(battleState.board, battleState.hazards, evalCtx(battleState));
      var tileView = evaluation.view[side2 + '-' + row + '-' + index];
      var shown = tileView ? evaluation.strengthOf(tileView) : unit.strength;
      var dealt = Math.max(0, Math.min(amount, shown - 1));
      unit.temp = (unit.temp || 0) - dealt;
      if ((side2 === PLAYER || battleState.pvp) && hasRelic(battleState.pvp ? relicsFor(battleState, side2) : relics, 'glass_cannon')) unit.cracked = (unit.cracked || 0) + 1;
      return dealt;
    },
    buff: function (side2, tile, amount, permanent) {
      var unit = unitAt(battleState.board, side2, tile.row, tile.index);
      if (!unit) return;
      if (permanent) {
        unit.strength += amount;
        /* "Permanently" should outlive the battle, not just the board —
           write the increase back into the run's own deck too. Skipped
           during AI lookahead (battleState.sim) so a hypothetical move the AI
           never actually commits to can't leave a mark on the real deck, and
           skipped for anything without a traceable deck slot (tokens, the
           enemy's disposable deck) since there's nothing persistent to
           write to. */
        if (!battleState.sim && !battleState.pvp && side2 === PLAYER && typeof unit.deckIndex === 'number' && store.run && store.run.deck && store.run.deck[unit.deckIndex]) {
          store.run.deck[unit.deckIndex] = liftStrength(store.run.deck[unit.deckIndex], amount);
        }
      } else {
        unit.temp = (unit.temp || 0) + amount;
      }
    },
    /* Permanently strikes a card from the run's own deck, not just this
       battle's board — the sacrifice half of a devour effect that eats its
       target rather than merely destroying it for the fight.

       deckIndex is assigned fresh every battle from run.deck's array
       position at that moment (see enterNode), and the ONLY other thing
       that ever touches run.deck mid-battle is a permanent buff, which
       replaces a slot in place and never changes the array's length. This
       is the first thing that does — an actual splice — so every other
       deckIndex reference still alive this battle (a card still in hand,
       still in the draw pile, or already standing on the board) has to be
       shifted down in the same stroke. Skip that and the very next
       permanent buff on any of those cards would silently land on the
       wrong slot for the rest of the fight. */
    removeFromDeck: function (side2, tile) {
      if (battleState.sim || battleState.pvp || side2 !== PLAYER || !store.run || !store.run.deck) return false;
      var unit = unitAt(battleState.board, side2, tile.row, tile.index);
      if (!unit || typeof unit.deckIndex !== 'number' || !store.run.deck[unit.deckIndex]) return false;
      var removedIndex = unit.deckIndex;
      store.run.deck.splice(removedIndex, 1);
      function resync(entry) {
        if (entry && typeof entry.deckIndex === 'number' && entry.deckIndex > removedIndex) entry.deckIndex--;
      }
      (battleState.hands[PLAYER] || []).forEach(resync);
      (battleState.decks[PLAYER] || []).forEach(resync);
      ROWS.forEach(function (row) {
        for (var index = 0; index < ROW_INFO[row].count; index++) resync(battleState.board[PLAYER][row][index]);
      });
      return true;
    },
    create: function (side2, row, index, cardId) {
      if (battleState.board[side2][row][index]) return;
      var cardDef = CARDS[cardId];
      battleState.board[side2][row][index] = { cardId: cardId, color: cardDef.color, strength: cardDef.strength, temp: 0, cracked: 0 };
    },
    destroy: function (side2, tile) { battleState.board[side2][tile.row][tile.index] = null; },
    move: function (side2, from, to) {
      var unit = unitAt(battleState.board, side2, from.row, from.index);
      if (!unit || battleState.board[side2][to.row][to.index]) return;
      if (unit.strength + (unit.temp || 0) < ROW_INFO[to.row].min) return;
      battleState.board[side2][to.row][to.index] = unit; battleState.board[side2][from.row][from.index] = null;
      if ((side2 === PLAYER || battleState.pvp) && hasRelic(battleState.pvp ? relicsFor(battleState, side2) : relics, 'heavy_brush') && ROW_INFO[to.row].depth === 3) unit.strength += 1;
    },
    recolor: function (side2, tile, color) {
      var unit = unitAt(battleState.board, side2, tile.row, tile.index);
      if (!unit) return;
      var previousColor = unit.color;
      unit.color = color;
      if ((side2 === PLAYER || battleState.pvp) && previousColor !== color) {
        var ownerRelics = battleState.pvp ? relicsFor(battleState, side2) : relics;
        if (hasRelic(ownerRelics, 'chromatic_memory')) unit.temp = (unit.temp || 0) + Math.ceil((unit.strength + (unit.temp || 0)) / 4);
        if (color === 'black' && hasRelic(ownerRelics, 'black_paint')) unit.temp = (unit.temp || 0) + 3;
      }
    },
    clearHazard: function (side2, row) { battleState.hazards[side2][row] = null; },
    /* Silence every scar touching any of these tiles until the round ends.
       The fissures themselves are untouched; only this battle stops seeing
       them, which is what makes Cyan a reprieve rather than a cure. */
    quietFissuresAt: function (side2, tiles) {
      battleState.quieted = battleState.quieted || {};
      var quietedCount = 0;
      (battleState.fissures || []).forEach(function (fissure) {
        if (fissure.side !== side2) return;
        var hit = tiles.some(function (tile) { return C.sameTile(fissure.a, tile) || C.sameTile(fissure.b, tile); });
        if (!hit) return;
        var key = C.edgeKey(fissure.side, fissure.a, fissure.b);
        if (battleState.quieted[key]) return;
        battleState.quieted[key] = 1; quietedCount++;
      });
      return quietedCount;
    },
    freeMix: function (side2, base, other, extra) { return doMixCascade(battleState, side2, base, other, extra, true, notes); },
    /* Tears the run's ground, which outlives this battle. */
    spawnFissure: function (targetSide, board) { return battleState.pvp ? null : spawnFissure(targetSide, board); },
    enemyFrontlinesIn: function (laneList) {
      var evaluation = evaluateBoard(battleState.board, battleState.hazards, evalCtx(battleState));
      var foe = otherSide(side), frontlines = [], seen = {};
      laneList.forEach(function (laneIndex) {
        var laneData = evaluation.lanes[laneIndex][foe];
        if (!laneData) return;
        var key = laneData.champion.row + '-' + laneData.champion.index;
        if (seen[key]) return;
        seen[key] = 1;
        frontlines.push({ row: laneData.champion.row, index: laneData.champion.index, strength: evaluation.strengthOf(laneData.champion) });
      });
      return frontlines;
    },
    /* Everything in those lanes that is NOT the champion — the units standing
       behind the line, feeding it. Nothing could reach them before: every
       removal effect in the game went through enemyFrontlinesIn, so the back
       rows were the safest place on the board and stacking them was a
       free action. */
    /* First empty tile touching `at` that the unit could legally stand in.
       Used by cards that grow something rather than target it, so they need
       no targeting UI. */
    emptyAdjacent: function (side2, at) {
      var found = null;
      C.adjacentTilesFor(side2, at.row, at.index, C.boardTopo(battleState.fissures)).forEach(function (tile) {
        if (found) return;
        if (battleState.board[side2][tile.row][tile.index]) return;
        found = tile;
      });
      return found;
    },
    enemySupportIn: function (laneList) {
      var evaluation = evaluateBoard(battleState.board, battleState.hazards, evalCtx(battleState));
      var foe = otherSide(side), support = [], seen = {};
      laneList.forEach(function (laneIndex) {
        var laneData = evaluation.lanes[laneIndex][foe];
        if (!laneData) return;
        laneData.members.forEach(function (member) {
          if (member.row === laneData.champion.row && member.index === laneData.champion.index) return;
          var key = member.row + '-' + member.index;
          if (seen[key]) return;
          seen[key] = 1;
          support.push({ row: member.row, index: member.index, strength: evaluation.strengthOf(member) });
        });
      });
      return support;
    }
  };
  return api;
}

/* Quieted fissures are still on the run — they come back next round — but
   for as long as they are quiet the board behaves as though they healed. */
function activeFissures(battleState) {
  var all = battleState.fissures || (store.run && store.run.fissures) || [];
  var quieted = battleState && battleState.quieted;
  if (!quieted) return all;
  return all.filter(function (fissure) { return !quieted[C.edgeKey(fissure.side, fissure.a, fissure.b)]; });
}

export function evalCtx(battleState) {
  return { relicsTop: battleState.pvp ? battleState.seats.top.relics : [], relics: battleState.relics || [], enemyMod: battleState.enemyMod || {},
           chains: battleState.chains || { bottom: 0, top: 0 },
           drawn: battleState.drawn || { extra: 0 },
           hands: battleState.hands || null,
           // read by feedsOnCurses: what the player carried into this fight
           playerCurses: battleState.playerCurses || 0,
           curseFired: battleState.curseFired || [],
           mixChain: battleState.mixChain || 0, spectrumColor: battleState.spectrumColor,
           /* The board's scars travel with every evaluation, including the
              ones the AI runs against hypothetical futures. Anything Cyan has
              quieted is filtered out here, so adjacency, lanes and drain all
              stop seeing it at once without any of them knowing why. */
           fissures: activeFissures(battleState) };
}

/* Collected before firing, because an effect may add or remove units and we
   do not want the list mutating underneath the loop. Position travels with
   each trigger so a card can act on itself \u2014 without it, "this gains 1" had
   no way to say which tile "this" was. */
export function fireFriendlyMix(battleState, side, notes) {
  var triggered = [];
  eachUnit(battleState.board, side, function (unit, row, index) {
    var cardDef = CARDS[unit.cardId];
    if (cardDef && cardDef.onFriendlyMix) triggered.push({ cardDef: cardDef, at: { row: row, index: index } });
  });
  triggered.forEach(function (trigger) {
    var note = trigger.cardDef.onFriendlyMix(battleState, side, buildApi(battleState, side, notes), trigger.at);
    if (note && notes) notes.push(note);
  });
}

/* A mix, plus anything it cascades into. Volatile Fusion can chain further. */
export function doMixCascade(battleState, side, base, other, extra, isFree, notes) {
  var result = applyMix(battleState, side, base, other, extra, isFree);
  if (notes) notes.push((isFree ? 'Free Mix' : 'Mix') + ' \u2192 ' + colorInfo(result.color).name + ' ' + result.strength + ' (chain ' + result.chain + ')');
  fireFriendlyMix(battleState, side, notes);

  var relics = relicsFor(battleState, side);
  /* GDD §29 says "every third mix in a chain". With one Mix token a round a
     chain can never reach three on its own, so the relic could never fire.
     It now also triggers on the opening link, which is what makes chains
     reachable at all — everything downstream (Black Singularity, Magenta
     Echo, Double Rainbow) depends on a chain existing in the first place. */
  var chainNow = (battleState.chains && battleState.chains[side]) || 0;
  var triggers = (chainNow === 1 || (chainNow > 0 && chainNow % 3 === 0));
  if (hasRelic(relics, 'volatile_fusion') && triggers && (battleState.cascadeDepth || 0) < 6) {
    var options = mixOptions(battleState.board, side);
    if (options.length) {
      battleState.cascadeDepth = (battleState.cascadeDepth || 0) + 1;
      var pick = bestMixOption(battleState, side, options);
      if (notes) notes.push('Volatile Fusion erupts');
      doMixCascade(battleState, side, pick.base, pick.other, 0, true, notes);
      battleState.cascadeDepth--;
    }
  }
  return result;
}

function bestMixOption(battleState, side, options) {
  var best = null;
  options.forEach(function (option) {
    var sim = simGame(battleState);
    applyMix(sim, side, option.base, option.other, 0, true);
    var evaluation = evaluateBoard(sim.board, sim.hazards, evalCtx(sim));
    var scoreDelta = evaluation.totals[side] - evaluation.totals[otherSide(side)];
    if (!best || scoreDelta > best.scoreDelta) best = { scoreDelta: scoreDelta, base: option.base, other: option.other };
  });
  return best || options[0];
}

export function simGame(sourceState) {
  return { board: C.cloneBoard(sourceState.board), hazards: C.cloneHazards(sourceState.hazards),
    hands: { bottom: sourceState.hands.bottom.slice(), top: sourceState.hands.top.slice() },
    decks: { bottom: sourceState.decks.bottom.slice(), top: sourceState.decks.top.slice() },
    pvp: sourceState.pvp, seats: sourceState.seats, drawn: sourceState.pvp ? Object.assign({}, sourceState.drawn) : undefined, relics: (sourceState.relics || []).slice(), enemyMod: sourceState.enemyMod, spectrumColor: sourceState.spectrumColor,
    fissures: sourceState.fissures || [],
    // cloned: a simulated Cyan play must not quiet the real board
    quieted: sourceState.quieted ? Object.assign({}, sourceState.quieted) : null,
    mixChain: sourceState.mixChain || 0,
    chains: { bottom: (sourceState.chains && sourceState.chains.bottom) || 0, top: (sourceState.chains && sourceState.chains.top) || 0 },
    mixesThisRound: sourceState.mixesThisRound || 0,
    freeMixesThisRound: sourceState.freeMixesThisRound || 0, echoUsedThisRound: sourceState.echoUsedThisRound, sim: true };
}
