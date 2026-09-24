/* Map generation: paths walked down a fixed three-column grid, then the
   guarantees each act makes (a Lab, a skippable elite, one Volatile branch). */

import { ACTS, eliteFor } from '../content/acts.js';
import { store } from '../store.js';

/* Map generation walks paths down a fixed three-column grid, one column step
   at a time, refusing moves that would cross an edge already laid in that row.
   The previous version mapped row indices onto "centre" columns across rows of
   differing widths, which produced long crossing links — a rightmost node whose
   only exit ran to the far left. Paths keep the flow readable and local. */
export var MAP_COLS = 3, MAP_PATHS = 6;

export function buildMap(actKey, isFirstAct) {
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
        nextCol = candidates[Math.floor(store.rnd() * candidates.length)];
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
      var type = PLAN[rowIndex][Math.floor(store.rnd() * PLAN[rowIndex].length)];
      var node = { depth: rowIndex, col: colIndex, type: type, next: [], done: false };
      if (type === 'battle') node.enemy = act.normals[Math.floor(store.rnd() * act.normals.length)];
      if (type === 'elite') node.enemy = eliteFor(act, store.rnd);
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
  ensureEliteIsSkippable(rows, act, store.rnd);
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
export function carveVolatileBranch(rows, act) {
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
  var gate = gates[Math.floor(store.rnd() * gates.length)];

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
          return node.col === pickNonCrossing(otherGate.parent.col, otherCols, committedHere, store.rnd).toCol;
        }));
      }
      if (!otherGate.parent.next.length) otherGate.parent.next.push(pick.index);      // row has nothing else
    }
  });
  gate.parent.next = mustKeep.concat([pick.index]);
  gate.parent.type = 'elite';
  gate.parent.enemy = eliteFor(act, store.rnd);
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
    if (store.rnd() < 0.5 && after.type !== 'elite') {
      after.type = 'elite';
      after.enemy = eliteFor(act, store.rnd);
    }
    // keep the safe road clean: strip this successor from non-volatile parents
    rows[branchDepth].forEach(function (other, otherIndex) {
      if (otherIndex === pick.index) return;
      if (other.next.length > 1) other.next = other.next.filter(function (existingNext) { return existingNext !== nextIndex; });
    });
  });
}
