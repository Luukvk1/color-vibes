/* Every card in the game.
   A card is data plus optional hooks (passive, aura, onPlay, …) that the evaluation
   pipeline and the battle loop call at the right moment. */

import { COLORS, colorInfo } from './colors.js';
import { ROWS, ROW_INFO, adjacentTiles, lanesOf } from './board-shape.js';
import { eachUnit, hazardsOnRow, otherSide, slotName, unitAt } from './primitives.js';
import { evaluateBoard } from './evaluation.js';

/* ===================================================================
   4. CARDS
   =================================================================== */
/* Curses want the front: a blocked Row 1 slot costs a whole lane. */
/* ---- archetype helpers ----
   Payoff cards need to ask questions about the whole board, not just their
   own tile. These are the questions worth asking, written once so a dozen
   cards can share them and read consistently. */
export function eachOwn(v, fn) {
  ROWS.forEach(function (row) {
    for (var i = 0; i < ROW_INFO[row].count; i++) {
      var u = v.board[v.side][row][i];
      if (!u) continue;
      if (row === v.row && i === v.index) continue;   // never counts itself
      fn(u, row, i);
    }
  });
}
export function countOwn(v, pred) {
  var n = 0;
  eachOwn(v, function (u) { if (!pred || pred(u)) n++; });
  return n;
}
/* How many different colours are standing on your half. The spectrum
   archetype's whole question, and the one thing the colour wheel rewards
   that no other axis does. */
export function ownColours(v) {
  var seen = {};
  eachOwn(v, function (u) { if (u.color) seen[u.color] = 1; });
  if (v.unit && v.unit.color) seen[v.unit.color] = 1;
  return Object.keys(seen).length;
}
export function isWardCard(u) {
  var d = CARDS[u.cardId];
  return !!(d && (d.warded || d.wardsAdjacent || d.wardsWhenAlone || d.wardsRowWhenFront));
}

export function plantCurse(g, side, api, id) {
  var want = CARDS[id].strength;
  for (var r = 0; r < ROWS.length; r++) {
    var row = ROWS[r];
    if (want < ROW_INFO[row].min) continue;
    for (var i = 0; i < ROW_INFO[row].count; i++) {
      if (g.board[side][row][i]) continue;
      api.create(side, row, i, id);
      return 'it takes root on ' + slotName(row, i);
    }
  }
  return 'no room for it to take root';
}

/* Every curse is worth exactly this much on the board.

   They used to print 1, 1, 2 and 1, so which curse you were handed silently
   decided how much strength it contributed and which rows it could even sit
   in — the Ashen Pillar could take a Row 2 slot, the others could not. A curse
   is meant to be dead weight in the way, and a number that changes for no
   reason the player can see reads as noise. One value for all of them means a
   curse is only ever its rule. */
export var CURSE_STRENGTH = 1;

export var CARDS = {
  red_scout: { name: 'Red Scout', color: 'red', strength: 1, rarity: 'Common', type: 'unit', cost: 20,
    text: '+1 while a friendly unit touches it.',
    passive: function (v) { return v.adjacentFriendly().length ? 1 : 0; } },
  red_brute: { name: 'Red Brute', color: 'red', strength: 2, rarity: 'Common', type: 'unit', cost: 15,
    text: 'No effect. Just muscle.' },
  red_breaker: { name: 'Red Breaker', color: 'red', strength: 3, rarity: 'Common', type: 'unit', cost: 30,
    text: 'On play, every enemy frontline in the lanes it feeds loses 1 strength.',
    onPlay: function (g, side, at, targets, api) {
      var hit = api.enemyFrontlinesIn(lanesOf(at.row, at.index));
      hit.forEach(function (f) { api.damage(otherSide(side), f.row, f.index, 1); });
      return hit.length ? 'weakened ' + hit.length : 'no target';
    } },
  red_ravager: { name: 'Red Ravager', color: 'red', strength: 4, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: '+2 while holding a frontline with an effective matchup.',
    matchup: function (v) { return (v.isFrontline && v.isEffective) ? 2 : 0; } },
  red_titan: { name: 'Red Titan', color: 'red', strength: 6, rarity: 'Rare', type: 'unit', cost: 70,
    text: '+3 while it is the frontline of two or more lanes.',
    matchup: function (v) { return v.frontlineCount >= 2 ? 3 : 0; } },

  blue_scout: { name: 'Blue Scout', color: 'blue', strength: 1, rarity: 'Common', type: 'unit', cost: 20,
    text: 'On play, draw a card.',
    onPlay: function (g, side, at, t, api) { return api.draw(side, 1) ? 'drew a card' : 'deck empty'; } },
  /* ---- the draw archetype ----
     Drawing was a single Common and two relics, which is not enough to build
     around. These give Blue and Cyan a real engine: cheap bodies that dig,
     a payoff that scales with how much you have drawn, and a card that
     trades board presence for a fistful of options. A deck built on these
     *wants* to be small, which is the same thing the deck-size curve wants,
     so the archetype and the economy pull in the same direction. */
  blue_archivist: { name: 'Blue Archivist', color: 'blue', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: 'On play, draw 2 cards.',
    onPlay: function (g, side, at, t, api) {
      var n = api.draw(side, 2);
      return n ? 'drew ' + n : 'deck empty';
    } },
  blue_tideline: { name: 'Blue Tideline', color: 'blue', strength: 1, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: '+1 for every card you have drawn beyond your opening hand this battle.',
    passive: function (v) { return Math.min(8, v.drawnExtra || 0); } },
  cyan_wellspring: { name: 'Cyan Wellspring', color: 'cyan', strength: 3, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'At the start of each round, draw an extra card.',
    drawsEachRound: 1 },
  colorless_ledger: { name: 'The Ledger', color: null, strength: 0, rarity: 'Uncommon', type: 'spell', cost: 45,
    text: 'Draw 3 cards.',
    onPlay: function (g, side, at, t, api) {
      var n = api.draw(side, 3);
      return n ? 'drew ' + n : 'deck empty';
    } },

  /* ---- relics of the road (boss drops only) ----
     Fusion is the only way to build a really big body, and a fused Amalgam is
     silenced \u2014 all numbers, no text. That made "big" and "interesting"
     mutually exclusive late in a run, which is the wrong trade for the last
     third of the game. These are the other half: printed strength on the
     level of a mid-sized fusion, but each still carrying an ability.

     They are marked `bossOnly` and kept out of rewards, shops and the Lab's
     random pools, so the only place they appear is the pick-one-of-three
     after an act boss falls. That makes the drop feel like a trophy rather
     than a slightly better roll, and gives each act a signature card. */
  red_forgeheart: { name: 'The Forge Heart', color: 'red', strength: 6, rarity: 'Legendary', type: 'unit', cost: 130,
    /* matchup() is called once per lane the unit fronts, so this pays twice
       on a two-lane frontline and three times on a three. +3 is deliberately
       short of the others' printed value because it is the only trophy that
       multiplies with position. */
    bossOnly: true, text: '+3 for each lane it holds the front of.',
    matchup: function (v) { return v.isFrontline ? 3 : 0; } },
  green_worldroot: { name: 'The World Root', color: 'green', strength: 4, rarity: 'Legendary', type: 'unit', cost: 130,
    bossOnly: true, text: 'Units touching it are 2 stronger.',
    aura: function () { return 2; } },
  blue_deepcurrent: { name: 'The Deep Current', color: 'blue', strength: 4, rarity: 'Legendary', type: 'unit', cost: 130,
    bossOnly: true, text: 'On play, draw 2. Draws another card at the start of each round.',
    drawsEachRound: 1,
    onPlay: function (g, side, at, t, api) {
      var n = api.draw(side, 2);
      return n ? 'drew ' + n : 'deck empty';
    } },
  yellow_noonday: { name: 'The Noonday Crown', color: 'yellow', strength: 5, rarity: 'Legendary', type: 'unit', cost: 130,
    bossOnly: true, text: 'Every other friendly unit in its row is 2 stronger.',
    rowAura: function () { return 2; } },
  cyan_aegis: { name: 'The Aegis', color: 'cyan', strength: 6, rarity: 'Legendary', type: 'unit', cost: 130,
    bossOnly: true, guardsColour: true,
    text: 'Units touching it are 1 stronger and keep their colour through Colourless Row.',
    aura: function () { return 1; } },
  magenta_refractor: { name: 'The Refractor', color: 'magenta', strength: 4, rarity: 'Legendary', type: 'unit', cost: 130,
    bossOnly: true, text: '+2 for each link in your mix chain.',
    passive: function (v) { return (v.mixChain || 0) * 2; } },
  black_devouring_star: { name: 'The Devouring Star', color: 'black', strength: 5, rarity: 'Legendary', type: 'unit', cost: 130,
    bossOnly: true, text: 'On play, devour a touching friendly unit and take twice its strength for this battle.',
    targets: [{ kind: 'friendlyAdjacentToSelf', prompt: 'Pick a touching friendly unit to devour' }],
    /* The gain is deliberately NOT permanent. It used to be, and permanence
       is what broke it: a permanent buff writes back into the run deck, so
       every battle started where the last one ended, and two Stars could eat
       each other turn after turn. Measured, the strength roughly doubled per
       feed — 10, 25, 55, 115, 235, 475, 955, 3835 — with no ceiling at all,
       which is how a run reached five figures and stopped being a game.

       Twice the target's strength is still enormous for one play, and eating
       a genuinely big unit is still the most explosive thing in the game. It
       simply stops being a savings account that carries between fights. */
    onPlay: function (g, side, at, t, api) {
      if (!t.length) return 'nothing in reach';
      var v = unitAt(g.board, side, t[0].row, t[0].index), gained = (v.strength + (v.temp || 0)) * 2;
      api.destroy(side, t[0]); api.buff(side, at, gained, false);
      return 'devoured for ' + gained;
    } },

  /* ---- secret trophies ----
     Every road that is not on the wheel drops its OWN three, never the seven
     above. A secret act is reached by how a run was lived, not by which
     colour it opened, so its prize should not be a colour trophy either —
     these are all colourless, exactly as unconditionally playable as the
     roads themselves are unconditionally hard to reach. `secretOnly` keeps
     them out of the ordinary boss-trophy pool the same way `bossOnly` keeps
     every Legendary out of the drawable one: one flag, checked once, at the
     point the pool is built.

     Each one answers its own boss's rule rather than just being large:
     Judgement punishes Black and pays for breadth, so White's trophies
     reward breadth outright and can turn Judgement's own trick on the
     enemy. The Choir is built from your curses, so Rot's trophies are built
     from them too. The Crack feeds on fissures on both halves, so Rift's
     trophies make fissures something you would choose to have. Priced to
     feel like the reward for a act that is, by design, brutal to reach. */
  white_prism_crown: { name: 'The Prism Crown', color: null, strength: 3, rarity: 'Legendary', type: 'unit', cost: 140,
    secretOnly: true, text: '+2 for every distinct colour you field, up to six.',
    passive: function (v) {
      var seen = {};
      ROWS.forEach(function (row) {
        for (var i = 0; i < ROW_INFO[row].count; i++) {
          var u = v.board[v.side][row][i];
          if (u && u.color) seen[u.color] = 1;
        }
      });
      return Math.min(6, Object.keys(seen).length) * 2;
    } },
  white_absolute_zero: { name: 'Absolute Zero', color: null, strength: 5, rarity: 'Legendary', type: 'unit', cost: 140,
    secretOnly: true, text: 'Ignores all negative effects, and so do units touching it.',
    warded: true, wardsAdjacent: true },
  white_last_verdict: { name: 'The Last Verdict', color: null, strength: 4, rarity: 'Legendary', type: 'unit', cost: 140,
    secretOnly: true, text: "On play, the enemy's most-fielded colour loses 3 per unit, once.",
    onPlay: function (g, side, at, t, api) {
      var foe = otherSide(side), tally = {}, top = 0, topColor = null, tied = false, hit = 0;
      eachUnit(g.board, foe, function (u) {
        if (!u.color) return;
        tally[u.color] = (tally[u.color] || 0) + 1;
        if (tally[u.color] > top) { top = tally[u.color]; topColor = u.color; tied = false; }
        else if (tally[u.color] === top) tied = true;
      });
      if (!topColor || tied) return 'nothing to judge';
      eachUnit(g.board, foe, function (u, row, index) {
        if (u.color === topColor) { api.damage(foe, row, index, 3); hit++; }
      });
      return 'judged ' + hit + ' ' + colorInfo(topColor).name + ' unit' + (hit === 1 ? '' : 's');
    } },

  rot_reliquary: { name: 'The Reliquary', color: null, strength: 2, rarity: 'Legendary', type: 'unit', cost: 130,
    secretOnly: true, text: '+3 for every curse in your deck.',
    passive: function (v) { return (v.playerCurses || 0) * 3; } },
  rot_plague_herald: { name: 'Plague Herald', color: null, strength: 3, rarity: 'Legendary', type: 'unit', cost: 130,
    secretOnly: true, text: 'On play, devour a touching curse and gain 8 permanently.',
    targets: [{ kind: 'friendlyAdjacentToSelf', prompt: 'Pick a touching curse to devour' }],
    onPlay: function (g, side, at, t, api) {
      if (!t.length) return 'nothing in reach';
      var u = unitAt(g.board, side, t[0].row, t[0].index), d = u && CARDS[u.cardId];
      if (!d || !d.curse) return 'that is not a curse';
      api.destroy(side, t[0]); api.buff(side, at, 8, true);
      return 'devoured ' + d.name + ' for 8';
    } },
  rot_undying_choir: { name: 'The Undying Choir', color: null, strength: 2, rarity: 'Legendary', type: 'unit', cost: 130,
    secretOnly: true, text: '+2 permanently for every curse you have drawn this battle.',
    /* Reads a live count rather than granting the buff at draw-time, so it
       still credits every curse that resolved before this card was even
       played — arriving late to a rotten battle is not a wasted trip. */
    passive: function (v) { return (v.cursesDrawn || 0) * 2; } },

  rift_keystone: { name: 'The Keystone', color: null, strength: 3, rarity: 'Legendary', type: 'unit', cost: 130,
    secretOnly: true, text: '+3 for every fissure touching it.',
    passive: function (v) { return (v.fissureLoad || 0) * 3; } },
  rift_bridgewalker: { name: 'Bridge Walker', color: null, strength: 4, rarity: 'Legendary', type: 'unit', cost: 130,
    secretOnly: true, text: 'Ignores fissure drain, and so do units touching it.',
    warded: true, wardsAdjacent: true,
    fissure: function () { return 0; } },
  rift_the_widening: { name: 'The Widening', color: null, strength: 3, rarity: 'Legendary', type: 'unit', cost: 130,
    secretOnly: true, text: "On play, tear a new fissure on the enemy's ground and gain 6 permanently.",
    /* spawnFissure lives in the RUN module, not here — it mutates run.fissures,
       the run's own persistent tear list, which has to survive past this one
       battle. A card cannot hold that state itself, so it reaches across the
       module boundary for the one call that actually needs to, the same way
       a card's onPlay already reaches into the api this file hands it. */
    onPlay: function (g, side, at, t, api) {
      var made = window.CV_RUN && window.CV_RUN.spawnFissure(otherSide(side), g.board);
      api.buff(side, at, 6, true);
      return made ? 'tore the ground and gained 6' : 'gained 6 (no room to tear)';
    } },

  /* ---- reaching past the line ----
     Every removal effect in the game went through the enemy's frontline, so
     the back rows were the one place on the board nothing could touch —
     stacking support was free, and a tall lane was strictly better than a
     wide one. These reach over the line instead of through it, which makes
     depth a decision again rather than a default. Kept deliberately fragile:
     each is a small body buying a big reach. */
  magenta_lancer: { name: 'Magenta Lancer', color: 'magenta', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: 'On play, the strongest enemy unit BEHIND the line in its lanes loses 4.',
    onPlay: function (g, side, at, t, api) {
      var back = api.enemySupportIn(lanesOf(at.row, at.index));
      if (!back.length) return 'nothing behind the line';
      var w = back.reduce(function (a, b) { return b.strength > a.strength ? b : a; });
      api.damage(otherSide(side), w.row, w.index, 4);
      return 'ran through ' + slotName(w.row, w.index);
    } },
  blue_saboteur: { name: 'Blue Saboteur', color: 'blue', strength: 1, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: 'On play, every enemy unit behind the line in its lanes loses 1.',
    onPlay: function (g, side, at, t, api) {
      var back = api.enemySupportIn(lanesOf(at.row, at.index));
      if (!back.length) return 'nothing behind the line';
      back.forEach(function (u) { api.damage(otherSide(side), u.row, u.index, 1); });
      return 'cut ' + back.length + ' from behind';
    } },
  yellow_arclight: { name: 'Yellow Arclight', color: 'yellow', strength: 3, rarity: 'Rare', type: 'unit', cost: 65,
    text: 'Enemy units in their back row are 2 weaker.',
    enemyRowAura: { row: 'row3', amount: -2 } },
  red_javelin: { name: 'Red Javelin', color: 'red', strength: 2, rarity: 'Common', type: 'unit', cost: 30,
    text: 'On play, the weakest enemy unit behind the line in its lanes loses 2.',
    onPlay: function (g, side, at, t, api) {
      var back = api.enemySupportIn(lanesOf(at.row, at.index));
      if (!back.length) return 'nothing behind the line';
      var w = back.reduce(function (a, b) { return b.strength < a.strength ? b : a; });
      api.damage(otherSide(side), w.row, w.index, 2);
      return 'pinned ' + slotName(w.row, w.index);
    } },

  /* ---- warding ----
     Almost everything that goes wrong on this board is a negative applied to
     a unit: hazards, fissure drain, enemy auras, boss punishments. Nothing
     could refuse any of it. `warded` is a single flag the evaluator honours
     at the one place negatives land, so one idea covers every source rather
     than needing a counter per mechanic.

     Deliberately not blanket immunity — that would just invert the problem.
     Each of these buys protection with something real: a body that protects
     others but not itself, one that trades its own growth for the ward, and
     one that only holds while it stands alone. */
  cyan_bulwark: { name: 'Cyan Bulwark', color: 'cyan', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 55,
    text: 'Units touching it ignore all negative effects. It does not.',
    wardsAdjacent: true },
  green_thicket: { name: 'Green Thicket', color: 'green', strength: 4, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: 'Ignores all negative effects, and no aura can strengthen it.',
    warded: true, silenced: true },
  magenta_recluse: { name: 'Magenta Recluse', color: 'magenta', strength: 5, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'While no friendly unit touches it, it ignores all negative effects.',
    wardsWhenAlone: true },
  yellow_oath: { name: 'Yellow Oath', color: 'yellow', strength: 2, rarity: 'Rare', type: 'unit', cost: 65,
    text: 'Friendly units in its row ignore all negative effects while it holds a frontline.',
    wardsRowWhenFront: true },

  /* ===================================================================
     ARCHETYPES
     Six things a deck can be built around, each with its own scaling number
     so they compete for different resources rather than all wanting the
     biggest body. Bridge cards deliberately sit between two of them, because
     an archetype that cannot be combined is a lane, not a strategy.

       SWARM     pays for how many units you field   (green)
       SPECTRUM  pays for how many colours you field (yellow)
       CHAIN     pays for mix chain length           (magenta)
       CONTROL   pays for shrinking the enemy        (red)
       FORTRESS  pays for surviving in place         (cyan)
       DRAW      pays for digging                    (blue)
     =================================================================== */

  /* ---- SWARM: many small bodies ---- */
  green_swarmling: { name: 'Green Swarmling', color: 'green', strength: 1, rarity: 'Common', type: 'unit', cost: 20,
    text: '+1 for every 2 other friendly units.',
    passive: function (v) { return Math.floor(v.friendlyCount() / 2); } },
  green_broodmother: { name: 'Green Broodmother', color: 'green', strength: 2, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'Every other friendly unit is 1 stronger.',
    swarmAura: 1 },
  red_warband: { name: 'Red Warband', color: 'red', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: '+2 while three or more other friendly units stand with it.',
    passive: function (v) { return v.friendlyCount() >= 3 ? 2 : 0; } },
  yellow_conscript: { name: 'Yellow Conscript', color: 'yellow', strength: 1, rarity: 'Common', type: 'unit', cost: 22,
    text: '+1 for every other friendly unit in its row.',
    passive: function (v) { return v.rowMates(); } },

  /* ---- SPECTRUM: breadth of colour, the design pillar made playable ---- */
  yellow_prismatic: { name: 'Yellow Prismatic', color: 'yellow', strength: 1, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: '+2 for every distinct colour you field.',
    passive: function (v) { return v.distinctColours() * 2; } },
  cyan_covenant: { name: 'Cyan Covenant', color: 'cyan', strength: 2, rarity: 'Rare', type: 'unit', cost: 75,
    text: '+3 while you field four or more distinct colours.',
    passive: function (v) { return v.distinctColours() >= 4 ? 3 : 0; } },
  magenta_harlequin: { name: 'Magenta Harlequin', color: 'magenta', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 48,
    text: '+1 for every distinct colour touching it.',
    passive: function (v) {
      var seen = {};
      v.adjacentFriendly().forEach(function (u) { if (u.color) seen[u.color] = 1; });
      return Object.keys(seen).length;
    } },

  /* ---- CHAIN: mixing as an engine rather than a stat upgrade ---- */
  magenta_cascade: { name: 'Magenta Cascade', color: 'magenta', strength: 1, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: '+3 for each link in your mix chain.',
    passive: function (v) { return (v.mixChain || 0) * 3; } },
  red_kindler: { name: 'Red Kindler', color: 'red', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: 'Whenever you mix, this gains 1 permanently.',
    onFriendlyMix: function (g, side, api, at) {
      if (!at) return null;
      api.buff(side, at, 1, true);
      return 'Kindler catches (+1)';
    } },
  blue_conduit: { name: 'Blue Conduit', color: 'blue', strength: 2, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'Whenever you mix, draw a card.',
    onFriendlyMix: function (g, side, api) {
      var n = api.draw(side, 1);
      return n ? 'Conduit draws' : null;
    } },

  /* ---- CONTROL: winning by subtraction ---- */
  red_harrier: { name: 'Red Harrier', color: 'red', strength: 2, rarity: 'Common', type: 'unit', cost: 28,
    text: 'Enemy units touching it are 1 weaker.',
    enemyAura: function () { return -1; } },
  black_famine: { name: 'Black Famine', color: 'black', strength: 3, rarity: 'Rare', type: 'unit', cost: 75,
    text: 'Every enemy unit is 1 weaker for every 3 enemy units on the board.',
    enemyFieldAura: true },
  magenta_thief: { name: 'Magenta Thief', color: 'magenta', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: 'On play, take 2 from the strongest enemy frontline in its lanes and keep it.',
    onPlay: function (g, side, at, t, api) {
      var f = api.enemyFrontlinesIn(lanesOf(at.row, at.index));
      if (!f.length) return 'no target';
      var w = f.reduce(function (a, b) { return b.strength > a.strength ? b : a; });
      var took = api.damage(otherSide(side), w.row, w.index, 2);
      if (took) api.buff(side, at, took, true);
      return 'took ' + took;
    } },

  /* ---- FORTRESS: outlasting rather than outgrowing ---- */
  cyan_anchor: { name: 'Cyan Anchor', color: 'cyan', strength: 4, rarity: 'Common', type: 'unit', cost: 32,
    text: '+2 while it holds a frontline.',
    matchup: function (v) { return v.isFrontline ? 2 : 0; } },
  green_deeproot: { name: 'Green Deeproot', color: 'green', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 44,
    text: '+3 while it stands in your back row.',
    passive: function (v) { return ROW_INFO[v.row].depth === 3 ? 3 : 0; } },

  /* ---- primary-colour anchors ----
     Measured: with Spectrum and Ward living only in secondary colours, they
     were reachable in 0 of 30 simulated runs \u2014 a deck cannot build toward
     something the colour gate never offers it. Every archetype now has at
     least one card in a primary, so the style is available from act one and
     the secondaries deepen it rather than gatekeep it. */
  red_standard: { name: 'Red Standard', color: 'red', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 46,
    text: '+3 while you field three or more distinct colours.',
    passive: function (v) { return v.distinctColours() >= 3 ? 3 : 0; } },
  blue_lens: { name: 'Blue Lens', color: 'blue', strength: 1, rarity: 'Common', type: 'unit', cost: 30,
    text: '+1 for every distinct colour you field.',
    passive: function (v) { return v.distinctColours(); } },
  green_banner_wide: { name: 'Green Ensign', color: 'green', strength: 2, rarity: 'Common', type: 'unit', cost: 32,
    text: '+2 while you field three or more distinct colours.',
    passive: function (v) { return v.distinctColours() >= 3 ? 2 : 0; } },

  red_ironhide: { name: 'Red Ironhide', color: 'red', strength: 3, rarity: 'Common', type: 'unit', cost: 34,
    text: 'Ignores all negative effects while it holds a frontline.',
    wardsSelfWhenFront: true },
  blue_bastion: { name: 'Blue Bastion', color: 'blue', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 52,
    text: 'Units in its row ignore all negative effects.',
    wardsRow: true },

  green_ferment: { name: 'Green Ferment', color: 'green', strength: 2, rarity: 'Common', type: 'unit', cost: 30,
    text: '+2 for each link in your mix chain.',
    passive: function (v) { return (v.mixChain || 0) * 2; } },

  /* ---- BRIDGES: each sits between two archetypes on purpose ---- */
  green_chorister: { name: 'Green Chorister', color: 'green', strength: 1, rarity: 'Uncommon', type: 'unit', cost: 48,
    text: 'On play, draw a card for every 3 other friendly units.',
    onPlay: function (g, side, at, t, api) {
      var n = 0;
      ROWS.forEach(function (r2) {
        for (var i2 = 0; i2 < ROW_INFO[r2].count; i2++) {
          var u2 = g.board[side][r2][i2];
          if (!u2 || (r2 === at.row && i2 === at.index)) continue;
          if (!CARDS[u2.cardId] || !CARDS[u2.cardId].curse) n++;
        }
      });
      var drew = api.draw(side, Math.floor(n / 3));
      return drew ? 'drew ' + drew : 'not enough of a crowd';
    } },
  cyan_lattice: { name: 'Cyan Lattice', color: 'cyan', strength: 2, rarity: 'Rare', type: 'unit', cost: 72,
    text: 'Units touching it ignore all negative effects, and are 1 stronger for every distinct colour touching them.',
    wardsAdjacent: true,
    aura: function () { return 1; } },
  blue_cartographer: { name: 'Blue Cartographer', color: 'blue', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 52,
    text: '+1 for every 2 cards you have drawn past your opening hand, and draws one on play.',
    passive: function (v) { return Math.floor((v.drawnExtra || 0) / 2); },
    onPlay: function (g, side, at, t, api) {
      var n = api.draw(side, 1);
      return n ? 'drew ' + n : 'deck empty';
    } },

  /* ===================================================================
     BUILD-AROUNDS
     The pool was eighty-odd cards of standalone value, which is why only two
     playstyles ever emerged: nothing rewarded *committing* to a shape, so the
     best deck was always "biggest bodies plus enough draw to find them".

     These are payoffs. Each asks a question about the board that only one
     kind of deck can answer well, and each is deliberately weak on an
     ordinary board — a Hivemind in a two-unit deck is a 1. Committing is what
     pays, and the questions are chosen so answers overlap: a wide board is
     also a colourful board, a warded board is also a slow one.
     =================================================================== */

  /* ---- SWARM: many small bodies ---- */
  green_hivemind: { name: 'Green Hivemind', color: 'green', strength: 1, rarity: 'Rare', type: 'unit', cost: 70,
    text: '+1 for every other friendly unit on the board.',
    passive: function (v) { return countOwn(v); } },
  yellow_multitude: { name: 'Yellow Multitude', color: 'yellow', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: '+4 while you control four or more other units.',
    passive: function (v) { return countOwn(v) >= 4 ? 4 : 0; } },
  green_spore: { name: 'Green Spore', color: 'green', strength: 1, rarity: 'Common', type: 'unit', cost: 25,
    text: 'On play, grow a Seedling in a touching empty tile.',
    onPlay: function (g, side, at, t, api) {
      var spot = api.emptyAdjacent(side, at);
      if (!spot) return 'no room to grow';
      api.create(side, spot.row, spot.index, 'green_seedling');
      return 'grew into ' + slotName(spot.row, spot.index);
    } },

  /* ---- MONOLITH: few, enormous ---- */
  red_colossus: { name: 'Red Colossus', color: 'red', strength: 9, rarity: 'Rare', type: 'unit', cost: 80,
    text: '\u22122 for every other friendly unit on the board.',
    passive: function (v) { return -2 * countOwn(v); } },
  black_solitude: { name: 'Black Solitude', color: 'black', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: '+8 while you control two or fewer other units.',
    passive: function (v) { return countOwn(v) <= 2 ? 8 : 0; } },
  /* Solitude fights the lane system on purpose: three units can only contest
     three lanes, so an empty-board archetype has to pay far better per unit
     than a wide one to break even. Measured at three units it scored 17
     against a Titan board's 56, so its payoffs carry most of the difference.
     These two are the ceiling the archetype was missing. */
  black_hermit: { name: 'The Hermit', color: 'black', strength: 4, rarity: 'Rare', type: 'unit', cost: 75,
    text: 'Doubles its own strength while you control two or fewer other units.',
    passive: function (v) { return countOwn(v) <= 2 ? (v.unit.strength + (v.unit.temp || 0)) : 0; } },
  cyan_monolith: { name: 'Cyan Monolith', color: 'cyan', strength: 3, rarity: 'Rare', type: 'unit', cost: 75,
    text: '+3 for every empty tile on your half of the board.',
    passive: function (v) {
      var empty = 0;
      ROWS.forEach(function (row) {
        for (var i = 0; i < ROW_INFO[row].count; i++) if (!v.board[v.side][row][i]) empty++;
      });
      return empty * 3;
    } },

  /* ---- TIDE: draw and hold ---- */
  blue_undertow: { name: 'Blue Undertow', color: 'blue', strength: 1, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: '+1 for every card in your hand, up to +6.',
    passive: function (v) { return Math.min(6, v.handSize || 0); } },
  cyan_reservoir: { name: 'Cyan Reservoir', color: 'cyan', strength: 2, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'Draws a card each round, and is +3 while your hand holds six or more.',
    drawsEachRound: 1,
    passive: function (v) { return (v.handSize || 0) >= 6 ? 3 : 0; } },

  /* ---- CHAIN: mixing as an engine ---- */
  magenta_crescendo: { name: 'Magenta Crescendo', color: 'magenta', strength: 1, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'Whenever you mix, this permanently gains 2.',
    onFriendlyMix: function (g, side, api, at) { api.buff(side, at, 2, true); return 'crescendo'; } },
  magenta_relay: { name: 'Magenta Relay', color: 'magenta', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: 'Your mixes produce units 1 stronger, and it is +2 for each link in your chain.',
    mixBonus: 1,
    passive: function (v) { return (v.mixChain || 0) * 2; } },

  /* ---- ATTRITION: grind the other side down ---- */
  black_wither: { name: 'Black Wither', color: 'black', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: 'Enemy frontlines in the lanes it holds are 2 weaker.',
    enemyAura: function () { return -2; } },
  blue_siphon: { name: 'Blue Siphon', color: 'blue', strength: 2, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'On play, the strongest enemy unit behind the line loses 3 and this gains 3.',
    onPlay: function (g, side, at, t, api) {
      var back = api.enemySupportIn(lanesOf(at.row, at.index));
      if (!back.length) return 'nothing to draw from';
      var w = back.reduce(function (a, b) { return b.strength > a.strength ? b : a; });
      api.damage(otherSide(side), w.row, w.index, 3);
      api.buff(side, at, 3, true);
      return 'siphoned ' + slotName(w.row, w.index);
    } },

  /* ---- SPECTRUM: breadth as a resource ---- */
  yellow_mosaic: { name: 'Yellow Mosaic', color: 'yellow', strength: 1, rarity: 'Rare', type: 'unit', cost: 70,
    text: '+2 for each different colour among your units.',
    passive: function (v) { return ownColours(v) * 2; } },
  yellow_pilgrim: { name: 'Yellow Pilgrim', color: 'yellow', strength: 1, rarity: 'Common', type: 'unit', cost: 30,
    text: '+1 for each different colour touching it.',
    passive: function (v) {
      var seen = {};
      v.adjacentFriendly().forEach(function (u) { if (u.color) seen[u.color] = 1; });
      return Object.keys(seen).length;
    } },
  colorless_prismstone: { name: 'Prismstone', color: null, strength: 2, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: 'Colourless, and +2 while four or more different colours stand with it.',
    passive: function (v) { return ownColours(v) >= 4 ? 2 : 0; } },

  /* ---- WARD: refuse to be moved ---- */
  cyan_sanctum: { name: 'Cyan Sanctum', color: 'cyan', strength: 2, rarity: 'Rare', type: 'unit', cost: 70,
    text: '+3 for every other warding unit you control.',
    passive: function (v) { return 3 * countOwn(v, isWardCard); } },
  green_bramblewall: { name: 'Green Bramblewall', color: 'green', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 55,
    text: 'Units in its row ignore all negative effects while it holds a frontline.',
    wardsRowWhenFront: true },

  /* ---- standing where they should not ----
     Row minimums are what actually held the cheap-unit archetypes down:
     measured, a swarm board filled 7 of 9 tiles and a one-of-each-colour
     board filled 4, while a Titan board filled all nine. These ignore the
     minimum, which is worth far more to those decks than another +1 rate. */
  green_burrower: { name: 'Green Burrower', color: 'green', strength: 1, rarity: 'Common', type: 'unit', cost: 30,
    text: 'May stand in any row. +1 for every 2 other friendly units.',
    anyRow: true,
    passive: function (v) {
      var n = 0;
      ROWS.forEach(function (row) {
        for (var i = 0; i < ROW_INFO[row].count; i++) {
          var u = v.board[v.side][row][i];
          if (u && !(row === v.row && i === v.index)) n++;
        }
      });
      return Math.floor(n / 2);
    } },
  yellow_herald: { name: 'Yellow Herald', color: 'yellow', strength: 1, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: 'May stand in any row. +2 for every distinct colour you field.',
    anyRow: true,
    passive: function (v) {
      var seen = {};
      ROWS.forEach(function (row) {
        for (var i = 0; i < ROW_INFO[row].count; i++) {
          var u = v.board[v.side][row][i];
          if (u && u.color) seen[u.color] = 1;
        }
      });
      return Object.keys(seen).length * 2;
    } },
  cyan_footing: { name: 'Cyan Footing', color: 'cyan', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: 'Friendly units in its row may stand there whatever their strength.',
    rowFreesPlacement: true },

  /* ---- payoffs for the hand-size archetype ----
     A hand-size board measured 24 against a Titan board's 56. The rates were
     fine; there was nothing at the top end to build toward. Magenta already
     had its chain payoffs, so only Blue needed the ceiling raised. */
  blue_archive: { name: 'The Blue Archive', color: 'blue', strength: 2, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'Every friendly unit is 1 stronger for every 3 cards in your hand.',
    aura: function (v) { return Math.floor(((v && v.handSize) || 0) / 3); } },
  blue_hoard: { name: 'Blue Hoard', color: 'blue', strength: 1, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: '+2 for every 3 cards in your hand.',
    passive: function (v) { return Math.floor((v.handSize || 0) / 3) * 2; } },
  cyan_reservoir: { name: 'Cyan Reservoir', color: 'cyan', strength: 2, rarity: 'Common', type: 'unit', cost: 30,
    text: '+1 for every 2 cards in your hand, up to +5.',
    passive: function (v) { return Math.min(5, Math.floor((v.handSize || 0) / 2)); } },

  blue_current: { name: 'Blue Current', color: 'blue', strength: 2, rarity: 'Common', type: 'unit', cost: 25,
    text: 'On play, move a friendly unit to a touching empty tile.',
    targets: [{ kind: 'friendlyUnit', prompt: 'Pick a friendly unit to move' },
              { kind: 'emptyAdjacentTo', ref: 0, prompt: 'Pick a touching empty tile' }],
    onPlay: function (g, side, at, t, api) {
      if (t.length < 2) return 'no legal move';
      api.move(side, t[0], t[1]); return 'moved to ' + slotName(t[1].row, t[1].index);
    } },
  blue_controller: { name: 'Blue Controller', color: 'blue', strength: 4, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: 'Enemy frontlines in the lanes it feeds are 1 weaker.',
    enemyAura: function () { return -1; } },

  green_seed: { name: 'Green Seed', color: 'green', strength: 1, rarity: 'Common', type: 'unit', cost: 20,
    text: '+2 while a friendly Green unit touches it.',
    passive: function (v) { return v.adjacentFriendly().some(function (u) { return u.color === 'green'; }) ? 2 : 0; } },
  green_gardener: { name: 'Green Gardener', color: 'green', strength: 3, rarity: 'Common', type: 'unit', cost: 30,
    text: 'Friendly units touching it are 1 stronger.', aura: function () { return 1; } },
  green_colony: { name: 'Green Colony', color: 'green', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: 'On play, grow a Green 1 in the leftmost empty Row 1 slot.',
    onPlay: function (g, side, at, t, api) {
      for (var i = 0; i < 4; i++) if (!g.board[side].row1[i]) { api.create(side, 'row1', i, 'green_seedling'); return 'grew a seedling'; }
      return 'no room';
    } },
  green_titan: { name: 'Green Titan', color: 'green', strength: 5, rarity: 'Rare', type: 'unit', cost: 65,
    text: '+1 for every other friendly Green unit.',
    passive: function (v) { var n = 0; eachUnit(v.board, v.side, function (u, r, i) { if (u.color === 'green' && !(r === v.row && i === v.index)) n++; }); return n; } },
  green_seedling: { name: 'Green Seedling', color: 'green', strength: 1, rarity: 'Token', type: 'unit', token: true,
    text: 'A token grown by Green Colony.' },

  yellow_spark: { name: 'Yellow Spark', color: 'yellow', strength: 1, rarity: 'Common', type: 'unit', cost: 20,
    text: 'On play, permanently strengthen your weakest other unit by 1.',
    onPlay: function (g, side, at, t, api) {
      var best = null;
      eachUnit(g.board, side, function (u, r, i) {
        if (r === at.row && i === at.index) return;
        if (!best || u.strength < best.u.strength) best = { u: u, r: r, i: i };
      });
      if (!best) return 'nothing to boost';
      api.buff(side, { row: best.r, index: best.i }, 1, true);
      return 'boosted ' + slotName(best.r, best.i);
    } },
  yellow_banner: { name: 'Yellow Banner', color: 'yellow', strength: 2, rarity: 'Common', type: 'unit', cost: 30,
    text: 'Friendly units in the same row are 1 stronger.', rowAura: function () { return 1; } },
  yellow_alchemist: { name: 'Yellow Alchemist', color: 'yellow', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 55,
    text: 'On play, perform a Free Mix between two touching friendly units.',
    targets: [{ kind: 'friendlyUnit', prompt: 'Pick the unit that will absorb the other' },
              { kind: 'friendlyAdjacentTo', ref: 0, prompt: 'Pick a touching friendly unit' }],
    onPlay: function (g, side, at, t, api) {
      if (t.length < 2) return 'nothing to mix';
      var r = api.freeMix(side, t[0], t[1]);
      return 'Free Mix into ' + colorInfo(r.color).name + ' ' + r.strength;
    } },
  yellow_champion: { name: 'Yellow Champion', color: 'yellow', strength: 4, rarity: 'Rare', type: 'unit', cost: 65,
    text: '+1 for every different colour on your board, up to +5.',
    passive: function (v) { var seen = {}, n = 0; eachUnit(v.board, v.side, function (u) { if (u.color && !seen[u.color]) { seen[u.color] = 1; n++; } }); return Math.min(5, n); } },

  cyan_shield: { name: 'Cyan Shield', color: 'cyan', strength: 1, rarity: 'Common', type: 'unit', cost: 20,
    text: '+2 while a hazard sits on its row.',
    passive: function (v) { return hazardsOnRow(v.hazards, v.row).length ? 2 : 0; } },
  cyan_cleanser: { name: 'Cyan Cleanser', color: 'cyan', strength: 3, rarity: 'Common', type: 'unit', cost: 30,
    text: 'On play, clear one hazard from the board.',
    targets: [{ kind: 'hazard', prompt: 'Pick a hazard to clear' }],
    onPlay: function (g, side, at, t, api) {
      if (!t.length) return 'no hazard';
      api.clearHazard(t[0].side, t[0].row); return 'cleared ' + ROW_INFO[t[0].row].label;
    } },
  cyan_guardian: { name: 'Cyan Guardian', color: 'cyan', strength: 5, rarity: 'Rare', type: 'unit', cost: 65,
    text: 'Units touching it keep their colour through Colourless Row.', guardsColour: true },
  cyan_mender: { name: 'Cyan Mender', color: 'cyan', strength: 2, rarity: 'Common', type: 'unit', cost: 30,
    text: 'On play, fissures touching its tile fall quiet until the round ends.',
    onPlay: function (g, side, at, t, api) {
      var n = api.quietFissuresAt(side, [at]);
      return n ? 'quieted ' + n : 'nothing to quiet';
    } },
  cyan_keystone: { name: 'Cyan Keystone', color: 'cyan', strength: 4, rarity: 'Uncommon', type: 'unit', cost: 55,
    text: 'On play, fissures touching it or its neighbours fall quiet until the round ends.',
    onPlay: function (g, side, at, t, api) {
      var tiles = [at].concat(adjacentTiles(at.row, at.index));
      var n = api.quietFissuresAt(side, tiles);
      return n ? 'quieted ' + n : 'nothing to quiet';
    } },

  magenta_spark: { name: 'Magenta Spark', color: 'magenta', strength: 1, rarity: 'Common', type: 'unit', cost: 25,
    text: 'Whenever you mix, draw a card.',
    onFriendlyMix: function (g, side, api) { api.draw(side, 1); return 'Spark drew'; } },
  magenta_chain: { name: 'Magenta Chain', color: 'magenta', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: 'Your mixes produce units 2 stronger.', mixBonus: 2 },
  magenta_echo: { name: 'Magenta Echo', color: 'magenta', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: '+2 for each mix in the current chain.',
    passive: function (v) { return 2 * (v.mixChain || 0); } },
  magenta_kaleidoscope: { name: 'Magenta Kaleidoscope', color: 'magenta', strength: 5, rarity: 'Rare', type: 'unit', cost: 75,
    text: 'On play, if your board holds 4 or more colours, perform a Free Mix.',
    targets: [{ kind: 'friendlyUnit', prompt: 'Pick the unit that will absorb the other' },
              { kind: 'friendlyAdjacentTo', ref: 0, prompt: 'Pick a touching friendly unit' }],
    onPlay: function (g, side, at, t, api) {
      var seen = {}, n = 0;
      eachUnit(g.board, side, function (u) { if (u.color && !seen[u.color]) { seen[u.color] = 1; n++; } });
      if (n < 4) return 'only ' + n + ' colours, no Free Mix';
      if (t.length < 2) return 'nothing to mix';
      var r = api.freeMix(side, t[0], t[1]);
      return 'Free Mix into ' + colorInfo(r.color).name + ' ' + r.strength;
    } },

  black_voidling: { name: 'Black Voidling', color: 'black', strength: 1, rarity: 'Common', type: 'unit', cost: 25,
    text: 'When mixed, the result is 3 stronger.', onMixConsumed: 3 },
  black_devourer: { name: 'Black Devourer', color: 'black', strength: 3, rarity: 'Common', type: 'unit', cost: 35,
    text: 'On play, devour a touching friendly unit and take its current strength permanently. The devoured card is gone from your deck for good.',
    targets: [{ kind: 'friendlyAdjacentToSelf', prompt: 'Pick a touching friendly unit to devour' }],
    /* Two changes from the original: the amount taken is now read off the
       fully evaluated board rather than the unit's own stored fields, and
       the meal costs something real.

       v.strength + v.temp only ever held the card's own printed number plus
       whatever had been permanently or temporarily added directly to it —
       it never included what a neighbour's aura was currently lending it.
       A unit standing next to a Green Gardener reads larger on the board
       than that sum says, and the old code took the smaller, wrong number.
       evaluateBoard is the same pass that produces what the player actually
       sees printed on the tile, so reading strength through it is reading
       the same number as the display, not a stored fragment of it.

       Removing the card from the deck is what makes the strength gain a
       trade rather than a free upgrade: eating a card previously destroyed
       it only for this fight and it would simply reappear in the next one,
       so Devourer cost nothing but the tempo of playing the meal first.
       Now the meal is truly gone, and growing Devourer this way is spent
       thinning the deck around it, not conjuring strength from nothing. */
    onPlay: function (g, side, at, t, api) {
      if (!t.length) return 'nothing in reach';
      var ev = evaluateBoard(g.board, g.hazards, g);
      var view = ev.view[side + '-' + t[0].row + '-' + t[0].index];
      var gained = view ? ev.strengthOf(view) : 0;
      api.removeFromDeck(side, t[0]);   // read the unit and its deck slot before destroy() clears the tile
      api.destroy(side, t[0]);
      api.buff(side, at, gained, true);
      return 'devoured for ' + gained + ' \u2014 gone from the deck for good';
    } },
  black_eraser: { name: 'Black Eraser', color: 'black', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: 'On play, the weakest enemy frontline in its lanes loses 3 strength.',
    onPlay: function (g, side, at, t, api) {
      var f = api.enemyFrontlinesIn(lanesOf(at.row, at.index));
      if (!f.length) return 'no target';
      var w = f.reduce(function (a, b) { return b.strength < a.strength ? b : a; });
      api.damage(otherSide(side), w.row, w.index, 3);
      return 'eroded ' + slotName(w.row, w.index);
    } },
  black_singularity: { name: 'Black Singularity', color: 'black', strength: 6, rarity: 'Rare', type: 'unit', cost: 80,
    text: 'When mixed, the result gains 2 more for every earlier mix in the chain.',
    onMixConsumedChain: 2 },
  /* The two cards that want a broken board. Both are written so the reward
     peaks and then turns: a Riftwalker on a lightly damaged tile is superb, on
     a tile the board has chewed through four times it is worse than nothing.
     That keeps deliberate self-destruction from being the optimal line — you
     want some damage, not all of it. */
  /* ---- plain Black ----
     Black's roster leaned hard on fissures, and once fissure cards were held
     back until a fissure exists, the colour had almost nothing to offer a
     player who had never used Rewind. These four are unconditional: they work
     on turn one of act one, and they give the Black gate something to be built
     out of besides luck. */
  black_ember: { name: 'Black Ember', color: 'black', strength: 2, rarity: 'Common', type: 'unit', cost: 25,
    text: '+2 while it holds a frontline.',
    matchup: function (v) { return v.isFrontline ? 2 : 0; } },
  black_shroud: { name: 'Black Shroud', color: 'black', strength: 3, rarity: 'Common', type: 'unit', cost: 30,
    text: 'Enemy units touching it are 1 weaker.',
    enemyAura: function () { return -1; } },
  black_maw: { name: 'Black Maw', color: 'black', strength: 4, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: 'On play, the strongest enemy frontline in its lanes loses 2.',
    onPlay: function (g, side, at, t, api) {
      var f = api.enemyFrontlinesIn(lanesOf(at.row, at.index));
      if (!f.length) return 'no target';
      var w = f.reduce(function (a, b) { return b.strength > a.strength ? b : a; });
      api.damage(otherSide(side), w.row, w.index, 2);
      return 'swallowed ' + slotName(w.row, w.index);
    } },
  black_obelisk: { name: 'Black Obelisk', color: 'black', strength: 5, rarity: 'Uncommon', type: 'unit', cost: 60,
    text: '+1 for every other Black unit you control.',
    passive: function (v) {
      var n = 0;
      ROWS.forEach(function (row) {
        for (var i = 0; i < ROW_INFO[row].count; i++) {
          var u = v.board[v.side][row][i];
          if (!u || (row === v.row && i === v.index)) continue;
          if (u.color === 'black') n++;
        }
      });
      return n;
    } },

  /* ---- the curse archetype ----
     Deliberately not built like the fissure cards. Those count a global
     number and scale smoothly with it, which makes them passive: you check a
     tally. Curses are objects sitting on your board taking up slots, so these
     are about *position and consumption* — touch one, or eat one. That gives
     the player a reason to place a curse well rather than merely own it, and
     it turns a dead slot into a resource without ever making curses good.

     Gated on actually holding a curse, so they never appear as blanks. */
  black_gravebloom: { name: 'Black Gravebloom', color: 'black', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 45,
    text: '+4 while it touches a curse.',
    passive: function (v) {
      return v.adjacentFriendly().some(function (u) {
        var d = CARDS[u.cardId]; return d && d.curse;
      }) ? 4 : 0;
    } },
  black_reclaimer: { name: 'Black Reclaimer', color: 'black', strength: 3, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'On play, devour a touching curse and gain 5 permanently.',
    targets: [{ kind: 'friendlyAdjacentToSelf', prompt: 'Pick a touching curse to devour' }],
    onPlay: function (g, side, at, t, api) {
      if (!t.length) return 'nothing in reach';
      var u = unitAt(g.board, side, t[0].row, t[0].index);
      var d = u && CARDS[u.cardId];
      if (!d || !d.curse) return 'that is not a curse';
      api.destroy(side, t[0]); api.buff(side, at, 5, true);
      return 'devoured ' + d.name;
    } },
  cyan_absolver: { name: 'Cyan Absolver', color: 'cyan', strength: 3, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: 'On play, destroy a touching curse.',
    targets: [{ kind: 'friendlyAdjacentToSelf', prompt: 'Pick a touching curse to lift' }],
    onPlay: function (g, side, at, t, api) {
      if (!t.length) return 'nothing in reach';
      var u = unitAt(g.board, side, t[0].row, t[0].index);
      var d = u && CARDS[u.cardId];
      if (!d || !d.curse) return 'that is not a curse';
      api.destroy(side, t[0]);
      return 'lifted ' + d.name;
    } },

  black_riftwalker: { name: 'Black Riftwalker', color: 'black', strength: 3, rarity: 'Rare', type: 'unit', cost: 70,
    text: 'Feeds on fissures rather than bleeding: +2 per point, \u22123 for each point past 4.',
    fissure: function (f) {
      var n = f.count;
      return n <= 4 ? 2 * n : 8 - 3 * (n - 4);
    } },
  black_chorus: { name: 'Black Chorus', color: 'black', strength: 2, rarity: 'Uncommon', type: 'unit', cost: 50,
    text: '+1 per fissure on your board, up to +5. Still bleeds into fissures it touches.',
    passive: function (v) { return Math.min(5, (v.fissures || []).length); } },

  overcharge: { name: 'Overcharge', color: null, strength: 0, rarity: 'Common', type: 'spell', cost: 25,
    text: 'Give a friendly unit +3 until the round ends.',
    targets: [{ kind: 'friendlyUnit', prompt: 'Pick a unit to overcharge' }],
    onPlay: function (g, side, at, t, api) { if (!t.length) return 'no unit'; api.buff(side, t[0], 3, false); return 'overcharged'; } },
  catalyst: { name: 'Catalyst', color: null, strength: 0, rarity: 'Uncommon', type: 'spell', cost: 50,
    text: 'Free Mix two touching friendly units. The result is 2 stronger.',
    targets: [{ kind: 'friendlyUnit', prompt: 'Pick the unit that will absorb the other' },
              { kind: 'friendlyAdjacentTo', ref: 0, prompt: 'Pick a touching friendly unit' }],
    onPlay: function (g, side, at, t, api) {
      if (t.length < 2) return 'nothing to mix';
      var r = api.freeMix(side, t[0], t[1], 2);
      return 'catalysed into ' + colorInfo(r.color).name + ' ' + r.strength;
    } },
  spectrum_shift: { name: 'Spectrum Shift', color: null, strength: 0, rarity: 'Uncommon', type: 'spell', cost: 40,
    text: 'Repaint a friendly unit any colour.',
    targets: [{ kind: 'friendlyUnit', prompt: 'Pick a unit to repaint' }, { kind: 'color', prompt: 'Pick its new colour' }],
    onPlay: function (g, side, at, t, api) {
      if (t.length < 2) return 'nothing to repaint';
      api.recolor(side, t[0], t[1].color); return 'repainted to ' + COLORS[t[1].color].name;
    } },

  /* ---------------- CURSES ----------------
     A curse never reaches your hand. The moment it is drawn it plants itself on
     your board as a colourless unit: squatting on a tile you wanted, dragging
     your neighbours down, or feeding the enemy across the line. Colourless means
     it can neither be effective nor be countered — dead weight holding a lane.
     Whoever draws one gets it on their own half, enemies included. */
  curse_husk: { name: 'Grey Husk', color: null, strength: CURSE_STRENGTH, rarity: 'Curse', type: 'curse', curse: true,
    text: 'Plants itself on your board. Colourless, does nothing, and sits where you wanted to build.',
    onDraw: function (g, side, api) { return plantCurse(g, side, api, 'curse_husk'); } },

  curse_idol: { name: 'Leaden Idol', color: null, strength: CURSE_STRENGTH, rarity: 'Curse', type: 'curse', curse: true,
    text: 'Plants itself on your board. Units touching it are 1 weaker.',
    aura: function () { return -1; },
    onDraw: function (g, side, api) { return plantCurse(g, side, api, 'curse_idol'); } },

  curse_pillar: { name: 'Ashen Pillar', color: null, strength: CURSE_STRENGTH, rarity: 'Curse', type: 'curse', curse: true,
    text: 'Plants itself on your board. Your units in its row are 1 weaker.',
    rowAura: function () { return -1; },
    onDraw: function (g, side, api) { return plantCurse(g, side, api, 'curse_pillar'); } },

  curse_beacon: { name: 'Beacon of Rot', color: null, strength: CURSE_STRENGTH, rarity: 'Curse', type: 'curse', curse: true,
    text: 'Plants itself on your board. Enemy frontlines in the lanes it feeds are 2 stronger.',
    enemyAura: function () { return 2; },
    onDraw: function (g, side, api) { return plantCurse(g, side, api, 'curse_beacon'); } },

  colorless_row: { name: 'Colourless Row', color: null, strength: 0, rarity: 'Common', type: 'hazard', cost: 30,
    hazardKind: 'colorless', text: 'Units in this row lose their colour — on BOTH halves.' },
  scorched_row: { name: 'Scorched Row', color: null, strength: 0, rarity: 'Common', type: 'hazard', cost: 30,
    hazardKind: 'scorch', text: 'Units in this row are 1 weaker — on BOTH halves.' }
};
