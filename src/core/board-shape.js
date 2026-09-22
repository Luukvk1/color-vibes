/* The board's geometry.
   Eighteen triangular tiles: which touch, which lanes they belong to, and the SVG
   coordinates each is drawn at. Pure maths — no game state. */

import { COLOR_KEYS } from './colors.js';
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
export var ACT_REQUIREMENT = 2;                       // cards of a colour needed to open its act
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
  var counts = {};
  COLOR_KEYS.forEach(function (colorKey) { counts[colorKey] = 0; });
  (deck || []).forEach(function (entry) {
    var cardDef = CARDS[entry.id];
    if (!cardDef || cardDef.curse) return;             // a curse is not a colour you earned
    if (cardDef.color && counts[cardDef.color] !== undefined) counts[cardDef.color]++;
  });
  return counts;
}
export function actUnlocked(colorKey, deck) {
  if (PRIMARY_COLORS.indexOf(colorKey) !== -1) return true;
  return colourCounts(deck)[colorKey] >= requirementFor(colorKey);
}

/* Every tile's direct neighbours, keyed by "row-index". Built once: for each
   Row 2 tile, connect it to the two Row 1 tiles it sits above; for each
   Row 3 tile, the two Row 2 tiles above that. Every connection is recorded
   on both ends. */
export var ADJACENT = (function () {
  var adjacencyMap = {};
  function connect(rowA, indexA, rowB, indexB) {
    if (indexA < 0 || indexA >= ROW_INFO[rowA].count || indexB < 0 || indexB >= ROW_INFO[rowB].count) return;
    adjacencyMap[rowA + '-' + indexA].push({ row: rowB, index: indexB });
    adjacencyMap[rowB + '-' + indexB].push({ row: rowA, index: indexA });
  }
  ROWS.forEach(function (row) {
    for (var index = 0; index < ROW_INFO[row].count; index++) adjacencyMap[row + '-' + index] = [];
  });
  for (var row2Index = 0; row2Index < 3; row2Index++) {
    connect('row2', row2Index, 'row1', row2Index);
    connect('row2', row2Index, 'row1', row2Index + 1);
  }
  for (var row3Index = 0; row3Index < 2; row3Index++) {
    connect('row3', row3Index, 'row2', row3Index);
    connect('row3', row3Index, 'row2', row3Index + 1);
  }
  return adjacencyMap;
})();
export function adjacentTiles(row, index) { return ADJACENT[row + '-' + index] || []; }

/* Every Row 1 tile is the head of its own lane; each lane's candidate
   members are that Row 1 tile plus the Row 2 and Row 3 tiles that stand
   behind it. Used as the default membership before any fissure narrows or
   widens it (see lanesOfFor). */
export var LANE_CANDIDATES = (function () {
  var lanes = [];
  for (var laneIndex = 0; laneIndex < LANE_COUNT; laneIndex++) {
    var members = [{ row: 'row1', index: laneIndex }];
    [laneIndex - 1, laneIndex].forEach(function (row2Index) {
      if (row2Index >= 0 && row2Index < 3) members.push({ row: 'row2', index: row2Index });
    });
    [laneIndex - 2, laneIndex - 1, laneIndex].forEach(function (row3Index) {
      if (row3Index >= 0 && row3Index < 2) members.push({ row: 'row3', index: row3Index });
    });
    lanes.push(members);
  }
  return lanes;
})();
export var LANES_OF = (function () {
  var tileToLanes = {};
  LANE_CANDIDATES.forEach(function (members, laneIndex) {
    members.forEach(function (tile) {
      var key = tile.row + '-' + tile.index;
      (tileToLanes[key] = tileToLanes[key] || []).push(laneIndex);
    });
  });
  return tileToLanes;
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
export function edgeKey(side, tileA, tileB) {
  var keyA = tileA.row + '-' + tileA.index, keyB = tileB.row + '-' + tileB.index;
  return side + '|' + (keyA < keyB ? keyA + '|' + keyB : keyB + '|' + keyA);
}
export function sameTile(tileA, tileB) { return tileA.row === tileB.row && tileA.index === tileB.index; }

/* One reading of the board's damage: which joins are cut, which unnatural
   joins have been forced open, and how hard each one pulls. Everything that
   asks about adjacency or lanes goes through this. */
export function boardTopo(fissures) {
  if (!fissures || !fissures.length) return null;
  var cutEdges = {}, bridgedNeighbors = {}, hasAny = false;
  function link(side, from, to) {
    var key = side + '|' + from.row + '-' + from.index;
    (bridgedNeighbors[key] = bridgedNeighbors[key] || []).push({ row: to.row, index: to.index });
  }
  fissures.forEach(function (fissure) {
    if (!fissure.side) return;
    hasAny = true;
    if (fissure.kind === 'sever') cutEdges[edgeKey(fissure.side, fissure.a, fissure.b)] = 1;
    else if (fissure.kind === 'bridge') { link(fissure.side, fissure.a, fissure.b); link(fissure.side, fissure.b, fissure.a); }
  });
  return hasAny ? { cut: cutEdges, extra: bridgedNeighbors } : null;
}
/* Adjacency as the board actually is now: severed joins removed, bridged
   joins added. Every adjacency-flavoured rule in the game reads through
   this, so nothing reaches across a fissure and everything reaches across
   a bridge. */
export function adjacentTilesFor(side, row, index, topology) {
  var neighbors = ADJACENT[row + '-' + index] || [];
  if (!topology) return neighbors;
  var selfTile = { row: row, index: index };
  var live = neighbors.filter(function (tile) { return !topology.cut[edgeKey(side, selfTile, tile)]; });
  var bridged = topology.extra[side + '|' + row + '-' + index];
  if (bridged) bridged.forEach(function (tile) {
    if (topology.cut[edgeKey(side, selfTile, tile)]) return;
    if (live.some(function (existing) { return sameTile(existing, tile); })) return;
    live.push({ row: tile.row, index: tile.index });
  });
  return live;
}
/* Which lanes a tile still feeds: walk forward through live joins until we
   reach Row 1 tiles, each of which is the head of its own lane. A bridge
   that points forward therefore grants a lane for free; one that runs along
   a row grants adjacency only. */
export function lanesOfFor(side, row, index, topology) {
  if (!topology) return LANES_OF[row + '-' + index] || [];
  var visited = {}, reachedLanes = {}, stack = [{ row: row, index: index }];
  while (stack.length) {
    var tile = stack.pop(), tileKey = tile.row + '-' + tile.index;
    if (visited[tileKey]) continue;
    visited[tileKey] = 1;
    if (tile.row === 'row1') { reachedLanes[tile.index] = 1; continue; }
    adjacentTilesFor(side, tile.row, tile.index, topology).forEach(function (neighbor) {
      // only ever walk toward the front, never back down the board
      if (ROW_INFO[neighbor.row].depth < ROW_INFO[tile.row].depth) stack.push(neighbor);
    });
  }
  return Object.keys(reachedLanes).map(Number).sort(function (laneA, laneB) { return laneA - laneB; });
}
export function laneMembersFor(laneIndex, side, topology) {
  var candidates = LANE_CANDIDATES[laneIndex];
  if (!topology) return candidates;
  // a bridge can put a tile in a lane its row never belonged to
  var members = candidates.filter(function (tile) { return lanesOfFor(side, tile.row, tile.index, topology).indexOf(laneIndex) !== -1; });
  ROWS.forEach(function (row) {
    for (var index = 0; index < ROW_INFO[row].count; index++) {
      if (members.some(function (existing) { return existing.row === row && existing.index === index; })) continue;
      if (lanesOfFor(side, row, index, topology).indexOf(laneIndex) !== -1) members.push({ row: row, index: index });
    }
  });
  return members;
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
export function fissurePower(fissure) { return Math.max(1, fissure.power || 1); }
export function fissuresTouching(side, row, index, fissures) {
  if (!fissures || !fissures.length) return 0;
  var selfTile = { row: row, index: index }, totalPower = 0;
  fissures.forEach(function (fissure) {
    if (fissure.side !== side) return;
    if (sameTile(fissure.a, selfTile) || sameTile(fissure.b, selfTile)) totalPower += fissurePower(fissure);
  });
  return totalPower;
}

/* Every edge whose loss still leaves each tile a route to the front. A tile
   that can reach no Row 1 tile is stranded: it would sit on the board
   contributing to nothing, which reads as a bug rather than a scar. */
export function severableLinks(side, fissures) {
  var topology = boardTopo(fissures), severable = [];
  var cutEdges = (topology && topology.cut) || {}, bridgedNeighbors = (topology && topology.extra) || {};
  var edges = [];
  ROWS.forEach(function (row) {
    for (var index = 0; index < ROW_INFO[row].count; index++) {
      (ADJACENT[row + '-' + index] || []).forEach(function (neighbor) {
        if (ROW_INFO[neighbor.row].depth >= ROW_INFO[row].depth) return;   // list each edge once
        edges.push({ a: { row: row, index: index }, b: { row: neighbor.row, index: neighbor.index } });
      });
    }
  });
  edges.forEach(function (edge) {
    var key = edgeKey(side, edge.a, edge.b);
    if (cutEdges[key]) return;
    // trial-cut this one edge on top of what's already cut, and see if anything gets stranded
    var trialTopology = { cut: {}, extra: bridgedNeighbors };
    Object.keys(cutEdges).forEach(function (existingKey) { trialTopology.cut[existingKey] = 1; });
    trialTopology.cut[key] = 1;
    var strandsATile = false;
    ROWS.forEach(function (row) {
      for (var index = 0; index < ROW_INFO[row].count; index++)
        if (!lanesOfFor(side, row, index, trialTopology).length) strandsATile = true;
    });
    if (!strandsATile) severable.push({ kind: 'sever', side: side, a: edge.a, b: edge.b, power: 1 });
  });
  return severable;
}

/* A bridge joins two tiles that meet at a single corner but were never meant
   to connect — the board folding over on itself. Corner-sharing keeps it
   legible: the join is always visibly short and never leaps the board. Tiles
   already joined by an edge share two corners, so they exclude themselves. */
export var BRIDGE_PAIRS = null;
export function bridgePairs() {
  if (BRIDGE_PAIRS) return BRIDGE_PAIRS;
  var pointsByTile = {}, tileKeys = [];
  basePolys().forEach(function (tile) {
    pointsByTile[tile.row + '-' + tile.index] = tile.points;
    tileKeys.push({ row: tile.row, index: tile.index });
  });
  function sharedCornerCount(keyA, keyB) {
    var polygonA = pointsByTile[keyA], polygonB = pointsByTile[keyB], count = 0;
    polygonA.forEach(function (pointA) {
      polygonB.forEach(function (pointB) {
        if (Math.abs(pointA[0] - pointB[0]) < 0.001 && Math.abs(pointA[1] - pointB[1]) < 0.001) count++;
      });
    });
    return count;
  }
  BRIDGE_PAIRS = [];
  for (var indexA = 0; indexA < tileKeys.length; indexA++) {
    for (var indexB = indexA + 1; indexB < tileKeys.length; indexB++) {
      var keyA = tileKeys[indexA].row + '-' + tileKeys[indexA].index, keyB = tileKeys[indexB].row + '-' + tileKeys[indexB].index;
      if (sharedCornerCount(keyA, keyB) === 1) BRIDGE_PAIRS.push({ a: tileKeys[indexA], b: tileKeys[indexB] });
    }
  }
  return BRIDGE_PAIRS;
}
export function bridgeableLinks(side, fissures) {
  var topology = boardTopo(fissures), bridgeable = [];
  bridgePairs().forEach(function (pair) {
    var alreadyPlaced = (fissures || []).some(function (fissure) {
      return fissure.side === side &&
        ((sameTile(fissure.a, pair.a) && sameTile(fissure.b, pair.b)) || (sameTile(fissure.a, pair.b) && sameTile(fissure.b, pair.a)));
    });
    if (alreadyPlaced) return;
    if (topology && topology.cut[edgeKey(side, pair.a, pair.b)]) return;
    bridgeable.push({ kind: 'bridge', side: side, a: pair.a, b: pair.b, power: 1 });
  });
  return bridgeable;
}

export var TILE_SIZE = 200, TILE_HEIGHT = Math.sqrt(3) / 2 * TILE_SIZE, GUTTER = 0.92;
export function centroidOf(points) {
  if (points.length === 4) return [(points[0][0] + points[2][0]) / 2, (points[0][1] + points[2][1]) / 2];
  var sumX = 0, sumY = 0;
  points.forEach(function (point) { sumX += point[0]; sumY += point[1]; });
  return [sumX / points.length, sumY / points.length];
}
export function shrink(points, center, factor) {
  return points.map(function (point) { return [center[0] + (point[0] - center[0]) * factor, center[1] + (point[1] - center[1]) * factor]; });
}
/* The eighteen tile polygons, unshrunk and undrawn: one Row 1 triangle per
   lane head, a Row 2 rhombus behind each pair of Row 1 tiles, and a Row 3
   triangle behind each pair of Row 2 tiles — the same forward-narrowing
   shape the adjacency and lane tables describe, laid out in actual
   coordinates. */
export function basePolys() {
  var tiles = [];
  for (var row1Index = 0; row1Index < 4; row1Index++) {
    tiles.push({ row: 'row1', index: row1Index,
      points: [[row1Index * TILE_SIZE, 0], [(row1Index + 1) * TILE_SIZE, 0], [row1Index * TILE_SIZE + TILE_SIZE / 2, TILE_HEIGHT]] });
  }
  for (var row2Index = 0; row2Index < 3; row2Index++) {
    tiles.push({ row: 'row2', index: row2Index,
      points: [[(row2Index + 1) * TILE_SIZE, 0], [(row2Index + 1) * TILE_SIZE + TILE_SIZE / 2, TILE_HEIGHT],
        [(row2Index + 1) * TILE_SIZE, 2 * TILE_HEIGHT], [row2Index * TILE_SIZE + TILE_SIZE / 2, TILE_HEIGHT]] });
  }
  for (var row3Index = 0; row3Index < 2; row3Index++) {
    tiles.push({ row: 'row3', index: row3Index,
      points: [[(row3Index + 1) * TILE_SIZE + TILE_SIZE / 2, TILE_HEIGHT], [(row3Index + 2) * TILE_SIZE, 2 * TILE_HEIGHT], [(row3Index + 1) * TILE_SIZE, 2 * TILE_HEIGHT]] });
  }
  return tiles;
}
/* Every tile, on both sides of the board, shrunk in from its neighbours by
   GUTTER so the drawn pucks don't touch, with its centroid cached for
   quick placement of text and effects. The top side is the bottom side's
   polygons mirrored across the y axis. */
export var GEO = (function () {
  var baseTiles = basePolys(), geoTiles = [];
  baseTiles.forEach(function (tile) {
    var bottomCentroid = centroidOf(tile.points);
    geoTiles.push({ side: 'bottom', row: tile.row, index: tile.index, points: shrink(tile.points, bottomCentroid, GUTTER), cx: bottomCentroid[0], cy: bottomCentroid[1] });
    var mirroredPoints = tile.points.map(function (point) { return [point[0], -point[1]]; }), topCentroid = centroidOf(mirroredPoints);
    geoTiles.push({ side: 'top', row: tile.row, index: tile.index, points: shrink(mirroredPoints, topCentroid, GUTTER), cx: topCentroid[0], cy: topCentroid[1] });
  });
  return geoTiles;
})();

/* The literal seam two adjacent tiles share, taken from the unshrunk
   polygons so a crack sits on the join itself rather than on the line
   between the two centroids. Two triangles or a triangle and a rhombus
   always share exactly two vertices; those are the ends of the seam. */
export var EDGE_GEO = (function () {
  var baseTiles = basePolys(), pointsByTile = {}, seamsByEdge = {};
  baseTiles.forEach(function (tile) { pointsByTile[tile.row + '-' + tile.index] = tile.points; });
  function seam(keyA, keyB) {
    var polygonA = pointsByTile[keyA], polygonB = pointsByTile[keyB], sharedPoints = [];
    polygonA.forEach(function (pointA) {
      polygonB.forEach(function (pointB) {
        if (Math.abs(pointA[0] - pointB[0]) < 0.001 && Math.abs(pointA[1] - pointB[1]) < 0.001) sharedPoints.push(pointA);
      });
    });
    return sharedPoints.length === 2 ? sharedPoints : null;
  }
  ROWS.forEach(function (row) {
    for (var index = 0; index < ROW_INFO[row].count; index++) {
      var keyA = row + '-' + index;
      (ADJACENT[keyA] || []).forEach(function (neighbor) {
        var keyB = neighbor.row + '-' + neighbor.index;
        var sharedPoints = seam(keyA, keyB);
        if (!sharedPoints) return;
        var edgeKeyStr = keyA < keyB ? keyA + '|' + keyB : keyB + '|' + keyA;
        seamsByEdge['bottom|' + edgeKeyStr] = [[sharedPoints[0][0], sharedPoints[0][1]], [sharedPoints[1][0], sharedPoints[1][1]]];
        seamsByEdge['top|' + edgeKeyStr] = [[sharedPoints[0][0], -sharedPoints[0][1]], [sharedPoints[1][0], -sharedPoints[1][1]]];
      });
    }
  });
  return seamsByEdge;
})();
/* The single corner a bridged pair meets at, in board coordinates. */
export function sharedCorner(side, tileA, tileB) {
  var pointsByTile = {};
  basePolys().forEach(function (tile) { pointsByTile[tile.row + '-' + tile.index] = tile.points; });
  var polygonA = pointsByTile[tileA.row + '-' + tileA.index], polygonB = pointsByTile[tileB.row + '-' + tileB.index], corner = null;
  if (!polygonA || !polygonB) return null;
  polygonA.forEach(function (pointA) {
    polygonB.forEach(function (pointB) {
      if (Math.abs(pointA[0] - pointB[0]) < 0.001 && Math.abs(pointA[1] - pointB[1]) < 0.001) corner = pointA;
    });
  });
  return corner ? [corner[0], side === 'top' ? -corner[1] : corner[1]] : null;
}
export function seamOf(side, tileA, tileB) {
  var keyA = tileA.row + '-' + tileA.index, keyB = tileB.row + '-' + tileB.index;
  return EDGE_GEO[side + '|' + (keyA < keyB ? keyA + '|' + keyB : keyB + '|' + keyA)] || null;
}
export var VIEWBOX = (function () {
  var padding = 28, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  GEO.forEach(function (tile) {
    tile.points.forEach(function (point) {
      minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
    });
  });
  return { x: minX - padding, y: minY - padding, w: (maxX - minX) + padding * 2, h: (maxY - minY) + padding * 2 };
})();
