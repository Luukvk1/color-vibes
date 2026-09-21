/* Colour Vibes — generated from the single-file build by build/split.py.
   Edit color-vibes-act1.html, then re-run the script. */

/* The board's geometry.
   Eighteen triangular tiles: which touch, which lanes they belong to, and the SVG
   coordinates each is drawn at. Pure maths — no game state. */

import { B, COLOR_KEYS } from './colors.js';
import { CARDS } from './cards.js';

/* ===================================================================
   2. BOARD SHAPE
   =================================================================== */
export var ROW_INFO = {
  row1: { count: 4, min: 1, label: 'Row 1', depth: 1 },
  row2: { count: 3, min: 2, label: 'Row 2', depth: 2 },
  row3: { count: 2, min: 3, label: 'Row 3', depth: 3 }
};
export var ROWS = ['row1', 'row2', 'row3'];
export var PLAYER = 'bottom', ENEMY = 'top';
export var LANE_COUNT = 4;
export var HAND_LIMIT = 10, OPENING_HAND = 6, DECK_SIZE = 10, ROUND_DRAW = 2;
/* No cap. Relics were limited to eight, which quietly turned the back half of
   a long run into a stream of rewards the player could not accept — and there
   is no interesting decision in "you may not have this", only a wasted drop.
   Kept as a name rather than deleted so the places that used to gate on it
   read honestly as unbounded. */
export var RELIC_LIMIT = Infinity;

/* ---- act progression (Act Progression doc, Option 1) ----
   An act is reachable only once the deck already holds enough cards of that
   colour. The three primaries are free, because the starting deck is built
   from them; everything else has to be made, and the only place to make it is
   the Colour Lab. That is not a restriction bolted on top of the colour
   system — it *is* the colour system: Yellow is Red + Green, so "you may
   enter the Radiant Grove once you hold Yellow" and "Yellow is Red mixed with
   Green" are the same sentence. */
export var ACT_REQUIREMENT = 2;                       // x — cards of a colour needed to open its act
/* Black is the three-colour mix, so a single Black card already costs two
   fusions: a secondary first, then that secondary against the missing
   primary. Four Black is therefore roughly eight bench operations, and the
   Lab hands out one guaranteed per act. That prices the last road exactly
   where it should sit — barely reachable off two acts, a real push off three,
   unremarkable off four — without any explicit act counting. */
export var ACT_REQUIREMENT_BY_COLOR = { black: 2 };
export var PRIMARY_COLORS = ['red', 'green', 'blue']; // always reachable, never need the Lab

export function requirementFor(colorKey) {
  return ACT_REQUIREMENT_BY_COLOR[colorKey] || ACT_REQUIREMENT;
}

/* How many cards of each colour a deck is holding. Colourless cards count for
   nothing here: they open no doors. */
export function colourCounts(deck) {
  var out = {};
  COLOR_KEYS.forEach(function (k) { out[k] = 0; });
  (deck || []).forEach(function (entry) {
    var d = CARDS[entry.id];
    if (!d || d.curse) return;                  // a curse is not a colour you earned
    if (d.color && out[d.color] !== undefined) out[d.color]++;
  });
  return out;
}
export function actUnlocked(colorKey, deck) {
  if (PRIMARY_COLORS.indexOf(colorKey) !== -1) return true;
  return colourCounts(deck)[colorKey] >= requirementFor(colorKey);
}

export var ADJACENT = (function () {
  var a = {}, j, k;
  function put(r1, i1, r2, i2) {
    if (i1 < 0 || i1 >= ROW_INFO[r1].count || i2 < 0 || i2 >= ROW_INFO[r2].count) return;
    a[r1 + '-' + i1].push({ row: r2, index: i2 });
    a[r2 + '-' + i2].push({ row: r1, index: i1 });
  }
  ROWS.forEach(function (r) { for (var n = 0; n < ROW_INFO[r].count; n++) a[r + '-' + n] = []; });
  for (j = 0; j < 3; j++) { put('row2', j, 'row1', j); put('row2', j, 'row1', j + 1); }
  for (k = 0; k < 2; k++) { put('row3', k, 'row2', k); put('row3', k, 'row2', k + 1); }
  return a;
})();
export function adjacentTiles(row, index) { return ADJACENT[row + '-' + index] || []; }

export var LANE_CANDIDATES = (function () {
  var out = [], i;
  for (i = 0; i < LANE_COUNT; i++) {
    var c = [{ row: 'row1', index: i }];
    [i - 1, i].forEach(function (j) { if (j >= 0 && j < 3) c.push({ row: 'row2', index: j }); });
    [i - 2, i - 1, i].forEach(function (k) { if (k >= 0 && k < 2) c.push({ row: 'row3', index: k }); });
    out.push(c);
  }
  return out;
})();
export var LANES_OF = (function () {
  var m = {};
  LANE_CANDIDATES.forEach(function (list, L) {
    list.forEach(function (t) { (m[t.row + '-' + t.index] = m[t.row + '-' + t.index] || []).push(L); });
  });
  return m;
})();
export function lanesOf(row, index) { return LANES_OF[row + '-' + index]; }

/* ---- fissures ----------------------------------------------------
   A fissure is a crack running along one adjacency edge. It breaks that
   edge for everything at once: auras, guards, mixing, targeting, and the
   flow of strength forward into the lanes.

   That single rule is enough because the lane table above is exactly
   forward reachability through the adjacency graph — row2[j] reaches
   row1[j] and row1[j+1], row3[k] reaches everything its two row2
   neighbours reach. So once an edge is gone, lane membership falls out of
   a reachability walk rather than needing its own bookkeeping, and a
   Row 3 tile cut from one neighbour keeps precisely the lanes its other
   neighbour still offers. */
export function edgeKey(side, a, b) {
  var x = a.row + '-' + a.index, y = b.row + '-' + b.index;
  return side + '|' + (x < y ? x + '|' + y : y + '|' + x);
}
export function sameTile(a, b) { return a.row === b.row && a.index === b.index; }

/* One reading of the board's damage: which joins are cut, which unnatural
   joins have been forced open, and how hard each one pulls. Everything that
   asks about adjacency or lanes goes through this. */
export function boardTopo(fissures) {
  if (!fissures || !fissures.length) return null;
  var cut = {}, extra = {}, any = false;
  function link(side, from, to) {
    var k = side + '|' + from.row + '-' + from.index;
    (extra[k] = extra[k] || []).push({ row: to.row, index: to.index });
  }
  fissures.forEach(function (f) {
    if (!f.side) return;
    any = true;
    if (f.kind === 'sever') cut[edgeKey(f.side, f.a, f.b)] = 1;
    else if (f.kind === 'bridge') { link(f.side, f.a, f.b); link(f.side, f.b, f.a); }
  });
  return any ? { cut: cut, extra: extra } : null;
}
/* Adjacency as the board actually is now: severed joins removed, bridged
   joins added. Every adjacency-flavoured rule in the game reads through
   this, so nothing reaches across a fissure and everything reaches across
   a bridge. */
export function adjacentTilesFor(side, row, index, topo) {
  var list = ADJACENT[row + '-' + index] || [];
  if (!topo) return list;
  var self = { row: row, index: index };
  var out = list.filter(function (t) { return !topo.cut[edgeKey(side, self, t)]; });
  var add = topo.extra[side + '|' + row + '-' + index];
  if (add) add.forEach(function (t) {
    if (topo.cut[edgeKey(side, self, t)]) return;
    if (out.some(function (o) { return sameTile(o, t); })) return;
    out.push({ row: t.row, index: t.index });
  });
  return out;
}
/* Which lanes a tile still feeds: walk forward through live joins until we
   reach Row 1 tiles, each of which is the head of its own lane. A bridge
   that points forward therefore grants a lane for free; one that runs along
   a row grants adjacency only. */
export function lanesOfFor(side, row, index, topo) {
  if (!topo) return LANES_OF[row + '-' + index] || [];
  var seen = {}, lanes = {}, stack = [{ row: row, index: index }];
  while (stack.length) {
    var t = stack.pop(), k = t.row + '-' + t.index;
    if (seen[k]) continue;
    seen[k] = 1;
    if (t.row === 'row1') { lanes[t.index] = 1; continue; }
    adjacentTilesFor(side, t.row, t.index, topo).forEach(function (n) {
      // only ever walk toward the front, never back down the board
      if (ROW_INFO[n.row].depth < ROW_INFO[t.row].depth) stack.push(n);
    });
  }
  return Object.keys(lanes).map(Number).sort(function (a, b) { return a - b; });
}
export function laneMembersFor(L, side, topo) {
  var list = LANE_CANDIDATES[L];
  if (!topo) return list;
  // a bridge can put a tile in a lane its row never belonged to
  var out = list.filter(function (t) { return lanesOfFor(side, t.row, t.index, topo).indexOf(L) !== -1; });
  ROWS.forEach(function (row) {
    for (var i = 0; i < ROW_INFO[row].count; i++) {
      if (out.some(function (o) { return o.row === row && o.index === i; })) continue;
      if (lanesOfFor(side, row, i, topo).indexOf(L) !== -1) out.push({ row: row, index: i });
    }
  });
  return out;
}

/* Set true to make a severed unit pour its whole strength into the lanes it
   still holds, instead of losing the severed share. Measured at 4,000 random
   boards this turns Sever into a net gain for the player (+0.5 points on
   average, helping more often than it hurts), so it ships off. */
export var FISSURE_CONCENTRATES = false;

/* Every scar pulls at the tiles it touches, whether it was torn open or
   forced together. Power is how hard: a fresh scar pulls once, and a board
   with nowhere left to break deepens the scars it already has. */
export var FISSURE_DRAIN = 1, FISSURE_MAX_POWER = 4;
export function fissurePower(f) { return Math.max(1, f.power || 1); }
export function fissuresTouching(side, row, index, fissures) {
  if (!fissures || !fissures.length) return 0;
  var self = { row: row, index: index }, n = 0;
  fissures.forEach(function (f) {
    if (f.side !== side) return;
    if (sameTile(f.a, self) || sameTile(f.b, self)) n += fissurePower(f);
  });
  return n;
}

/* Every edge whose loss still leaves each tile a route to the front. A tile
   that can reach no Row 1 tile is stranded: it would sit on the board
   contributing to nothing, which reads as a bug rather than a scar. */
export function severableLinks(side, fissures) {
  var topo = boardTopo(fissures), out = [];
  var cut = (topo && topo.cut) || {}, extra = (topo && topo.extra) || {};
  var edges = [];
  ROWS.forEach(function (row) {
    for (var i = 0; i < ROW_INFO[row].count; i++) {
      (ADJACENT[row + '-' + i] || []).forEach(function (t) {
        if (ROW_INFO[t.row].depth >= ROW_INFO[row].depth) return;   // list each edge once
        edges.push({ a: { row: row, index: i }, b: { row: t.row, index: t.index } });
      });
    }
  });
  edges.forEach(function (e) {
    var k = edgeKey(side, e.a, e.b);
    if (cut[k]) return;
    var trial = { cut: {}, extra: extra };
    Object.keys(cut).forEach(function (kk) { trial.cut[kk] = 1; });
    trial.cut[k] = 1;
    var stranded = false;
    ROWS.forEach(function (row) {
      for (var i = 0; i < ROW_INFO[row].count; i++)
        if (!lanesOfFor(side, row, i, trial).length) stranded = true;
    });
    if (!stranded) out.push({ kind: 'sever', side: side, a: e.a, b: e.b, power: 1 });
  });
  return out;
}

/* A bridge joins two tiles that meet at a single corner but were never meant
   to connect — the board folding over on itself. Corner-sharing keeps it
   legible: the join is always visibly short and never leaps the board. Tiles
   already joined by an edge share two corners, so they exclude themselves. */
export var BRIDGE_PAIRS = null;
export function bridgePairs() {
  if (BRIDGE_PAIRS) return BRIDGE_PAIRS;
  var poly = {}, keys = [];
  basePolys().forEach(function (t) {
    poly[t.row + '-' + t.index] = t.points;
    keys.push({ row: t.row, index: t.index });
  });
  function corners(ka, kb) {
    var A = poly[ka], B = poly[kb], n = 0;
    A.forEach(function (p) {
      B.forEach(function (q) {
        if (Math.abs(p[0] - q[0]) < 0.001 && Math.abs(p[1] - q[1]) < 0.001) n++;
      });
    });
    return n;
  }
  BRIDGE_PAIRS = [];
  for (var i = 0; i < keys.length; i++) {
    for (var j = i + 1; j < keys.length; j++) {
      var ka = keys[i].row + '-' + keys[i].index, kb = keys[j].row + '-' + keys[j].index;
      if (corners(ka, kb) === 1) BRIDGE_PAIRS.push({ a: keys[i], b: keys[j] });
    }
  }
  return BRIDGE_PAIRS;
}
export function bridgeableLinks(side, fissures) {
  var topo = boardTopo(fissures), out = [];
  bridgePairs().forEach(function (pr) {
    var taken = (fissures || []).some(function (f) {
      return f.side === side &&
        ((sameTile(f.a, pr.a) && sameTile(f.b, pr.b)) || (sameTile(f.a, pr.b) && sameTile(f.b, pr.a)));
    });
    if (taken) return;
    if (topo && topo.cut[edgeKey(side, pr.a, pr.b)]) return;
    out.push({ kind: 'bridge', side: side, a: pr.a, b: pr.b, power: 1 });
  });
  return out;
}

export var T = 200, HT = Math.sqrt(3) / 2 * T, GUTTER = 0.92;
export function centroidOf(p) {
  if (p.length === 4) return [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2];
  var sx = 0, sy = 0;
  p.forEach(function (q) { sx += q[0]; sy += q[1]; });
  return [sx / p.length, sy / p.length];
}
export function shrink(p, c, f) { return p.map(function (q) { return [c[0] + (q[0] - c[0]) * f, c[1] + (q[1] - c[1]) * f]; }); }
export function basePolys() {
  var base = [], i, j, k;
  for (i = 0; i < 4; i++) base.push({ row: 'row1', index: i, points: [[i * T, 0], [(i + 1) * T, 0], [i * T + T / 2, HT]] });
  for (j = 0; j < 3; j++) base.push({ row: 'row2', index: j, points: [[(j + 1) * T, 0], [(j + 1) * T + T / 2, HT], [(j + 1) * T, 2 * HT], [j * T + T / 2, HT]] });
  for (k = 0; k < 2; k++) base.push({ row: 'row3', index: k, points: [[(k + 1) * T + T / 2, HT], [(k + 2) * T, 2 * HT], [(k + 1) * T, 2 * HT]] });
  return base;
}
export var GEO = (function () {
  var base = basePolys(), g = [];
  base.forEach(function (t) {
    var bc = centroidOf(t.points);
    g.push({ side: 'bottom', row: t.row, index: t.index, points: shrink(t.points, bc, GUTTER), cx: bc[0], cy: bc[1] });
    var m = t.points.map(function (p) { return [p[0], -p[1]]; }), tc = centroidOf(m);
    g.push({ side: 'top', row: t.row, index: t.index, points: shrink(m, tc, GUTTER), cx: tc[0], cy: tc[1] });
  });
  return g;
})();

/* The literal seam two adjacent tiles share, taken from the unshrunk
   polygons so a crack sits on the join itself rather than on the line
   between the two centroids. Two triangles or a triangle and a rhombus
   always share exactly two vertices; those are the ends of the seam. */
export var EDGE_GEO = (function () {
  var base = basePolys(), poly = {}, out = {};
  base.forEach(function (t) { poly[t.row + '-' + t.index] = t.points; });
  function seam(ka, kb) {
    var A = poly[ka], B = poly[kb], shared = [];
    A.forEach(function (p) {
      B.forEach(function (q) {
        if (Math.abs(p[0] - q[0]) < 0.001 && Math.abs(p[1] - q[1]) < 0.001) shared.push(p);
      });
    });
    return shared.length === 2 ? shared : null;
  }
  ROWS.forEach(function (row) {
    for (var i = 0; i < ROW_INFO[row].count; i++) {
      var ka = row + '-' + i;
      (ADJACENT[ka] || []).forEach(function (t) {
        var kb = t.row + '-' + t.index;
        var s = seam(ka, kb);
        if (!s) return;
        var k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        out['bottom|' + k] = [[s[0][0], s[0][1]], [s[1][0], s[1][1]]];
        out['top|' + k] = [[s[0][0], -s[0][1]], [s[1][0], -s[1][1]]];
      });
    }
  });
  return out;
})();
/* The single corner a bridged pair meets at, in board coordinates. */
export function sharedCorner(side, a, b) {
  var poly = {};
  basePolys().forEach(function (t) { poly[t.row + '-' + t.index] = t.points; });
  var A = poly[a.row + '-' + a.index], B = poly[b.row + '-' + b.index], hit = null;
  if (!A || !B) return null;
  A.forEach(function (p) {
    B.forEach(function (q) {
      if (Math.abs(p[0] - q[0]) < 0.001 && Math.abs(p[1] - q[1]) < 0.001) hit = p;
    });
  });
  return hit ? [hit[0], side === 'top' ? -hit[1] : hit[1]] : null;
}
export function seamOf(side, a, b) {
  var x = a.row + '-' + a.index, y = b.row + '-' + b.index;
  return EDGE_GEO[side + '|' + (x < y ? x + '|' + y : y + '|' + x)] || null;
}
export var VIEWBOX = (function () {
  var pad = 28, a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  GEO.forEach(function (t) {
    t.points.forEach(function (p) {
      a = Math.min(a, p[0]); c = Math.max(c, p[0]); b = Math.min(b, p[1]); d = Math.max(d, p[1]);
    });
  });
  return { x: a - pad, y: b - pad, w: (c - a) + pad * 2, h: (d - b) + pad * 2 };
})();
