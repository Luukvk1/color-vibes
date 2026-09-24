/* The board itself: tiles, fissures, hazard marks and the short-lived effects
   that play over them. */

import { rules as C } from '../../game/index.js';
import { canMix, currentTargetOptions, getBattleState, inspectHazard, pendingSpec, tileKey } from '../../game/index.js';
import { SVG_NS, els, tileEls } from '../dom.js';
import { resetEnemyHand } from './hand.js';
import { hazardInfo, openInfo, tapTile } from './info.js';

var CARDS = C.CARDS;
var GEO = C.GEO;
var PLAYER = C.PLAYER;
var ROWS = C.ROWS;
var ROW_INFO = C.ROW_INFO;
var VIEWBOX = C.VIEWBOX;
var canPlace = C.canPlace;
var cardStrength = C.cardStrength;
var colorInfo = C.colorInfo;
var rowHasHazard = C.rowHasHazard;
var sideName = C.sideName;
var slotName = C.slotName;
var unitAt = C.unitAt;

var linesGroup = null, fxLayer = null, hazLayer = null;

export var fissureLayer = null, fissureSig = null, newFissures = {};

/* ===================================================================
   BOARD
   =================================================================== */
var PUCK_H = 13;              // puck thickness, in board units

/* Darken (or lighten) a hex colour. Used for the puck's side wall, which is
   the top face's colour in shadow so the whole piece reads as one block of
   stained wood rather than two stacked discs. */
export function shadeHex(hex, amt) {
  var packed = parseInt(hex.slice(1), 16);
  var red = (packed >> 16) & 255, green = (packed >> 8) & 255, blue = packed & 255;
  function mix(channel) {
    var shaded = amt < 0 ? channel * (1 + amt) : channel + (255 - channel) * amt;
    return Math.max(0, Math.min(255, Math.round(shaded)));
  }
  return '#' + ((1 << 24) + (mix(red) << 16) + (mix(green) << 8) + mix(blue)).toString(16).slice(1);
}

export function buildBoard() {
  var svg = els.board;
  // extra room on the left for the hazard marks
  /* The gutter only has to clear the hazard marks at VIEWBOX.x-40. It was 82,
     which threw away ~5% of the board's width on every screen. */
  svg.setAttribute('viewBox', (VIEWBOX.x - 58) + ' ' + VIEWBOX.y + ' ' + (VIEWBOX.w + 58) + ' ' + VIEWBOX.h);
  svg.innerHTML = '';
  /* Grain and sheen live in defs so every puck shares one definition rather
     than carrying its own copy \u2014 eighteen tiles x several gradients adds up. */
  svg.insertAdjacentHTML('afterbegin',
    '<defs>' +
      '<pattern id="woodGrain" width="18" height="96" patternUnits="userSpaceOnUse" patternTransform="rotate(-11)">' +
        '<rect width="16" height="88" fill="none"/>' +
        '<path d="M2,0 q3,22 0,44 t0,44" stroke="#4a2f16" stroke-opacity=".55" stroke-width="2.6" fill="none"/>' +
        '<path d="M7,0 q-2.5,20 0,40 t0,48" stroke="#3a2410" stroke-opacity=".40" stroke-width="1.7" fill="none"/>' +
        '<path d="M11,0 q2,26 0,52 t0,36" stroke="#5c3c1d" stroke-opacity=".45" stroke-width="1.3" fill="none"/>' +
        '<path d="M15,0 q-1.5,24 0,48 t0,40" stroke="#2e1c0b" stroke-opacity=".30" stroke-width="1.1" fill="none"/>' +
      '</pattern>' +
      '<linearGradient id="puckSheen" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#fff" stop-opacity=".40"/>' +
        '<stop offset="100%" stop-color="#fff" stop-opacity="0"/>' +
      '</linearGradient>' +
    '</defs>');
  linesGroup = document.createElementNS(SVG_NS, 'g');
  linesGroup.setAttribute('class', 'conn-layer');

  GEO.forEach(function (geoEntry) {
    var tileGroup = document.createElementNS(SVG_NS, 'g');
    tileGroup.setAttribute('class', 'tile ' + geoEntry.row + ' side-' + geoEntry.side);
    tileGroup.setAttribute('tabindex', '0'); tileGroup.setAttribute('role', 'button');
    function add(tag, cls, attrs) {
      var el = document.createElementNS(SVG_NS, tag);
      el.setAttribute('class', cls);
      Object.keys(attrs).forEach(function (attrKey) { el.setAttribute(attrKey, attrs[attrKey]); });
      tileGroup.appendChild(el); return el;
    }
    var shape = add('polygon', 'tile-shape', { points: geoEntry.points.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') });
    var minText = add('text', 'tile-min', { x: geoEntry.cx, y: geoEntry.cy, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    minText.textContent = ROW_INFO[geoEntry.row].min;
    /* The ownership ring belongs at the puck's base, not at its top face.
       Left at the top-face centre it stuck out 8px above the puck as a thin
       crescent — the piece looked like it had a halo, or a badly aligned
       outline. At the base it reads as the collar the puck is standing on,
       and the top face covers its upper half. */
    var owner = add('circle', 'tile-owner', { cx: geoEntry.cx, cy: geoEntry.cy + PUCK_H, r: 50 });
    /* A unit is a wooden puck standing on the board, not a flat disc drawn on
       it. The whole board is rotateX'd away from the viewer, so "up off the
       surface" reads on screen as *down*: the side wall is the same circle
       pushed +PUCK_H in y, drawn behind the top face, and the crescent of it
       that shows below the face is the puck's thickness. The top face keeps
       the unit's colour, because colour identity is the game \u2014 the wood is a
       grain overlay on top of it, not a replacement for it. */
    var contact = add('ellipse', 'tile-contact', { cx: geoEntry.cx, cy: geoEntry.cy + PUCK_H + 4, rx: 45, ry: 45 });
    var side = add('circle', 'tile-puck-side', { cx: geoEntry.cx, cy: geoEntry.cy + PUCK_H, r: 44 });
    var sideGrain = add('circle', 'tile-side-grain', { cx: geoEntry.cx, cy: geoEntry.cy + PUCK_H, r: 44, fill: 'url(#woodGrain)' });
    var token = add('circle', 'tile-token', { cx: geoEntry.cx, cy: geoEntry.cy, r: 44 });
    var grain = add('circle', 'tile-grain', { cx: geoEntry.cx, cy: geoEntry.cy, r: 44, fill: 'url(#woodGrain)' });
    var sheen = add('ellipse', 'tile-sheen', { cx: geoEntry.cx, cy: geoEntry.cy - 15, rx: 30, ry: 17 });
    var tokenText = add('text', 'tile-token-text', { x: geoEntry.cx, y: geoEntry.cy, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    var fx = add('text', 'tile-fx', { x: geoEntry.cx, y: geoEntry.cy + (geoEntry.side === 'bottom' ? 70 : -70), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    var ring = add('circle', 'tile-ring', { cx: geoEntry.cx, cy: geoEntry.cy, r: 60 });
    tileGroup.addEventListener('click', function () { tapTile(geoEntry.side, geoEntry.row, geoEntry.index); });
    tileGroup.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tapTile(geoEntry.side, geoEntry.row, geoEntry.index); }
    });
    svg.appendChild(tileGroup);
    tileEls[tileKey(geoEntry.side, geoEntry.row, geoEntry.index)] = { g: tileGroup, shape: shape, minText: minText, owner: owner,
      token: token, side: side, sideGrain: sideGrain, grain: grain, sheen: sheen, contact: contact,
      tokenText: tokenText, fx: fx, ring: ring, geo: geoEntry };
  });
  svg.appendChild(linesGroup);
  fissureLayer = document.createElementNS(SVG_NS, 'g');
  fissureLayer.setAttribute('class', 'fissure-layer');
  svg.appendChild(fissureLayer);
  fissureSig = null;
  resetEnemyHand();
  hazLayer = document.createElementNS(SVG_NS, 'g');
  hazLayer.setAttribute('class', 'haz-layer');
  svg.appendChild(hazLayer);
  fxLayer = document.createElementNS(SVG_NS, 'g');
  fxLayer.setAttribute('class', 'fx-layer');
  svg.appendChild(fxLayer);
}

/* ===================================================================
   ACTION EFFECTS
   Opponent moves used to happen silently between renders. Each action now
   leaves a visible trace on the board plus a short banner naming it, so the
   player can follow what the enemy actually did.
   =================================================================== */
function tileGeo(side, row, index) {
  var el = tileEls[tileKey(side, row, index)];
  return el ? el.geo : null;
}

function fxAdd(node, life) {
  if (!fxLayer) return;
  fxLayer.appendChild(node);
  setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, life);
}

function fxBurst(side, row, index, hex) {
  var geo = tileGeo(side, row, index);
  if (!geo) return;
  var circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('class', 'fx-burst');
  circle.setAttribute('cx', geo.cx); circle.setAttribute('cy', geo.cy); circle.setAttribute('r', 46);
  circle.setAttribute('stroke', hex || '#ffffff');
  fxAdd(circle, 900);
}

/* A ghost of the consumed unit slides into the tile that absorbed it. */
function fxFly(side, from, to, hex, ink, label) {
  var fromGeo = tileGeo(side, from.row, from.index), toGeo = tileGeo(side, to.row, to.index);
  if (!fromGeo || !toGeo) return;
  var group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'fx-fly');
  group.setAttribute('transform', 'translate(0,0)');
  var circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', fromGeo.cx); circle.setAttribute('cy', fromGeo.cy); circle.setAttribute('r', 44);
  circle.setAttribute('fill', hex); circle.setAttribute('stroke', '#0d0b09'); circle.setAttribute('stroke-width', 3);
  group.appendChild(circle);
  var text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', fromGeo.cx); text.setAttribute('y', fromGeo.cy);
  text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('fill', ink); text.setAttribute('class', 'fx-fly-text');
  text.textContent = label;
  group.appendChild(text);
  fxAdd(group, 900);
  requestAnimationFrame(function () {
    group.setAttribute('transform', 'translate(' + (toGeo.cx - fromGeo.cx) + ',' + (toGeo.cy - fromGeo.cy) + ')');
    group.classList.add('going');
  });
  setTimeout(function () { fxBurst(side, to.row, to.index, hex); }, 430);
}

/* A hazard washes across its row on both halves — it hits both. */
function fxHazard(row, kind) {
  ['bottom', 'top'].forEach(function (side) {
    for (var index = 0; index < ROW_INFO[row].count; index++) {
      var geo = tileGeo(side, row, index);
      if (!geo) continue;
      var poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('class', 'fx-haz ' + kind);
      poly.setAttribute('points', geo.points.map(function (point) { return point[0].toFixed(1) + ',' + point[1].toFixed(1); }).join(' '));
      poly.style.animationDelay = (index * 70) + 'ms';
      fxAdd(poly, 1400);
    }
  });
}

export function playFx(fx) {
  if (fx.kind === 'burst') fxBurst(fx.side, fx.row, fx.index, colorInfo(fx.color).hex);
  else if (fx.kind === 'hazard') fxHazard(fx.row, fx.hazardKind);
  else if (fx.kind === 'fly') { var donor = colorInfo(fx.color); fxFly(fx.side, fx.from, fx.to, donor.hex, donor.ink, fx.label); }
}

export function renderTiles(ev) {
  var state = getBattleState();
  var locked = state.resolving || state.battleOver || state.opponentThinking;
  var canAct = !locked && state.turn === PLAYER;
  var card = state.selectedCard !== null ? state.hands[PLAYER][state.selectedCard] : null;
  var selectedCardDef = card ? CARDS[card.id] : null;
  var opts = currentTargetOptions(), spec = pendingSpec();

  var fronts = {};
  ev.lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (side) {
      if (!lane[side]) return;
      var key = tileKey(side, lane[side].champion.row, lane[side].champion.index);
      fronts[key] = fronts[key] || { mult: 1 };
      fronts[key].mult = Math.max(fronts[key].mult, lane[side].multiplier);
    });
  });

  GEO.forEach(function (tile) {
    var el = tileEls[tileKey(tile.side, tile.row, tile.index)];
    var unit = unitAt(state.board, tile.side, tile.row, tile.index);
    var view = ev.get(tile.side, tile.row, tile.index);
    var placeable = false, mixable = false, targetable = false;

    if (state.pending && spec) {
      if (spec.kind === 'hazard') targetable = opts.some(function (option) { return option.side === tile.side && option.row === tile.row; });
      else targetable = tile.side === state.pending.side && opts.some(function (option) { return option.row === tile.row && option.index === tile.index; });
    } else if (canAct && tile.side === PLAYER) {
      if (state.mode === 'place' && selectedCardDef) {
        if (selectedCardDef.type === 'unit') placeable = !unit && canPlace(state.board, tile.side, tile.row, tile.index, cardStrength(card), C.placeOpts(card.id, state.relics, state.board, tile.side)).ok;
        else if (selectedCardDef.type === 'hazard') placeable = !state.hazards[PLAYER][tile.row];
      } else if (state.mode === 'mix' && unit) {
        if (!state.mixBase) mixable = C.adjacentTilesFor(PLAYER, tile.row, tile.index, C.boardTopo(state.fissures))
          .some(function (neighbor) { return !!unitAt(state.board, PLAYER, neighbor.row, neighbor.index); });
        else mixable = canMix(state.board, PLAYER, state.mixBase, { row: tile.row, index: tile.index }).ok;
      }
    }

    el.g.classList.toggle('placeable', placeable);
    el.g.classList.toggle('mixable', mixable);
    el.g.classList.toggle('targetable', targetable);
    el.g.classList.toggle('occupied', !!unit);
    el.g.classList.toggle('hazard-colorless', rowHasHazard(state.hazards, tile.row, 'colorless'));
    el.g.classList.toggle('hazard-scorch', rowHasHazard(state.hazards, tile.row, 'scorch'));
    var frontInfo = fronts[tileKey(tile.side, tile.row, tile.index)];
    el.g.classList.toggle('frontline', !!frontInfo);
    el.g.classList.toggle('mix-base', !!(state.mixBase && tile.side === PLAYER && state.mixBase.row === tile.row && state.mixBase.index === tile.index));

    if (unit && view) {
      var colorDef = colorInfo(view.color);
      el.token.setAttribute('fill', colorDef.hex);
      // the side wall is the same colour in shadow, so the puck reads as one solid piece
      el.side.setAttribute('fill', shadeHex(colorDef.hex, -0.45));
      el.tokenText.setAttribute('fill', colorDef.ink);
      el.tokenText.textContent = ev.strengthOf(view);
      el.g.classList.toggle('colorless', !!view.colorless);
      el.fx.textContent = (frontInfo && frontInfo.mult > 1) ? '\u00d7' + frontInfo.mult : '';
      var unitCardDef = CARDS[unit.cardId];
      el.g.setAttribute('aria-label', sideName(tile.side) + ' ' + slotName(tile.row, tile.index) + ', ' +
        (unitCardDef ? unitCardDef.name : 'mixed unit') + ', ' + colorDef.name + ' strength ' + ev.strengthOf(view));
    } else {
      el.fx.textContent = '';
      el.g.setAttribute('aria-label', sideName(tile.side) + ' ' + slotName(tile.row, tile.index) + ', empty, minimum ' + ROW_INFO[tile.row].min);
    }
    var inspected = state.inspected;
    el.g.classList.toggle('inspected', !!(inspected && inspected.side === tile.side && inspected.row === tile.row && inspected.index === tile.index));
    el.g.classList.toggle('just-placed', !!(state.lastPlaced && state.lastPlaced.side === tile.side && state.lastPlaced.row === tile.row && state.lastPlaced.index === tile.index));
  });

  linesGroup.innerHTML = '';
  ev.lanes.forEach(function (lane) {
    if (!lane.bottom || !lane.top) return;
    var bottomEl = tileEls[tileKey('bottom', lane.bottom.champion.row, lane.bottom.champion.index)];
    var topEl = tileEls[tileKey('top', lane.top.champion.row, lane.top.champion.index)];
    var line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', bottomEl.geo.cx); line.setAttribute('y1', bottomEl.geo.cy);
    line.setAttribute('x2', topEl.geo.cx); line.setAttribute('y2', topEl.geo.cy);
    var cls = 'lane-line';
    if (lane.bottom.effective && lane.top.effective) cls += ' both';
    else if (lane.bottom.effective) cls += ' you-win';
    else if (lane.top.effective) cls += ' opp-win';
    line.setAttribute('class', cls);
    linesGroup.appendChild(line);
  });
}

/* ===================================================================
   FISSURES ON THE BOARD
   A sever is drawn on the literal seam its two tiles share, jittered along
   its own length so it reads as a split in the surface rather than a ruled
   line. A bridge is drawn as a short span between two tiles that only meet
   at a corner. Both are stacked strokes — wide soft glow, mid halo, thin
   white core — and both burn brighter as their power grows.
   =================================================================== */
function crackPoints(seam) {
  var ax = seam[0][0], ay = seam[0][1], bx = seam[1][0], by = seam[1][1];
  var dx = bx - ax, dy = by - ay;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / len, uy = dy / len;      // along the seam
  var px = -uy, py = ux;                 // across it
  /* The crack ends where the edge ends. It used to overshoot each corner by
     6%, which read as a scratch laid over the board rather than the board
     itself coming apart. */
  var pts = [], N = 7;
  for (var i = 0; i <= N; i++) {
    var t = i / N;
    var wob = (i === 0 || i === N) ? 0 : (i % 2 ? 1 : -1) * (len * 0.035);
    pts.push([ax + ux * len * t + px * wob, ay + uy * len * t + py * wob]);
  }
  return 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L');
}

/* A bridge runs corner to corner between its two tiles: out from one
   centroid, through the corner they share, and into the other. Bowing it
   through the shared corner keeps it clear of the tokens at either end. */
function bridgePoints(fissure) {
  var tileA = tileGeo(fissure.side, fissure.a.row, fissure.a.index), tileB = tileGeo(fissure.side, fissure.b.row, fissure.b.index);
  if (!tileA || !tileB) return null;
  var corner = C.sharedCorner(fissure.side, fissure.a, fissure.b);
  var mx = corner ? corner[0] : (tileA.cx + tileB.cx) / 2;
  var my = corner ? corner[1] : (tileA.cy + tileB.cy) / 2;
  function toward(point, tx, ty, dist) {
    var dx = tx - point.cx, dy = ty - point.cy, l = Math.sqrt(dx * dx + dy * dy) || 1;
    return [point.cx + dx / l * dist, point.cy + dy / l * dist];
  }
  var startPoint = toward(tileA, mx, my, 46), endPoint = toward(tileB, mx, my, 46);
  return 'M' + startPoint[0].toFixed(1) + ',' + startPoint[1].toFixed(1) +
         ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) +
         ' ' + endPoint[0].toFixed(1) + ',' + endPoint[1].toFixed(1);
}

export function renderFissures() {
  var state = getBattleState();
  if (!fissureLayer) return;
  var list = (state && state.fissures) || [];
  var sig = list.map(function (fissure) {
    return C.edgeKey(fissure.side, fissure.a, fissure.b) + ':' + fissure.kind + ':' + C.fissurePower(fissure);
  }).join('|');
  if (sig === fissureSig) return;
  fissureSig = sig;
  fissureLayer.innerHTML = '';
  list.forEach(function (fissure) {
    var pathData = fissure.kind === 'bridge' ? bridgePoints(fissure) : (function () {
      var seam = C.seamOf(fissure.side, fissure.a, fissure.b);
      return seam ? crackPoints(seam) : null;
    })();
    if (!pathData) return;
    var key = C.edgeKey(fissure.side, fissure.a, fissure.b);
    var power = Math.min(C.FISSURE_MAX_POWER, C.fissurePower(fissure));
    var group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'fissure fissure-' + fissure.kind + ' fissure-p' + power +
      (newFissures[key] ? ' fissure-new' : ''));
    ['fissure-glow', 'fissure-halo', 'fissure-core'].forEach(function (cls) {
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', cls);
      path.setAttribute('d', pathData);
      group.appendChild(path);
    });
    fissureLayer.appendChild(group);
    delete newFissures[key];
  });
}

/* Hazards no longer get a panel. Each affected row wears a mark beside it on
   both halves — because that is what a hazard does, it hits both — and tapping
   one puts the explanation in the inspector. */
var HAZ_GLYPH = {
  colorless: '<path class="hm-icon" d="M-8,8 L8,-8 M-8,-8 A11,11 0 0,1 8,8"/>',
  scorch: '<path class="hm-icon" d="M-7,-7 L0,1 L7,-7 M-7,2 L0,10 L7,2"/>'
};

function rowCentre(side, row) {
  var ys = [], count = ROW_INFO[row].count;
  for (var i = 0; i < count; i++) { var geo = tileGeo(side, row, i); if (geo) ys.push(geo.cy); }
  if (!ys.length) return 0;
  return ys.reduce(function (sum, cy) { return sum + cy; }, 0) / ys.length;
}

export function renderHazardMarks() {
  var state = getBattleState();
  hazLayer.innerHTML = '';
  var markX = VIEWBOX.x - 40;
  ROWS.forEach(function (row) {
    var kinds = C.hazardsOnRow(state.hazards, row);
    if (!kinds.length) return;
    ['bottom', 'top'].forEach(function (side) {
      var cy = rowCentre(side, row);
      kinds.forEach(function (kind, stackIndex) {
        var owner = state.hazards.bottom[row] === kind ? 'bottom' : 'top';
        var group = document.createElementNS(SVG_NS, 'g');
        var sel = state.inspectedHazard && state.inspectedHazard.row === row && state.inspectedHazard.kind === kind;
        group.setAttribute('class', 'haz-mark ' + kind + (sel ? ' selected' : ''));
        group.setAttribute('transform', 'translate(' + markX + ',' + (cy + stackIndex * 62) + ')');
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'button');
        group.setAttribute('aria-label', C.HAZARD_TEXT[kind]);
        group.innerHTML = '<circle class="hm-disc" r="26"/>' + HAZ_GLYPH[kind];
        function open() {
          inspectHazard(row, kind, owner);
          openInfo(kind === 'colorless' ? 'Colourless Row' : 'Scorched Row', hazardInfo(getBattleState().inspectedHazard));
        }
        group.addEventListener('click', open);
        group.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
        });
        hazLayer.appendChild(group);
      });
    });
  });
}
