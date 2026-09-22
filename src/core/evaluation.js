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
   =================================================================== */
export function evaluateBoard(board, hazards, ctx) {
  /* ---- wards ----
     Worked out once, before anything negative is applied, because every
     source of harm on this board ends up as a subtraction on a unit and they
     should all respect the same flag. Computed from board state rather than
     stored, so a ward appears and disappears as the unit granting it is
     played or killed.

     `wardBlock` is the single gate: negatives ask it, positives never do. */
  var warded = {};
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (u, row, index) {
      var d = CARDS[u.cardId];
      if (!d) return;
      var key = side + '-' + row + '-' + index;
      if (d.warded) warded[key] = 1;
      if (d.wardsWhenAlone) {
        var touching = adjacentTilesFor(side, row, index, sev)
          .filter(function (t) { return board[side][t.row][t.index]; });
        if (!touching.length) warded[key] = 1;
      }
      if (d.wardsAdjacent) {
        adjacentTilesFor(side, row, index, sev).forEach(function (t) {
          if (board[side][t.row][t.index]) warded[side + '-' + t.row + '-' + t.index] = 1;
        });
      }
      if (d.wardsRowWhenFront && ROW_INFO[row].depth === 1) {
        for (var i = 0; i < ROW_INFO[row].count; i++) {
          if (board[side][row][i]) warded[side + '-' + row + '-' + i] = 1;
        }
      }
      if (d.wardsRow) {
        for (var j = 0; j < ROW_INFO[row].count; j++) {
          if (board[side][row][j]) warded[side + '-' + row + '-' + j] = 1;
        }
      }
      if (d.wardsSelfWhenFront && ROW_INFO[row].depth === 1) warded[key] = 1;
    });
  });
  function isWarded(side, row, index) { return !!warded[side + '-' + row + '-' + index]; }
  hazards = hazards || emptyHazards();
  ctx = ctx || {};
  var relics = ctx.relics || [], mod = ctx.enemyMod || {};
  // each side reads its own chain
  var chains = ctx.chains || { bottom: ctx.mixChain || 0, top: 0 };
  // how the board actually joins up now: null when it is still whole
  var sev = boardTopo(ctx.fissures);
  var view = {};

  // A + B : base strength, hazards
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (u, row, index) {
      var color = u.color, colorless = false;
      if (rowHasHazard(hazards, row, 'colorless')) {
        var guarded = adjacentTilesFor(side, row, index, sev).some(function (t) {
          var n = board[side][t.row][t.index];
          return n && CARDS[n.cardId] && CARDS[n.cardId].guardsColour;
        });
        if (!guarded) { color = null; colorless = true; }
      }
      /* Colourless is a property of the unit, not only of the hazard that caused
         it: curse units are born without a colour. Anything reading this flag can
         then rely on it instead of null-checking the colour itself. */
      colorless = (color === null);
      var strength = u.strength + (u.temp || 0);
      // scorch is baked into base strength, so the ward has to be asked here too
      if (rowHasHazard(hazards, row, 'scorch') && !isWarded(side, row, index)) strength -= 1;
      // relic: Glass Cannon
      // enemy modifiers
      /* Curses are never buffed. They plant on whichever side drew them, and
         on the enemy's half they were picking up the depth bonus, the act
         boss's colour bonus and the Spectrum's rotating bonus like a real
         unit — so the same curse was worth 1 in act one and 7 in act five,
         for no reason the player could see. A curse is dead weight on
         whoever owns it. */
      if (side === ENEMY && !(CARDS[u.cardId] && CARDS[u.cardId].curse)) {
        // Deck power grows fast across an act; enemies get a flat depth bonus so
        // the elite and boss stay a fight rather than a formality.
        if (mod.depthBonus) strength += mod.depthBonus;
        if (mod.colorBonus && mod.colorBonus[u.color]) strength += mod.colorBonus[u.color];
        if (mod.rotatingColor && ctx.spectrumColor && u.color === ctx.spectrumColor) strength += mod.rotatingColor;
      }
      view[side + '-' + row + '-' + index] = { side: side, row: row, index: index, unit: u,
        color: color, colorless: colorless, base: Math.max(0, strength), bonus: 0 };
    });
  });
  function get(side, row, index) { return view[side + '-' + row + '-' + index] || null; }
  /* Apply a delta to a view, refusing it if it is negative and the unit is
     warded. Every harmful effect routes through here. */
  function applyDelta(v, amount) {
    if (!v) return 0;
    if (amount < 0 && isWarded(v.side, v.row, v.index)) return 0;
    v.bonus += amount;
    return amount;
  }

  function strengthOf(v) { return Math.max(0, v.base + v.bonus); }

  /* BOSS RULE — taxDominantColor (The Hollow Sun).
     Whatever colour the player is leaning on hardest is taxed, per unit. The
     lesson is the game's own design pillar: a board spread across colours pays
     almost nothing, a mono-colour board pays for every unit it fields. Ties
     are not broken — if two colours are level, neither is dominant and neither
     is taxed, so splitting exactly evenly is a real out. */
  /* BOSS RULE — punishColor (The Unbroken Light). A flat penalty on every
     player unit of a named colour, applied before lanes resolve so a punished
     unit can genuinely lose its frontline rather than merely score less. */
  /* BOSS RULE — feedsOnCurses (The Chorus Eternal). Every curse the player is
     carrying makes the whole enemy line stronger. Read off the run's deck
     rather than the board: it is about what you brought, not what you drew. */
  if (mod.feedsOnCurses && ctx.playerCurses) {
    var choirGain = ctx.playerCurses * mod.feedsOnCurses;
    eachUnit(board, ENEMY, function (u, row, index) {
      var v = get(ENEMY, row, index);
      if (v) v.bonus += choirGain;
    });
  }

  /* BOSS RULE — feedsOnFissures (The Long Crack). It profits from the same
     broken ground that is bleeding the player, per crack on its own half. */
  if (mod.feedsOnFissures) {
    eachUnit(board, ENEMY, function (u, row, index) {
      var n2 = fissuresTouching(ENEMY, row, index, ctx.fissures);
      if (!n2) return;
      var v = get(ENEMY, row, index);
      if (v) v.bonus += n2 * mod.feedsOnFissures;
    });
  }

  if (mod.punishColor) {
    eachUnit(board, PLAYER, function (u, row, index) {
      var v = get(PLAYER, row, index);
      if (!v || !v.color) return;
      var pen = mod.punishColor[v.color];
      if (pen && applyDelta(v, -pen)) v.punishedColor = true;
    });
  }

  /* BOSS RULE — spectrumReward (The Unbroken Light). The other half of the
     same idea: breadth is paid for, so the answer to the punishment is to
     bring the colours back rather than to bring bigger Black. Counted on
     distinct colours actually fielded, not on what the deck holds. */
  if (mod.spectrumReward) {
    var seen = {};
    eachUnit(board, PLAYER, function (u, row, index) {
      var v = get(PLAYER, row, index);
      if (v && v.color) seen[v.color] = 1;
    });
    var breadth = Object.keys(seen).length - 2;
    if (breadth > 0) {
      eachUnit(board, PLAYER, function (u, row, index) {
        var v = get(PLAYER, row, index);
        if (v) v.bonus += breadth * mod.spectrumReward;
      });
    }
  }

  if (mod.taxDominantColor) {
    var tally = {};
    eachUnit(board, PLAYER, function (u, row, index) {
      var v = get(PLAYER, row, index);
      if (!v || !v.color) return;                 // colourless units are never dominant
      tally[v.color] = (tally[v.color] || 0) + 1;
    });
    var top = 0, topColor = null, tied = false;
    Object.keys(tally).forEach(function (c) {
      if (tally[c] > top) { top = tally[c]; topColor = c; tied = false; }
      else if (tally[c] === top) tied = true;
    });
    if (topColor && !tied && top > 1) {
      eachUnit(board, PLAYER, function (u, row, index) {
        var v = get(PLAYER, row, index);
        if (v && v.color === topColor && applyDelta(v, -mod.taxDominantColor)) v.taxed = true;
      });
    }
  }

  // C : board-only passives, then auras
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (u, row, index) {
      var v = get(side, row, index), d = CARDS[u.cardId];
      if (!d || !d.passive) return;
      v.bonus += d.passive({ board: board, hazards: hazards, side: side, row: row, index: index, unit: u,
        mixChain: chains[side] || 0,
        drawnExtra: (ctx.drawn && side === PLAYER) ? ctx.drawn.extra : 0,
        // read by curse-synergy payoffs: how many curses have actually resolved this fight
        cursesDrawn: (ctx.curseFired || []).filter(function (c) { return c.side === side; }).length,
        // read by Reliquary-style payoffs: how many curses the run itself is carrying
        playerCurses: (side === PLAYER) ? (ctx.playerCurses || 0) : 0,
        // read by the Tide payoffs: how much you are still holding
        handSize: (ctx.hands && ctx.hands[side]) ? ctx.hands[side].length : 0,
        fissures: (ctx.fissures || []).filter(function (f) { return f.side === side; }),
        fissureLoad: fissuresTouching(side, row, index, ctx.fissures),
        adjacentFriendly: function () {
          return adjacentTilesFor(side, row, index, sev)
            .map(function (t) { return board[side][t.row][t.index]; }).filter(Boolean);
        },
        /* ---- scaling hooks for the wider archetypes ----
           Each of these is the one number an archetype is built around, so a
           card can say "for every X" without every card re-walking the board
           itself. All exclude the asking unit, so "for every OTHER" reads
           literally rather than needing a -1 everywhere. */
        friendlyCount: function () {
          var n = 0;
          eachUnit(board, side, function (u2, r2, i2) {
            if (r2 === row && i2 === index) return;
            var d2 = CARDS[u2.cardId];
            if (d2 && d2.curse) return;          // rot is not an army
            n++;
          });
          return n;
        },
        distinctColours: function () {
          var seen = {};
          eachUnit(board, side, function (u2) {
            if (u2.color) seen[u2.color] = 1;
          });
          return Object.keys(seen).length;
        },
        rowMates: function () {
          var n = 0;
          for (var i2 = 0; i2 < ROW_INFO[row].count; i2++) {
            if (i2 === index) continue;
            if (board[side][row][i2]) n++;
          }
          return n;
        },
        enemyCount: function () {
          var n = 0;
          eachUnit(board, otherSide(side), function () { n++; });
          return n;
        },
        curseCount: function () {
          var n = 0;
          eachUnit(board, side, function (u2) {
            var d2 = CARDS[u2.cardId];
            if (d2 && d2.curse) n++;
          });
          return n;
        } }) || 0;
    });
  });
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (u, row, index) {
      var d = CARDS[u.cardId];
      if (!d) return;
      // A silenced unit is deaf to every aura, friendly or otherwise.
      function silenced(v2) { var cd = CARDS[v2.unit.cardId]; return !!(cd && cd.silenced); }
      if (d.aura) adjacentTilesFor(side, row, index, sev).forEach(function (t) {
        var nv = get(side, t.row, t.index);
        if (nv && !silenced(nv)) nv.bonus += d.aura() || 0;
      });
      /* Lifts every other friendly unit on the board, not just neighbours —
         the swarm payoff, which is why it is a Rare with a 2-strength body. */
      if (d.swarmAura) {
        eachUnit(board, side, function (u2, r2, i2) {
          if (r2 === row && i2 === index) return;
          var sv = get(side, r2, i2);
          if (sv && !silenced(sv)) sv.bonus += d.swarmAura;
        });
      }
      /* Punishes a crowded enemy board: the more they field, the weaker each
         of them is. The control answer to a swarm. */
      if (d.enemyFieldAura) {
        var foeSide2 = side === PLAYER ? ENEMY : PLAYER, foeN = 0;
        eachUnit(board, foeSide2, function () { foeN++; });
        var bite = -Math.floor(foeN / 3);
        if (bite) {
          eachUnit(board, foeSide2, function (u2, r2, i2) {
            applyDelta(get(foeSide2, r2, i2), bite);
          });
        }
      }
      if (d.rowAura) for (var i = 0; i < ROW_INFO[row].count; i++) {
        if (i === index) continue;
        var rv = get(side, row, i);
        if (rv && !silenced(rv)) rv.bonus += d.rowAura() || 0;
      }
      /* Reaches across the board into a named row on the enemy's half. Data
         rather than a function so a fusion can inherit and stack it. */
      if (d.enemyRowAura) {
        var era = d.enemyRowAura, foeSide = side === PLAYER ? ENEMY : PLAYER;
        for (var ei = 0; ei < ROW_INFO[era.row].count; ei++) {
          var ev2 = get(foeSide, era.row, ei);
          if (ev2 && !silenced(ev2)) applyDelta(ev2, era.amount || 0);
        }
      }
    });
  });

  /* C2 : the cracks bleed. A unit standing on a tile a fissure runs through
     loses strength to it, once per crack touching that tile. A card may
     define fissure({count, drain}) to feed on the crack instead of bleeding
     into it — return a positive number and the same tile becomes a reason to
     want a broken board. Applied after auras so a fed unit is drained on its
     real strength; strengthOf already floors at zero, so a heavy drain empties
     a unit rather than making it negative. */
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (u, row, index) {
      var n = fissuresTouching(side, row, index, ctx.fissures);
      if (!n) return;
      var v = get(side, row, index);
      if (!v) return;
      var d = CARDS[u.cardId];
      /* BOSS RULE — drainMultiplier (The Long Crack). Broken ground bites the
         player harder here. A card that feeds on fissures still feeds; it
         just does so against a heavier baseline. */
      var drain = FISSURE_DRAIN * ((side === PLAYER && mod.drainMultiplier) || 1);
      var delta = (d && d.fissure)
        ? (d.fissure({ count: n, drain: drain, view: v }) || 0)
        : -drain * n;
      // a warded unit does not bleed into the ground it is standing on
      v.fissureDelta = (v.fissureDelta || 0) + applyDelta(v, delta);
    });
  });

  // D : frontlines
  var lanes = [];
  for (var L = 0; L < LANE_COUNT; L++) {
    var lane = { index: L, bottom: null, top: null };
    ['bottom', 'top'].forEach(function (side) {
      var members = [], champ = null;
      laneMembersFor(L, side, sev).forEach(function (t) {
        var v = get(side, t.row, t.index);
        if (!v) return;
        members.push(v);
        if (!champ) champ = v;
        else {
          var dn = ROW_INFO[t.row].depth, dold = ROW_INFO[champ.row].depth;
          if (dn < dold || (dn === dold && strengthOf(v) > strengthOf(champ))) champ = v;
        }
      });
      if (members.length) lane[side] = { members: members, champion: champ };
    });
    lanes.push(lane);
  }

  // E : matchups — publish every colour first, then compare
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (s) { if (lane[s]) lane[s].color = lane[s].champion.color; });
  });
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (s) {
      var me = lane[s], them = lane[otherSide(s)];
      if (!me) return;
      me.contested = !!them;
      me.effective = !!(them && isEffective(me.color, them.color));
    });
  });

  // F : matchup passives, enemy auras, enemy punish modifier
  var frontCount = {};
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (s) {
      if (!lane[s]) return;
      var k = s + '-' + lane[s].champion.row + '-' + lane[s].champion.index;
      frontCount[k] = (frontCount[k] || 0) + 1;
    });
  });
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (s) {
      var me = lane[s];
      if (!me) return;
      var v = me.champion, d = CARDS[v.unit.cardId];
      if (d && d.matchup) v.bonus += d.matchup({ isFrontline: true, isEffective: me.effective,
        frontlineCount: frontCount[s + '-' + v.row + '-' + v.index] || 1, view: v }) || 0;
      // Glass Cannon only pays out on units actually holding the line
      if (s === PLAYER && hasRelic(relics, 'glass_cannon') && !v.glassPaid) {
        v.glassPaid = true;
        v.bonus += 1 - 2 * (v.unit.cracked || 0);
      }
    });
    /* Chromatic Knight punishes the lanes you win on colour — and only those.
       This used to add to the unit itself, which compounded when one enemy unit
       fronted several effective lanes and leaked into lanes where the player was
       not effective at all. It is lane-scoped now. */
    if (mod.punishEffective && lane.bottom && lane.bottom.effective && lane.top) {
      lane.top.punish = (lane.top.punish || 0) + mod.punishEffective;
    }
  });
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (u, row, index) {
      var d = CARDS[u.cardId];
      if (!d || !d.enemyAura) return;
      lanesOfFor(side, row, index, sev).forEach(function (L) {
        var foe = lanes[L][otherSide(side)];
        // a warded frontline shrugs off an enemy aura like anything else
        if (foe) applyDelta(foe.champion, d.enemyAura() || 0);
      });
    });
  });

  // G : shares, multipliers, totals
  var shares = {};
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (u, row, index) {
      var v = get(side, row, index);
      var live = lanesOfFor(side, row, index, sev);
      /* A unit still divides itself the way it always did — across every lane
         the tile was built to feed. A severed lane simply never receives its
         share; the strength is lost, not rerouted. Redistributing it would
         make a fissure a concentration buff rather than a wound, which is the
         opposite of what it is for. */
      /* Split across every lane the tile was born with plus any a bridge has
         since opened. A severed lane keeps its slot and simply never receives
         it — the strength is lost, not rerouted — while a bridged lane is paid
         for by thinning every other share. */
      var all = FISSURE_CONCENTRATES ? live : lanesOf(row, index).slice();
      if (!FISSURE_CONCENTRATES) live.forEach(function (L) { if (all.indexOf(L) === -1) all.push(L); });
      var amounts = splitStrength(strengthOf(v), all.length), m = {};
      all.forEach(function (L, n) { if (live.indexOf(L) !== -1) m[L] = amounts[n]; });
      shares[side + '-' + row + '-' + index] = m;
    });
  });
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (side) {
      var me = lane[side];
      if (!me) return;
      var cs = shares[side + '-' + me.champion.row + '-' + me.champion.index][lane.index], sup = 0;
      me.members.forEach(function (v) {
        if (v.row === me.champion.row && v.index === me.champion.index) return;
        sup += shares[side + '-' + v.row + '-' + v.index][lane.index];
      });
      var punish = me.punish || 0;
      /* BOSS RULE — supportPenalty (The Cinder Tyrant). Everything behind the
         line counts for less. Tall stacks feeding one champion stop working;
         the answer is width, not depth. */
      if (side === PLAYER && mod.supportPenalty) sup = sup * mod.supportPenalty;
      me.frontStrength = cs + punish; me.support = sup; me.strength = cs + sup + punish;
      me.multiplier = me.effective ? 2 : 1;
      if (side === PLAYER && !me.effective && me.champion.colorless && hasRelic(relics, 'empty_palette')) me.multiplier = 1.25;
    });
  });

  /* BOSS RULE — echoBestLane (The Drowned Archive). It reads whichever lane
     you have invested in most and answers it in kind, taking a share of that
     lane's strength for its own frontline there. Building one monster lane
     feeds it; spreading evenly starves it. Measured before multipliers, so
     being effective in that lane is still worth doing. */
  if (mod.echoBestLane) {
    var bestLane = null;
    lanes.forEach(function (l) {
      if (l.bottom && (!bestLane || l.bottom.strength > bestLane.bottom.strength)) bestLane = l;
    });
    if (bestLane && bestLane.top) {
      var echoed = Math.floor(bestLane.bottom.strength * mod.echoBestLane);
      bestLane.top.strength += echoed;
      bestLane.top.frontStrength += echoed;
      bestLane.top.echoed = echoed;
    }
  }

  /* BOSS RULE — wardWeakLanes (The Tidewarden). Each round it shields the
     lanes it is weakest in: your matchup bonus is cancelled there, so a
     perfect counter lands for nothing. The lanes it is strongest in stay
     fully exploitable — you have to hit where it is already dangerous. */
  if (mod.wardWeakLanes) {
    var ranked = lanes.filter(function (l) { return l.bottom; })
      .sort(function (a, b) {
        return ((a.top && a.top.strength) || 0) - ((b.top && b.top.strength) || 0);
      });
    ranked.slice(0, mod.wardWeakLanes).forEach(function (l) {
      if (l.bottom.multiplier > 1) { l.bottom.multiplier = 1; l.bottom.warded = true; }
    });
  }
  // Colour Lens upgrades the single biggest effective lane
  if (hasRelic(relics, 'color_lens')) {
    var best = null;
    lanes.forEach(function (l) { if (l.bottom && l.bottom.effective && (!best || l.bottom.strength > best.strength)) best = l.bottom; });
    if (best) { best.multiplier = 2.5; best.lensed = true; }
  }
  lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (s) {
      if (lane[s]) lane[s].final = Math.round(lane[s].strength * lane[s].multiplier);
    });
  });

  var totals = { bottom: 0, top: 0 }, raw = { bottom: 0, top: 0 }, units = { bottom: 0, top: 0 };
  lanes.forEach(function (l) { ['bottom', 'top'].forEach(function (s) { if (l[s]) totals[s] += l[s].final; }); });
  ['bottom', 'top'].forEach(function (side) {
    eachUnit(board, side, function (u, row, index) { raw[side] += strengthOf(get(side, row, index)); units[side]++; });
  });
  return { lanes: lanes, totals: totals, raw: raw, units: units, shares: shares, view: view, strengthOf: strengthOf, get: get };
}

export function decideRound(ev, starter) {
  var b = ev.totals.bottom, t = ev.totals.top;
  if (b !== t) return { winner: b > t ? 'bottom' : 'top', bottom: b, top: t, note: '' };
  if (ev.raw.bottom !== ev.raw.top) return { winner: ev.raw.bottom > ev.raw.top ? 'bottom' : 'top', bottom: b, top: t, note: 'Tied on score — higher raw strength wins.' };
  if (ev.units.bottom !== ev.units.top) return { winner: ev.units.bottom < ev.units.top ? 'bottom' : 'top', bottom: b, top: t, note: 'Tied on strength — fewer units wins.' };
  return { winner: otherSide(starter), bottom: b, top: t, note: 'Fully tied — the starting player loses by rule.' };
}
