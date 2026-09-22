/* The run layer: everything between battles.
   Acts and the map that threads them, rewards, shops, the colour labs, the
   codex and the save file. Owns the run's mutable state and is the only place
   that writes to it.

   One file on purpose. Every section here reassigns shared state — `run` alone
   is read 388 times — and an ES module cannot reassign an imported binding, so
   splitting it means routing those references through a state holder. That is a
   real refactor with real regression risk and belongs in a change of its own.
   Navigate by the section banners. */

import '../core/index.js';

var C = window.CV_CORE;
var SVG_NS = C.SVG_NS, COLORS = C.COLORS, COLOR_KEYS = C.COLOR_KEYS, CARDS = C.CARDS,
    RELICS = C.RELICS, RELIC_KEYS = C.RELIC_KEYS, ENEMIES = C.ENEMIES,
    ROW_INFO = C.ROW_INFO, ROWS = C.ROWS, PLAYER = C.PLAYER, ENEMY = C.ENEMY,
    GEO = C.GEO, VIEWBOX = C.VIEWBOX;
var otherSide = C.otherSide, unitAt = C.unitAt, sideName = C.sideName, slotName = C.slotName,
    eachUnit = C.eachUnit, canPlace = C.canPlace, legalTiles = C.legalTiles,
    adjacentTiles = C.adjacentTiles, adjacentTilesFor = C.adjacentTilesFor,
    lanesOf = C.lanesOf, colorInfo = C.colorInfo,
    mixColor = C.mixColor, mixResultColor = C.mixResultColor, hasRelic = C.hasRelic, makeCard = C.makeCard,
    cardStrength = C.cardStrength, cardName = C.cardName, evaluateBoard = C.evaluateBoard,
    decideRound = C.decideRound, freeHazardRows = C.freeHazardRows, rowHasHazard = C.rowHasHazard;

var state = null, run = null, els = {}, tileEls = {}, linesGroup, log = [];
var rnd = Math.random;

/* ===================================================================
   MIXING — Free Mix and Mix Chain (GDD §17, §18)
   =================================================================== */
function canMix(board, side, base, other, fissures) {
  var unitA = unitAt(board, side, base.row, base.index), unitB = unitAt(board, side, other.row, other.index);
  if (!unitA || !unitB) return { ok: false, reason: 'Both tiles need a unit.' };
  if (base.row === other.row && base.index === other.index) return { ok: false, reason: 'Pick two different units.' };
  var topology = C.boardTopo(fissures || (run && run.fissures));
  if (!adjacentTilesFor(side, base.row, base.index, topology).some(function (tile) { return tile.row === other.row && tile.index === other.index; })) {
    /* Distinguish the two failures: tiles that never touched, and tiles a
       fissure has since pulled apart. The second needs explaining. */
    var everAdjacent = adjacentTiles(base.row, base.index).some(function (tile) { return tile.row === other.row && tile.index === other.index; });
    return { ok: false, reason: everAdjacent ? 'A fissure runs between those tiles.' : 'Those tiles do not touch.' };
  }
  return { ok: true };
}
function mixOptions(board, side, fissures) {
  var options = [], topology = C.boardTopo(fissures || (run && run.fissures));
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
function applyMix(battleState, side, base, other, extra, isFree) {
  var relics = (side === PLAYER && battleState.relics) ? battleState.relics : [];
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
function drawInto(battleState, side, count, opening) {
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
  if (battleState.drawn && side === PLAYER) battleState.drawn.extra += got;
}

function buildApi(battleState, side, notes) {
  var relics = (side === PLAYER && battleState.relics) ? battleState.relics : [];
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
      if (side2 === PLAYER && hasRelic(relics, 'glass_cannon')) unit.cracked = (unit.cracked || 0) + 1;
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
        if (!battleState.sim && side2 === PLAYER && typeof unit.deckIndex === 'number' && run && run.deck && run.deck[unit.deckIndex]) {
          run.deck[unit.deckIndex] = liftStrength(run.deck[unit.deckIndex], amount);
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
      if (battleState.sim || side2 !== PLAYER || !run || !run.deck) return false;
      var unit = unitAt(battleState.board, side2, tile.row, tile.index);
      if (!unit || typeof unit.deckIndex !== 'number' || !run.deck[unit.deckIndex]) return false;
      var removedIndex = unit.deckIndex;
      run.deck.splice(removedIndex, 1);
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
      if (side2 === PLAYER && hasRelic(relics, 'heavy_brush') && ROW_INFO[to.row].depth === 3) unit.strength += 1;
    },
    recolor: function (side2, tile, color) {
      var unit = unitAt(battleState.board, side2, tile.row, tile.index);
      if (!unit) return;
      var previousColor = unit.color;
      unit.color = color;
      if (side2 === PLAYER && previousColor !== color) {
        if (hasRelic(relics, 'chromatic_memory')) unit.temp = (unit.temp || 0) + Math.ceil((unit.strength + (unit.temp || 0)) / 4);
        if (color === 'black' && hasRelic(relics, 'black_paint')) unit.temp = (unit.temp || 0) + 3;
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
  var all = battleState.fissures || (run && run.fissures) || [];
  var quieted = battleState && battleState.quieted;
  if (!quieted) return all;
  return all.filter(function (fissure) { return !quieted[C.edgeKey(fissure.side, fissure.a, fissure.b)]; });
}
function evalCtx(battleState) {
  return { relics: battleState.relics || [], enemyMod: battleState.enemyMod || {},
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
function fireFriendlyMix(battleState, side, notes) {
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
function doMixCascade(battleState, side, base, other, extra, isFree, notes) {
  var result = applyMix(battleState, side, base, other, extra, isFree);
  if (notes) notes.push((isFree ? 'Free Mix' : 'Mix') + ' \u2192 ' + colorInfo(result.color).name + ' ' + result.strength + ' (chain ' + result.chain + ')');
  fireFriendlyMix(battleState, side, notes);

  var relics = (side === PLAYER && battleState.relics) ? battleState.relics : [];
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

function simGame(sourceState) {
  return { board: C.cloneBoard(sourceState.board), hazards: C.cloneHazards(sourceState.hazards),
    hands: { bottom: sourceState.hands.bottom.slice(), top: sourceState.hands.top.slice() },
    decks: { bottom: sourceState.decks.bottom.slice(), top: sourceState.decks.top.slice() },
    relics: (sourceState.relics || []).slice(), enemyMod: sourceState.enemyMod, spectrumColor: sourceState.spectrumColor,
    fissures: sourceState.fissures || [],
    // cloned: a simulated Cyan play must not quiet the real board
    quieted: sourceState.quieted ? Object.assign({}, sourceState.quieted) : null,
    mixChain: sourceState.mixChain || 0,
    chains: { bottom: (sourceState.chains && sourceState.chains.bottom) || 0, top: (sourceState.chains && sourceState.chains.top) || 0 },
    mixesThisRound: sourceState.mixesThisRound || 0,
    freeMixesThisRound: sourceState.freeMixesThisRound || 0, echoUsedThisRound: sourceState.echoUsedThisRound, sim: true };
}

/* ===================================================================
   REWIND AND BOARD INSTABILITY
   The player never sees a number here. They take back a bad exchange, the
   board quietly writes it down, and some later Rewind is the one that
   finally cracks something. Debt, not currency.
   =================================================================== */
var REWIND = {
  BASE_CHUNK: 5,      // what the very first Rewind costs, at neutral impact
  GROWTH: 1.45,       // per lifetime use — never resets, not even on overflow
  THRESHOLD: 100,     // meter crosses this and the board tears
  MAX_IMPACT: 3       // ceiling on the "how big was that" multiplier
};

/* How much of an exchange was actually taken back. Calibrated so an ordinary
   exchange — one card each way, nothing dying — scores about 1.0, which is the
   figure the growth curve above is tuned against. Taking back a pass costs
   roughly half that; unwinding a mix that killed something and swung the score
   costs two or three times it. Measured in play: mean 1.05, range 0.5 to 2.6. */
function rewindImpact(snap, now, evaluationBefore, evaluationAfter) {
  var impact = 0.5;
  var cardsPlayed = (snap.handCount.bottom - now.hands[PLAYER].length) +
                    (snap.handCount.top - now.hands[ENEMY].length);
  impact += 0.2 * Math.max(0, cardsPlayed);
  if (snap.mixesThisRound !== (now.mixesThisRound || 0)) impact += 0.35;
  var unitsBefore = evaluationBefore.units.bottom + evaluationBefore.units.top;
  var unitsAfter = evaluationAfter.units.bottom + evaluationAfter.units.top;
  if (unitsAfter < unitsBefore) impact += 0.35 * (unitsBefore - unitsAfter);
  var swingBefore = evaluationBefore.totals.bottom - evaluationBefore.totals.top;
  var swingAfter = evaluationAfter.totals.bottom - evaluationAfter.totals.top;
  impact += Math.min(0.9, Math.abs(swingAfter - swingBefore) / 16);
  return Math.min(REWIND.MAX_IMPACT, impact);
}

function rewindChunk(runState, impact) {
  return REWIND.BASE_CHUNK * Math.pow(REWIND.GROWTH, runState.rewindsUsed || 0) * impact;
}

/* Pick a link to cut. Prefer somewhere the player is actually standing — a
   crack under an occupied tile is felt immediately rather than discovered
   three rounds later — but fall back to any intact link. */
/* Prefer a join with a unit on at least one end, so the damage is felt now
   rather than discovered three rounds later. */
function preferLive(links, side, board) {
  if (!board) return links;
  var live = links.filter(function (link) {
    return !!C.unitAt(board, side, link.a.row, link.a.index) || !!C.unitAt(board, side, link.b.row, link.b.index);
  });
  return live.length ? live : links;
}

/* What the board does next with a debt it cannot pay.

   While there is somewhere left to break, it breaks: mostly a sever, and
   roughly a third of the time a bridge instead, so a run's board drifts into
   its own shape rather than one long march of cuts. As the board fills up the
   odds tip toward deepening what is already there, and once nothing is left
   to break, every further debt goes into deepening. That way Rewind never
   becomes free — the board simply stops having new ways to say no and starts
   saying it louder. */
function spawnFissure(side, board) {
  var severableList = C.severableLinks(side, run.fissures);
  var bridgeableList = C.bridgeableLinks(side, run.fissures);
  var room = severableList.length + bridgeableList.length;
  var deepenable = run.fissures.filter(function (fissure) {
    return fissure.side === side && C.fissurePower(fissure) < C.FISSURE_MAX_POWER;
  });

  // near-saturated boards start deepening instead of breaking
  var deepenChance = room === 0 ? 1 : (room <= 3 ? 0.55 : 0.12);
  if (deepenable.length && rnd() < deepenChance) {
    var growCandidates = preferLive(deepenable, side, board);
    var chosen = growCandidates[Math.floor(rnd() * growCandidates.length)];
    chosen.power = C.fissurePower(chosen) + 1;
    return { grew: chosen };
  }
  if (!room) return null;

  var wantBridge = bridgeableList.length && (!severableList.length || rnd() < 0.34);
  var pool = preferLive(wantBridge ? bridgeableList : severableList, side, board);
  var newFissure = pool[Math.floor(rnd() * pool.length)];
  run.fissures.push(newFissure);
  return { born: newFissure };
}

/* Add to the meter and, if it has overflowed, damage the board once.

   Only ever once. The growth curve is exponential, so by the 11th lifetime
   Rewind a single chunk is worth two thresholds and by the 18th it is worth
   twenty-seven — draining the whole meter in a loop meant one late Rewind
   could tear the board apart in a single click. What escalation is meant to
   buy is certainty (every further use costs you something) not volume, so we
   spend one threshold and drop the rest. Dropping rather than carrying also
   stops an unpayable bank building up that would fire on every future use
   regardless of how small that use was. */
function addInstability(amount, side, board) {
  run.instability = (run.instability || 0) + amount;
  if (run.instability < REWIND.THRESHOLD) return [];
  var event = spawnFissure(side, board);
  if (!event) {                                    // nothing left to give
    run.instability = REWIND.THRESHOLD - 1;
    return [];
  }
  run.instability = Math.min(run.instability - REWIND.THRESHOLD, REWIND.THRESHOLD - 1);
  return [event];
}

/* ===================================================================
   TARGETING AND CARD RESOLUTION
   =================================================================== */
function legalTargets(battleState, side, spec, picks, selfTile) {
  var legal = [], topology = C.boardTopo(battleState.fissures || (run && run.fissures));
  function adjacentOf(tile) { return adjacentTilesFor(side, tile.row, tile.index, topology); }
  if (spec.kind === 'friendlyUnit') eachUnit(battleState.board, side, function (unit, row, index) { legal.push({ row: row, index: index }); });
  else if (spec.kind === 'friendlyAdjacentToSelf') {
    if (selfTile) adjacentOf(selfTile).forEach(function (tile) { if (unitAt(battleState.board, side, tile.row, tile.index)) legal.push(tile); });
  } else if (spec.kind === 'friendlyAdjacentTo') {
    var ref = picks[spec.ref];
    if (ref) adjacentOf(ref).forEach(function (tile) { if (unitAt(battleState.board, side, tile.row, tile.index)) legal.push(tile); });
  } else if (spec.kind === 'emptyAdjacentTo') {
    var refTile = picks[spec.ref];
    if (refTile) {
      var movingUnit = unitAt(battleState.board, side, refTile.row, refTile.index), movingStrength = movingUnit ? movingUnit.strength + (movingUnit.temp || 0) : 0;
      adjacentOf(refTile).forEach(function (tile) {
        if (!unitAt(battleState.board, side, tile.row, tile.index) && movingStrength >= ROW_INFO[tile.row].min) legal.push(tile);
      });
    }
  } else if (spec.kind === 'hazard') {
    ['bottom', 'top'].forEach(function (hazardSide) { ROWS.forEach(function (row) { if (battleState.hazards[hazardSide][row]) legal.push({ side: hazardSide, row: row, hazard: battleState.hazards[hazardSide][row] }); }); });
  } else if (spec.kind === 'color') COLOR_KEYS.forEach(function (colorKey) { legal.push({ color: colorKey }); });
  return legal;
}

function autoTargets(battleState, side, card, selfTile) {
  var cardDef = CARDS[card.id];
  if (!cardDef.targets) return [];
  var picks = [];
  for (var specIndex = 0; specIndex < cardDef.targets.length; specIndex++) {
    var spec = cardDef.targets[specIndex], options = legalTargets(battleState, side, spec, picks, selfTile);
    if (/^friendly/.test(spec.kind)) {
      options = options.slice().sort(function (tileA, tileB) {
        var unitA = unitAt(battleState.board, side, tileA.row, tileA.index), unitB = unitAt(battleState.board, side, tileB.row, tileB.index);
        return (unitB.strength + (unitB.temp || 0)) - (unitA.strength + (unitA.temp || 0));
      });
    }
    if (!options.length) return picks;
    picks.push(options[0]);
  }
  return picks;
}

function resolveCard(battleState, side, card, tile, targets) {
  var cardDef = CARDS[card.id], notes = [];
  if (cardDef.type === 'hazard') { battleState.hazards[side][tile.row] = cardDef.hazardKind; notes.push('hazard on ' + ROW_INFO[tile.row].label); return notes; }
  if (cardDef.type === 'unit') {
    var strength = cardStrength(card);
    var relics = (side === PLAYER && battleState.relics) ? battleState.relics : [];
    if (hasRelic(relics, 'heavy_brush') && ROW_INFO[tile.row].depth === 3) strength += 1;
    battleState.board[side][tile.row][tile.index] = { cardId: card.id, color: cardDef.color, strength: strength, temp: 0, up: card.up, cracked: 0, deckIndex: card.deckIndex };
  }
  if (cardDef.onPlay) {
    var note = cardDef.onPlay(battleState, side, tile || { row: null, index: null }, targets || [], buildApi(battleState, side, notes));
    if (note) notes.push(note);
  }
  return notes;
}

/* ===================================================================
   BATTLE STATE
   =================================================================== */
/* Enemy strength per act band. Flat 0 through the opening battles so the
   starting deck has a fair fight, then stepping up as the player's deck grows.
   Retuned once frontlines started falling between rounds: boards are emptier
   and round scores dropped from roughly 24 to roughly 10, so a per-unit bonus
   now weighs about three times what it used to. */
/* The opening fights are a warm-up while the player learns lanes and frontlines.
   Measured: docking every enemy unit a point of strength won those fights 96% of
   the time, which is not easing in, it is a walkover. Holding back two opening
   cards is far gentler — the enemy still plays well, it just has less to play. */
var EASE_IN_BATTLES = 3, EASE_IN_HAND_PENALTY = 2;
function easeInHand(battlesFought) { return battlesFought < EASE_IN_BATTLES ? EASE_IN_HAND_PENALTY : 0; }

/* Reads run-wide power, not act-local depth. The old three-step curve topped
   out at 2 and would have left every act after the first sitting on a flat
   ceiling, so the enemy stopped growing exactly when the player did not. */
function depthBonusFor(power) {
  if (power <= 5) return 0;
  return Math.min(6, 1 + Math.floor((power - 6) / 5));
}

function newBattle(node) {
  var enemyKey = node.enemy, enemy = ENEMIES[enemyKey];
  // The very first battle of a run always opens with the player, so the tutorial
  // lands on their own move rather than after the enemy has already acted.
  var starter = (run.battlesFought === 0) ? PLAYER : (rnd() < 0.5 ? PLAYER : ENEMY);
  var battleState = {
    board: C.emptyBoard(), hazards: C.emptyHazards(),
    decks: { bottom: run.deck.map(function (entry, index) { return makeCard(entry.id, entry.up, index); }), top: C.buildEnemyDeck(enemy, powerAt(run, node.depth), rnd, run.corruption || 0, curseCount(run.deck), ACTS[run.act]) },
    hands: { bottom: [], top: [] },
    relics: run.relics.slice(),
    enemyKey: enemyKey, enemy: enemy,
    enemyMod: Object.assign({}, enemy.mod || {}, { depthBonus: depthBonusFor(powerAt(run, node.depth)) }),
    // the AI reads this to decide how well it is allowed to play
    power: powerAt(run, node.depth),
    // frozen at battle start so a curse drawn mid-fight cannot re-price the boss
    playerCurses: curseCount(run.deck),
    node: node,
    /* By reference: a fissure torn mid-battle is on the board at once, and
       still there next battle. */
    fissures: run.fissures,
    rewindSnap: null, rewindUsedThisRound: false, quieted: null,
    drawn: { extra: 0 },
    mixTokens: { bottom: 1, top: (enemy.mod && enemy.mod.mixTokens) || 1 },
    mixChain: 0, chains: { bottom: 0, top: 0 },
    mixesThisRound: 0, freeMixesThisRound: 0, echoUsedThisRound: false, cascadeDepth: 0,
    wildPaletteUsed: false,
    easeIn: run.battlesFought < EASE_IN_BATTLES,
    round: 1, wins: { bottom: 0, top: 0 },
    turn: starter, roundStarter: starter,
    finalTurn: false, resolving: false, battleOver: false,
    opponentThinking: false,
    mode: 'place', selectedCard: null, mixBase: null, pending: null,
    inspected: null, lastPlaced: null, bestChain: 0
  };
  shuffle(battleState.decks.bottom);
  if (enemy.mod && enemy.mod.rotatingColor) battleState.spectrumColor = COLOR_KEYS[Math.floor(rnd() * COLOR_KEYS.length)];
  /* Meeting something is what puts it in the codex \u2014 the enemy you are about
     to fight, and every card you are carrying into the fight. */
  discoverFoe(enemyKey);
  /* Checked here rather than only at the end of an act: a colour finished at
     the Lab in depth 6 should be remembered the moment it exists, not held
     back until the boss falls. */
  noteActOmens();
  // a marker left over from the last fight is not about this one
  if (window.CV_BATTLE && window.CV_BATTLE.showPassPuck) window.CV_BATTLE.showPassPuck(false);
  run.deck.forEach(function (entry) { discoverCard(entry.id); });
  drawInto(battleState, PLAYER, C.OPENING_HAND + (hasRelic(run.relics, 'open_ledger') ? 2 : 0), true);
  drawInto(battleState, ENEMY, C.OPENING_HAND - easeInHand(run.battlesFought));
  return battleState;
}
function shuffle(list) {
  for (var index = list.length - 1; index > 0; index--) {
    var swapIndex = Math.floor(rnd() * (index + 1));
    var temp = list[index]; list[index] = list[swapIndex]; list[swapIndex] = temp;
  }
  return list;
}

function addLog(msg) {
  log.unshift('R' + (state ? state.round : 0) + ' · ' + msg);
  if (log.length > 90) log.pop();
  if (els.logList) els.logList.innerHTML = log.map(function (entry) { return '<li>' + entry + '</li>'; }).join('');
}
function tileKey(side, row, index) { return side + '-' + row + '-' + index; }

/* ===================================================================
   RUN / MAP  (GDD §25, §38)
   =================================================================== */
var NORMAL_ENEMIES = ['brawler', 'controller', 'cultist', 'alchemist', 'prism'];

/* ===================================================================
   ACTS
   Every act is a colour. Its theme, its road, its elites and its boss all
   belong to that colour, so the ring around a node on the map and the room
   you are standing in tell you the same thing. Reaching an act means holding
   its colour in your deck; the primaries are free because you start with
   them, and everything past them has to come out of the Colour Lab.
   =================================================================== */
var ACTS = {
  green: {
    key: 'green', color: 'green', name: 'The Verdant Path',
    blurb: 'Everything here grows, and none of it grows alone.',
    normals: ['brawler', 'alchemist', 'prism', 'controller'],
    elite: 'bramble_warden', boss: 'verdant_crown'
  },
  red: {
    key: 'red', color: 'red', name: 'The Crimson Cliffs',
    blurb: 'Nothing on this road is interested in a long game.',
    normals: ['brawler', 'cultist', 'prism', 'alchemist'],
    elite: 'ash_marshal', boss: 'cinder_tyrant'
  },
  blue: {
    key: 'blue', color: 'blue', name: 'The Indigo Hollow',
    blurb: 'Everything down here is already three moves ahead of you.',
    normals: ['controller', 'prism', 'alchemist', 'brawler'],
    elite: 'tide_reader', boss: 'drowned_archive'
  },
  yellow: {
    key: 'yellow', color: 'yellow', name: 'The Radiant Grove',
    blurb: 'The light is generous, and it is not on your side.',
    normals: ['brawler', 'alchemist', 'prism', 'cultist'],
    elite: 'gilded_herald', boss: 'hollow_sun'
  },
  magenta: {
    key: 'magenta', color: 'magenta', name: 'The Amethyst Depths',
    blurb: 'Every strike here lands twice, and the second one is worse.',
    normals: ['alchemist', 'controller', 'prism', 'cultist'],
    elite: 'crystal_echo', boss: 'riven_prism'
  },
  cyan: {
    key: 'cyan', color: 'cyan', name: 'The Cerulean Pools',
    blurb: 'Nothing moves here, and nothing you do to it seems to stick.',
    normals: ['controller', 'prism', 'brawler', 'alchemist'],
    elite: 'still_warden', boss: 'glass_tide'
  },
  black: {
    key: 'black', color: 'black', name: 'The Ashen Wastelands',
    blurb: 'Every colour you ever made ends up here, drained.',
    normals: ['cultist', 'prism', 'alchemist', 'controller'],
    /* The last road is the only one that fields two different elites, so the
       two orphaned designs both get a home and the run's final act is the one
       place you cannot predict which elite is waiting. */
    elite: ['chromatic_knight', 'the_mixer'], boss: 'spectrum'
  },
  /* ---- secret ----
     White is not on the wheel and cannot be mixed: in a subtractive system
     there is no recipe for it. It is reached by having walked everything
     else, which makes it a coverage prize rather than an accumulation one —
     the only road you earn by breadth instead of by depth. Kept out of
     ACT_KEYS so it never appears in an ordinary fork, never counts toward a
     full clear, and never shows up in the roads glossary until it is met. */
  white: {
    key: 'white', color: 'white', name: 'The Unbroken Light', secret: true,
    blurb: 'Everything you drained away is still here, and it remembers.',
    normals: ['prism', 'alchemist', 'controller', 'brawler'],
    elite: ['chromatic_knight', 'the_mixer'], boss: 'unbroken_light'
  },
  /* Two more roads that are not on the wheel. Where White is earned by
     breadth, these are earned by what a run did to itself: the rot it
     accumulated, and the ground it broke. Neither is a colour, so neither can
     be mixed toward — you qualify by having lived a certain way. */
  rot: {
    key: 'rot', color: 'black', name: 'The Rotting Choir', secret: true,
    blurb: 'Everything you were given and could not put down is singing here.',
    normals: ['cultist', 'alchemist', 'prism', 'controller'],
    elite: ['ash_marshal', 'crystal_echo'], boss: 'the_chorus_eternal',
    /* Every enemy on this road plays the curse game, so the tech roll is
       forced rather than chanced and the decks are seeded with rot. */
    alwaysCurses: true
  },
  rift: {
    key: 'rift', color: 'cyan', name: 'The Sundered Ground', secret: true,
    blurb: 'The ground here was broken long before you arrived, and it is still going.',
    normals: ['controller', 'brawler', 'prism', 'cultist'],
    elite: ['tide_reader', 'bramble_warden'], boss: 'the_long_crack',
    /* The enemy's half is broken too — the only road where it is. */
    alwaysFissures: true
  }
};
/* Every act is built. Secret acts (the Dimensional Drift ending) are not
   listed here — they are not reached through the colour gate. */
var ACT_PLANNED = {};

/* An act may name one elite or several; a map picks per node. */
function eliteFor(act, rnd) {
  var elite = act.elite;
  if (!Array.isArray(elite)) return elite;
  return elite[Math.floor(rnd() * elite.length)];
}
function elitesOf(act) { return Array.isArray(act.elite) ? act.elite : [act.elite]; }
/* ACT_KEYS is the seven roads of the wheel. Secret acts are deliberately
   excluded: every gate, fork, glossary count and full-clear check reads this
   list, so leaving White out of it means none of them need to know it
   exists. */
var ACT_KEYS = Object.keys(ACTS).filter(function (key) { return !ACTS[key].secret; });
var SECRET_ACT_KEYS = Object.keys(ACTS).filter(function (key) { return ACTS[key].secret; });
var ACT_LENGTH = 13;          // nodes per act; every act is the same length

/* Which acts you could walk into next: built, unlocked by your deck, and not
   already behind you — unless the run has gone endless, in which case a
   cleared act is a road again rather than a dead end. The colour gate still
   applies either way; endless removes the "already visited" exclusion, not
   the requirement that earned the visit in the first place. */
function eligibleActs(runState) {
  return ACT_KEYS.filter(function (key) {
    if (!runState.endless && runState.actsCleared.indexOf(key) !== -1) return false;
    return C.actUnlocked(ACTS[key].color, runState.deck);
  });
}
/* Every act has been beaten at least once — the condition for the run being
   truly finished, as opposed to merely stuck because some colours were never
   made. Checked against the distinct set, since actsCleared accumulates a
   duplicate entry on every loop once a run goes endless. */
function allActsConquered(runState) {
  return ACT_KEYS.every(function (key) { return runState.actsCleared.indexOf(key) !== -1; });
}
/* A run-wide difficulty level. Cleared acts carry their full length forward,
   so an act-two opener is harder than an act-one finale rather than resetting
   the curve every time the road changes colour. */
function powerAt(runState, depth) {
  return (runState.actsCleared ? runState.actsCleared.length : 0) * ACT_LENGTH + depth;
}

/* Map generation walks paths down a fixed three-column grid, one column step
   at a time, refusing moves that would cross an edge already laid in that row.
   The previous version mapped row indices onto "centre" columns across rows of
   differing widths, which produced long crossing links — a rightmost node whose
   only exit ran to the far left. Paths keep the flow readable and local. */
var MAP_COLS = 3, MAP_PATHS = 6;

function buildMap(actKey, isFirstAct) {
  var act = ACTS[actKey] || ACTS.green;
  /* The first act opens with three unavoidable single-file battles. That
     teaches the core loop before the map branches, and it spends the warm-up
     handicap on exactly those three fights rather than letting it leak deeper
     into the run when a player takes shops and events early.

     Only the first act. By act two the player knows how to play, and a
     compulsory three-battle corridor at the top of every road is just a toll
     — it delays the point where the act starts being a set of choices. Later
     acts branch from the second node.

     Depth 6 is a solid row of Labs, not a battle-or-lab roll. With rewards
     restricted to colours you already hold, the Lab is the only place a new
     colour can be made, and a map that can hide every Lab behind an unchosen
     branch is a map that can strand a run in the primaries forever. One
     guaranteed bench per act is the floor that makes the colour gate a
     decision instead of a dice roll. */
  var PLAN = isFirstAct
    ? [['battle'], ['battle'], ['battle'], ['battle', 'lab'], ['battle', 'event'],
       ['battle', 'shop'], ['lab'], ['battle', 'event'], ['elite', 'battle'],
       ['battle', 'shop'], ['battle', 'lab'], ['battle', 'event'], ['boss']]
    : [['battle'], ['battle', 'event'], ['battle', 'lab'], ['battle', 'shop'],
       ['battle', 'event'], ['battle', 'shop'], ['lab'], ['battle', 'event'], ['elite', 'battle'],
       ['battle', 'shop'], ['battle', 'lab'], ['battle', 'event'], ['boss']];
  var depth = PLAN.length;
  /* FORCED pins a depth to the middle column, which is what actually makes a
     row single-file — the PLAN only decides what sits there. So the opening
     corridor lives here, not in the plan, and dropping depths 1 and 2 is what
     lets a later act fork immediately. Depth 0 always stays pinned: an act
     needs exactly one way in. The boss stays centred so every route meets it.

     The elite at depth 8 is deliberately NOT pinned any more. It used to be
     — PLAN offered only 'elite' there and FORCED collapsed it to one column,
     so every single road crossed it with no alternative at all. A relic is
     worth wanting, but a fight nobody could decline is a tax, not a choice.
     Letting the row branch like any other optional node means a battle sits
     beside it wherever the walk allows, and a player can route around the
     elite the same way they already route around a shop or an event. */
  var FORCED = isFirstAct
    ? { 0: 1, 1: 1, 2: 1, 12: 1 }
    : { 0: 1, 12: 1 };

  var visited = {}, edgeSeen = {}, edgeList = [];
  for (var pathIndex = 0; pathIndex < MAP_PATHS; pathIndex++) {
    var pathCol = FORCED[0];
    visited['0:' + pathCol] = true;
    for (var pathRow = 0; pathRow < depth - 1; pathRow++) {
      var nextCol;
      if (FORCED[pathRow + 1] !== undefined) nextCol = FORCED[pathRow + 1];
      else {
        var candidates = [pathCol - 1, pathCol, pathCol + 1].filter(function (candidateCol) { return candidateCol >= 0 && candidateCol < MAP_COLS; });
        candidates = candidates.filter(function (candidateCol) {
          return candidateCol === pathCol || !edgeSeen[pathRow + ':' + candidateCol + '>' + pathCol];   // no crossing
        });
        nextCol = candidates[Math.floor(rnd() * candidates.length)];
      }
      var key = pathRow + ':' + pathCol + '>' + nextCol;
      if (!edgeSeen[key]) { edgeSeen[key] = true; edgeList.push({ row: pathRow, from: pathCol, to: nextCol }); }
      visited[(pathRow + 1) + ':' + nextCol] = true;
      pathCol = nextCol;
    }
  }

  var rows = [], cols = [];
  for (var rowIndex = 0; rowIndex < depth; rowIndex++) {
    var present = [];
    for (var col = 0; col < MAP_COLS; col++) if (visited[rowIndex + ':' + col]) present.push(col);
    cols.push(present);
    rows.push(present.map(function (colIndex) {
      var type = PLAN[rowIndex][Math.floor(rnd() * PLAN[rowIndex].length)];
      var node = { depth: rowIndex, col: colIndex, type: type, next: [], done: false };
      if (type === 'battle') node.enemy = act.normals[Math.floor(rnd() * act.normals.length)];
      if (type === 'elite') node.enemy = eliteFor(act, rnd);
      if (type === 'boss') node.enemy = act.boss;
      return node;
    }));
  }
  edgeList.forEach(function (edge) {
    var fromIdx = cols[edge.row].indexOf(edge.from), toIdx = cols[edge.row + 1].indexOf(edge.to);
    if (fromIdx === -1 || toIdx === -1) return;
    if (rows[edge.row][fromIdx].next.indexOf(toIdx) === -1) rows[edge.row][fromIdx].next.push(toIdx);
  });
  carveVolatileBranch(rows, act);
  ensureEliteIsSkippable(rows, act, rnd);
  return rows;
}

/* Depth 8 is where PLAN puts the road's one ordinary elite, offered beside a
   battle so it is optional rather than a toll every road pays. Left to the
   same random walks that shape the rest of the map, that promise did not
   reliably hold: measured across 200 generated maps, only 84% even rolled an
   elite there at all, and a battle alternative was reachable from EVERY
   upstream node in just 39% — the rest left at least one entry funnelled
   into the elite with no other option, exactly the toll the option was
   meant to remove.

   Runs AFTER the volatile branch is carved, not before: when the volatile
   lab lands at depth 9, its gate sits at depth 8 — the same row — and the
   first version of this ran first, so its battle column was simply
   overwritten back to 'elite' the moment the gate claimed that node.
   `.dangerous` marks that node and it is never touched here: the gate's
   "one way in, and it commits you" is a design choice this function has to
   respect, not undo. Every other change is additive — an edge is added, or
   a non-gate node's type is flipped — nothing already reachable is removed. */
var ELITE_ROW = 8;
/* The random walk that draws the main road already refuses an edge that
   would cross one already drawn (`edgeSeen[...]`, "no crossing" above).
   Every edge added AFTER that walk — patching a gate's orphaned sibling back
   in, or guaranteeing a way to skip an elite — went in blind, picking
   whichever column was first or random with no idea whether the line it
   drew would cut straight through a neighbour's. Measured: the elite-skip
   patch alone produced 385 crossings across 500 generated maps, the worst
   of any transition by a wide margin.

   Two lines (fromCol1\u2192toCol1) and (fromCol2\u2192toCol2) cross exactly when
   their column order flips between the two rows — one starts left of the
   other but ends right of it. `pickNonCrossing` reuses that test against
   every edge already committed at this transition, in physical column terms
   (`.col`), which is what actually decides where a line lands on screen —
   a row's array index is not that, once earlier columns have dropped out of
   a narrower row. */
function edgesAtTransition(rows, rowIndex) {
  var edges = [];
  rows[rowIndex].forEach(function (node) {
    (node.next || []).forEach(function (nextIndex) {
      var toNode = rows[rowIndex + 1][nextIndex];
      if (toNode) edges.push({ colA: node.col, colB: toNode.col });
    });
  });
  return edges;
}
function pickNonCrossing(fromCol, candidates, existing, rnd) {
  /* Ranked by how many crossings each candidate actually introduces, not a
     binary clean-or-not split, so a caller that must pick something no
     matter what still gets the least-bad option rather than a coin flip
     among all of them, some of which cross far more than others.

     Returns the choice AND its score rather than deciding for the caller:
     the elite-skip patch would rather leave one entry point without the
     skip option than draw a visible crossing, while the orphan-reroute
     patch cannot do that — the node it is fixing just lost its only edge,
     and leaving it with none at all is a dead end, a strictly worse bug
     than a crossing line. Same ranking, two different tolerances for it. */
  var scored = candidates.map(function (toCol) {
    var hits = existing.filter(function (edge) {
      return (fromCol < edge.colA && toCol > edge.colB) || (fromCol > edge.colA && toCol < edge.colB);
    }).length;
    return { toCol: toCol, hits: hits };
  });
  var best = Math.min.apply(null, scored.map(function (candidate) { return candidate.hits; }));
  var pool = scored.filter(function (candidate) { return candidate.hits === best; }).map(function (candidate) { return candidate.toCol; });
  return { toCol: pool[Math.floor(rnd() * pool.length)], hits: best };
}
function ensureEliteIsSkippable(rows, act, rnd) {
  var eliteRow = rows[ELITE_ROW], prevRow = rows[ELITE_ROW - 1];

  /* A choice needs two columns to choose between. With exactly one, whatever
     the random roll gave it is unavoidable no matter what runs here, so the
     two goals below fight over the same single slot: "guarantee an elite"
     steals the lone column into eliteCols, then "guarantee a battle" sees
     battleCols now empty and converts that very same column straight back —
     forever flipping one node between the two types it cannot simultaneously
     be. Leaving it alone is correct: a road that rolled a single column here
     was always going to be a toll, same as it would have been before any of
     this ran, and that is a pre-existing property of a narrow map, not
     something this function owes a fix for. */
  if (!eliteRow || !prevRow || eliteRow.length < 2 || !prevRow.length) return;

  var eliteCols = [], battleCols = [], lockedCols = [];
  eliteRow.forEach(function (node, index) {
    if (node.dangerous) lockedCols.push(index);
    (node.type === 'elite' ? eliteCols : battleCols).push(index);
  });

  // the elite vanished by chance — give the road one back
  if (!eliteCols.length) {
    var toElite = Math.floor(rnd() * eliteRow.length);
    eliteRow[toElite].type = 'elite';
    eliteRow[toElite].enemy = eliteFor(act, rnd);
    eliteCols.push(toElite);
    var battleIdx = battleCols.indexOf(toElite);
    if (battleIdx !== -1) battleCols.splice(battleIdx, 1);
  }
  // no alternative rolled at all — the same fix, in the other direction,
  // but the gate (if this row holds one) is never a candidate to convert
  if (!battleCols.length) {
    var toBattle = eliteRow.findIndex(function (node, index) {
      return eliteCols.indexOf(index) !== -1 && lockedCols.indexOf(index) === -1;
    });
    // every elite column here is the volatile gate itself — vanishingly rare,
    // and there is nothing left to safely flip without breaking that gate
    if (toBattle !== -1) {
      eliteRow[toBattle].type = 'battle';
      eliteRow[toBattle].enemy = act.normals[Math.floor(rnd() * act.normals.length)];
      battleCols.push(toBattle);
      eliteCols.splice(eliteCols.indexOf(toBattle), 1);
    }
  }
  if (!battleCols.length) return;   // the rare case above: nothing more to guarantee

  /* The part that was actually missing: wherever a node upstream cannot
     already reach a battle column, add the edge. Skipping the elite has to
     work from anywhere the player could be standing, not just from whichever
     branch happened to roll one. Tracked and updated as each edge is added,
     same as the original walk does, so the second patched-in line already
     knows about the first rather than only ever checking against the map's
     original edges. */
  var committed = edgesAtTransition(rows, ELITE_ROW - 1);
  prevRow.forEach(function (parent) {
    var reachesBattle = parent.next.some(function (nextIndex) { return battleCols.indexOf(nextIndex) !== -1; });
    if (reachesBattle) return;
    var battleTargetCols = battleCols.map(function (nextIndex) { return eliteRow[nextIndex].col; });
    var skipPick = pickNonCrossing(parent.col, battleTargetCols, committed, rnd);
    /* No crossing-free route exists for this one entry — usually because a
       single battle column is the only target on offer at all. A visible
       crossing on the map is worse than this specific approach not carrying
       the skip option; every other entry still gets it. */
    if (skipPick.hits > 0) return;
    var chosenIdx = battleCols[battleTargetCols.indexOf(skipPick.toCol)];
    parent.next.push(chosenIdx);
    committed.push({ colA: parent.col, colB: skipPick.toCol });
  });
}

/* Exactly one Volatile Lab per act, and it is never on the safe road. The way in
   is a single gate that commits you, the way out is obscured, and both ends lean
   toward elites. The player can see the branch is bad news without seeing what is
   on it — which is the whole decision. */
function carveVolatileBranch(rows, act) {
  act = act || ACTS.green;
  /* Prefer a mid-act row that actually branches, so the lab reads as a detour.
     If none of the candidates branch, take the widest available rather than
     skipping the lab entirely — every act must carry exactly one. */
  /* The volatile branch rewrites three rows, not one: the row it sits on, the
     row above it (which becomes the single gate leading in) and the row below
     it (the obscured way out). So the guaranteed Lab at depth 6 rules out
     depths 5, 6 and 7 as candidates, not just 6 — a branch at 7 would retype
     a Lab into the gate elite, and a branch at 5 would swallow it on the exit.
     Both were happening before this list was narrowed. */
  var CANDIDATES = [4, 9, 10, 3];
  var branchDepth = -1, candidateIndex;
  for (candidateIndex = 0; candidateIndex < CANDIDATES.length; candidateIndex++) {
    var wideDepth = CANDIDATES[candidateIndex];
    if (rows[wideDepth] && rows[wideDepth].length >= 2) { branchDepth = wideDepth; break; }
  }
  if (branchDepth === -1) {
    for (candidateIndex = 0; candidateIndex < CANDIDATES.length; candidateIndex++) {
      var anyDepth = CANDIDATES[candidateIndex];
      if (rows[anyDepth] && rows[anyDepth].length >= 1) { branchDepth = anyDepth; break; }
    }
  }
  if (branchDepth === -1 || !rows[branchDepth - 1]) return;

  // prefer an edge column so the branch reads as a detour
  var candidates = rows[branchDepth].map(function (node, index) { return { node: node, index: index }; })
    .sort(function (candidateA, candidateB) { return Math.abs(candidateB.node.col - 1) - Math.abs(candidateA.node.col - 1); });
  var pick = candidates[0];
  var volatileNode = pick.node;
  volatileNode.type = 'volatile'; volatileNode.enemy = null; volatileNode.hidden = false;

  // one gate leads in, and it leads nowhere else
  var gates = [];
  rows[branchDepth - 1].forEach(function (parent, parentIndex) {
    if (parent.next.indexOf(pick.index) !== -1) gates.push({ parent: parent, parentIndex: parentIndex });
  });
  if (!gates.length) return;
  var gate = gates[Math.floor(rnd() * gates.length)];

  /* Reachability check, computed from the untouched graph before anything
     below is mutated. "One gate leads in, and it leads nowhere else" set
     gate.p.next = [pick.i] unconditionally, discarding every other column
     the gate used to reach. That is fine whenever those siblings have a
     second parent elsewhere in row D-1 — but the elite corridor immediately
     before a Lab row is FORCED to a single column, so that one node is the
     ONLY possible parent for every column in row D. Wiping its other edges
     there did not just remove a redundant path, it deleted the last one:
     every sibling column silently lost all access to the rest of the act.
     A column only keeps its forced membership here if truly nothing else in
     row D-1 already reaches it. */
  var reachableWithoutGate = {};
  rows[branchDepth - 1].forEach(function (parent) {
    if (parent === gate.parent) return;
    (parent.next || []).forEach(function (nextIndex) { reachableWithoutGate[nextIndex] = true; });
  });
  var mustKeep = (gate.parent.next || []).filter(function (nextIndex) {
    return nextIndex !== pick.index && !reachableWithoutGate[nextIndex];
  });

  gates.forEach(function (otherGate) {
    if (otherGate === gate) return;
    otherGate.parent.next = otherGate.parent.next.filter(function (nextIndex) { return nextIndex !== pick.index; });
    if (!otherGate.parent.next.length) {
      /* Re-pointing it back at the lab would quietly open a second way in.
         Send it to any other node in that row instead — but "any" used to
         mean "the first one found scanning from column 0", regardless of
         whether the resulting line cut through a neighbour's. Route it the
         same crossing-aware way the elite-skip patch does. */
      var otherCols = [];
      for (var colIndex = 0; colIndex < rows[branchDepth].length; colIndex++) if (colIndex !== pick.index) otherCols.push(rows[branchDepth][colIndex].col);
      if (otherCols.length) {
        var committedHere = edgesAtTransition(rows, branchDepth - 1);
        /* Always takes the ranked choice, imperfect or not: this node just
           had its only edge stripped, and leaving it with none at all is a
           dead end, a strictly worse bug than a crossing line. */
        otherGate.parent.next.push(rows[branchDepth].findIndex(function (node) {
          return node.col === pickNonCrossing(otherGate.parent.col, otherCols, committedHere, rnd).toCol;
        }));
      }
      if (!otherGate.parent.next.length) otherGate.parent.next.push(pick.index);      // row has nothing else
    }
  });
  gate.parent.next = mustKeep.concat([pick.index]);
  gate.parent.type = 'elite';
  gate.parent.enemy = eliteFor(act, rnd);
  gate.parent.hidden = true;
  gate.parent.dangerous = true;

  // the road out is obscured too, and may hold another elite
  volatileNode.next.forEach(function (nextIndex) {
    var after = rows[branchDepth + 1] && rows[branchDepth + 1][nextIndex];
    if (!after || after.type === 'boss') return;
    /* The guaranteed Lab is off limits on the way out as well as on the way
       in. When the branch sits at row 5 its exit lands straight on row 6, and
       re-typing that node to an elite quietly ate the one bench the act
       promises — the same deadlock, entered through the back door. */
    if (after.type === 'lab') return;
    after.hidden = true;
    after.dangerous = true;
    if (rnd() < 0.5 && after.type !== 'elite') {
      after.type = 'elite';
      after.enemy = eliteFor(act, rnd);
    }
    // keep the safe road clean: strip this successor from non-volatile parents
    rows[branchDepth].forEach(function (other, otherIndex) {
      if (otherIndex === pick.index) return;
      if (other.next.length > 1) other.next = other.next.filter(function (existingNext) { return existingNext !== nextIndex; });
    });
  });
}

function startingDeck() {
  // GDD §23 starting deck, expressed in the current card pool
  var d = [];
  ['red_brute', 'red_brute', 'red_scout', 'blue_scout', 'blue_current', 'blue_controller',
   'green_seed', 'green_gardener', 'green_colony', 'colorless_row'].forEach(function (id) { d.push({ id: id, up: false }); });
  return d;
}

function newRun() {
  tutorial.seen = {};      // lessons fire again for a fresh run
  tutorial.list = null;
  /* The first act is rolled, not chosen. You start holding all three
     primaries, so there is nothing to decide yet — the choosing begins once
     the deck you have built starts opening and closing roads. */
  var built = C.PRIMARY_COLORS.filter(function (k) { return !!ACTS[k]; });
  var first = built[Math.floor(rnd() * built.length)] || ACT_KEYS[0];
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

/* ===================================================================
   SAVE
   The run is saved at every point where it is standing still — a map, a
   shop, a fork in the road — and never mid-battle. A battle is a single
   sitting: quit in the middle of one and you come back to the map with that
   node still unspent, which costs you the fight but never the run. Saving a
   half-resolved board would mean serialising a live battle state that holds
   references into the map and the fissure list, and getting that subtly wrong
   corrupts a run in ways that only show up hours later.
   =================================================================== */
var SAVE_KEY = 'colorvibes.run.v1';
var CODEX_KEY = 'colorvibes.codex.v1';

/* ---- the codex ----
   What the player has actually met. Kept separate from the run save on
   purpose: a run ends, is abandoned, or is wiped, and none of that should
   erase what you learned. It survives across runs, which is what makes the
   glossary worth opening on a fresh start. */
var codex = { cards: {}, foes: {} };
function loadCodex() {
  try {
    var raw = window.localStorage.getItem(CODEX_KEY);
    if (!raw) return;
    var d = JSON.parse(raw);
    if (d && d.cards && d.foes) codex = d;
  } catch (e) { /* no storage, no codex — the game still plays */ }
}
function saveCodex() {
  try { window.localStorage.setItem(CODEX_KEY, JSON.stringify(codex)); } catch (e) {}
}
function discoverCard(id) {
  if (!id || codex.cards[id]) return;
  var d = CARDS[id];
  if (!d || d.fused || d.reforged) return;   // minted cards are not codex entries
  codex.cards[id] = 1; saveCodex();
}
function discoverFoe(key) {
  if (!key || codex.foes[key]) return;
  codex.foes[key] = 1; saveCodex();
}
function codexCounts() {
  var totalCards = C.DRAWABLE.length + C.BOSS_CARDS.length + C.CURSE_KEYS.length;
  var foeKeys = Object.keys(ENEMIES);
  return {
    cards: Object.keys(codex.cards).length, cardsTotal: totalCards,
    foes: Object.keys(codex.foes).length, foesTotal: foeKeys.length
  };
}

/* While the title is up, the run behind it is only scaffolding \u2014 something
   for the interface to render against. Writing it out would create a save on
   a fresh install, which made Continue appear before the player had played
   anything and forced New run to ask for a confirmation it had no business
   asking for. */
var saveSuppressed = false;
function suppressSave(on) { saveSuppressed = !!on; }

function saveRun() {
  if (saveSuppressed) return;
  if (!run || run.screen === 'battle') return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, run: run }));
  } catch (e) { /* private mode, quota, no storage — the run just won't persist */ }
}
function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (e) {}
}
function hasSave() {
  try { return !!window.localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
/* Returns a run or null. Anything unexpected returns null rather than
   throwing: a save from an older build must never be able to brick the game,
   so every failure path ends in a fresh run instead of a blank screen. */
function loadRun() {
  var raw;
  try { raw = window.localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  try {
    var data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.run) return null;
    var r = data.run;
    if (!r.map || !r.map.length || !Array.isArray(r.deck) || !ACTS[r.act]) return null;
    replayMints(r.minted);
    // every card the deck points at must actually exist after the replay
    var ok = r.deck.every(function (e) { return !!CARDS[e.id]; });
    if (!ok) return null;
    r.actsCleared = r.actsCleared || [];
    r.minted = r.minted || [];
    if (r.screen === 'battle') r.screen = 'map';   // battles are never resumed
    return r;
  } catch (e) { return null; }
}

/* ---- glossary ----
   Only what you have met. A locked entry still shows a silhouette \u2014 the
   rarity and, for a card, its colour \u2014 because "there is something here you
   have not seen" is information worth having, while the name and text are the
   part you earn. */
var glossaryTab = 'cards';

function glCardEntry(id) {
  var d = CARDS[id], known = !!codex.cards[id];
  var col = d.color ? COLORS[d.color] : { hex: '#6f6a60', ink: '#12100d' };
  var swatch = '<span class="gl-swatch" style="background:' + col.hex + ';color:' + col.ink + '">' +
    (known ? (d.type === 'unit' ? d.strength : '\u2726') : '?') + '</span>';
  if (!known) {
    return '<div class="gl-entry gl-locked">' + swatch +
      '<div class="gl-main"><span class="gl-name">Not yet met</span>' +
      '<span class="gl-meta">' + d.rarity + '</span>' +
      '<div class="gl-text">Find it on the road and it will be recorded here.</div></div></div>';
  }
  return '<div class="gl-entry">' + swatch +
    '<div class="gl-main"><span class="gl-name">' + d.name + '</span>' +
    '<span class="gl-meta">' + d.rarity + (d.bossOnly ? ' \u00b7 boss drop' : '') + '</span>' +
    '<div class="gl-text">' + (d.text || 'No special rule \u2014 just a body.') + '</div>' +
    C.iconRow(id) + '</div></div>';
}

function glFoeEntry(key) {
  var e = ENEMIES[key], known = !!codex.foes[key];
  var lead = e.colors && e.colors[0] ? COLORS[e.colors[0]] : { hex: '#6f6a60', ink: '#12100d' };
  var mark = e.kind === 'boss' ? '\u2726' : e.kind === 'elite' ? '\u2605' : '\u25cf';
  var swatch = '<span class="gl-swatch" style="background:' + lead.hex + ';color:' + lead.ink + '">' +
    (known ? mark : '?') + '</span>';
  if (!known) {
    return '<div class="gl-entry gl-locked">' + swatch +
      '<div class="gl-main"><span class="gl-name">Not yet met</span>' +
      '<span class="gl-meta">' + e.kind + '</span>' +
      '<div class="gl-text">Something on a road you have not walked.</div></div></div>';
  }
  var rules = C.enemyIcons(key);
  return '<div class="gl-entry">' + swatch +
    '<div class="gl-main"><span class="gl-name">' + e.name + '</span>' +
    '<span class="gl-meta">' + e.kind + '</span>' +
    '<div class="gl-text">' + e.behaviour + '</div>' +
    (rules.length ? C.enemyIconRow(key) : '') + '</div></div>';
}

function renderGlossary() {
  var body = document.getElementById('glossaryBody');
  if (!body) return;
  var n = codexCounts(), html = '';

  if (glossaryTab === 'cards') {
    html += '<p class="gl-note">' + n.cards + ' of ' + n.cardsTotal +
      ' cards recorded. Cards enter the codex when you are offered one, ' +
      'or when you carry one into a fight.</p>';
    var groups = {};
    C.DRAWABLE.concat(C.BOSS_CARDS).concat(C.CURSE_KEYS).forEach(function (k) {
      var d = CARDS[k];
      var g = d.curse ? 'Curses' : d.bossOnly ? 'Boss drops'
            : d.color ? COLORS[d.color].name : 'Colourless';
      (groups[g] = groups[g] || []).push(k);
    });
    var order = ['Red', 'Green', 'Blue', 'Yellow', 'Cyan', 'Magenta', 'Black',
                 'Colourless', 'Boss drops', 'Curses'];
    order.forEach(function (g) {
      if (!groups[g]) return;
      var seen = groups[g].filter(function (k) { return codex.cards[k]; }).length;
      html += '<div class="gl-group"><span class="lbl">' + g +
        ' \u00b7 ' + seen + '/' + groups[g].length + '</span>' +
        groups[g].map(glCardEntry).join('') + '</div>';
    });
  } else if (glossaryTab === 'foes') {
    html += '<p class="gl-note">' + n.foes + ' of ' + n.foesTotal +
      ' recorded. Every act has its own elite and boss, and each boss plays by ' +
      'a rule of its own \u2014 learning them is how you choose which roads to open.</p>';
    var byKind = { boss: [], elite: [], normal: [] };
    Object.keys(ENEMIES).forEach(function (k) { byKind[ENEMIES[k].kind].push(k); });
    [['boss', 'Act bosses'], ['elite', 'Elites'], ['normal', 'Common foes']].forEach(function (pair) {
      var list = byKind[pair[0]];
      if (!list.length) return;
      var seen = list.filter(function (k) { return codex.foes[k]; }).length;
      html += '<div class="gl-group"><span class="lbl">' + pair[1] +
        ' \u00b7 ' + seen + '/' + list.length + '</span>' +
        list.map(glFoeEntry).join('') + '</div>';
    });
  } else if (glossaryTab === 'roads') {
    var omens = codex.omens || {};
    var found = ACT_KEYS.filter(function (k) { return omens[k]; }).length;
    html += '<p class="gl-note">' + found + ' of ' + ACT_KEYS.length +
      ' roads have opened for you. Each one wrote itself down the first time ' +
      'it became reachable \u2014 what it says is what you noticed, not how it works.</p>';
    html += '<div class="gl-group">' + ACT_KEYS.map(function (k) {
      var act = ACTS[k], col = COLORS[act.color];
      var swatch = '<span class="gl-swatch" style="background:' + col.hex + ';color:' + col.ink +
        '">' + (omens[k] ? '\u2726' : '?') + '</span>';
      if (!omens[k]) {
        return '<div class="gl-entry gl-locked">' + swatch +
          '<div class="gl-main"><span class="gl-name">A road you have not opened</span>' +
          '<div class="gl-text">Something has to change in your deck before this one will exist.</div>' +
          '</div></div>';
      }
      return '<div class="gl-entry">' + swatch +
        '<div class="gl-main"><span class="gl-name">' + act.name + '</span>' +
        '<div class="gl-text">' + ACT_OMENS[k] + '</div></div></div>';
    }).join('') + '</div>';
  } else {
    html += '<p class="gl-note">Every icon in the game, and what it means. ' +
      'These are always readable \u2014 nothing here has to be discovered.</p>';
    var ICON_TEXT = [
      ['boss', 'Act boss. Beat it to end the act and choose your next road.'],
      ['elite', 'Elite. Tougher than a normal fight, and always drops a relic.'],
      ['growth', 'Overgrowth \u2014 its surviving units come back permanently stronger each round.'],
      ['support', 'Scorched Line \u2014 your units behind the front count for half.'],
      ['echoLane', 'Undertow \u2014 it takes half of your strongest lane for its own frontline there.'],
      ['tax', 'Exposure \u2014 whichever colour you field most is taxed per unit.'],
      ['echoMix', 'Refraction \u2014 every mix you land feeds its strongest unit.'],
      ['ward', 'Still Water \u2014 your matchup bonus is cancelled in the lanes it is weakest in.'],
      ['devour', 'It devours your weakest unit at the start of each round.'],
      ['rotate', 'Each round it becomes a colour at random, and grows in that colour.'],
      ['mixtoken', 'It mixes more than once a round.'],
      ['plus', 'A bonus to strength.'],
      ['minus', 'A penalty to strength.'],
      ['draw', 'Draws cards.'],
      ['mix', 'Mixing, or a fused card.'],
      ['freemix', 'A mix that costs no token.'],
      ['chain', 'Cares about your mix chain.'],
      ['aura', 'Affects the units touching it.'],
      ['row', 'Affects a whole row.'],
      ['lane', 'Affects a lane.'],
      ['front', 'Cares about holding a frontline.'],
      ['touch', 'Something adjacent.'],
      ['enemy', 'Targets the enemy.'],
      ['friendly', 'Targets your own side.'],
      ['shield', 'Protection.'],
      ['cleanse', 'Removes a hazard.'],
      ['hazard', 'Places a hazard.'],
      ['destroy', 'Destroys a unit.'],
      ['create', 'Creates a unit.'],
      ['move', 'Moves a unit.'],
      ['palette', 'Changes colour.'],
      ['colourless', 'Strips colour.'],
      ['stack', 'Happens every round.'],
      ['block', 'Blocks a tile.'],
      ['x2', 'Doubles something.']
    ];
    html += '<div class="gl-group">' + ICON_TEXT.map(function (p2) {
      return '<div class="gl-icon">' + C.glyphSvg(p2[0]) +
        '<span class="gl-text">' + p2[1] + '</span></div>';
    }).join('') + '</div>';
  }
  body.innerHTML = html;
}

function openGlossary() {
  var g = document.getElementById('glossary');
  if (!g) return;
  renderGlossary();
  g.hidden = false;
}
function closeGlossary() {
  var g = document.getElementById('glossary');
  if (g) g.hidden = true;
}
function setGlossaryTab(t) {
  glossaryTab = t;
  Array.prototype.forEach.call(document.querySelectorAll('.gl-tab'), function (b) {
    b.classList.toggle('on', b.getAttribute('data-tab') === t);
  });
  renderGlossary();
}

function nodeAt(depth, col) { return run.map[depth] && run.map[depth][col]; }
function currentNodes() {
  if (run.depth === 0) return run.map[0].map(function (n, i) { return i; });
  return run.available;
}

/* ===================================================================
   SCREENS
   =================================================================== */
function show(screen) {
  run.screen = screen;
  // the battle screen is locked to one viewport; everything else scrolls normally
  document.body.classList.toggle('battle-mode', screen === 'battle');
  // also on the root, or its scrollbar gutter leaves a grey band beside the art
  document.documentElement.classList.toggle('battle-mode', screen === 'battle');
  if (screen !== 'battle') {
    var hud = document.getElementById('battleHud');
    if (hud) hud.hidden = true;   // hide the battle HUD content on every other screen
    // leaving battle: drop the inline alignment so other screens keep the
    // CSS default rather than a stale position computed for the board.
    var art = document.querySelector('.room-art');
    if (art) { art.style.backgroundPosition = ''; art.style.backgroundSize = ''; }
  }
  ['map', 'act', 'victory', 'battle', 'reward', 'shop', 'lab', 'event', 'gameover'].forEach(function (s) {
    var el = els['screen_' + s];
    if (el) el.hidden = (s !== screen);
  });
  applyGrey();
  renderRunBar();
  if (screen === 'map') { renderMap(); renderMapLegend(); }
  else if (screen === 'act') renderActSelect();
  else if (screen === 'victory') renderVictory();
  else if (screen === 'reward') renderReward();
  else if (screen === 'shop') renderShop();
  else if (screen === 'lab') renderLab();
  else if (screen === 'event') renderEvent();
  else if (screen === 'gameover') renderGameOver();
  else if (screen === 'battle') window.CV_BATTLE.render();
  if (screen !== 'battle') saveRun();
}

function chip(colorKey, label) {
  var c = colorInfo(colorKey);
  return '<span class="chip" style="background:' + c.hex + ';color:' + c.ink + '">' + (label || c.name) + '</span>';
}
function cardMini(entry, extra) {
  var d = CARDS[entry.id], c = colorInfo(d.color);
  return '<div class="mini-card ' + d.type + (extra || '') + '" style="--card:' + c.hex + ';--card-ink:' + c.ink + '">' +
    '<span class="mini-top">' + (d.type === 'unit' ? cardStrength(entry)
      : d.type === 'hazard' ? 'HAZ' : d.type === 'curse' ? 'CRS' : 'SPL') + '</span>' +
    '<span class="mini-name">' + cardName(entry) + '</span>' +
    '<span class="mini-text">' + d.text + '</span></div>';
}

/* Every curse that lands in your deck takes a little colour out of the world.
   Nothing announces it; the map, the board and the cards simply go greyer. */
function gainCurse(id) {
  run.deck.push({ id: id, up: false });
  run.corruption = (run.corruption || 0) + 1;
  applyGrey();
  return CARDS[id];
}
function applyGrey() {
  var n = (run && run.corruption) || 0;
  var sat = Math.max(0.28, 1 - n * 0.075);
  document.documentElement.style.setProperty('--sat', sat.toFixed(3));
  // the room withers on its own curve, a little ahead of the interface
  document.documentElement.style.setProperty('--ash', Math.min(1, n / 8).toFixed(3));
}

function renderRunBar() {
  if (run.lives < 0) run.lives = 0;
  var hearts = '';
  for (var i = 0; i < run.maxLives; i++) hearts += '<span class="life' + (i < run.lives ? '' : ' lost') + '">\u25c6</span>';
  els.runLives.innerHTML = hearts;
  els.runGold.textContent = run.gold;
  /* Between acts the old act's depth is meaningless and reading "13 / 13"
     next to a fork in the road just looks like a bug. */
  els.runDepth.textContent = run.screen === 'act' ? '\u2014'
    : (run.depth + 1) + ' / ' + run.map.length;
  var actCell = document.getElementById('runAct');
  if (actCell) actCell.textContent = ACTS[run.act] ? ACTS[run.act].name.replace(/^The /, '') : '\u2014';
  els.deckBtnCount.textContent = run.deck.length;
  els.relicBtnCount.textContent = run.relics.length;
  run.relics = run.relics.filter(function (k) { return !!RELICS[k]; });
  els.runRelics.innerHTML = run.relics.length
    ? run.relics.map(function (k) { return '<span class="relic-pip" title="' + RELICS[k].text + '">' + RELICS[k].name + '</span>'; }).join('')
    : '<span class="muted" style="font-size:11px">No relics yet</span>';
}

/* A single place to check what you are carrying — deck and relics together,
   reachable from any screen including mid-battle. */
function renderDeckModal() {
  var byColour = {};
  run.deck.forEach(function (c) {
    var k = CARDS[c.id].color || 'colourless';
    (byColour[k] = byColour[k] || []).push(c);
  });
  var order = C.COLOR_KEYS.concat(['colourless']);
  var groups = order.filter(function (k) { return byColour[k]; }).map(function (k) {
    var label = k === 'colourless' ? 'Colourless' : COLORS[k].name;
    return '<div class="deck-group"><span class="lbl">' + label + ' · ' + byColour[k].length + '</span>' +
      '<div class="deck-grid">' + byColour[k].map(function (c) { return cardMini(c); }).join('') + '</div></div>';
  }).join('');

  els.deckModalBody.innerHTML =
    '<div class="dm-section"><h3>Relics · ' + run.relics.length + '</h3>' +
    (run.relics.length
      ? run.relics.map(function (k) {
          return '<div class="relic-line"><b>' + RELICS[k].name + '</b><span>' + RELICS[k].text + '</span></div>';
        }).join('')
      : '<p class="muted" style="font-size:12.5px;margin:0">No relics yet. Elites and bosses always drop one.</p>') +
    '</div>' +
    '<div class="dm-section"><h3>Deck · ' + run.deck.length + ' cards</h3>' +
    '<p class="screen-lead">A smaller deck draws its best cards more often. Skipping a reward keeps it lean.</p>' +
    groups + '</div>';
  els.deckOverlay.hidden = false;
}

/* ================= MAP =================
   Drawn as SVG so the edges between nodes are visible: you can see which
   branches a node leads to and plan a route to the boss. */
var MAP_ICONS = {
  battle: '<path d="M-7,-7 L7,7 M7,-7 L-7,7" stroke-width="3" fill="none"/>',
  elite:  '<path d="M-8,-8 L8,8 M8,-8 L-8,8" stroke-width="3.5" fill="none"/>' +
          '<circle cx="0" cy="0" r="11.5" fill="none" stroke-width="2"/>',
  boss:   '<path d="M-11,6 L-11,-7 L-5.5,-1 L0,-9 L5.5,-1 L11,-7 L11,6 Z" stroke-width="2"/>',
  shop:   '<circle cx="0" cy="0" r="8" fill="none" stroke-width="2.5"/>' +
          '<path d="M0,-4.5 L0,4.5 M-3,-2 L3,-2 M-3,2 L3,2" stroke-width="2" fill="none"/>',
  lab:    '<path d="M-3,-9 L3,-9 M-2,-9 L-2,-2 L-7.5,7 A2,2 0 0,0 -6,9.5 L6,9.5 A2,2 0 0,0 7.5,7 L2,-2 L2,-9" ' +
          'fill="none" stroke-width="2.2" stroke-linejoin="round"/>',
  event:  '<path d="M-4,-4 A4,4 0 1,1 0,2 M0,6 L0,7.5" fill="none" stroke-width="2.6" stroke-linecap="round"/>',
  // the lab flask, but something is coming out of it
  volatile: '<path d="M-3,-9 L3,-9 M-2,-9 L-2,-2 L-7.5,7 A2,2 0 0,0 -6,9.5 L6,9.5 A2,2 0 0,0 7.5,7 L2,-2 L2,-9" ' +
            'fill="none" stroke-width="2.2" stroke-linejoin="round"/>' +
            '<circle class="vbub b1" cx="-3" cy="-12" r="1.9"/>' +
            '<circle class="vbub b2" cx="2" cy="-14" r="1.4"/>' +
            '<circle class="vbub b3" cx="5" cy="-11" r="1.1"/>',
  unknown: '<path d="M-9,-4 q4.5,-3.5 9,0 t9,0 M-9,1 q4.5,-3.5 9,0 t9,0 M-9,6 q4.5,-3.5 9,0 t9,0" ' +
           'fill="none" stroke-width="2.2" stroke-linecap="round"/>'
};
/* The colours a fight will bring, drawn as a segmented ring around the node.
   No text, no clutter — a red/green/yellow ring reads as "bring counters for
   these" at a glance, and the seven-colour ring marks the boss instantly. */
function colorRing(colors) {
  var r = 24, gap = colors.length > 1 ? 0.16 : 0, out = '';
  colors.forEach(function (c, i) {
    var a0 = -Math.PI / 2 + (i / colors.length) * Math.PI * 2 + gap / 2;
    var a1 = -Math.PI / 2 + ((i + 1) / colors.length) * Math.PI * 2 - gap / 2;
    var large = (a1 - a0) > Math.PI ? 1 : 0;
    if (colors.length === 1) {
      out += '<circle class="mn-ring" r="' + r + '" fill="none" stroke="' + COLORS[c].hex + '"/>';
      return;
    }
    out += '<path class="mn-ring" fill="none" stroke="' + COLORS[c].hex + '" d="M' +
      (Math.cos(a0) * r).toFixed(2) + ',' + (Math.sin(a0) * r).toFixed(2) +
      ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' +
      (Math.cos(a1) * r).toFixed(2) + ',' + (Math.sin(a1) * r).toFixed(2) + '"/>';
  });
  return out;
}

var MAP_LABEL = { battle: 'Battle', elite: 'Elite', shop: 'Shop', lab: 'Colour Lab', event: 'Event', boss: 'Boss', volatile: 'Volatile Lab' };

function renderMap() {
  var open = currentNodes();
  var W = 320, rowH = 74, pad = 34;
  var H = run.map.length * rowH + pad;
  /* x comes from the node's grid column, not its index in the row, so a node
     keeps the same horizontal position whatever else that row contains. */
  function nodeX(depth, idx) {
    var node = run.map[depth][idx];
    return pad + (node.col + 0.5) * (W - pad * 2) / MAP_COLS;
  }
  function nodeY(depth) { return pad / 2 + depth * rowH + 26; }

  var edges = '', nodes = '';
  run.map.forEach(function (row, d) {
    if (d >= run.map.length - 1) return;
    row.forEach(function (n, i) {
      n.next.forEach(function (j) {
        var x1 = nodeX(d, i), y1 = nodeY(d) + 20, x2 = nodeX(d + 1, j), y2 = nodeY(d + 1) - 20;
        var my = (y1 + y2) / 2;
        var taken = (run.history[d] === i && run.history[d + 1] === j);
        var live = (d === run.depth && open.indexOf(i) !== -1) ||
                   (d === run.depth - 1 && run.history[d] === i);
        var cls = 'map-edge' + (taken ? ' taken' : live ? ' live' : '');
        edges += '<path class="' + cls + '" d="M' + x1 + ',' + y1 +
          ' C' + x1 + ',' + my + ' ' + x2 + ',' + my + ' ' + x2 + ',' + y2 + '"/>';
      });
    });
  });

  run.map.forEach(function (row, d) {
    row.forEach(function (n, i) {
      var x = nodeX(d, i), y = nodeY(d);
      var reachable = (d === run.depth && open.indexOf(i) !== -1);
      var past = d < run.depth, taken = past && run.history[d] === i;
      var cls = 'map-node t-' + n.type + (reachable ? ' open' : '') + (past ? ' past' : '') + (taken ? ' taken' : '');
      var enemy = n.enemy ? ENEMIES[n.enemy] : null;
      var title = n.hidden ? 'Unknown — something is waiting on this road'
        : MAP_LABEL[n.type] + (enemy ? ' — ' + enemy.name + ' · ' +
          enemy.colors.map(function (c) { return COLORS[c].name; }).join(', ') : '');
      nodes += '<g class="' + cls + (n.hidden ? ' hidden-node' : '') + (n.dangerous ? ' danger' : '') +
        '" transform="translate(' + x + ',' + y + ')"' +
        (reachable ? ' data-col="' + i + '" tabindex="0" role="button"' : '') +
        ' aria-label="' + title + '"><title>' + title + '</title>' +
        (enemy && !n.hidden ? colorRing(enemy.colors) : '') +
        '<circle class="mn-disc" r="19"/>' +
        '<g class="mn-icon">' + MAP_ICONS[n.hidden ? 'unknown' : n.type] + '</g>' +
        (reachable ? '<circle class="mn-halo" r="25" fill="none"/>' : '') +
        '</g>';
    });
  });

  els.mapBody.innerHTML =
    '<svg class="map-svg" viewBox="0 0 ' + W + ' ' + H + '" ' +
    'xmlns="http://www.w3.org/2000/svg">' + edges + nodes + '</svg>';

  Array.prototype.forEach.call(els.mapBody.querySelectorAll('.map-node.open'), function (g) {
    function go() { enterNode(+g.getAttribute('data-col')); }
    g.addEventListener('click', go);
    g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  // keep the live row in view
  if (els.mapScroll) {
    var svgEl = els.mapBody.querySelector('.map-svg');
    var drawn = svgEl ? svgEl.getBoundingClientRect().height : H;
    var top = nodeY(run.depth) / H * drawn;
    els.mapScroll.scrollTop = Math.max(0, top - els.mapScroll.clientHeight * 0.45);
  }
}

function renderMapLegend() {
  if (els.mapLegend.dataset.built) return;
  els.mapLegend.innerHTML = ['battle', 'elite', 'boss', 'shop', 'lab', 'volatile', 'event', 'unknown'].map(function (t) {
    return '<span class="legend-item t-' + t + '"><svg viewBox="-16 -16 32 32" class="legend-ic">' +
      '<g class="mn-icon">' + MAP_ICONS[t] + '</g></svg>' + (MAP_LABEL[t] || 'Unknown') + '</span>';
  }).join('');
  els.mapLegend.dataset.built = '1';
}


function enterNode(col) {
  var node = nodeAt(run.depth, col);
  run.col = col;
  run.pendingNode = node;
  run.history[run.depth] = col;
  if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') beginBattle();
  else if (node.type === 'shop') { rollShop(); show('shop'); }
  else if (node.type === 'lab') { rollLab(); show('lab'); }
  else if (node.type === 'volatile') {
    rollLab();
    run.lab = { kind: 'volatile', picks: [], presses: 0, results: [], done: false, curses: 0 };
    show('lab');
  }
  else if (node.type === 'event') { rollEvent(); show('event'); }
}

function advance() {
  var node = run.pendingNode;
  if (!node) { show('map'); return; }
  node.done = true;
  if (run.depth >= run.map.length - 1) { finishAct(); return; }
  run.available = node.next.slice();
  run.depth += 1;
  run.pendingNode = null;
  show('map');
  saveRun();
}

/* An act is behind you. What comes next depends entirely on the deck you
   built inside it — which is the whole point of gating acts by colour rather
   than marching through them in a fixed order. */
/* ---- how a road announced itself ----
   One line per act, written into the codex the first time that act becomes
   reachable. Deliberately oblique: it should read as a memory of the moment
   the colour turned into a place, not as an instruction for repeating it. The
   requirement is never named — a player who wants the rule can infer it from
   their own deck, and a player who does not still gets the sense that the
   world responded to something they made. */
var ACT_OMENS = {
  red:     'You carried Red from the first hour; it was never something you had to earn. Something was already burning at the edge of the map, and it did not need an invitation.',
  green:   'You carried Green from the first hour. The first shoot came up through the floorboards while you slept, and by morning there was a road.',
  blue:    'You carried Blue from the first hour. The water in the flasks began leaning the same way, all of them, toward somewhere below.',
  yellow:  'Red met Green on the bench and the mixture would not stop giving off light. The residue crept off the table and became a grove.',
  cyan:    'Green met Blue and the room went quiet all at once \u2014 and the quiet turned out to have a floor you could stand on.',
  magenta: 'Red met Blue and did not stop ringing. The sound cut a stair down into the rock.',
  /* Black names its parents in the plural on purpose: two secondaries, never
     a secondary and a primary. The line is the only place the rule is stated
     anywhere in the game. */
  black:   'You fused one made colour into another \u2014 two mixtures, each already a mixture \u2014 and what came out had no colour left in it at all. It knew the way to you before you finished.'
};

/* Recorded once, the first time a road opens. Kept in the codex rather than
   the run, so it survives the run that earned it. */
function noteActOmens() {
  codex.omens = codex.omens || {};
  var changed = false;
  ACT_KEYS.forEach(function (k) {
    if (codex.omens[k]) return;
    if (!C.actUnlocked(ACTS[k].color, run.deck)) return;
    codex.omens[k] = 1; changed = true;
  });
  if (changed) saveCodex();
}

function finishAct() {
  var justFinished = run.act;
  run.actsCleared.push(run.act);
  run.pendingNode = null;
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
  if (justFinished === 'black' && !run.endless) {
    show('victory');
    saveRun();
    return;
  }
  /* White is the last thing there is. Beating it ends the run outright rather
     than returning to a fork — there is no road after the one that was never
     on the map. */
  if (ACTS[justFinished] && ACTS[justFinished].secret) {
    show('gameover');
    saveRun();
    return;
  }
  var open = eligibleActs(run);
  if (!open.length) { show('gameover'); saveRun(); return; }
  /* Two roads, drawn at random from what your deck has opened. Random keeps
     a run from settling into one memorised route; the choice between them is
     where the deckbuilding pays off. */
  shuffle(open);
  run.actOffer = open.slice(0, 2);
  show('act');
  saveRun();
}

/* Called from the victory screen. Endless simply lifts the "already visited"
   exclusion in eligibleActs — every act you have ever opened is a road again,
   and run-wide power keeps climbing every loop through the existing
   powerAt() maths, so the game keeps getting harder with no new content
   required to support it. */
function goEndless() {
  run.endless = true;
  var open = eligibleActs(run);
  if (!open.length) { show('gameover'); saveRun(); return; }
  shuffle(open);
  run.actOffer = open.slice(0, 2);
  show('act');
  saveRun();
}
/* The other choice on the victory screen: stop here, on your own terms,
   with every road behind you. */
function endAsVictory() {
  show('gameover');
  saveRun();
}

function beginAct(key) {
  if (!ACTS[key]) return;
  var act = ACTS[key];
  run.act = key;
  run.actOffer = null;
  run.map = buildMap(key, run.actsCleared.length === 0);
  run.depth = 0; run.col = null; run.available = [0];
  run.history = []; run.pendingNode = null;
  run.reward = null; run.shop = null; run.lab = null; run.event = null;
  /* The Sundered Ground arrives already broken, on both halves. Fissures are
     run-wide and persistent, so seeding them here means the whole act is
     played on cracked ground rather than the boss being a sudden surprise at
     depth 13 \u2014 and the enemy's half is broken too, which is what makes it a
     shared condition instead of a handicap. */
  if (act.alwaysFissures) {
    for (var i = 0; i < 3; i++) { spawnFissure(PLAYER, null); spawnFissure(ENEMY, null); }
  }
  applyActTheme();
  show('map');
  saveRun();
}

function renderActSelect() {
  var offer = run.actOffer || [];
  var cleared = run.actsCleared.map(function (k) {
    return '<span class="chip" style="background:' + COLORS[ACTS[k].color].hex +
      ';color:' + COLORS[ACTS[k].color].ink + '">' + ACTS[k].name + '</span>';
  }).join(' ');

  /* Each option wears its own room. A scrim sits between the painting and the
     words rather than dimming the painting itself, so the art keeps its colour
     while the text keeps a solid dark backing — the two darkest paintings and
     the two brightest all stay readable without per-act tuning. */
  var cards = offer.map(function (k) {
    var a = ACTS[k], c = COLORS[a.color], art = ACT_ART[k] || {};
    var bg = art.varName ? 'var(' + art.varName + ')' : 'none';
    return '<button class="act-pick" data-act="' + k + '" style="--act:' + c.hex +
      ';--act-art:' + bg + ';--act-art-filter:' + (art.filter || 'none') +
      ';--act-art-y:' + Math.round((art.seam || 0.25) * 100) + '%">' +
      '<span class="act-art" aria-hidden="true"></span>' +
      '<span class="act-scrim" aria-hidden="true"></span>' +
      '<span class="act-copy">' +
        '<span class="act-name">' + a.name + '</span>' +
        '<span class="act-blurb">' + a.blurb + '</span>' +
        '<span class="act-boss">Boss · ' + ENEMIES[a.boss].name + '</span>' +
      '</span></button>';
  }).join('');

  /* Just the two roads, and nothing about the ones you cannot walk.

     This screen used to list every shut act with its exact requirement —
     "needs 2 Magenta, you hold 0" — which turned discovery into a checklist.
     The player was told the whole colour wheel before they had made a single
     secondary, so opening a new road stopped being a thing you found and
     became a task you completed. What is left is the fork itself.

     The knowledge still arrives, just afterwards and obliquely: unlocking an
     act writes a cryptic line into the glossary, so the codex fills in with
     the shape of what you did rather than the recipe for doing it again. */
  els.actBody.innerHTML =
    '<h2>The road forks</h2>' +
    '<p class="screen-lead">' + (cleared ? 'Behind you: ' + cleared + '. ' : '') +
    'Where you can go next is decided by what your deck is made of.</p>' +
    '<div class="act-picks">' + cards + '</div>';

  Array.prototype.forEach.call(els.actBody.querySelectorAll('.act-pick'), function (b) {
    b.addEventListener('click', function () { beginAct(b.getAttribute('data-act')); });
  });
}

/* The screen for the moment every act has fallen at least once. It is not
   the same thing as the run ending — the player has choices from here, so it
   gets its own screen rather than folding into the gameover summary, which
   is written for an ending, not a decision. */
/* White is offered only when every road of the wheel was already behind the
   player at the moment Black fell. Checked against the distinct set, so an
   endless run cannot accumulate its way to it by repeating one act. */
function whiteUnlocked(r) {
  if (r.actsCleared.indexOf('white') !== -1) return false;
  return ACT_KEYS.every(function (k) { return r.actsCleared.indexOf(k) !== -1; });
}

/* Thresholds for the two roads earned by how a run was lived rather than by
   what it covered. Both are read at the moment Black falls.

   Deliberately not exclusive with White or with each other: a run that went
   broad, carried its rot AND broke the ground repeatedly has done three
   different hard things, and should be offered all three. */
var ROT_THRESHOLD = 3;      // curses still in the deck
var RIFT_THRESHOLD = 4;     // cracks opened across the run

function rotUnlocked(r) {
  if (r.actsCleared.indexOf('rot') !== -1) return false;
  return curseCount(r.deck) >= ROT_THRESHOLD;
}
function riftUnlocked(r) {
  if (r.actsCleared.indexOf('rift') !== -1) return false;
  return (r.fissures || []).length >= RIFT_THRESHOLD;
}
/* Every secret road currently on offer, in a stable order. */
function secretOffers(r) {
  var out = [];
  if (whiteUnlocked(r)) out.push('white');
  if (rotUnlocked(r)) out.push('rot');
  if (riftUnlocked(r)) out.push('rift');
  return out;
}

/* Why each secret road opened, in the player's own terms. Shown on the card
   so a run that qualified for two or three can see which of its own habits
   earned which door. */
var SECRET_REASON = {
  white: 'Every road of the wheel is behind you, and that is the only thing that opens this one.',
  rot:   'You are still carrying what the labs gave you. It has been following.',
  rift:  'You broke the ground this many times. Something down there kept count.'
};

function renderVictory() {
  var offers = secretOffers(run);
  var full = whiteUnlocked(run);
  var roster = ACT_KEYS.map(function (k) {
    var a = ACTS[k], c = COLORS[a.color];
    var walked = run.actsCleared.indexOf(k) !== -1;
    return '<span class="chip" style="background:' + (walked ? c.hex : 'transparent') +
      ';color:' + (walked ? c.ink : 'var(--ink-3)') +
      (walked ? '' : ';border:1px dashed var(--line)') + '">' + a.name + '</span>';
  }).join(' ');

  var head = full ? 'The wheel is complete' : 'Black is broken';
  var lead = full
    ? 'Seven bosses, seven roads, one deck. There is nothing left that your colours have not ' +
      'already opened \u2014 and something that was never on the wheel has noticed.'
    : 'You broke The Spectrum and walked out of the Ashen Wastelands. Black was the last colour ' +
      'and the hardest door; the roads you did not take are still out there.';
  if (!full && offers.length) {
    lead += ' Something else has been following you, though.';
  }

  /* Every secret road that qualified, not just the first. A run that went
     broad, carried its rot and broke the ground has done three separate hard
     things and is offered all three. */
  var secretCards = offers.map(function (k) {
    var a = ACTS[k], c = COLORS[a.color];
    var art = ACT_ART[k] || {};
    var bg = art.varName ? 'var(' + art.varName + ')' : 'none';
    return '<button class="act-pick victory-pick" data-secret="' + k + '" style="--act:' + c.hex +
      ';--act-art:' + bg + ';--act-art-filter:' + (art.filter || 'none') +
      ';--act-art-y:' + Math.round((art.seam || 0.25) * 100) + '%">' +
      '<span class="act-art" aria-hidden="true"></span>' +
      '<span class="act-scrim" aria-hidden="true"></span>' +
      '<span class="act-copy">' +
        '<span class="act-name">' + a.name + '</span>' +
        '<span class="act-blurb">' + a.blurb + ' ' + (SECRET_REASON[k] || '') + '</span>' +
        '<span class="act-boss">Boss \u00b7 ' + ENEMIES[a.boss].name + '</span>' +
      '</span></button>';
  }).join('');

  els.victoryBody.innerHTML =
    '<h2>' + head + '</h2>' +
    '<p class="screen-lead">' + roster + '</p>' +
    '<p class="screen-lead">' + lead + '</p>' +
    '<div class="act-picks">' + secretCards +
      '<button class="act-pick victory-pick" id="goEndlessBtn" style="--act:#f3c86a">' +
        '<span class="act-copy">' +
          '<span class="act-name">Go endless</span>' +
          '<span class="act-blurb">Every road opens again, and the world keeps getting harder ' +
            'the longer you last. There is no further ending waiting for you \u2014 only how far ' +
            'you get.</span>' +
        '</span></button>' +
      '<button class="act-pick victory-pick" id="endHereBtn" style="--act:#8a8378">' +
        '<span class="act-copy">' +
          '<span class="act-name">End the run here</span>' +
          '<span class="act-blurb">Take the win. Your run, your deck, and the road behind you are ' +
            'recorded as they stand.</span>' +
        '</span></button>' +
    '</div>';

  Array.prototype.forEach.call(els.victoryBody.querySelectorAll('[data-secret]'), function (b) {
    b.addEventListener('click', function () { beginAct(b.getAttribute('data-secret')); });
  });
  document.getElementById('goEndlessBtn').addEventListener('click', function () { goEndless(); });
  document.getElementById('endHereBtn').addEventListener('click', function () { endAsVictory(); });
}

/* The room you are standing in is the act you are in. Each theme carries its
   own painting plus the seam fraction that tells the battle screen where the
   eyes sit in it, so the art keeps lining up with the enemy's cards. */
/* seam  = where the watching eyes sit, as a fraction of image height.
   dim   = extra veil, scaled off how bright the painting's floor is. The
           board's grid is drawn in one colour across every act, so a room lit
           like an afternoon has to be pulled down or the grid stops reading.
           Measured floor luminance: blue 16, magenta 21, red 23, green 26,
           yellow 55 — only the Grove is an outlier, and only it is dimmed. */
var ACT_ART = {
  green:   { varName: '--art-green',   w: 840, h: 1297, seam: 0.186, dim: 0 },
  red:     { varName: '--art-red',     w: 728, h: 1176, seam: 0.227, dim: 0 },
  blue:    { varName: '--art-blue',    w: 728, h: 1260, seam: 0.258, dim: 0 },
  yellow:  { varName: '--art-yellow',  w: 784, h: 1260, seam: 0.257, dim: 0.72 },
  magenta: { varName: '--art-magenta', w: 784, h: 1260, seam: 0.262, dim: 0 },
  cyan:    { varName: '--art-cyan',    w: 756, h: 1260, seam: 0.263, dim: 0 },
  /* The Wastelands are the one room with nothing watching from the dark, so
     the eyes are drawn rather than painted — see .room-eyes. They sit exactly
     where every other act's eyes sit, because the aligner pins the seam to
     the same point on screen regardless of which painting is behind it. */
  black:   { varName: '--art-black',   w: 784, h: 1204, seam: 0.255, dim: 0.12,
             drawEyes: true },
  /* Each secret road now has its own painting. None of the three had a watcher
     painted in, so all three draw their eyes — but each draws a different kind,
     keyed to what the road is about. See .room-eyes for the variants.

     The White terrace is lit like noon, so it carries a heavier veil for the
     same reason the Radiant Grove does. */
  white:   { varName: '--art-white',   w: 728, h: 1004, seam: 0.397, dim: 0.52,
             drawEyes: true, eyeStyle: 'unblinking' },
  rot:     { varName: '--art-rot',     w: 728, h: 1078, seam: 0.402, dim: 0.10,
             drawEyes: true, eyeStyle: 'choir' },
  rift:    { varName: '--art-rift',    w: 728, h: 1186, seam: 0.337, dim: 0.24,
             drawEyes: true, eyeStyle: 'sundered' }
};
function applyActTheme() {
  var art = ACT_ART[(run && run.act) || 'green'] || ACT_ART.green;
  document.documentElement.style.setProperty('--bg-art', 'var(' + art.varName + ')');
  document.documentElement.style.setProperty('--room-dim', String(art.dim || 0));
  document.documentElement.style.setProperty('--art-filter', art.filter || 'none');
  if (window.CV_BATTLE && window.CV_BATTLE.setBackgroundMetrics) {
    window.CV_BATTLE.setBackgroundMetrics(art);
  }
}

function beginBattle() {
  log.length = 0;
  state = newBattle(run.pendingNode);
  show('battle');
  window.CV_BATTLE.buildBoard();
  addLog('Battle with ' + state.enemy.name + ' begins. ' + sideName(state.turn) + ' start' + (state.turn === PLAYER ? '' : 's') + '.');
  if (hasRelic(state.relics, 'recycling_bin')) { drawInto(state, PLAYER, 1); addLog('Recycling Bin drew an extra card.'); }
  window.CV_BATTLE.render();
  window.CV_BATTLE.flushCurses();
  var teaching = tutorialActive();
  if (teaching) openTutorial(TUTORIAL_STEPS);
  run.battlesFought++;
  // Hold the enemy's opening move until the tutorial is dismissed, so nothing
  // changes on the board while the player is still reading.
  if (!teaching) window.CV_BATTLE.maybeOpponentMove();
}

/* Whoever held the line in a CONTESTED lane is removed before the next round.
   Front units are spent taking the fight; the ranks behind step up. A lane
   where only one side fielded anything saw no fight, so nothing falls there —
   that lets you build safely in lanes the enemy has ignored. A unit fronting
   several lanes falls once if any of them was contested. */
function clearFrontlines(board, hazards, ctx) {
  var ev = C.evaluateBoard(board, hazards, ctx || {});
  var fallen = { bottom: [], top: [] };
  ev.lanes.forEach(function (lane) {
    if (!lane.bottom || !lane.top) return;      // uncontested — no fight, no losses
    ['bottom', 'top'].forEach(function (sd) {
      if (!lane[sd]) return;
      var ch = lane[sd].champion, key = ch.row + '|' + ch.index;
      if (fallen[sd].indexOf(key) === -1) fallen[sd].push(key);
    });
  });
  ['bottom', 'top'].forEach(function (sd) {
    fallen[sd].forEach(function (k) {
      var p = k.split('|');
      board[sd][p[0]][+p[1]] = null;
    });
  });
  return fallen;
}

/* ---------------- tutorial ---------------- */
var tutorial = { enabled: true, step: 0, list: null, seen: {} };

/* ---------------- tutorial diagrams ----------------
   Small boards drawn from the real geometry, so what the player studies here
   is literally the board they are about to play on. Numbered pointers sit on
   the tiles being described and match the captions underneath. */
function tutorialBoard(spec) {
  var geo = C.GEO.filter(function (t) { return !spec.half || t.side === spec.half; });
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  geo.forEach(function (t) {
    t.points.forEach(function (p) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
  });
  var padX = 130, padTop = (spec.lanes || spec.flows) ? 156 : 56, padBot = 66;
  var vb = { x: minX - padX, y: minY - padTop, w: (maxX - minX) + padX * 2, h: (maxY - minY) + padTop + padBot };
  var headerY = minY - 104;        // LANE n label
  var amountY = minY - 46;         // the share that lane receives, above Row 1
  var arrowY = minY - 18;          // arrowheads stop just short of the board

  var tiles = '', tokens = '', marks = '', bands = '', laneText = '', flows = '';

  if (spec.lanes) {
    [0, 1, 2, 3].forEach(function (L) {
      var cx = (L + 0.5) * 200;
      bands += '<rect class="tut-lane" x="' + (cx - 94) + '" y="' + (minY + 6) +
        '" width="188" height="' + ((maxY - minY) - 12) + '" rx="14"/>';
      laneText += '<rect class="tut-lanepill" x="' + (cx - 84) + '" y="' + (headerY - 34) +
        '" width="168" height="58" rx="16"/>' +
        '<text class="tut-laneno" x="' + cx + '" y="' + headerY + '" text-anchor="middle" ' +
        'dominant-baseline="central">LANE ' + (L + 1) + '</text>';
    });
  }

  geo.forEach(function (t) {
    tiles += '<polygon class="tut-tile ' + t.row + ' side-' + t.side + '" points="' +
      t.points.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
  });

  function centre(u) {
    var g = C.GEO.filter(function (t) {
      return t.side === u.side && t.row === u.row && t.index === u.index;
    })[0];
    return g ? { x: g.cx, y: g.cy } : { x: 0, y: 0 };
  }

  /* Arrows showing where a unit's strength actually goes. They are drawn over the
     tokens rather than under them, and the share each lane receives sits in its own
     chip beneath the lane label, clear of the board. */
  var amounts = '';
  var perLane = {};
  (spec.flows || []).forEach(function (f) {
    var p = centre(f.from), lx = (f.lane + 0.5) * 200;
    var hex = C.COLORS[f.color].hex;
    var my = (p.y + arrowY) / 2;
    flows += '<path class="tut-flow" stroke="' + hex + '" d="M' + p.x + ',' + p.y +
      ' C' + p.x + ',' + my + ' ' + lx + ',' + my + ' ' + lx + ',' + (arrowY + 20) + '"/>';
    flows += '<path class="tut-arrow" fill="' + hex + '" d="M' + lx + ',' + arrowY +
      ' l-13,22 l26,0 Z"/>';
    perLane[f.lane] = { amount: (perLane[f.lane] ? perLane[f.lane].amount + f.amount : f.amount), hex: hex };
  });
  Object.keys(perLane).forEach(function (L) {
    var lx = (+L + 0.5) * 200, e = perLane[L];
    amounts += '<rect class="tut-amtbox" x="' + (lx - 30) + '" y="' + (amountY - 26) +
      '" width="60" height="52" rx="15" stroke="' + e.hex + '"/>' +
      '<text class="tut-amt" x="' + lx + '" y="' + amountY + '" text-anchor="middle" ' +
      'dominant-baseline="central" fill="' + e.hex + '">' + e.amount + '</text>';
  });

  (spec.units || []).forEach(function (u) {
    var p = centre(u), ci = C.colorInfo(u.color);
    tokens += '<circle class="tut-owner ' + (u.side === 'bottom' ? 'you' : 'foe') +
      (u.faded ? ' faded' : '') + (u.front ? ' front' : '') + '" cx="' + p.x + '" cy="' + p.y + '" r="52"/>' +
      '<circle class="tut-token' + (u.faded ? ' faded' : '') + '" cx="' + p.x + '" cy="' + p.y +
      '" r="44" fill="' + ci.hex + '"/>' +
      '<text class="tut-str' + (u.faded ? ' faded' : '') + '" x="' + p.x + '" y="' + p.y +
      '" text-anchor="middle" dominant-baseline="central" fill="' + ci.ink + '">' + u.strength + '</text>';
    if (u.fx) {
      // drawn exactly as the live board draws its multiplier badge
      tokens += '<text class="tut-fx" x="' + p.x + '" y="' + (p.y + (u.side === 'bottom' ? 70 : -70)) +
        '" text-anchor="middle" dominant-baseline="central">' + u.fx + '</text>';
    }
  });

  /* On a live board we cannot know what is where, so pointers pick the nearest
     offset that keeps clear of every token and of the pointers already placed. */
  var unitPts = (spec.units || []).map(function (u) { return centre(u); });
  var placed = [];
  var CANDIDATES = [[-116, -8], [116, -8], [-116, 64], [116, 64], [0, -122], [0, 122],
                    [-146, 34], [146, 34], [-96, -96], [96, -96], [-96, 96], [96, 96]];
  function autoOffset(p) {
    var best = null;
    CANDIDATES.forEach(function (c) {
      var bx = p.x + c[0], by = p.y + c[1], worst = Infinity;
      unitPts.concat(placed).forEach(function (q) {
        var d = Math.sqrt((bx - q.x) * (bx - q.x) + (by - q.y) * (by - q.y));
        if (d < worst) worst = d;
      });
      if (!best || worst > best.worst) best = { worst: worst, dx: c[0], dy: c[1] };
    });
    return best || { dx: -116, dy: -8 };
  }

  (spec.marks || []).forEach(function (m) {
    var p = m.at ? centre(m.at) : { x: m.x, y: m.y };
    var off = (m.dx === undefined && m.dy === undefined) ? autoOffset(p) : { dx: m.dx || 0, dy: m.dy || 0 };
    var bx = p.x + off.dx, by = p.y + off.dy;
    placed.push({ x: bx, y: by });
    marks += '<line class="tut-lead" x1="' + p.x + '" y1="' + p.y + '" x2="' + bx + '" y2="' + by + '"/>';
    marks += '<circle class="tut-badge" cx="' + bx + '" cy="' + by + '" r="30"/>' +
      '<text class="tut-badgeno" x="' + bx + '" y="' + by + '" text-anchor="middle" dominant-baseline="central">' +
      m.n + '</text>';
  });

  return '<svg class="tut-svg" viewBox="' + vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h +
    '" xmlns="http://www.w3.org/2000/svg">' + bands + tiles + tokens + flows + amounts +
    laneText + marks + '</svg>';
}

/* Turn a real board plus its evaluation into diagram units, carrying the same
   frontline rings and multiplier badges the live board draws. */
function liveUnits(board, ev, fadedKeys) {
  var fronts = {}, mult = {};
  ev.lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (sd) {
      if (!lane[sd]) return;
      var k = sd + '-' + lane[sd].champion.row + '-' + lane[sd].champion.index;
      fronts[k] = true;
      mult[k] = Math.max(mult[k] || 1, lane[sd].multiplier);
    });
  });
  var out = [];
  ['bottom', 'top'].forEach(function (sd) {
    C.eachUnit(board, sd, function (u, row, i) {
      var k = sd + '-' + row + '-' + i, v = ev.get(sd, row, i);
      out.push({ side: sd, row: row, index: i, color: v.color, strength: ev.strengthOf(v),
                 front: !!fronts[k], fx: (mult[k] > 1 ? '\u00d7' + mult[k] : null),
                 faded: !!(fadedKeys && fadedKeys.indexOf(k) !== -1) });
    });
  });
  return out;
}
function unitName(board, ev, side, row, index) {
  var v = ev.get(side, row, index);
  return C.colorInfo(v.color).name + ' ' + ev.strengthOf(v);
}
function rowLabel(row) { return C.ROW_INFO[row].label; }

/* Step 2 points at the interface itself, so it mirrors the real hand and
   buttons rather than the board. */
function tutorialControls() {
  function card(id, n) {
    var d = CARDS[id], ci = C.colorInfo(d.color);
    return '<div class="tut-card" style="--card:' + ci.hex + ';--card-ink:' + ci.ink + '">' +
      (n ? '<span class="tut-pin">' + n + '</span>' : '') +
      '<span class="card-top">' + (d.type === 'unit' ? d.strength : d.type === 'hazard' ? 'HAZ' : 'SPL') + '</span>' +
      '<span class="card-name">' + d.name + '</span>' +
      '<span class="card-text">' + d.text + '</span></div>';
  }
  return '<div class="tut-ui">' +
    '<span class="lbl">Your hand</span>' +
    '<div class="tut-rack">' + card('red_brute', 1) + card('green_gardener') + card('blue_scout') + '</div>' +
    '<div class="tut-actions-mock">' +
    '<div class="tut-fakebtn"><span class="tut-pin">2</span>Pass</div>' +
    '</div></div>';
}

/* A small mock of the two flank buttons, Rewind pinned so the legend can
   point straight at it — the icon is the same path data as the live
   button, just without the ID-scoped styling that only #rewindBtn gets. */
function tutorialRewind() {
  var rewindIcon = '<svg class="rw" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path class="rw-loop" d="M20 11a8 8 0 1 0-2.3 5.6"/>' +
    '<path class="rw-arrow" d="M20 4.6v6.1h-6.1z"/></svg>';
  return '<div class="tut-ui"><div class="tut-actions-mock">' +
    '<div class="tut-fakebtn">Pass</div>' +
    '<div class="tut-fakebtn tut-fakebtn-icon"><span class="tut-pin">1</span>' + rewindIcon + '</div>' +
    '</div></div>';
}

function tutorialLegend(items) {
  return '<ol class="tut-legend">' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ol>';
}



/* Opening set: only what you need before the very first move. Everything else
   now waits until the board itself demonstrates it. */
var TUTORIAL_STEPS = [
  { title: 'A battle is best of three',
    body: 'Win two rounds and the battle is yours. Cards you spend are gone for the rest of the ' +
          'battle, so throwing everything into round one can cost you the next two.' }
];

/* One lesson per row, fired the first time the player commits a unit there.
   Drawn on the player's own half with the lane headers above, so the arrows
   read as "this is where that unit's strength actually went". */
function lanesLesson(ctx, row) {
  var board = ctx.board, ev = ctx.ev, tile = ctx.tile;
  if (!tile || tile.row !== row) return null;
  var key = 'bottom-' + row + '-' + tile.index;
  if (!ev.shares[key]) return null;
  var lanes = C.lanesOf(row, tile.index);
  var color = ev.get('bottom', row, tile.index).color || 'red';
  var flows = lanes.map(function (L, n) {
    return { from: { side: 'bottom', row: row, index: tile.index }, lane: L,
             amount: ev.shares[key][L], color: color, nudge: (n - (lanes.length - 1) / 2) * 44 };
  });
  var shares = lanes.map(function (L) { return ev.shares[key][L]; });
  var name = unitName(board, ev, 'bottom', row, tile.index);
  var titles = { row1: 'Row 1 commits everything to one lane',
                 row2: 'Row 2 spreads across two lanes',
                 row3: 'Row 3 reaches three lanes at once' };
  var closing = { row1: 'A Row 1 unit is a spike: all of it lands in one place.',
                  row2: 'Half the weight in each. Wider reach, softer hit.',
                  row3: 'A third in each. It touches most of the board, but thinly — Row 3 wants big units.' };
  // Row 1 reaches a single lane, so nothing is divided — say so plainly.
  var middle = lanes.length === 1
    ? 'All <b>' + shares[0] + '</b> of it goes there. Nothing is split off.'
    : 'Its strength splits into <b>' + shares.join(' + ') + '</b>, one share per lane, never differing by more than one.';
  return [{ title: titles[row],
    art: function () {
      return tutorialBoard({ half: 'bottom', lanes: true,
        units: liveUnits(board, ev).filter(function (u) { return u.side === 'bottom'; }),
        flows: flows,
        marks: [{ n: 1, at: { side: 'bottom', row: row, index: tile.index } }] });
    },
    legend: ['Your <b>' + name + '</b> on ' + rowLabel(row) + ' feeds lane' +
               (lanes.length > 1 ? 's ' : ' ') + lanes.map(function (L) { return L + 1; }).join(', ') + '.',
             middle,
             closing[row]] }];
}

var TUTORIAL_LESSONS = {

  /* The very first turn: what a turn even consists of. */
  play: function () {
    return [{ title: 'Your turn — play a card',
      artHtml: function () { return tutorialControls(); },
      legend: ['Tap a card in your hand. Every tile it can legally take lights up — then tap one to commit it.',
               '<b>Pass</b> is the other thing a turn can be. It will explain itself when it matters.'] }];
  },

  /* Offered the moment it first becomes real: right after your move and the
     enemy's reply to it, once it is your turn again. The third line is a
     deliberate tease, not an explanation — it should read as a rumor, not
     a rule, and it must not describe what actually happens mechanically.
     That stays for the board to teach on its own. */
  rewind: function () {
    return [{ title: 'Rewind — take it back',
      artHtml: function () { return tutorialRewind(); },
      legend: ['<b>Rewind</b> takes back your last move and the enemy\u2019s answer to it, as if neither happened.',
               'It\u2019s once per round, and only while it\u2019s still your turn — pass or let the round end and the chance is gone.',
               '<i>Some say the board never quite forgets what you undo \u2014 a faint dimensional drift, they call it, though no one\u2019s ever proven it.</i>'] }];
  },


  /* Placing into a row for the first time: show exactly where that unit's
     strength goes, with an arrow per lane and the share it carries. */
  lanes_row1: function (ctx) { return lanesLesson(ctx, 'row1'); },
  lanes_row2: function (ctx) { return lanesLesson(ctx, 'row2'); },
  lanes_row3: function (ctx) { return lanesLesson(ctx, 'row3'); },

  /* Mixing waits until a mix would actually buy you an effective matchup —
     which is also the natural moment to explain effectiveness at all. */
  mixing: function (ctx) {
    var board = ctx.board, ev = ctx.ev, opt = ctx.opt;
    if (!opt) return null;
    var a = C.unitAt(board, 'bottom', opt.base.row, opt.base.index);
    var b = C.unitAt(board, 'bottom', opt.other.row, opt.other.index);
    var resColor = C.mixResultColor(a.color, b.color);
    var marks = [
      { n: 1, at: { side: 'bottom', row: opt.base.row, index: opt.base.index } },
      { n: 2, at: { side: 'bottom', row: opt.other.row, index: opt.other.index } },
      { n: 3, at: { side: 'top', row: opt.foe.row, index: opt.foe.index } }
    ];
    return [{ title: 'Mix for the colour you need',
      art: function () { return tutorialBoard({ units: liveUnits(board, ev), marks: marks }); },
      legend: [
        'Your <b>' + unitName(board, ev, 'bottom', opt.base.row, opt.base.index) +
          '</b> can absorb a touching friendly unit. Spend your Mix token and the result lands here.',
        'It swallows your <b>' + unitName(board, ev, 'bottom', opt.other.row, opt.other.index) +
          '</b>. Colours combine like paint and the strengths add together, plus one.',
        'That makes <b>' + C.colorInfo(resColor).name + ' ' + opt.strength + '</b> — and ' +
          C.colorInfo(resColor).name + ' beats the <b>' + C.colorInfo(opt.foeColor).name +
          '</b> facing it, so that lane would <b>double</b>. Being effective is worth more than being big.'
      ] }];
  },

  /* Passing explained the moment it is genuinely the right move. */
  passing: function (ctx) {
    var reason = ctx.reason, ev = ctx.ev;
    var lead = ev.totals.bottom - ev.totals.top;
    return [{ title: reason === 'stuck' ? 'Nothing left to play' : 'Bank the round',
      art: function () { return tutorialBoard({ units: liveUnits(ctx.board, ev) }); },
      legend: reason === 'stuck'
        ? ['You have no legal card and no mix available, so <b>Pass</b> is your only move.',
           'Passing gives the enemy exactly one more action, then the round ends and the totals are compared.',
           'Cards you never spend stay in hand for the next round — running dry is not always bad.']
        : ['You are ahead by <b>' + lead + '</b> and the enemy cannot close that this round.',
           'Passing now ends your commitment: they get one final action, then scores are compared.',
           'Everything you hold back stays in hand for the next round. Winning a round cheaply is how you win the battle.'] }];
  },

  frontline: function (ctx) {
    var ev = ctx.ev, board = ctx.board, best = null;
    ev.lanes.forEach(function (lane) {
      if (!lane.bottom || !lane.top) return;
      // prefer the most instructive lane: one with support, or a deep frontline
      var score = (lane.bottom.support ? 2 : 0) +
                  (lane.bottom.champion.row !== 'row1' ? 3 : 0) +
                  (lane.bottom.effective || lane.top.effective ? 1 : 0);
      if (!best || score > best.score) best = { lane: lane, score: score };
    });
    if (!best) return null;

    var lane = best.lane, mine = lane.bottom, theirs = lane.top, L = lane.index + 1;
    var ch = mine.champion, marks = [], legend = [], n = 1;

    marks.push({ n: n, at: { side: 'bottom', row: ch.row, index: ch.index } });
    legend.push('Your <b>' + unitName(board, ev, 'bottom', ch.row, ch.index) + '</b> on ' +
      rowLabel(ch.row) + ' is the frontline of lane ' + L + ' — your frontmost unit there. ' +
      (ch.row === 'row1' ? 'Row 1 always leads when it is occupied.'
                         : 'Row 1 is empty in this lane, so this deeper unit leads instead.') +
      ' Only a frontline\u2019s colour fights.');
    n++;

    var sup = null;
    mine.members.forEach(function (m) {
      if (sup) return;
      if (m.row === ch.row && m.index === ch.index) return;
      sup = m;
    });
    if (sup) {
      marks.push({ n: n, at: { side: 'bottom', row: sup.row, index: sup.index } });
      legend.push('Your <b>' + unitName(board, ev, 'bottom', sup.row, sup.index) + '</b> is support here: it adds ' +
        ev.shares['bottom-' + sup.row + '-' + sup.index][lane.index] +
        ' strength to the lane, but its colour is ignored.');
      n++;
    }

    var tc = theirs.champion;
    marks.push({ n: n, at: { side: 'top', row: tc.row, index: tc.index } });
    legend.push('They front <b>' + unitName(board, ev, 'top', tc.row, tc.index) + '</b>. ' +
      (mine.effective ? C.colorInfo(mine.color).name + ' beats ' + C.colorInfo(theirs.color).name +
          ', so your whole lane doubles — that is the <b>\u00d7' + mine.multiplier + '</b> under your unit.'
       : theirs.effective ? C.colorInfo(theirs.color).name + ' beats ' + C.colorInfo(mine.color).name +
          ', so <b>their</b> lane doubles instead. Answer it with a colour that beats theirs.'
       : 'Neither colour beats the other, so both sides count flat here.'));

    return [{ title: 'Only the frontline fights',
      art: function () { return tutorialBoard({ units: liveUnits(board, ev), marks: marks }); },
      legend: legend }];
  },

  roundbreak: function (ctx) {
    var ev = ctx.ev, board = ctx.board, after = ctx.after, fallen = ctx.fallen;
    var faded = [];
    ['bottom', 'top'].forEach(function (sd) {
      fallen[sd].forEach(function (k) { faded.push(sd + '-' + k.split('|')[0] + '-' + k.split('|')[1]); });
    });
    if (!faded.length) return null;      // nothing fell; wait for a round that teaches it

    var marks = [], legend = [], n = 1, mineFell = fallen.bottom[0], used = [];
    var total = fallen.bottom.length + fallen.top.length;
    if (mineFell) {
      var p = mineFell.split('|'), row = p[0], idx = +p[1];
      marks.push({ n: n, at: { side: 'bottom', row: row, index: idx } });
      used.push(row + '-' + idx);
      legend.push('Every frontline in a <b>contested</b> lane is removed — both sides, all of them. ' +
        'That took ' + total + ' unit' + (total === 1 ? '' : 's') + ' here, including your <b>' +
        unitName(board, ev, 'bottom', row, idx) + '</b>, shown faded. Whatever stood behind them steps up.');
      n++;
    }

    /* Point at a unit that came through untouched, and never the same one twice. */
    var survivor = null;
    ev.lanes.forEach(function (lane) {
      if (survivor || !lane.bottom || lane.top) return;
      var c = lane.bottom.champion;
      if (used.indexOf(c.row + '-' + c.index) !== -1) return;
      survivor = c;
    });
    if (survivor) {
      marks.push({ n: n, at: { side: 'bottom', row: survivor.row, index: survivor.index } });
      legend.push('Your <b>' + unitName(board, ev, 'bottom', survivor.row, survivor.index) +
        '</b> was never contested — nothing fought there, so it <b>stays</b> for the next round.');
    } else {
      legend.push('A lane the enemy never contests costs you nothing: units there survive the break.');
    }

    return [{ title: 'The line breaks between rounds',
      art: function () { return tutorialBoard({ units: liveUnits(board, ev, faded), marks: marks }); },
      legend: legend }];
  }
};

function tutorialActive() { return tutorial.enabled && run && run.battlesFought === 0; }
function inFirstBattle() { return tutorial.enabled && run && run.battlesFought === 1; }
/* Lessons run across the whole act, not just the opening fight — several of them
   need a board situation that may not turn up until the third or fourth battle. */
function shouldTeach(key) { return tutorial.enabled && run && !tutorial.seen[key]; }
function tutorialOpen() { return els.tutorialOverlay && !els.tutorialOverlay.hidden; }
function teach(key, ctx) {
  if (!shouldTeach(key)) return false;
  var cards = TUTORIAL_LESSONS[key](ctx || {});
  if (!cards || !cards.length) return false;   // nothing worth pointing at yet
  tutorial.seen[key] = true;
  openTutorial(cards);
  return true;
}
function openTutorial(list) { tutorial.list = list; tutorial.step = 0; renderTutorial(); }

function renderTutorial() {
  var list = tutorial.list || TUTORIAL_STEPS;
  var st = list[tutorial.step];
  var single = list.length === 1;
  els.tutorialBody.innerHTML =
    (single ? '<span class="tut-count">Good to know</span>'
            : '<span class="tut-count">Step ' + (tutorial.step + 1) + ' of ' + list.length + '</span>') +
    '<h2>' + st.title + '</h2>' +
    (st.art ? '<div class="tut-art">' + st.art() + '</div>' : '') +
    (st.artHtml ? '<div class="tut-art plain">' + st.artHtml() + '</div>' : '') +
    (st.body ? '<p class="tut-text">' + st.body + '</p>' : '') +
    (st.legend ? tutorialLegend(st.legend) : '') +
    (single ? '' : '<div class="tut-dots">' + list.map(function (_, i) {
      return '<span class="tut-dot' + (i === tutorial.step ? ' on' : '') + '"></span>';
    }).join('') + '</div>');
  els.tutorialBack.hidden = single;
  els.tutorialSkip.hidden = single;
  els.tutorialBack.disabled = tutorial.step === 0;
  els.tutorialNext.textContent = single ? 'Got it'
    : (tutorial.step === list.length - 1 ? 'Start the battle' : 'Next');
  els.tutorialOverlay.hidden = false;
}
function tutorialStep(delta) {
  var list = tutorial.list || TUTORIAL_STEPS;
  tutorial.step += delta;
  if (tutorial.step < 0) tutorial.step = 0;
  if (tutorial.step >= list.length) { closeTutorial(); return; }
  renderTutorial();
}
function closeTutorial() {
  var wasOpen = !els.tutorialOverlay.hidden;
  els.tutorialOverlay.hidden = true;
  if (!wasOpen || !window.CV_BATTLE || !state) return;
  // another lesson may already be relevant; if not, let the enemy move
  if (!window.CV_BATTLE.teachNow()) window.CV_BATTLE.maybeOpponentMove();
}
function setTutorial(on) {
  tutorial.enabled = !!on;
  if (els.tutorialToggle) els.tutorialToggle.textContent = 'Tutorial: ' + (on ? 'on' : 'off');
  if (!on) closeTutorial();
}

/* ---------------- rewards ---------------- */
/* The road only offers you colours you already carry. Colourless cards are
   always on the table — they are the flexibility valve, and gating them would
   turn a narrowing into a strangling. This is what makes the Colour Lab load
   bearing: nothing else in the run can put a colour in your deck that is not
   already there, so a new colour is always something you made, never
   something you were handed. */
/* Cards whose whole text is about something the run has not produced yet.
   Being offered a Riftwalker before a single fissure exists is being offered a
   blank card: the player either takes dead weight or wastes the pick, and
   either way the reward screen lied about being a choice. These stay out of
   the pool until the thing they answer is actually on the board.

   Keyed off the run, not the battle, because a reward is chosen between
   fights — what matters is whether fissures exist at all, not whether any
   were on the last board. */
var NEEDS_FISSURES = ['black_riftwalker', 'black_chorus', 'cyan_mender', 'cyan_keystone'];
var NEEDS_HAZARDS  = ['cyan_shield', 'cyan_cleanser'];
var NEEDS_CURSES   = ['black_gravebloom', 'black_reclaimer', 'cyan_absolver'];

function curseCount(deck) {
  return (deck || []).filter(function (e) { return CARDS[e.id] && CARDS[e.id].curse; }).length;
}

function situationalOk(k) {
  if (NEEDS_FISSURES.indexOf(k) !== -1) return (run.fissures || []).length > 0;
  if (NEEDS_CURSES.indexOf(k) !== -1) return curseCount(run.deck) > 0;
  /* Hazards are not permanent like fissures — they are played from cards. So
     the test is whether the run can produce one at all: either you carry a
     hazard card, or you have met enemies deep enough to field them. */
  if (NEEDS_HAZARDS.indexOf(k) !== -1) {
    var haveHazard = run.deck.some(function (e) { return CARDS[e.id].type === 'hazard'; });
    return haveHazard || powerAt(run, run.depth) >= 6;
  }
  return true;
}

function offerableCards() {
  var held = C.colourCounts(run.deck);
  return C.DRAWABLE.filter(function (k) {
    var d = CARDS[k];
    if (!situationalOk(k)) return false;
    if (!d.color) return true;                 // colourless: always available
    return held[d.color] > 0;
  });
}

/* What declining a card is worth. Skipping used to be a pure loss, so the
   only reason to do it was discipline — and decks ran to forty-plus cards
   because taking something was always weakly better than taking nothing.
   Paying for the skip turns deck size into an economy: a lean deck is
   something you buy, round after round, instead of something you merely
   resist spending. Scales with power so it stays relevant late. */
function skipValue() {
  return 25 + powerAt(run, run.depth) * 3;
}

/* Two cuts per shop, at 50 then 75. Unlimited removal let a rich player
   empty their deck at a single bench, which made shops the whole answer to
   deck size and left events and reward-skipping doing nothing. Capping at two
   keeps thinning a steady spend across the run rather than one purge, and the
   rising price still makes the second cut a real decision. */
var SHOP_REMOVAL_LIMIT = 2;
/* Shop relics cost half again their printed price. With the battle trickle
   gone the shop is one of only two supplies, so a relic on the shelf should
   be a real purchase that competes with cards and removals for the same
   purse — not small change picked up in passing. */
var SHOP_RELIC_MARKUP = 1.5;
function shopRelicPrice(key) {
  return Math.round((RELICS[key].cost || 80) * SHOP_RELIC_MARKUP);
}

function removalCost(shop) {
  return 50 + ((shop && shop.removals) || 0) * 25;
}
function removalsLeft(shop) {
  return SHOP_REMOVAL_LIMIT - ((shop && shop.removals) || 0);
}

/* Card quality climbs with the run. The weights used to be fixed, so the last
   battle of a seven-act run offered the same wash of Commons as the first,
   and taking a reward stopped being worth the deck slot long before the run
   ended. Rares overtake Commons around the third act. */
function rarityWeights(power) {
  var t = Math.min(1, power / 45);              // 0 at the start, 1 by act four or so
  return {
    Common:   Math.max(1, 6 - t * 5),
    Uncommon: 3 + t * 2,
    Rare:     1 + t * 5
  };
}

function rollReward(node) {
  var count = 3 + (hasRelic(run.relics, 'collectors_frame') ? 1 : 0);

  /* An act boss hands over its own road's trophy: one of three Legendaries,
     chosen, never rolled. These are the only cards in the game that are both
     large and still carry text, so the drop is worth planning a route around
     — and because the pick is yours, the boss you beat is the boss you wanted
     to beat. Colour gating does not apply here: you earned it in the field. */
  if (node.type === 'boss') {
    var mine = ACTS[run.act] ? ACTS[run.act].color : null;
    var offer, shortfall = 0;
    if (ACTS[run.act] && ACTS[run.act].secret && C.SECRET_TROPHIES[run.act]) {
      /* A secret road drops its own three, unconditionally — never the seven
         colour trophies, never gated, never short. There is nothing to
         filter: these cards answer to no colour, so every run that reaches
         one gets the full choice every time. */
      offer = C.SECRET_TROPHIES[run.act].slice();
    } else {
      /* A trophy can only be a colour the run has actually opened. Letting the
         drop ignore the gate meant the Devouring Star could turn up off a
         lucky roll in act two — handing out the last road's signature card to
         someone who had never made a single Black, which is precisely the thing
         the colour gate exists to prevent. The act's own colour always
         qualifies: you just beat that road, so you hold it by definition. */
      var trophies = C.BOSS_CARDS.filter(function (k) {
        var col = CARDS[k].color;
        return !col || col === mine || C.actUnlocked(col, run.deck);
      });
      var own = trophies.filter(function (k) { return CARDS[k].color === mine; });
      var rest = trophies.filter(function (k) { return CARDS[k].color !== mine; });
      shuffle(rest);
      offer = own.concat(rest).slice(0, 3);
      /* If the run is still narrow there may not be three unlocked trophies.
         Rather than pad with locked ones, the boss pays the difference in gold —
         a short offer is honest, a padded one is a tease. */
      shortfall = 3 - offer.length;
    }
    offer = offer.map(function (k) { return { id: k, up: false }; });
    run.reward = {
      cards: offer, gold: 140 + Math.floor(rnd() * 30) + shortfall * 60, relic: null, node: node,
      taken: false, cardTaken: false, relicTaken: false, rotted: null, trophy: true
    };
    offer.forEach(function (c) { discoverCard(c.id); });
    var availB = RELIC_KEYS.filter(function (k) { return !hasRelic(run.relics, k); });
    if (availB.length && run.relics.length < C.RELIC_LIMIT) {
      run.reward.relic = availB[Math.floor(rnd() * availB.length)];
    }
    return;
  }

  var pool = offerableCards();
  /* An elite costs more to beat than an ordinary fight, so its card should
     read like it — better than a battle at the same depth, short of a boss's
     trophy pick. Read as fifteen power ahead on the same curve everything
     else already scales on, rather than a separate elite-only table. */
  var effPower = powerAt(run, node.depth) + (node.type === 'elite' ? 15 : 0);
  var weight = rarityWeights(effPower);
  var picks = [], guard = 0;
  while (picks.length < count && guard++ < 400) {
    var id = pool[Math.floor(rnd() * pool.length)];
    if (rnd() * 10 > (weight[CARDS[id].rarity] || 1)) continue;
    if (picks.some(function (p) { return p.id === id; })) continue;
    picks.push({ id: id, up: false });
  }
  var gold = (node.type === 'boss' ? 120 : node.type === 'elite' ? 80 : 35) + Math.floor(rnd() * 20);
  /* Whatever broke in the lab is loose now. The bigger things on the road carry
     it, and hand a little of it back to you. */
  var rotted = null;
  if ((run.corruption || 0) > 0 && (node.type === 'elite' || node.type === 'boss')) {
    if (rnd() < Math.min(0.65, 0.25 + run.corruption * 0.08)) {
      var held = {};
      run.deck.forEach(function (c) { if (CARDS[c.id].curse) held[c.id] = true; });
      var fresh = C.CURSE_KEYS.filter(function (k) { return !held[k]; });
      rotted = gainCurse((fresh.length ? fresh : C.CURSE_KEYS)[Math.floor(rnd() * (fresh.length ? fresh.length : C.CURSE_KEYS.length))]);
    }
  }
  /* Relics come from the things worth beating, never from a lucky roll on an
     ordinary fight. An 18% trickle off every battle meant relics arrived as
     background noise — you were never *going* anywhere for one, so they never
     redirected a build. Now an elite or a boss always hands one over, next to
     the card, and everything else hands over none. That makes the elite on
     the road a decision ("do I want what it is guarding?") rather than a
     tax, and it makes the shop the only other supply. */
  var relic = null;
  if (node.type === 'elite' || node.type === 'boss') {
    var avail = RELIC_KEYS.filter(function (k) { return !hasRelic(run.relics, k); });
    if (avail.length) relic = avail[Math.floor(rnd() * avail.length)];
  }
  picks.forEach(function (c) { discoverCard(c.id); });
  if (rotted) discoverCard(rotted.id);
  run.reward = { cards: picks, gold: gold, relic: relic, node: node, taken: false, cardTaken: false, relicTaken: false, rotted: rotted };
}

function renderReward() {
  var r = run.reward;

  els.rewardRot.hidden = !r.rotted;
  els.rewardRot.innerHTML = r.rotted
    ? 'Something clung to it. <b>' + r.rotted.name + '</b> is in your deck now — ' + r.rotted.text
    : '';
  els.rewardCards.innerHTML = r.cards.map(function (c, i) {
    return '<button class="reward-pick' + (r.cardTaken ? ' taken' : '') + '" data-i="' + i + '"' +
      (r.cardTaken ? ' disabled' : '') + '>' + cardMini(c) + '</button>';
  }).join('');
  var lead = document.getElementById('rewardLead');
  var head = document.getElementById('rewardHead');
  if (head) head.textContent = r.trophy ? 'The road gives up its prize' : 'Spoils';
  if (lead) {
    /* A relic is a second, independent prize, not an alternative to the card
       — this line used to sit on both a card AND a relic and the click
       handler quietly let you leave with only one of them, since either
       button advanced past the whole reward on its own. Said plainly here so
       a player who has taken the card still knows the relic is theirs too. */
    var relicNote = r.relic ? (r.cardTaken ? ' The relic is still yours to take.' : ' Take the relic too — it is not instead of the card.') : '';
    lead.innerHTML = r.trophy
      ? 'You earned <b>' + r.gold + '</b> gold, and the act itself. Take one of these three \u2014 ' +
        'they are the only cards on the road that are both this large and still do something.' + relicNote
      : 'You earned <b>' + r.gold + '</b> gold. Take one card, or skip to keep your deck lean \u2014 ' +
        'it currently holds <b>' + run.deck.length + '</b> cards, and a smaller deck draws its best cards more often.' + relicNote;
  }
  var skipBtn = document.getElementById('skipRewardBtn');
  if (skipBtn) {
    // there is no sane reason to decline a trophy, so do not dangle a price
    skipBtn.hidden = !!r.trophy || !!r.cardTaken;
    skipBtn.textContent = 'Skip the card \u2014 take ' + skipValue() + ' gold instead';
  }
  els.screen_reward.classList.toggle('trophy', !!r.trophy);
  els.rewardRelic.hidden = !r.relic;
  // Clear it either way — leaving the previous reward's markup in a hidden
  // container leaves a live button behind that can push a null relic.
  els.rewardRelic.innerHTML = r.relic
    ? '<span class="lbl">Relic on offer' + (r.relicTaken ? ' \u2014 taken' : '') + '</span>' +
      '<button class="reward-pick relic' + (r.relicTaken ? ' taken' : '') + '" data-relic="1"' +
      (r.relicTaken ? ' disabled' : '') + '>' +
      '<div class="mini-card relicbox"><span class="mini-name">' + RELICS[r.relic].name + '</span>' +
      '<span class="mini-text">' + RELICS[r.relic].text + '</span></div></button>'
    : '';
  /* Advance only once every prize on offer has been resolved: the card slot
     (taken or skipped) and the relic slot (taken, or simply absent). Either
     button used to set one shared `taken` flag and leave immediately —
     whichever you clicked first was the only one you ever got. */
  function maybeAdvance() {
    if (r.cardTaken && (!r.relic || r.relicTaken)) { r.taken = true; advance(); }
    else renderReward();
  }
  Array.prototype.forEach.call(els.screen_reward.querySelectorAll('.reward-pick'), function (b) {
    b.addEventListener('click', function () {
      if (b.getAttribute('data-relic')) {
        if (!r.relic || r.relicTaken) return;
        run.relics.push(r.relic);
        r.relicTaken = true;
      } else {
        if (r.cardTaken) return;
        run.deck.push(r.cards[+b.getAttribute('data-i')]);
        r.cardTaken = true;
      }
      renderRunBar();
      maybeAdvance();
    });
  });
}

/* ---------------- shop ---------------- */
function rollShop() {
  var cards = [], guard = 0, stock = offerableCards();
  while (cards.length < 5 && guard++ < 200) {
    var id = stock[Math.floor(rnd() * stock.length)];
    if (cards.some(function (c) { return c.id === id; })) continue;
    cards.push({ id: id, up: false });
  }
  var avail = RELIC_KEYS.filter(function (k) { return !hasRelic(run.relics, k); });
  shuffle(avail);
  cards.forEach(function (c) { discoverCard(c.id); });
  run.shop = { cards: cards, relics: avail.slice(0, 2), removalUsed: false, sold: {} };
}
function renderShop() {
  var s = run.shop;
  els.shopCards.innerHTML = s.cards.map(function (c, i) {
    var price = CARDS[c.id].cost || 30;
    var owned = s.sold['c' + i];
    return '<button class="shop-item" data-c="' + i + '"' + (owned || run.gold < price ? ' disabled' : '') + '>' +
      cardMini(c) + '<span class="price">' + (owned ? 'Sold' : price + 'g') + '</span></button>';
  }).join('');
  els.shopRelics.innerHTML = s.relics.map(function (k, i) {
    var price = shopRelicPrice(k), owned = s.sold['r' + i];
    return '<button class="shop-item" data-r="' + i + '"' + (owned || run.gold < price ? ' disabled' : '') + '>' +
      '<div class="mini-card relicbox"><span class="mini-name">' + RELICS[k].name + '</span><span class="mini-text">' + RELICS[k].text + '</span></div>' +
      '<span class="price">' + (owned ? 'Sold' : price + 'g') + '</span></button>';
  }).join('');
  /* Removal is repeatable now, at a price that climbs each time. One removal
     per shop could not keep pace with a deck growing every battle, but making
     it flatly unlimited would trivialise deck size instead. A rising cost
     lets a player who is committed to a lean deck spend their whole purse on
     it, while still charging real money for the privilege. */
  var cost = removalCost(s), left = removalsLeft(s);
  els.shopRemove.disabled = run.gold < cost || run.deck.length <= 5 || left <= 0;
  els.shopRemove.textContent = left <= 0 ? 'This bench has cut all it will'
    : run.deck.length <= 5 ? 'Deck is as lean as it goes'
    : s.removing ? 'Pick a card to burn \u2014 or tap to cancel'
    : 'Remove a card \u2014 ' + cost + 'g' + (left < SHOP_REMOVAL_LIMIT ? ' (last one here)' : '');
  els.shopRemove.classList.toggle('armed', !!s.removing);

  /* The picker lives under the button rather than in a modal: it is a deck
     view with one extra job, and the deck is already the thing the player is
     looking at when they decide something has to go. */
  var pick = document.getElementById('shopRemovePick');
  if (pick) {
    pick.hidden = !s.removing || left <= 0;
    pick.innerHTML = pick.hidden ? '' :
      '<p class="screen-lead">' + cost + ' gold and it is gone from the run for good. ' +
      (left > 1 ? 'This bench will cut ' + left + ' cards in all.' : 'This is the last cut on offer here.') + '</p>' +
      '<div class="deck-grid">' + run.deck.map(function (c, i) {
        return '<button class="swap-card" data-burn="' + i + '">' + cardMini(c) + '</button>';
      }).join('') + '</div>';
    Array.prototype.forEach.call(pick.querySelectorAll('[data-burn]'), function (b) {
      b.addEventListener('click', function () {
        if (run.gold < cost || run.deck.length <= 5 || removalsLeft(s) <= 0) return;
        run.gold -= cost;
        run.deck.splice(+b.getAttribute('data-burn'), 1);
        s.removals = (s.removals || 0) + 1; s.removing = false;
        renderRunBar(); show('shop');
      });
    });
  }

  Array.prototype.forEach.call(els.shopCards.querySelectorAll('.shop-item'), function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-c'), price = CARDS[s.cards[i].id].cost || 30;
      if (run.gold < price) return;
      run.gold -= price; s.sold['c' + i] = true;
      run.deck.push(s.cards[i]);
      renderRunBar(); renderShop();
    });
  });
  Array.prototype.forEach.call(els.shopRelics.querySelectorAll('.shop-item'), function (b) {
    b.addEventListener('click', function () {
      // same price function the shelf displays, so the two cannot disagree
      var i = +b.getAttribute('data-r'), k = s.relics[i], price = shopRelicPrice(k);
      if (run.gold < price) return;
      run.gold -= price; s.sold['r' + i] = true; run.relics.push(k);
      renderRunBar(); renderShop();
    });
  });
}

/* ---------------- colour lab ----------------
   Entering the lab rolls one of three scenarios. Two are steady, deliberate
   improvements; the third is the Volatile Lab, a press-your-luck machine where
   every pull compounds both the payoff and the odds of walking out cursed. */
/* The Volatile Lab is its own place on the map now, so the ordinary lab offers
   only the two steady improvements. */
var LAB_SCENARIOS = [
  { key: 'fuse', weight: 45 },
  { key: 'boost', weight: 55 }
];

function rollLab() {
  var total = 0;
  LAB_SCENARIOS.forEach(function (x) { total += x.weight; });
  var r = rnd() * total, key = 'boost';
  for (var i = 0; i < LAB_SCENARIOS.length; i++) {
    r -= LAB_SCENARIOS[i].weight;
    if (r <= 0) { key = LAB_SCENARIOS[i].key; break; }
  }
  run.lab = { kind: key, picks: [], presses: 0, results: [], done: false, curses: 0 };
}

function deckUnits() {
  return run.deck.map(function (c, i) { return { c: c, i: i }; })
    .filter(function (e) { return CARDS[e.c.id].type === 'unit'; });
}
function randomUnitIndex() {
  var u = deckUnits();
  return u.length ? u[Math.floor(rnd() * u.length)].i : -1;
}

function renderLab() {
  if (!run.lab) rollLab();
  var lab = run.lab;
  if (lab.kind === 'volatile') return renderVolatileLab();
  if (lab.kind === 'fuse') return renderFuseLab();
  return renderBoostLab();
}

/* --- permanent fusion --- */
function renderFuseLab() {
  var lab = run.lab, units = deckUnits();
  var preview = '';
  if (lab.picks.length === 2) {
    var a = run.deck[lab.picks[0]], b = run.deck[lab.picks[1]];
    var p = C.fusePreview(a, b), ci = C.colorInfo(p.color);
    /* Fusing a secondary against the one primary it does not already contain
       cannot make Black on its own — that takes two secondaries. The mix
       still happens; it just stays the secondary, added together. Worth
       saying here, since the printed maths ("+bonus, Black in the mix")
       otherwise implies something it is not doing. */
    var rawWouldBe = C.mixColor(CARDS[a.id].color, CARDS[b.id].color);
    var redirected = rawWouldBe === 'black' && p.color !== 'black';
    preview = '<div class="lab-preview"><span class="lbl">Result</span>' +
      '<div class="mini-card" style="--card:' + ci.hex + ';--card-ink:' + ci.ink + '">' +
      '<span class="mini-top">' + p.strength + '</span>' +
      '<span class="mini-name">' + ci.name + ' Amalgam</span>' +
      '<span class="mini-text">' + C.cardName(a) + ' + ' + C.cardName(b) + ' + ' + p.bonus + '. No rules text.</span></div>' +
      (redirected ? '<p class="legend-note">Black only comes from two secondary colours — this stays ' +
        ci.name + ', just stronger.</p>' : '') +
      '<button class="primary" id="labConfirm">Fuse them permanently</button></div>';
  }
  els.labBody.innerHTML = '<h2>Permanent Fusion</h2>' +
    '<p class="screen-lead">Pick two units from your deck. They are consumed and reforged into a single card ' +
    'following the usual mixing rules — colours combine, strengths add plus one, plus two if Black is in the mix. ' +
    'Like any mixed unit, the result carries no rules text.</p>' +
    '<div class="deck-grid">' + units.map(function (e) {
      var on = lab.picks.indexOf(e.i) !== -1;
      return '<button class="swap-card' + (on ? ' picked' : '') + '" data-i="' + e.i + '">' + cardMini(e.c) + '</button>';
    }).join('') + '</div>' + preview;

  Array.prototype.forEach.call(els.labBody.querySelectorAll('.swap-card'), function (btn) {
    btn.addEventListener('click', function () {
      var i = +btn.getAttribute('data-i'), at = lab.picks.indexOf(i);
      if (at !== -1) lab.picks.splice(at, 1);
      else if (lab.picks.length < 2) lab.picks.push(i);
      renderFuseLab();
    });
  });
  var conf = document.getElementById('labConfirm');
  if (conf) conf.addEventListener('click', function () {
    if (lab.done) return;
    lab.done = true;
    var hi = Math.max(lab.picks[0], lab.picks[1]), lo = Math.min(lab.picks[0], lab.picks[1]);
    var fused = fuseInDeck(run.deck[lo], run.deck[hi]);
    run.deck.splice(hi, 1); run.deck.splice(lo, 1);
    run.deck.push(fused);
    renderRunBar();
    advance();
  });
}

/* --- reinforcement --- */
function renderBoostLab() {
  var lab = run.lab, units = deckUnits();
  if (lab.done) {
    els.labBody.innerHTML = '<h2>Reinforcement</h2>' +
      '<p class="screen-lead">' + lab.message + '</p>' +
      '<div class="deck-grid">' + cardMini(run.deck[lab.target]) + '</div>' +
      '<button class="primary" id="labLeave">Leave the lab</button>';
    document.getElementById('labLeave').addEventListener('click', advance);
    return;
  }
  els.labBody.innerHTML = '<h2>Reinforcement</h2>' +
    '<p class="screen-lead">Pick a unit to reinforce. The bench is imprecise — it will add either ' +
    '<b>+1</b> or <b>+2</b> strength, permanently.</p>' +
    '<div class="deck-grid">' + units.map(function (e) {
      return '<button class="swap-card" data-i="' + e.i + '">' + cardMini(e.c) + '</button>';
    }).join('') + '</div>';
  Array.prototype.forEach.call(els.labBody.querySelectorAll('.swap-card'), function (btn) {
    btn.addEventListener('click', function () {
      if (lab.done) return;
      var i = +btn.getAttribute('data-i');
      var amount = rnd() < 0.65 ? 1 : 2;
      run.deck[i] = liftStrength(run.deck[i], amount);
      lab.done = true; lab.target = i;
      lab.message = 'The bench settles on <b>+' + amount + '</b>.';
      renderRunBar();
      renderBoostLab();
    });
  });
}

/* Permanent strength and colour changes need a card of their own, since the
   printed value lives in the card database rather than on the deck entry.

   Every one of these is minted at runtime, which makes it invisible to a save
   file: a deck entry pointing at `lifted_4` is a dangling reference the moment
   the page reloads. So each mint also writes a recipe into run.minted, and
   loading a save replays those recipes in order to rebuild the definitions
   before the deck is read. Recipes, not definitions, because a definition
   carries live functions and would not survive JSON.

   The strength lift copies with Object.assign rather than naming fields one
   at a time. The old field list quietly dropped anything it did not mention —
   reinforcing a fused card threw away its `fused` and `silenced` flags, so a
   silenced Amalgam came off the bench newly open to auras. */
var liftSeq = 0;
function mintId() { return 'lifted_' + (++liftSeq); }
function recordMint(recipe) {
  if (run && run.minted) run.minted.push(recipe);
}
function applyLift(id, fromId, up, amount) {
  var d = CARDS[fromId];
  if (!d || d.type !== 'unit') return null;
  CARDS[id] = Object.assign({}, d, {
    strength: C.cardStrength({ id: fromId, up: up }) + amount,
    cost: (d.cost || 30) + amount * 10,
    reforged: true
  });
  return id;
}
function applyRecolour(id, fromId, up, color) {
  var d = CARDS[fromId];
  if (!d || d.type !== 'unit') return null;
  CARDS[id] = Object.assign({}, d, {
    color: color, strength: C.cardStrength({ id: fromId, up: up }), reforged: true
  });
  return id;
}
function liftStrength(entry, amount) {
  if (CARDS[entry.id].type !== 'unit') return entry;
  var id = mintId();
  if (!applyLift(id, entry.id, entry.up, amount)) return entry;
  recordMint({ k: 'lift', id: id, from: entry.id, up: !!entry.up, amount: amount });
  return { id: id, up: false };
}
function recolourCard(entry, color) {
  if (CARDS[entry.id].type !== 'unit') return entry;
  var id = mintId();
  if (!applyRecolour(id, entry.id, entry.up, color)) return entry;
  recordMint({ k: 'recolour', id: id, from: entry.id, up: !!entry.up, color: color });
  return { id: id, up: false };
}
/* The Lab's permanent fusion mints too, so it needs the same ledger entry. */
function fuseInDeck(a, b) {
  var out = C.fuseCards(a, b);
  /* The inherited effect list is recorded, not recomputed. Once a fusion
     carries more than three effects the surplus is dropped at random, so
     replaying the same two parents on load would roll a different card than
     the one the player is actually holding. */
  recordMint({ k: 'fuse', id: out.id, a: a.id, aUp: !!a.up, b: b.id, bUp: !!b.up,
               eff: (out.effectSources || []).slice() });
  return out;
}
/* Replay a ledger onto CARDS. Order matters: a lift can be built on a recolour
   which was built on a fusion, so recipes are applied exactly as recorded. */
function replayMints(ledger) {
  var highest = 0, highestFusion = 0;
  (ledger || []).forEach(function (m) {
    if (m.k === 'lift') applyLift(m.id, m.from, m.up, m.amount);
    else if (m.k === 'recolour') applyRecolour(m.id, m.from, m.up, m.color);
    else if (m.k === 'fuse') {
      var made = C.fuseCards({ id: m.a, up: m.aUp }, { id: m.b, up: m.bUp }, m.eff);
      CARDS[m.id] = CARDS[made.id];          // re-key onto the id the deck remembers
      var fn = +String(made.id).split('_')[1];
      if (fn > highestFusion) highestFusion = fn;
    }
    var n = +String(m.id).split('_')[1];
    if (m.k !== 'fuse' && n > highest) highest = n;
  });
  if (highest > liftSeq) liftSeq = highest;
}

/* --- the volatile lab --- */
var VOLATILE_EFFECTS = ['boost', 'recolor', 'fuse'];

/* Which colours a random recolour is allowed to land on.

   The volatile bench used to roll across all seven, Black included, which
   quietly made it the fastest route to the last act: three lucky presses in
   act one and the Wastelands were nearly open, with no mixing done at all.
   That is the colour wheel being bypassed rather than climbed \u2014 the whole
   point of the gate is that Black is Red and Green and Blue, earned two
   fusions at a time.

   So a recolour can only reach a colour you could already have made: the
   primaries, plus any secondary whose two parents are both in your deck. It
   can never mint Black. Black stays something you build. */
function recolourPalette() {
  var held = C.colourCounts(run.deck), out = C.PRIMARY_COLORS.slice();
  var PARENTS = { yellow: ['red', 'green'], cyan: ['green', 'blue'], magenta: ['red', 'blue'] };
  Object.keys(PARENTS).forEach(function (k) {
    if (held[k] > 0 || PARENTS[k].every(function (p) { return held[p] > 0; })) out.push(k);
  });
  return out;
}

function curseRisk(presses) { return Math.min(0.75, 0.06 + presses * 0.06); }

function applyVolatile(kind) {
  var i, j;
  if (kind === 'boost') {
    i = randomUnitIndex();
    if (i < 0) return null;
    var before = C.cardName(run.deck[i]);
    run.deck[i] = liftStrength(run.deck[i], 1);
    return before + ' grows to ' + C.cardStrength(run.deck[i]);
  }
  if (kind === 'recolor') {
    i = randomUnitIndex();
    if (i < 0) return null;
    var pal = recolourPalette();
    var col = pal[Math.floor(rnd() * pal.length)];
    var was = C.colorInfo(CARDS[run.deck[i].id].color).name;
    run.deck[i] = recolourCard(run.deck[i], col);
    return C.cardName(run.deck[i]) + ' turns ' + was + ' \u2192 ' + C.COLORS[col].name;
  }
  if (kind === 'fuse') {
    var units = deckUnits();
    // Curses inflate deck length, so guard on playable units instead: fusing
    // down to a two-card deck padded with curses is not a payoff, it is a brick.
    if (units.length < 5) return null;   // never fuse below four playable units
    /* Every pairing is legal now — mixing is never refused, only redirected —
       so the bench is free to pick any two units exactly as mixing on the
       board can. A secondary landing on the wrong primary here just comes
       back as that secondary, stronger, the same as it would in battle. */
    i = units[Math.floor(rnd() * units.length)].i;
    do { j = units[Math.floor(rnd() * units.length)].i; } while (j === i && units.length > 1);
    if (i === j) return null;
    var hi = Math.max(i, j), lo = Math.min(i, j);
    var na = C.cardName(run.deck[lo]), nb = C.cardName(run.deck[hi]);
    var fused = fuseInDeck(run.deck[lo], run.deck[hi]);
    run.deck.splice(hi, 1); run.deck.splice(lo, 1);
    run.deck.push(fused);
    return na + ' and ' + nb + ' collapse into ' + CARDS[fused.id].name + ' ' + CARDS[fused.id].strength;
  }
  return null;
}

function volatilePress() {
  var lab = run.lab;
  lab.presses++;

  if (rnd() < curseRisk(lab.presses - 1)) {
    var held = {};
    run.deck.forEach(function (c) { if (CARDS[c.id].curse) held[c.id] = true; });
    var fresh = C.CURSE_KEYS.filter(function (k) { return !held[k]; });
    var pool = fresh.length ? fresh : C.CURSE_KEYS;
    var key = pool[Math.floor(rnd() * pool.length)];
    gainCurse(key);
    lab.curses++;
    lab.results.unshift({ tone: 'curse', text: 'The mixture turns on you — <b>' + CARDS[key].name +
      '</b> is now in your deck. ' + CARDS[key].text });
    renderRunBar();
    renderVolatileLab();
    return;
  }

  var r = rnd(), count = 1, tone = 'ok';
  if (r > 0.988) {                       // the whole bench goes up
    cascade(lab);
    renderRunBar();
    renderVolatileLab();
    return;
  }
  if (r > 0.86) { count = 3; tone = 'big'; }
  else if (r > 0.62) { count = 2; tone = 'good'; }

  var lines = [], tries = 0;
  while (lines.length < count && tries++ < 12) {
    var out = applyVolatile(VOLATILE_EFFECTS[Math.floor(rnd() * VOLATILE_EFFECTS.length)]);
    if (out) lines.push(out);
  }
  if (!lines.length) lines.push('The mixture fizzles. Nothing changes.');
  lab.results.unshift({ tone: tone, text: (count > 1 ? '<b>\u00d7' + lines.length + '</b> ' : '') + lines.join(' \u00b7 ') });
  renderRunBar();
  renderVolatileLab();
}

function cascade(lab) {
  var touched = 0;
  // everything you own, all at once
  for (var i = 0; i < run.deck.length; i++) {
    if (CARDS[run.deck[i].id].type !== 'unit') continue;
    run.deck[i] = liftStrength(run.deck[i], 1);
    var pal2 = recolourPalette();
    run.deck[i] = recolourCard(run.deck[i], pal2[Math.floor(rnd() * pal2.length)]);
    touched++;
  }
  var fusions = 0;
  for (var f = 0; f < 2; f++) { if (applyVolatile('fuse')) fusions++; }
  lab.results.unshift({ tone: 'cascade',
    text: '<b>THE WHOLE BENCH GOES UP.</b> Every one of your ' + touched +
      ' units gains strength and a new colour' + (fusions ? ', and ' + fusions + ' pair' +
      (fusions > 1 ? 's' : '') + ' collapse together' : '') + '.' });
}

function renderVolatileLab() {
  var lab = run.lab;
  var risk = Math.round(curseRisk(lab.presses) * 100);
  els.labBody.innerHTML = '<h2>The Volatile Lab</h2>' +
    '<p class="screen-lead">Something is already bubbling. Pull the lever as often as you dare — ' +
    'each pull reshapes your deck, and each one makes the next more likely to bite.</p>' +
    '<div class="vol-meter"><div class="vol-row"><span class="lbl">Curse risk on the next pull</span>' +
    '<b class="' + (risk > 45 ? 'hot' : risk > 25 ? 'warm' : '') + '">' + risk + '%</b></div>' +
    '<div class="vol-bar"><span style="width:' + Math.min(100, risk / 0.75) + '%"></span></div>' +
    '<div class="vol-row"><span class="lbl">Pulls</span><b>' + lab.presses + '</b>' +
    '<span class="lbl">Curses taken</span><b class="' + (lab.curses ? 'hot' : '') + '">' + lab.curses + '</b></div></div>' +
    '<div class="vol-actions"><button class="primary danger" id="labPress">Pull the lever</button>' +
    '<button class="primary" id="labLeave">Leave with what you have</button></div>' +
    (lab.results.length ? '<ul class="vol-log">' + lab.results.map(function (r) {
      return '<li class="' + r.tone + '">' + r.text + '</li>';
    }).join('') + '</ul>' : '<p class="muted" style="font-size:12.5px">Nothing pulled yet.</p>');

  document.getElementById('labPress').addEventListener('click', volatilePress);
  document.getElementById('labLeave').addEventListener('click', advance);
}

/* ---------------- events ---------------- */
var EVENTS = [
  { title: 'A Spilled Palette', text: 'Pigment pools across the road. You can scoop some up, or step around it.',
    options: [
      { label: 'Scoop it — gain 45 gold, lose 1 life', run: function () { run.gold += 45; run.lives--; } },
      { label: 'Step around — nothing happens', run: function () {} }
    ] },
  { title: 'The Grinder', text: 'A stone wheel offers to sharpen one card, but it wears the rest.',
    options: [
      { label: 'Sharpen — upgrade a random active card', run: function () { var i = Math.floor(rnd() * run.deck.length); run.deck[i].up = true; } },
      { label: 'Walk on — gain 20 gold', run: function () { run.gold += 20; } }
    ] },
  { title: 'Colour Merchant', text: 'A trader will take a card off your hands for coin.',
    options: [
      { label: 'Sell a card — remove one at random, gain 60 gold', run: function () { if (run.deck.length > 5) { run.deck.splice(Math.floor(rnd() * run.deck.length), 1); run.gold += 60; } } },
      { label: 'Decline', run: function () {} }
    ] },
  { title: 'Abandoned Studio', text: 'Someone left their tools behind.',
    options: [
      { label: 'Take the relic — pay 40 gold', run: function () {
          if (run.gold < 40) return;
          run.gold -= 40;
          var avail = RELIC_KEYS.filter(function (k) { return !hasRelic(run.relics, k); });
          if (avail.length && run.relics.length < C.RELIC_LIMIT) run.relics.push(avail[Math.floor(rnd() * avail.length)]);
        } },
      { label: 'Rest instead \u2014 restore 1 life', run: function () { run.lives = Math.min(run.maxLives, run.lives + 1); } }
    ] },

  /* Deck-thinning events. The road grows a deck every single battle, so it
     needs places that shrink one back. These let a player choose *which* card
     goes, which matters far more than the count \u2014 a random cull is a tax, a
     chosen cull is deckbuilding. */
  { title: 'The Kiln', text: 'A furnace burns hot enough to take a card out of a run for good. It asks nothing for it.',
    options: [
      { label: 'Burn a card of your choosing', pick: 'remove', run: function () {} },
      { label: 'Leave it cold \u2014 gain 30 gold', run: function () { run.gold += 30; } }
    ] },
  { title: 'The Winnower', text: 'A figure sorts your deck without asking, and offers to keep only what is working.',
    options: [
      { label: 'Let it cut two \u2014 you choose both', pick: 'remove2', run: function () {} },
      { label: 'Refuse \u2014 upgrade a random card instead', run: function () {
          if (run.deck.length) run.deck[Math.floor(rnd() * run.deck.length)].up = true; } }
    ] },
  { title: 'Dead Weight', text: 'Your pack is heavier than it was. Something in it has stopped pulling its weight.',
    options: [
      { label: 'Cut the weakest card \u2014 and gain 40 gold', run: function () {
          if (run.deck.length <= 5) { run.gold += 40; return; }
          var worst = 0;
          run.deck.forEach(function (e, i) {
            if (C.cardStrength(e) < C.cardStrength(run.deck[worst])) worst = i;
          });
          run.deck.splice(worst, 1); run.gold += 40;
        } },
      { label: 'Carry it all \u2014 restore 1 life', run: function () { run.lives = Math.min(run.maxLives, run.lives + 1); } }
    ] },
  { title: 'The Sieve', text: 'Fine mesh, endlessly patient. It will strain the curses out \u2014 and a little else besides.',
    options: [
      { label: 'Strain it \u2014 remove every curse from your deck', run: function () {
          run.deck = run.deck.filter(function (e) { return !CARDS[e.id].curse; });
        } },
      { label: 'Trust your own hands \u2014 gain 50 gold', run: function () { run.gold += 50; } }
    ] }
];
function rollEvent() {
  run.event = EVENTS[Math.floor(rnd() * EVENTS.length)];
  run.eventTaken = false;
  run.eventPick = null;
}
function renderEvent() {
  var e = run.event;
  /* Some options do not resolve on the tap — they open a picker, because
     *which* card leaves matters more than how many. The event stays on screen
     until the choice is made rather than advancing underneath the player. */
  if (run.eventPick) {
    var left = run.eventPick.left;
    els.eventBody.innerHTML = '<h2>' + e.title + '</h2>' +
      '<p class="screen-lead">Choose ' + (left > 1 ? left + ' cards' : 'a card') +
      ' to take out of the run for good.</p>' +
      '<div class="deck-grid">' + run.deck.map(function (c, i) {
        return '<button class="swap-card" data-cut="' + i + '">' + cardMini(c) + '</button>';
      }).join('') + '</div>';
    Array.prototype.forEach.call(els.eventBody.querySelectorAll('[data-cut]'), function (b) {
      b.addEventListener('click', function () {
        if (run.deck.length <= 5) { run.eventPick = null; advance(); return; }
        run.deck.splice(+b.getAttribute('data-cut'), 1);
        run.eventPick.left--;
        if (run.eventPick.left <= 0) { run.eventPick = null; renderRunBar(); advance(); return; }
        renderRunBar(); show('event');
      });
    });
    return;
  }
  els.eventBody.innerHTML = '<h2>' + e.title + '</h2><p class="screen-lead">' + e.text + '</p><div class="lab-opts">' +
    e.options.map(function (o, i) { return '<button class="lab-opt" data-i="' + i + '">' + o.label + '</button>'; }).join('') + '</div>';
  Array.prototype.forEach.call(els.eventBody.querySelectorAll('.lab-opt'), function (b) {
    b.addEventListener('click', function () {
      // A fast double tap used to resolve the same option twice — and cost two lives.
      if (run.eventTaken) return;
      run.eventTaken = true;
      var opt = e.options[+b.getAttribute('data-i')];
      opt.run();
      renderRunBar();
      if (run.lives <= 0) { show('gameover'); return; }
      if (opt.pick && run.deck.length > 5) {
        run.eventPick = { left: opt.pick === 'remove2' ? 2 : 1 };
        show('event');
        return;
      }
      advance();
    });
  });
}

function renderGameOver() {
  var won = run.lives > 0 && run.actsCleared.length > 0;
  var conquered = allActsConquered(run);
  var last = run.actsCleared[run.actsCleared.length - 1];
  var head, lead;
  if (!won) {
    /* Dying inside an endless run is still a real ending, and a proud one —
       it deserves its own line rather than reading identically to dying on
       the very first act. */
    head = run.endless ? 'The endless road ends' : 'Run over';
    lead = run.endless
      ? 'Every road had already fallen once before this one finally took you — in ' +
        ACTS[run.act].name + ', at depth ' + (run.depth + 1) + '.'
      : 'You ran out of lives in ' + ACTS[run.act].name + ', at depth ' + (run.depth + 1) + '.';
  } else if (SECRET_ACT_KEYS.some(function (k) { return run.actsCleared.indexOf(k) !== -1; })) {
    var walkedSecret = SECRET_ACT_KEYS.filter(function (k) { return run.actsCleared.indexOf(k) !== -1; });
    var lastSecret = walkedSecret[walkedSecret.length - 1];
    var SECRET_END = {
      white: 'You brought every colour back to the one place that had none, and it was enough.',
      rot:   'You walked into the thing your own rot had been building, and it stopped singing.',
      rift:  'You fought it on ground that was breaking under both of you, and you were the one still standing.'
    };
    head = ACTS[lastSecret].name;
    lead = (SECRET_END[lastSecret] || '') + ' There is no road after this one.';
  } else if (conquered) {
    head = 'Every road conquered';
    lead = 'You broke ' + ENEMIES[ACTS[last].boss].name + ' and walked every road there is. ' +
      'You chose to stop here, with the whole wheel behind you.';
  } else {
    head = 'Run complete';
    lead = 'You broke ' + ENEMIES[ACTS[last].boss].name + ' and walked out of ' + ACTS[last].name +
      '. There is no road left that your deck can open — for now, that is the end of it.';
  }
  var loops = run.endless
    ? '<div><span class="tag">LOOPS</span><b>' +
      Math.max(1, run.actsCleared.length - ACT_KEYS.length + 1) + '</b></div>' : '';
  els.gameoverBody.innerHTML = '<h2>' + head + '</h2>' +
    '<p class="screen-lead">' + lead + '</p>' +
    '<div class="summary"><div><span class="tag">ACTS CLEARED</span><b>' + run.actsCleared.length + '</b></div>' +
    loops +
    '<div><span class="tag">BATTLES WON</span><b>' + run.battlesWon + '</b></div>' +
    '<div><span class="tag">GOLD</span><b>' + run.gold + '</b></div>' +
    '<div><span class="tag">RELICS</span><b>' + run.relics.length + '</b></div>' +
    '<div><span class="tag">DECK</span><b>' + run.deck.length + '</b></div></div>' +
    '<div class="deck-grid">' + run.deck.map(function (c) { return cardMini(c); }).join('') + '</div>';
}

const CV_RUN = {
  getRun: function () { return run; }, setRun: function (r) { run = r; },
  newRun: newRun, buildMap: buildMap, startingDeck: startingDeck, clearFrontlines: clearFrontlines,
  ACTS: ACTS, ACT_KEYS: ACT_KEYS, ACT_LENGTH: ACT_LENGTH, ACT_PLANNED: ACT_PLANNED,
  eligibleActs: eligibleActs, powerAt: powerAt, finishAct: finishAct, beginAct: beginAct,
  allActsConquered: allActsConquered, goEndless: goEndless, endAsVictory: endAsVictory,
  whiteUnlocked: whiteUnlocked, rotUnlocked: rotUnlocked, riftUnlocked: riftUnlocked,
  secretOffers: secretOffers, ROT_THRESHOLD: ROT_THRESHOLD, RIFT_THRESHOLD: RIFT_THRESHOLD,
  SECRET_ACT_KEYS: SECRET_ACT_KEYS,
  renderVictory: renderVictory,
  eliteFor: eliteFor, elitesOf: elitesOf,
  applyActTheme: applyActTheme, offerableCards: offerableCards, ACT_ART: ACT_ART,
  situationalOk: situationalOk, NEEDS_FISSURES: NEEDS_FISSURES, NEEDS_HAZARDS: NEEDS_HAZARDS,
  NEEDS_CURSES: NEEDS_CURSES, curseCount: curseCount,
  saveRun: saveRun, loadRun: loadRun, clearSave: clearSave, hasSave: hasSave,
  suppressSave: suppressSave,
  codex: codex, loadCodex: loadCodex, discoverCard: discoverCard, discoverFoe: discoverFoe,
  codexCounts: codexCounts, renderGlossary: renderGlossary, openGlossary: openGlossary,
  ACT_OMENS: ACT_OMENS, noteActOmens: noteActOmens,
  closeGlossary: closeGlossary, setGlossaryTab: setGlossaryTab,
  skipValue: skipValue, removalCost: removalCost, removalsLeft: removalsLeft,
  shopRelicPrice: shopRelicPrice,
  rarityWeights: rarityWeights,
  SHOP_REMOVAL_LIMIT: SHOP_REMOVAL_LIMIT, EVENTS: EVENTS,
  replayMints: replayMints, fuseInDeck: fuseInDeck, recolourPalette: recolourPalette,
  tutorial: tutorial, TUTORIAL_STEPS: TUTORIAL_STEPS, TUTORIAL_LESSONS: TUTORIAL_LESSONS,
  renderTutorial: renderTutorial, shouldTeach: shouldTeach, teach: teach, inFirstBattle: inFirstBattle,
  tutorialOpen: tutorialOpen,
  liveUnits: liveUnits,
  tutorialStep: tutorialStep, closeTutorial: closeTutorial, setTutorial: setTutorial,
  easeInHand: easeInHand, EASE_IN_BATTLES: EASE_IN_BATTLES,
  show: show, advance: advance, enterNode: enterNode, beginBattle: beginBattle,
  gainCurse: gainCurse, applyGrey: applyGrey, carveVolatileBranch: carveVolatileBranch,
  rollReward: rollReward, rollShop: rollShop, rollEvent: rollEvent,
  rollLab: rollLab, applyVolatile: applyVolatile, volatilePress: volatilePress,
  curseRisk: curseRisk, liftStrength: liftStrength, recolourCard: recolourCard,
  LAB_SCENARIOS: LAB_SCENARIOS, deckUnits: deckUnits,
  canMix: canMix, mixOptions: mixOptions, applyMix: applyMix, doMixCascade: doMixCascade,
  drawInto: drawInto, buildApi: buildApi, evalCtx: evalCtx, fireFriendlyMix: fireFriendlyMix,
  simGame: simGame, legalTargets: legalTargets, autoTargets: autoTargets, resolveCard: resolveCard,
  newBattle: newBattle, depthBonusFor: depthBonusFor, shuffle: shuffle, addLog: addLog, tileKey: tileKey,
  REWIND: REWIND, rewindImpact: rewindImpact, rewindChunk: rewindChunk,
  addInstability: addInstability, spawnFissure: spawnFissure,
  getState: function () { return state; }, setState: function (s) { state = s; },
  els: els, tileEls: tileEls, log: log, cardMini: cardMini, chip: chip,
  setRnd: function (f) { rnd = f; }, getRnd: function () { return rnd; },
  NORMAL_ENEMIES: NORMAL_ENEMIES,
  renderRunBar: renderRunBar, renderMap: renderMap, renderDeckModal: renderDeckModal,
  setLinesGroup: function (g) { linesGroup = g; }, getLinesGroup: function () { return linesGroup; }
};

window.CV_RUN = CV_RUN;
export default CV_RUN;
