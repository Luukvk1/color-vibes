/* The scoring pipeline.
   Takes a board and returns what every unit and lane is actually worth, with auras,
   hazards, fissures, wards and the current boss rule applied in a fixed order. The
   single source of truth for any strength the game shows or acts on. */

import { isEffective } from './colors.js';
import { ENEMY, FISSURE_CONCENTRATES, FISSURE_DRAIN, LANE_COUNT, PLAYER, ROW_INFO, adjacentTilesFor, boardTopo, fissuresTouching, laneMembersFor, lanesOf, lanesOfFor } from './board-shape.js';
import { eachUnit, emptyHazards, otherSide, rowHasHazard, splitStrength } from './primitives.js';
import { CARDS } from './cards.js';
import { hasRelic } from './relics.js';

/* ===================================================================
   7. EVALUATION  (stages A-G, now relic and enemy aware)
   -------------------------------------------------------------------
   ctx = { relics: [player relic keys], enemyMod: {...}, mixChain: n }

   evaluateBoard used to be one ~480-line function; it is now a short pipeline
   at the bottom of this file that calls the named stage functions below it,
   in the same order stages A-G always ran in. Splitting it out this way
   surfaced one existing quirk worth flagging rather than "fixing" quietly:
   computeWardedTiles necessarily runs before the board's fissure topology is
   known (wards have to be settled before anything negative is applied, and
   the topology depends on ctx, which nothing here needs yet), so "touching"
   inside it has always meant plain board adjacency, fissures or not. That is
   preserved exactly — see the comment on computeWardedTiles.
   =================================================================== */

/* ---- wards ----
   Worked out once, before anything negative is applied, because every
   source of harm on this board ends up as a subtraction on a unit and they
   should all respect the same flag. Computed from board state rather than
   stored, so a ward appears and disappears as the unit granting it is
   played or killed.

   Runs before evaluateBoard computes the board's fissure topology, so the
   adjacency checked here is always the board's plain adjacency — a
   wardsAdjacent or wardsWhenAlone card reads "touching" the same way
   whether or not a fissure has cut that edge. `isWarded` (built from this
   map) is the single gate: negatives ask it, positives never do. */
function computeWardedTiles(board) {
  var wardedTiles = {};
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (unit, row, index) {
      var cardDef = CARDS[unit.cardId];
      if (!cardDef) return;
      var key = side + '-' + row + '-' + index;
      if (cardDef.warded) wardedTiles[key] = 1;
      if (cardDef.wardsWhenAlone) {
        var touching = adjacentTilesFor(side, row, index)
          .filter(function (tile) { return board[side][tile.row][tile.index]; });
        if (!touching.length) wardedTiles[key] = 1;
      }
      if (cardDef.wardsAdjacent) {
        adjacentTilesFor(side, row, index).forEach(function (tile) {
          if (board[side][tile.row][tile.index]) wardedTiles[side + '-' + tile.row + '-' + tile.index] = 1;
        });
      }
      if (cardDef.wardsRowWhenFront && ROW_INFO[row].depth === 1) {
        for (var i = 0; i < ROW_INFO[row].count; i++) {
          if (board[side][row][i]) wardedTiles[side + '-' + row + '-' + i] = 1;
        }
      }
      if (cardDef.wardsRow) {
        for (var j = 0; j < ROW_INFO[row].count; j++) {
          if (board[side][row][j]) wardedTiles[side + '-' + row + '-' + j] = 1;
        }
      }
      if (cardDef.wardsSelfWhenFront && ROW_INFO[row].depth === 1) wardedTiles[key] = 1;
    });
  });
  return wardedTiles;
}

/* A + B : base strength and hazards. Colour is stripped by a Colourless Row
   unless something on the tile guards it; scorch and the enemy's depth/colour
   modifiers land here too, since both are baked into the unit's base number
   rather than applied as a later bonus. */
function buildBaseView(board, hazards, mod, ctx, topology, isWarded) {
  var view = {};
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (unit, row, index) {
      var color = unit.color, colorless = false;
      if (rowHasHazard(hazards, row, 'colorless')) {
        var guarded = adjacentTilesFor(side, row, index, topology).some(function (tile) {
          var neighbor = board[side][tile.row][tile.index];
          return neighbor && CARDS[neighbor.cardId] && CARDS[neighbor.cardId].guardsColour;
        });
        if (!guarded) { color = null; colorless = true; }
      }
      /* Colourless is a property of the unit, not only of the hazard that caused
         it: curse units are born without a colour. Anything reading this flag can
         then rely on it instead of null-checking the colour itself. */
      colorless = (color === null);
      var strength = unit.strength + (unit.temp || 0);
      // scorch is baked into base strength, so the ward has to be asked here too
      if (rowHasHazard(hazards, row, 'scorch') && !isWarded(side, row, index)) strength -= 1;
      /* Curses are never buffed. They plant on whichever side drew them, and
         on the enemy's half they were picking up the depth bonus, the act
         boss's colour bonus and the Spectrum's rotating bonus like a real
         unit — so the same curse was worth 1 in act one and 7 in act five,
         for no reason the player could see. A curse is dead weight on
         whoever owns it. */
      if (side === ENEMY && !(CARDS[unit.cardId] && CARDS[unit.cardId].curse)) {
        // Deck power grows fast across an act; enemies get a flat depth bonus so
        // the elite and boss stay a fight rather than a formality.
        if (mod.depthBonus) strength += mod.depthBonus;
        if (mod.colorBonus && mod.colorBonus[unit.color]) strength += mod.colorBonus[unit.color];
        if (mod.rotatingColor && ctx.spectrumColor && unit.color === ctx.spectrumColor) strength += mod.rotatingColor;
      }
      view[side + '-' + row + '-' + index] = { side: side, row: row, index: index, unit: unit,
        color: color, colorless: colorless, base: Math.max(0, strength), bonus: 0 };
    });
  });
  return view;
}

/* BOSS RULE — feedsOnCurses (The Chorus Eternal). Every curse the player is
   carrying makes the whole enemy line stronger. Read off the run's deck
   rather than the board: it is about what you brought, not what you drew. */
function applyFeedsOnCurses(board, get, mod, ctx) {
  if (!mod.feedsOnCurses || !ctx.playerCurses) return;
  var choirGain = ctx.playerCurses * mod.feedsOnCurses;
  eachUnit(board, ENEMY, function (unit, row, index) {
    var tileView = get(ENEMY, row, index);
    if (tileView) tileView.bonus += choirGain;
  });
}

/* BOSS RULE — feedsOnFissures (The Long Crack). It profits from the same
   broken ground that is bleeding the player, per crack on its own half. */
function applyFeedsOnFissures(board, get, mod, ctx) {
  if (!mod.feedsOnFissures) return;
  eachUnit(board, ENEMY, function (unit, row, index) {
    var touchingFissures = fissuresTouching(ENEMY, row, index, ctx.fissures);
    if (!touchingFissures) return;
    var tileView = get(ENEMY, row, index);
    if (tileView) tileView.bonus += touchingFissures * mod.feedsOnFissures;
  });
}

/* BOSS RULE — punishColor (The Unbroken Light). A flat penalty on every
   player unit of a named colour, applied before lanes resolve so a punished
   unit can genuinely lose its frontline rather than merely score less. */
function applyPunishColor(board, get, mod, applyDelta) {
  if (!mod.punishColor) return;
  eachUnit(board, PLAYER, function (unit, row, index) {
    var tileView = get(PLAYER, row, index);
    if (!tileView || !tileView.color) return;
    var penalty = mod.punishColor[tileView.color];
    if (penalty && applyDelta(tileView, -penalty)) tileView.punishedColor = true;
  });
}

/* BOSS RULE — spectrumReward (The Unbroken Light). The other half of the
   same idea: breadth is paid for, so the answer to the punishment is to
   bring the colours back rather than to bring bigger Black. Counted on
   distinct colours actually fielded, not on what the deck holds. */
function applySpectrumReward(board, get, mod) {
  if (!mod.spectrumReward) return;
  var seenColors = {};
  eachUnit(board, PLAYER, function (unit, row, index) {
    var tileView = get(PLAYER, row, index);
    if (tileView && tileView.color) seenColors[tileView.color] = 1;
  });
  var breadth = Object.keys(seenColors).length - 2;
  if (breadth <= 0) return;
  eachUnit(board, PLAYER, function (unit, row, index) {
    var tileView = get(PLAYER, row, index);
    if (tileView) tileView.bonus += breadth * mod.spectrumReward;
  });
}

/* BOSS RULE — taxDominantColor (The Hollow Sun).
   Whatever colour the player is leaning on hardest is taxed, per unit. The
   lesson is the game's own design pillar: a board spread across colours pays
   almost nothing, a mono-colour board pays for every unit it fields. Ties
   are not broken — if two colours are level, neither is dominant and neither
   is taxed, so splitting exactly evenly is a real out. */
function applyTaxDominantColor(board, get, mod, applyDelta) {
  if (!mod.taxDominantColor) return;
  var tally = {};
  eachUnit(board, PLAYER, function (unit, row, index) {
    var tileView = get(PLAYER, row, index);
    if (!tileView || !tileView.color) return;                 // colourless units are never dominant
    tally[tileView.color] = (tally[tileView.color] || 0) + 1;
  });
  var top = 0, topColor = null, tied = false;
  Object.keys(tally).forEach(function (colorKey) {
    if (tally[colorKey] > top) { top = tally[colorKey]; topColor = colorKey; tied = false; }
    else if (tally[colorKey] === top) tied = true;
  });
  if (!topColor || tied || top <= 1) return;
  eachUnit(board, PLAYER, function (unit, row, index) {
    var tileView = get(PLAYER, row, index);
    if (tileView && tileView.color === topColor && applyDelta(tileView, -mod.taxDominantColor)) tileView.taxed = true;
  });
}

/* C : board-only passives. Each card's `passive` hook is handed a small view
   of its own tile plus a set of scaling questions (friendlyCount,
   distinctColours, ...) written once here so every archetype card can ask
   them consistently rather than re-walking the board itself. */
function applyPassives(board, get, hazards, chains, ctx, topology) {
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (unit, row, index) {
      var tileView = get(side, row, index), cardDef = CARDS[unit.cardId];
      if (!cardDef || !cardDef.passive) return;
      tileView.bonus += cardDef.passive({ board: board, hazards: hazards, side: side, row: row, index: index, unit: unit,
        mixChain: chains[side] || 0,
        drawnExtra: (ctx.drawn && side === PLAYER) ? ctx.drawn.extra : 0,
        // read by curse-synergy payoffs: how many curses have actually resolved this fight
        cursesDrawn: (ctx.curseFired || []).filter(function (fired) { return fired.side === side; }).length,
        // read by Reliquary-style payoffs: how many curses the run itself is carrying
        playerCurses: (side === PLAYER) ? (ctx.playerCurses || 0) : 0,
        // read by the Tide payoffs: how much you are still holding
        handSize: (ctx.hands && ctx.hands[side]) ? ctx.hands[side].length : 0,
        fissures: (ctx.fissures || []).filter(function (fissure) { return fissure.side === side; }),
        fissureLoad: fissuresTouching(side, row, index, ctx.fissures),
        adjacentFriendly: function () {
          return adjacentTilesFor(side, row, index, topology)
            .map(function (tile) { return board[side][tile.row][tile.index]; }).filter(Boolean);
        },
        /* ---- scaling hooks for the wider archetypes ----
           Each of these is the one number an archetype is built around, so a
           card can say "for every X" without every card re-walking the board
           itself. All exclude the asking unit, so "for every OTHER" reads
           literally rather than needing a -1 everywhere. */
        friendlyCount: function () {
          var count = 0;
          eachUnit(board, side, function (otherUnit, otherRow, otherIndex) {
            if (otherRow === row && otherIndex === index) return;
            var otherCardDef = CARDS[otherUnit.cardId];
            if (otherCardDef && otherCardDef.curse) return;          // rot is not an army
            count++;
          });
          return count;
        },
        distinctColours: function () {
          var seenColors = {};
          eachUnit(board, side, function (otherUnit) {
            if (otherUnit.color) seenColors[otherUnit.color] = 1;
          });
          return Object.keys(seenColors).length;
        },
        rowMates: function () {
          var count = 0;
          for (var otherIndex = 0; otherIndex < ROW_INFO[row].count; otherIndex++) {
            if (otherIndex === index) continue;
            if (board[side][row][otherIndex]) count++;
          }
          return count;
        },
        enemyCount: function () {
          var count = 0;
          eachUnit(board, otherSide(side), function () { count++; });
          return count;
        },
        curseCount: function () {
          var count = 0;
          eachUnit(board, side, function (otherUnit) {
            var otherCardDef = CARDS[otherUnit.cardId];
            if (otherCardDef && otherCardDef.curse) count++;
          });
          return count;
        } }) || 0;
    });
  });
}

/* C : auras. Adjacent, swarm-wide, row-wide, enemy-field-wide and named-
   enemy-row auras all land here, after passives so an aura reads a unit's
   already-passived strength rather than racing it. A silenced unit is deaf
   to every aura here, friendly or otherwise. */
function applyAuras(board, get, topology, applyDelta) {
  function isSilenced(tileView) { var cardDef = CARDS[tileView.unit.cardId]; return !!(cardDef && cardDef.silenced); }
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (unit, row, index) {
      var cardDef = CARDS[unit.cardId];
      if (!cardDef) return;
      if (cardDef.aura) adjacentTilesFor(side, row, index, topology).forEach(function (tile) {
        var neighborView = get(side, tile.row, tile.index);
        if (neighborView && !isSilenced(neighborView)) neighborView.bonus += cardDef.aura() || 0;
      });
      /* Lifts every other friendly unit on the board, not just neighbours —
         the swarm payoff, which is why it is a Rare with a 2-strength body. */
      if (cardDef.swarmAura) {
        eachUnit(board, side, function (otherUnit, otherRow, otherIndex) {
          if (otherRow === row && otherIndex === index) return;
          var otherView = get(side, otherRow, otherIndex);
          if (otherView && !isSilenced(otherView)) otherView.bonus += cardDef.swarmAura;
        });
      }
      /* Punishes a crowded enemy board: the more they field, the weaker each
         of them is. The control answer to a swarm. */
      if (cardDef.enemyFieldAura) {
        var enemySide = side === PLAYER ? ENEMY : PLAYER, enemyUnitCount = 0;
        eachUnit(board, enemySide, function () { enemyUnitCount++; });
        var fieldPenalty = -Math.floor(enemyUnitCount / 3);
        if (fieldPenalty) {
          eachUnit(board, enemySide, function (otherUnit, otherRow, otherIndex) {
            applyDelta(get(enemySide, otherRow, otherIndex), fieldPenalty);
          });
        }
      }
      if (cardDef.rowAura) for (var otherIndex = 0; otherIndex < ROW_INFO[row].count; otherIndex++) {
        if (otherIndex === index) continue;
        var rowView = get(side, row, otherIndex);
        if (rowView && !isSilenced(rowView)) rowView.bonus += cardDef.rowAura() || 0;
      }
      /* Reaches across the board into a named row on the enemy's half. Data
         rather than a function so a fusion can inherit and stack it. */
      if (cardDef.enemyRowAura) {
        var rowAuraSpec = cardDef.enemyRowAura, enemySideForRow = side === PLAYER ? ENEMY : PLAYER;
        for (var enemyIndex = 0; enemyIndex < ROW_INFO[rowAuraSpec.row].count; enemyIndex++) {
          var enemyRowView = get(enemySideForRow, rowAuraSpec.row, enemyIndex);
          if (enemyRowView && !isSilenced(enemyRowView)) applyDelta(enemyRowView, rowAuraSpec.amount || 0);
        }
      }
    });
  });
}

/* C2 : the cracks bleed. A unit standing on a tile a fissure runs through
   loses strength to it, once per crack touching that tile. A card may
   define fissure({count, drain}) to feed on the crack instead of bleeding
   into it — return a positive number and the same tile becomes a reason to
   want a broken board. Applied after auras so a fed unit is drained on its
   real strength; strengthOf already floors at zero, so a heavy drain empties
   a unit rather than making it negative. */
function applyFissureDrain(board, get, mod, ctx, applyDelta) {
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (unit, row, index) {
      var touchingCount = fissuresTouching(side, row, index, ctx.fissures);
      if (!touchingCount) return;
      var tileView = get(side, row, index);
      if (!tileView) return;
      var cardDef = CARDS[unit.cardId];
      /* BOSS RULE — drainMultiplier (The Long Crack). Broken ground bites the
         player harder here. A card that feeds on fissures still feeds; it
         just does so against a heavier baseline. */
      var drain = FISSURE_DRAIN * ((side === PLAYER && mod.drainMultiplier) || 1);
      var delta = (cardDef && cardDef.fissure)
        ? (cardDef.fissure({ count: touchingCount, drain: drain, view: tileView }) || 0)
        : -drain * touchingCount;
      // a warded unit does not bleed into the ground it is standing on
      tileView.fissureDelta = (tileView.fissureDelta || 0) + applyDelta(tileView, delta);
    });
  });
}

// D : frontlines. Each lane elects a champion: the member closest to the
// front, ties broken by strength.
function buildLanes(board, topology, get, strengthOf) {
  var lanes = [];
  for (var laneIndex = 0; laneIndex < LANE_COUNT; laneIndex++) {
    var lane = { index: laneIndex, bottom: null, top: null };
    ['bottom', 'top'].forEach(function (side) {
      var members = [], champion = null;
      laneMembersFor(laneIndex, side, topology).forEach(function (tile) {
        var tileView = get(side, tile.row, tile.index);
        if (!tileView) return;
        members.push(tileView);
        if (!champion) champion = tileView;
        else {
          var depth = ROW_INFO[tile.row].depth, championDepth = ROW_INFO[champion.row].depth;
          if (depth < championDepth || (depth === championDepth && strengthOf(tileView) > strengthOf(champion))) champion = tileView;
        }
      });
      if (members.length) lane[side] = { members: members, champion: champion };
    });
    lanes.push(lane);
  }
  return lanes;
}

// E : matchups — publish every colour first, then compare
function publishLaneColors(lanes) {
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (side) { if (lane[side]) lane[side].color = lane[side].champion.color; });
  });
}
function computeLaneEffectiveness(lanes) {
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (side) {
      var mine = lane[side], theirs = lane[otherSide(side)];
      if (!mine) return;
      mine.contested = !!theirs;
      mine.effective = !!(theirs && isEffective(mine.color, theirs.color));
    });
  });
}

/* F : matchup passives, Glass Cannon, and Chromatic Knight's lane-scoped
   punish. Chromatic Knight used to add straight to the unit, which
   compounded when one enemy unit fronted several effective lanes and leaked
   into lanes where the player was not effective at all — it is lane-scoped
   now. */
function applyMatchupPassives(lanes, relics, mod) {
  var frontlineCounts = {};
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (side) {
      if (!lane[side]) return;
      var key = side + '-' + lane[side].champion.row + '-' + lane[side].champion.index;
      frontlineCounts[key] = (frontlineCounts[key] || 0) + 1;
    });
  });
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (side) {
      var mine = lane[side];
      if (!mine) return;
      var championView = mine.champion, cardDef = CARDS[championView.unit.cardId];
      if (cardDef && cardDef.matchup) championView.bonus += cardDef.matchup({ isFrontline: true, isEffective: mine.effective,
        frontlineCount: frontlineCounts[side + '-' + championView.row + '-' + championView.index] || 1, view: championView }) || 0;
      // Glass Cannon only pays out on units actually holding the line
      if (side === PLAYER && hasRelic(relics, 'glass_cannon') && !championView.glassPaid) {
        championView.glassPaid = true;
        championView.bonus += 1 - 2 * (championView.unit.cracked || 0);
      }
    });
    if (mod.punishEffective && lane.bottom && lane.bottom.effective && lane.top) {
      lane.top.punish = (lane.top.punish || 0) + mod.punishEffective;
    }
  });
}
function applyEnemyAurasToFrontlines(board, lanes, topology, applyDelta) {
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (unit, row, index) {
      var cardDef = CARDS[unit.cardId];
      if (!cardDef || !cardDef.enemyAura) return;
      lanesOfFor(side, row, index, topology).forEach(function (laneIndex) {
        var foeLane = lanes[laneIndex][otherSide(side)];
        // a warded frontline shrugs off an enemy aura like anything else
        if (foeLane) applyDelta(foeLane.champion, cardDef.enemyAura() || 0);
      });
    });
  });
}

/* G : shares. A unit still divides itself the way it always did — across
   every lane the tile was built to feed. A severed lane simply never
   receives its share; the strength is lost, not rerouted. Redistributing it
   would make a fissure a concentration buff rather than a wound, which is
   the opposite of what it is for.

   Split across every lane the tile was born with plus any a bridge has since
   opened. A severed lane keeps its slot and simply never receives it — the
   strength is lost, not rerouted — while a bridged lane is paid for by
   thinning every other share. */
function computeShares(board, get, topology, strengthOf) {
  var shares = {};
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (unit, row, index) {
      var tileView = get(side, row, index);
      var liveLanes = lanesOfFor(side, row, index, topology);
      var allLanes = FISSURE_CONCENTRATES ? liveLanes : lanesOf(row, index).slice();
      if (!FISSURE_CONCENTRATES) liveLanes.forEach(function (laneIndex) { if (allLanes.indexOf(laneIndex) === -1) allLanes.push(laneIndex); });
      var amounts = splitStrength(strengthOf(tileView), allLanes.length), laneShares = {};
      allLanes.forEach(function (laneIndex, amountIndex) { if (liveLanes.indexOf(laneIndex) !== -1) laneShares[laneIndex] = amounts[amountIndex]; });
      shares[side + '-' + row + '-' + index] = laneShares;
    });
  });
  return shares;
}
function finalizeLaneStrength(lanes, shares, mod, relics) {
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (side) {
      var mine = lane[side];
      if (!mine) return;
      var championShare = shares[side + '-' + mine.champion.row + '-' + mine.champion.index][lane.index], supportShare = 0;
      mine.members.forEach(function (memberView) {
        if (memberView.row === mine.champion.row && memberView.index === mine.champion.index) return;
        supportShare += shares[side + '-' + memberView.row + '-' + memberView.index][lane.index];
      });
      var punish = mine.punish || 0;
      /* BOSS RULE — supportPenalty (The Cinder Tyrant). Everything behind the
         line counts for less. Tall stacks feeding one champion stop working;
         the answer is width, not depth. */
      if (side === PLAYER && mod.supportPenalty) supportShare = supportShare * mod.supportPenalty;
      mine.frontStrength = championShare + punish; mine.support = supportShare; mine.strength = championShare + supportShare + punish;
      mine.multiplier = mine.effective ? 2 : 1;
      if (side === PLAYER && !mine.effective && mine.champion.colorless && hasRelic(relics, 'empty_palette')) mine.multiplier = 1.25;
    });
  });
}

/* BOSS RULE — echoBestLane (The Drowned Archive). It reads whichever lane
   you have invested in most and answers it in kind, taking a share of that
   lane's strength for its own frontline there. Building one monster lane
   feeds it; spreading evenly starves it. Measured before multipliers, so
   being effective in that lane is still worth doing. */
function applyEchoBestLane(lanes, mod) {
  if (!mod.echoBestLane) return;
  var bestLane = null;
  lanes.forEach(function (lane) {
    if (lane.bottom && (!bestLane || lane.bottom.strength > bestLane.bottom.strength)) bestLane = lane;
  });
  if (!bestLane || !bestLane.top) return;
  var echoed = Math.floor(bestLane.bottom.strength * mod.echoBestLane);
  bestLane.top.strength += echoed;
  bestLane.top.frontStrength += echoed;
  bestLane.top.echoed = echoed;
}

/* BOSS RULE — wardWeakLanes (The Tidewarden). Each round it shields the
   lanes it is weakest in: your matchup bonus is cancelled there, so a
   perfect counter lands for nothing. The lanes it is strongest in stay
   fully exploitable — you have to hit where it is already dangerous. */
function applyWardWeakLanes(lanes, mod) {
  if (!mod.wardWeakLanes) return;
  var ranked = lanes.filter(function (lane) { return lane.bottom; })
    .sort(function (laneA, laneB) {
      return ((laneA.top && laneA.top.strength) || 0) - ((laneB.top && laneB.top.strength) || 0);
    });
  ranked.slice(0, mod.wardWeakLanes).forEach(function (lane) {
    if (lane.bottom.multiplier > 1) { lane.bottom.multiplier = 1; lane.bottom.warded = true; }
  });
}

// Colour Lens upgrades the single biggest effective lane
function applyColorLensRelic(lanes, relics) {
  if (!hasRelic(relics, 'color_lens')) return;
  var best = null;
  lanes.forEach(function (lane) { if (lane.bottom && lane.bottom.effective && (!best || lane.bottom.strength > best.strength)) best = lane.bottom; });
  if (best) { best.multiplier = 2.5; best.lensed = true; }
}

function finalizeLaneScores(lanes) {
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (side) {
      if (lane[side]) lane[side].final = Math.round(lane[side].strength * lane[side].multiplier);
    });
  });
}

function computeTotals(board, lanes, get, strengthOf) {
  var totals = { bottom: 0, top: 0 }, raw = { bottom: 0, top: 0 }, units = { bottom: 0, top: 0 };
  lanes.forEach(function (lane) { ['bottom', 'top'].forEach(function (side) { if (lane[side]) totals[side] += lane[side].final; }); });
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (unit, row, index) { raw[side] += strengthOf(get(side, row, index)); units[side]++; });
  });
  return { totals: totals, raw: raw, units: units };
}

export function evaluateBoard(board, hazards, ctx) {
  var wardedTiles = computeWardedTiles(board);
  function isWarded(side, row, index) { return !!wardedTiles[side + '-' + row + '-' + index]; }

  hazards = hazards || emptyHazards();
  ctx = ctx || {};
  var relics = ctx.relics || [], mod = ctx.enemyMod || {};
  // each side reads its own chain
  var chains = ctx.chains || { bottom: ctx.mixChain || 0, top: 0 };
  // how the board actually joins up now: null when it is still whole
  var topology = boardTopo(ctx.fissures);

  var view = buildBaseView(board, hazards, mod, ctx, topology, isWarded);
  function get(side, row, index) { return view[side + '-' + row + '-' + index] || null; }
  /* Apply a delta to a view, refusing it if it is negative and the unit is
     warded. Every harmful effect routes through here. */
  function applyDelta(tileView, amount) {
    if (!tileView) return 0;
    if (amount < 0 && isWarded(tileView.side, tileView.row, tileView.index)) return 0;
    tileView.bonus += amount;
    return amount;
  }
  function strengthOf(tileView) { return Math.max(0, tileView.base + tileView.bonus); }

  applyFeedsOnCurses(board, get, mod, ctx);
  applyFeedsOnFissures(board, get, mod, ctx);
  applyPunishColor(board, get, mod, applyDelta);
  applySpectrumReward(board, get, mod);
  applyTaxDominantColor(board, get, mod, applyDelta);

  applyPassives(board, get, hazards, chains, ctx, topology);
  applyAuras(board, get, topology, applyDelta);
  applyFissureDrain(board, get, mod, ctx, applyDelta);

  var lanes = buildLanes(board, topology, get, strengthOf);
  publishLaneColors(lanes);
  computeLaneEffectiveness(lanes);
  applyMatchupPassives(lanes, relics, mod);
  applyEnemyAurasToFrontlines(board, lanes, topology, applyDelta);

  var shares = computeShares(board, get, topology, strengthOf);
  finalizeLaneStrength(lanes, shares, mod, relics);

  applyEchoBestLane(lanes, mod);
  applyWardWeakLanes(lanes, mod);
  applyColorLensRelic(lanes, relics);
  finalizeLaneScores(lanes);

  var totalsResult = computeTotals(board, lanes, get, strengthOf);
  return { lanes: lanes, totals: totalsResult.totals, raw: totalsResult.raw, units: totalsResult.units,
    shares: shares, view: view, strengthOf: strengthOf, get: get };
}

export function decideRound(evaluation, starter) {
  var bottomScore = evaluation.totals.bottom, topScore = evaluation.totals.top;
  if (bottomScore !== topScore) return { winner: bottomScore > topScore ? 'bottom' : 'top', bottom: bottomScore, top: topScore, note: '' };
  if (evaluation.raw.bottom !== evaluation.raw.top) {
    return { winner: evaluation.raw.bottom > evaluation.raw.top ? 'bottom' : 'top', bottom: bottomScore, top: topScore,
      note: 'Tied on score — higher raw strength wins.' };
  }
  if (evaluation.units.bottom !== evaluation.units.top) {
    return { winner: evaluation.units.bottom < evaluation.units.top ? 'bottom' : 'top', bottom: bottomScore, top: topScore,
      note: 'Tied on strength — fewer units wins.' };
  }
  return { winner: otherSide(starter), bottom: bottomScore, top: topScore, note: 'Fully tied — the starting player loses by rule.' };
}
