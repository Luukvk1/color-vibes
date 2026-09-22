/* The battle layer: the table itself.
   Draws the board and the hand, turns taps into moves, runs the opponent AI
   and resolves rounds. Reads the rules from core/ and the run's state from
   run/, and owns only what is on screen.

   One file for the same reason run/ is: shared mutable render state that every
   section reassigns. The self-test suite, being self-contained, has been
   lifted out to ./self-test.js. Navigate by the section banners. */

import '../run/index.js';

var C = window.CV_CORE, RUN = window.CV_RUN;
var SVG_NS = C.SVG_NS, COLORS = C.COLORS, COLOR_KEYS = C.COLOR_KEYS, CARDS = C.CARDS,
    RELICS = C.RELICS, ENEMIES = C.ENEMIES, ROW_INFO = C.ROW_INFO, ROWS = C.ROWS,
    PLAYER = C.PLAYER, ENEMY = C.ENEMY, GEO = C.GEO, VIEWBOX = C.VIEWBOX;
var otherSide = C.otherSide, unitAt = C.unitAt, sideName = C.sideName, slotName = C.slotName,
    eachUnit = C.eachUnit, canPlace = C.canPlace, legalTiles = C.legalTiles,
    adjacentTiles = C.adjacentTiles, lanesOf = C.lanesOf, colorInfo = C.colorInfo,
    hasRelic = C.hasRelic, cardStrength = C.cardStrength, cardName = C.cardName,
    evaluateBoard = C.evaluateBoard, decideRound = C.decideRound,
    freeHazardRows = C.freeHazardRows, rowHasHazard = C.rowHasHazard;

var els = RUN.els, tileEls = RUN.tileEls;
var linesGroup = null, fxLayer = null, hazLayer = null;
var fissureLayer = null, fissureSig = null, newFissures = {};
var lastEnemyHandCount = -1;

function getBattleState() { return RUN.getState(); }
function getActiveRun() { return RUN.getRun(); }
function tileKey(side, row, index) { return side + '-' + row + '-' + index; }
function addLog(msg) { RUN.addLog(msg); }

/* ===================================================================
   BOARD
   =================================================================== */
var PUCK_H = 13;              // puck thickness, in board units

/* Darken (or lighten) a hex colour. Used for the puck's side wall, which is
   the top face's colour in shadow so the whole piece reads as one block of
   stained wood rather than two stacked discs. */
function shadeHex(hex, amt) {
  var n = parseInt(hex.slice(1), 16);
  var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  function mix(c) {
    var v = amt < 0 ? c * (1 + amt) : c + (255 - c) * amt;
    return Math.max(0, Math.min(255, Math.round(v)));
  }
  return '#' + ((1 << 24) + (mix(r) << 16) + (mix(g) << 8) + mix(b)).toString(16).slice(1);
}

function buildBoard() {
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

  GEO.forEach(function (t) {
    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'tile ' + t.row + ' side-' + t.side);
    g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
    function add(tag, cls, attrs) {
      var e = document.createElementNS(SVG_NS, tag);
      e.setAttribute('class', cls);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      g.appendChild(e); return e;
    }
    var shape = add('polygon', 'tile-shape', { points: t.points.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') });
    var minText = add('text', 'tile-min', { x: t.cx, y: t.cy, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    minText.textContent = ROW_INFO[t.row].min;
    /* The ownership ring belongs at the puck's base, not at its top face.
       Left at the top-face centre it stuck out 8px above the puck as a thin
       crescent — the piece looked like it had a halo, or a badly aligned
       outline. At the base it reads as the collar the puck is standing on,
       and the top face covers its upper half. */
    var owner = add('circle', 'tile-owner', { cx: t.cx, cy: t.cy + PUCK_H, r: 50 });
    /* A unit is a wooden puck standing on the board, not a flat disc drawn on
       it. The whole board is rotateX'd away from the viewer, so "up off the
       surface" reads on screen as *down*: the side wall is the same circle
       pushed +PUCK_H in y, drawn behind the top face, and the crescent of it
       that shows below the face is the puck's thickness. The top face keeps
       the unit's colour, because colour identity is the game \u2014 the wood is a
       grain overlay on top of it, not a replacement for it. */
    var contact = add('ellipse', 'tile-contact', { cx: t.cx, cy: t.cy + PUCK_H + 4, rx: 45, ry: 45 });
    var side = add('circle', 'tile-puck-side', { cx: t.cx, cy: t.cy + PUCK_H, r: 44 });
    var sideGrain = add('circle', 'tile-side-grain', { cx: t.cx, cy: t.cy + PUCK_H, r: 44, fill: 'url(#woodGrain)' });
    var token = add('circle', 'tile-token', { cx: t.cx, cy: t.cy, r: 44 });
    var grain = add('circle', 'tile-grain', { cx: t.cx, cy: t.cy, r: 44, fill: 'url(#woodGrain)' });
    var sheen = add('ellipse', 'tile-sheen', { cx: t.cx, cy: t.cy - 15, rx: 30, ry: 17 });
    var tokenText = add('text', 'tile-token-text', { x: t.cx, y: t.cy, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    var fx = add('text', 'tile-fx', { x: t.cx, y: t.cy + (t.side === 'bottom' ? 70 : -70), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    var ring = add('circle', 'tile-ring', { cx: t.cx, cy: t.cy, r: 60 });
    g.addEventListener('click', function () { onTileActivate(t.side, t.row, t.index); });
    g.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTileActivate(t.side, t.row, t.index); }
    });
    svg.appendChild(g);
    tileEls[tileKey(t.side, t.row, t.index)] = { g: g, shape: shape, minText: minText, owner: owner,
      token: token, side: side, sideGrain: sideGrain, grain: grain, sheen: sheen, contact: contact,
      tokenText: tokenText, fx: fx, ring: ring, geo: t };
  });
  svg.appendChild(linesGroup);
  fissureLayer = document.createElementNS(SVG_NS, 'g');
  fissureLayer.setAttribute('class', 'fissure-layer');
  svg.appendChild(fissureLayer);
  fissureSig = null;
  lastEnemyHandCount = -1;
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
/* Curses resolve inside the draw, so the player is told what just happened. */
function flushCurses() {
  var state = getBattleState();
  if (!state || !state.curseFired || !state.curseFired.length) return;
  state.curseFired.forEach(function (curse) {
    var who = curse.side === PLAYER ? 'You drew' : state.enemy.name + ' drew';
    addLog(who + ' a curse — ' + curse.name + (curse.note ? ': ' + curse.note : '') + '.');
    if (curse.side === PLAYER) announce('Curse drawn — ' + curse.name, 'curse');
  });
  state.curseFired.length = 0;
  render();
}

function announce(text, tone) {
  if (!els.actionToast) return;
  els.actionToast.textContent = text;
  els.actionToast.className = 'action-toast show ' + (tone || '');
  els.actionToast.hidden = false;
  clearTimeout(announce._t);
  announce._t = setTimeout(function () {
    els.actionToast.className = 'action-toast';
    els.actionToast.hidden = true;
  }, 2400);
}

function pendingSpec() {
  var state = getBattleState();
  if (!state.pending) return null;
  var list = state.pending.kind === 'wild'
    ? [{ kind: 'friendlyUnit', prompt: 'Pick a unit to repaint' }, { kind: 'color', prompt: 'Pick its new colour' }]
    : CARDS[state.pending.card.id].targets;
  return list ? list[state.pending.picks.length] : null;
}
function currentTargetOptions() {
  var state = getBattleState(), spec = pendingSpec();
  if (!spec) return [];
  return RUN.legalTargets(state, state.pending.side, spec, state.pending.picks, state.pending.tile);
}

function renderTiles(ev) {
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
        else mixable = RUN.canMix(state.board, PLAYER, state.mixBase, { row: tile.row, index: tile.index }).ok;
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
   PANELS
   =================================================================== */
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

function renderFissures() {
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

/* Rebuilding the card-backs is what makes them re-deal (each .card-back
   plays a dealIn entrance animation on creation) — worth it when the hand
   actually changes, wasted motion when a render just fires because the
   player tapped one of their own cards. Skip the rebuild when the count
   hasn't moved; the deck/hand tally text still updates either way. */
function renderEnemyHand() {
  var state = getBattleState(), handCount = state.hands[ENEMY].length;
  els.enemyDeckCount.textContent = handCount + ' in hand · ' + state.decks[ENEMY].length + ' in deck';
  if (handCount === lastEnemyHandCount) return;
  lastEnemyHandCount = handCount;
  var backs = '';
  for (var i = 0; i < handCount; i++) backs += '<span class="card-back" style="--i:' + i + '"></span>';
  els.enemyHand.innerHTML = backs || '<span class="muted" style="font-size:11.5px">Empty hand</span>';
}

function renderHand() {
  var state = getBattleState(), hand = state.hands[PLAYER];
  var canAct = state.turn === PLAYER && !state.resolving && !state.battleOver && !state.opponentThinking && !state.pending;
  els.handCount.textContent = hand.length + ' card' + (hand.length === 1 ? '' : 's') + ' · ' + state.decks[PLAYER].length + ' in deck';

  var html = hand.map(function (card, index) {
    var cardDef = CARDS[card.id], colorDef = colorInfo(cardDef.color);
    var sel = state.selectedCard === index && state.mode === 'place' ? ' selected' : '';
    var dead = '';
    if (canAct) {
      if (cardDef.type === 'unit' && !legalTiles(state.board, PLAYER, cardStrength(card), C.placeOpts(card.id, state.relics, state.board, PLAYER)).length) dead = ' unplayable';
      if (cardDef.type === 'hazard' && !freeHazardRows(state.hazards, PLAYER).length) dead = ' unplayable';
      /* A spell's target picking begins the instant the card is tapped —
         there is no board placement step first, unlike a unit — so if the
         very first thing it needs to ask for has no legal answer at all
         (Catalyst wants a friendly unit to start from, and there are none),
         beginPlay found nothing to prompt for and finished the play on the
         spot with zero picks: the card was gone and nothing had happened,
         with no confirmation and no chance to back out. Marking it
         unplayable here catches it before the tap ever lands, the same way
         a unit with no legal tile already is. Scoped to spells only —
         a unit's own on-play targets can depend on the tile it is about to
         occupy, which does not exist yet at this point, so checking them
         here would wrongly flag units that are perfectly playable. */
      if (cardDef.type === 'spell' && cardDef.targets && cardDef.targets.length &&
          !RUN.legalTargets(state, PLAYER, cardDef.targets[0], [], null).length) dead = ' unplayable';
    }
    return '<button class="card ' + cardDef.type + sel + dead + '" data-card="' + index + '"' + (canAct ? '' : ' disabled') +
      ' style="--card:' + colorDef.hex + ';--card-ink:' + colorDef.ink + '">' +
      '<span class="card-top">' + (cardDef.type === 'unit' ? cardStrength(card) : cardDef.type === 'hazard' ? 'HAZ' : 'SPL') + '</span>' +
      '<span class="card-name">' + cardName(card) + '</span>' +
      C.iconRow(card.id) +
      '<span class="card-blurb">' + cardDef.text + '</span></button>';
  }).join('');

  /* Mixing is a card you play, not a button off to one side. */
  var tokens = state.mixTokens[PLAYER];
  var canMixNow = canAct && tokens > 0 && RUN.mixOptions(state.board, PLAYER).length > 0;
  html += '<button class="card mixcard' + (state.mode === 'mix' ? ' selected' : '') +
    (canMixNow ? '' : ' unplayable') + '" data-mix="1"' + (canMixNow ? '' : ' disabled') + '>' +
    '<span class="card-top">' + tokens + '</span>' +
    '<span class="card-name">' + (state.mode === 'mix' ? 'Cancel mix' : 'Mix') + '</span>' +
    C.iconRow('__mix__') +
    '<span class="card-blurb">Fuse two touching friendly units. Colours combine, strengths add plus one.</span></button>';

  els.hand.innerHTML = html;

  /* The strip now doubles as a button, so what it shows has to travel with
     what a tap on it should open — `info.cardId` is that link. `.has-more`
     is the one honest signal that the two-line strip is a summary, not the
     whole card: it goes on only once a real card is loaded, never on the
     empty "hover or tap" prompt. */
  function peek(info) {
    if (!info) {
      els.cardPeek.innerHTML = '<span class="peek-empty">Hover or tap a card to read it</span>';
      els.cardPeek.classList.remove('has-more');
      delete els.cardPeek.dataset.cardId;
      return;
    }
    els.cardPeek.innerHTML = info.html;
    els.cardPeek.classList.add('has-more');
    els.cardPeek.dataset.cardId = info.cardId;
  }
  /* Name lives on the card itself; the peek strip is just icons + the full
     rules text, so it stays short and never needs to guess how much room a
     neighbouring button will take. */
  function peekFor(btn) {
    if (btn.getAttribute('data-mix')) {
      return { cardId: '__mix__', html: C.iconRow('__mix__') +
        '<span>Fuse two touching friendly units — colours combine, strengths add plus one.</span>' };
    }
    var card = getBattleState().hands[PLAYER][+btn.getAttribute('data-card')];
    if (!card) return null;
    var cardDef = CARDS[card.id];
    return { cardId: card.id, html: C.iconRow(card.id) + '<span>' + cardDef.text + '</span>' };
  }
  // a re-render must not wipe what the player is currently reading
  var selNow = els.hand.querySelector('.card.selected');
  peek(selNow ? peekFor(selNow) : null);

  Array.prototype.forEach.call(els.hand.querySelectorAll('.card'), function (btn) {
    btn.addEventListener('mouseenter', function () { peek(peekFor(btn)); });
    btn.addEventListener('mouseleave', function () {
      var selBtn = els.hand.querySelector('.card.selected');
      /* Reverting to the selected card on mouseleave is still right; blanking
         the strip when nothing is selected is not — moving the cursor toward
         the peek strip to click it means leaving the card first, and that
         used to clear the very thing you were reaching for before the click
         could ever land. Leaving the last-peeked card in place until
         something else replaces it fixes the click and reads better besides:
         no flicker back to the empty prompt every time the mouse drifts off. */
      if (selBtn) peek(peekFor(selBtn));
    });
    btn.addEventListener('click', function () {
      var state = getBattleState();
      peek(peekFor(btn));
      if (btn.getAttribute('data-mix')) { onMixToggle(); return; }
      var clickedIndex = +btn.getAttribute('data-card');
      state.mode = 'place'; state.mixBase = null;
      state.selectedCard = state.selectedCard === clickedIndex ? null : clickedIndex;
      var card = state.hands[PLAYER][state.selectedCard];
      var cardDef = card && CARDS[card.id];
      /* A spell has no placement step — tapping it goes straight into
         targeting, unlike a unit, which only starts targeting once it has a
         tile to stand on. So when its first ask has nothing to offer at all
         (Catalyst wants a friendly unit and the board is empty), beginPlay
         used to find nothing to prompt for and finish the play immediately
         with zero picks — the card vanished, nothing happened, and there
         was never a chance to even read it first, let alone back out.
         Selecting it without resolving matches how an unplayable unit
         already behaves: visible, chosen, inert until something changes. */
      var canTarget = !cardDef || !cardDef.targets || !cardDef.targets.length ||
        RUN.legalTargets(state, PLAYER, cardDef.targets[0], [], null).length > 0;
      if (cardDef && cardDef.type === 'spell' && state.selectedCard !== null && canTarget) beginPlay(PLAYER, state.selectedCard, null);
      else render();
    });
  });
}

function renderLanes(ev) {
  els.lanes.innerHTML = ev.lanes.map(function (lane) {
    function cell(side) {
      var laneSide = lane[side];
      if (!laneSide) return '<span class="lane-empty">—</span>';
      var colorDef = colorInfo(laneSide.color), championCardDef = CARDS[laneSide.champion.unit.cardId];
      return '<span class="lane-unit" style="--c:' + colorDef.hex + '">' +
        '<span class="lane-tot"><b>' + laneSide.final + '</b>' + (laneSide.multiplier > 1 ? '<i class="x2">\u00d7' + laneSide.multiplier + '</i>' : '') + '</span>' +
        '<em>' + colorDef.name + ' · ' + ROW_INFO[laneSide.champion.row].label.replace('Row ', 'R') + '</em>' +
        '<em class="brk">front ' + laneSide.frontStrength + (laneSide.support ? ' + support ' + laneSide.support : '') + ' = ' + laneSide.strength + '</em></span>';
    }
    var mid;
    if (lane.bottom && lane.top) {
      if (lane.bottom.effective && lane.top.effective) mid = '<span class="mid both">\u25c0\u00d72\u25b6</span>';
      else if (lane.bottom.effective) mid = '<span class="mid you">\u00d7' + lane.bottom.multiplier + '\u25b6</span>';
      else if (lane.top.effective) mid = '<span class="mid opp">\u25c0\u00d72</span>';
      else mid = '<span class="mid">vs</span>';
    } else mid = '<span class="mid">vs</span>';
    return '<div class="lane-row' + (!lane.bottom && !lane.top ? ' quiet' : '') + '">' +
      '<span class="lane-id">' + (lane.index + 1) + '</span><span class="lane-side you">' + cell('bottom') + '</span>' +
      mid + '<span class="lane-side opp">' + cell('top') + '</span></div>';
  }).join('');
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
function renderHazardMarks() {
  var state = getBattleState();
  hazLayer.innerHTML = '';
  var markX = VIEWBOX.x - 40;
  ROWS.forEach(function (row) {
    var kinds = C.hazardsOnRow(state.hazards, row);
    if (!kinds.length) return;
    ['bottom', 'top'].forEach(function (side) {
      var cy = rowCentre(side, row);
      kinds.forEach(function (kind, k) {
        var owner = state.hazards.bottom[row] === kind ? 'bottom' : 'top';
        var group = document.createElementNS(SVG_NS, 'g');
        var sel = state.inspectedHazard && state.inspectedHazard.row === row && state.inspectedHazard.kind === kind;
        group.setAttribute('class', 'haz-mark ' + kind + (sel ? ' selected' : ''));
        group.setAttribute('transform', 'translate(' + markX + ',' + (cy + k * 62) + ')');
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'button');
        group.setAttribute('aria-label', C.HAZARD_TEXT[kind]);
        group.innerHTML = '<circle class="hm-disc" r="26"/>' + HAZ_GLYPH[kind];
        function open() {
          var innerState = getBattleState();
          innerState.inspectedHazard = { row: row, kind: kind, owner: owner };
          innerState.inspected = null;
          render();
          openInfo(kind === 'colorless' ? 'Colourless Row' : 'Scorched Row', hazardInfo(innerState.inspectedHazard));
        }
        group.addEventListener('click', open);
        group.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
        hazLayer.appendChild(group);
      });
    });
  });
}

/* The old status box is gone. Necessary guidance (picking a target, what a
   mix needs next) now surfaces as a sticky board toast that holds until the
   situation resolves; ordinary turn-taking is shown ambiently by lighting up
   YOU or ENEMY on the header instead of a running commentary. */
function stickyToast(text, tone) {
  if (!els.actionToast) return;
  if (!text) {
    if (els.actionToast.dataset.sticky === '1') {
      els.actionToast.hidden = true;
      els.actionToast.className = 'action-toast';
      els.actionToast.dataset.sticky = '';
    }
    return;
  }
  var key = text + '|' + (tone || '');
  if (els.actionToast.dataset.sticky === '1' && els.actionToast.dataset.key === key) return;
  clearTimeout(announce._t);
  els.actionToast.textContent = text;
  els.actionToast.className = 'action-toast show ' + (tone || '');
  els.actionToast.hidden = false;
  els.actionToast.dataset.sticky = '1';
  els.actionToast.dataset.key = key;
}

function renderStatus() {
  var s = getBattleState();
  if (s.pending) {
    var spec = pendingSpec();
    var who = s.pending.kind === 'wild' ? 'Wild Palette' : CARDS[s.pending.card.id].name;
    stickyToast(who + ': ' + (spec ? spec.prompt : 'resolving') + '.', 'target');
  } else if (s.mode === 'mix') {
    stickyToast(s.mixBase
      ? 'Pick a touching friendly unit to mix into ' + slotName(s.mixBase.row, s.mixBase.index) + '.'
      : 'Pick the unit that will absorb the other.', 'mix');
  } else {
    stickyToast(null);
  }
  if (els.battleHud) {
    els.battleHud.hidden = false;      // shown only while a battle is on screen
    var active = !s.resolving && !s.battleOver;
    els.battleHud.classList.toggle('turn-you', active && s.turn === PLAYER);
    els.battleHud.classList.toggle('turn-opp', active && s.turn === ENEMY);
  }
}

function renderControls(ev) {
  var s = getBattleState();
  var canAct = s.turn === PLAYER && !s.resolving && !s.battleOver && !s.opponentThinking;
  els.scoreYou.textContent = ev.totals.bottom;
  els.scoreOpp.textContent = ev.totals.top;
  function pips(n) {
    var out = '';
    for (var i = 0; i < 2; i++) out += '<span class="pip' + (i < n ? ' on' : '') + '"></span>';
    return out;
  }
  els.pipsYou.innerHTML = pips(s.wins.bottom);
  els.pipsOpp.innerHTML = pips(s.wins.top);

  els.chainCount.textContent = (s.chains && s.chains[PLAYER]) || 0;
  els.chainBadge.classList.toggle('live', ((s.chains && s.chains[PLAYER]) || 0) > 0);
  els.easeNote.hidden = !s.easeIn;
  els.enemyName.textContent = s.enemy.name;
  /* The rank mark and the rule icons only change when the enemy does, so they
     are rebuilt on that key rather than every render \u2014 rebuilding mid-battle
     would drop any rule the player had tapped open. */
  if (els.enemyRules.dataset.for !== s.enemyKey) {
    var rank = C.rankIcon(s.enemyKey);
    els.enemyRank.innerHTML = rank
      ? '<span class="ic rank-' + rank.i + '" title="' + rank.t + '">' + C.glyphSvg(rank.i) + '</span>'
      : '';
    var rules = C.enemyIcons(s.enemyKey);
    els.enemyRulesLayer.hidden = !rules.length;
    els.enemyRules.innerHTML = rules.map(function (e, i) {
      var style = e.colour ? ' style="color:' + C.COLORS[e.colour].hex + '"' : '';
      return '<button class="rule-ic" data-rule="' + i + '"' + style + '>' +
        C.glyphSvg(e.i) + (e.v !== undefined ? '<i class="icn">' + e.v + '</i>' : '') + '</button>';
    }).join('');
    els.enemyRules.dataset.for = s.enemyKey;
    els.enemyRuleText.hidden = true;
    Array.prototype.forEach.call(els.enemyRules.querySelectorAll('.rule-ic'), function (b2) {
      b2.addEventListener('click', function () {
        var idx = +b2.getAttribute('data-rule');
        var open = els.enemyRuleText.dataset.open === String(idx) && !els.enemyRuleText.hidden;
        Array.prototype.forEach.call(els.enemyRules.querySelectorAll('.rule-ic'),
          function (o) { o.classList.remove('on'); });
        if (open) { els.enemyRuleText.hidden = true; return; }
        b2.classList.add('on');
        els.enemyRuleText.textContent = rules[idx].t;
        els.enemyRuleText.dataset.open = String(idx);
        els.enemyRuleText.hidden = false;
      });
    });
  }
  renderOmens(s);
  if (!els.enemyColors.dataset.for || els.enemyColors.dataset.for !== s.enemyKey) {
    els.enemyColors.innerHTML = s.enemy.colors.map(function (c) { return RUN.chip(c); }).join(' ');
    els.enemyColors.dataset.for = s.enemyKey;
  }

  els.passBtn.disabled = !canAct || !!s.pending;
  els.passBtn.textContent = 'Pass';
  /* No meter, no warning, no count. The button is either offered or it is not. */
  els.rewindBtn.disabled = !canRewind();
  // the icon carries the state; a crossed-out arrow needs no label
  els.rewindBtn.classList.toggle('spent', !!s.rewindUsedThisRound);
  els.rewindBtn.title = s.rewindUsedThisRound
    ? 'Rewind already used this round.'
    : 'Take back your last move and the enemy\u2019s answer to it. Once per round.';
  els.cancelBtn.hidden = !s.pending;
  els.wildBtn.hidden = !hasRelic(s.relics, 'wild_palette');
  els.wildBtn.disabled = !canAct || !!s.pending || s.wildPaletteUsed;
  els.wildBtn.textContent = s.wildPaletteUsed ? 'Wild Palette used' : 'Wild Palette';

  var spec = pendingSpec();
  var showPicker = !!(spec && spec.kind === 'color');
  els.colorPicker.hidden = !showPicker;
  /* The action bar exists only to hold the colour picker, so it follows it.
     This used to be set several lines earlier, from the picker's *previous*
     value \u2014 so on the very render where the picker first appeared, its own
     parent was still hidden and Spectrum Shift and the Wild Palette relic
     looked like they did nothing. It only corrected itself if some later
     event forced a second render. Read after the value is computed, not
     before. */
  els.controls.hidden = !showPicker;
  if (showPicker && !els.colorPicker.dataset.built) {
    els.colorPicker.innerHTML = COLOR_KEYS.map(function (k) {
      return '<button class="pick" data-color="' + k + '" style="background:' + COLORS[k].hex + ';color:' + COLORS[k].ink + '">' + COLORS[k].name + '</button>';
    }).join('');
    Array.prototype.forEach.call(els.colorPicker.querySelectorAll('.pick'), function (b) {
      b.addEventListener('click', function () { advanceTarget({ color: b.getAttribute('data-color') }); });
    });
    els.colorPicker.dataset.built = '1';
  }

}

/* Omens, not explanations. A colour the enemy is currently attuned to, and a pip
   per Mix token they hold beyond the first. The player works out the rest. */
function renderOmens(s) {
  var out = '';
  if (s.spectrumColor) {
    out += '<span class="omen-dot" style="background:' + COLORS[s.spectrumColor].hex +
      '" aria-label="The enemy is attuned to ' + COLORS[s.spectrumColor].name + ' this round"></span>';
  }
  var extra = (s.mixTokens[ENEMY] || 0) - 1;
  for (var i = 0; i < extra; i++) out += '<span class="omen-pip" aria-label="Extra enemy Mix token"></span>';
  els.enemyOmens.innerHTML = out;
}

/* Detail now arrives as a tap-through overlay rather than a permanent panel,
   so the board can own the screen. */
function openInfo(title, html) {
  els.infoTitle.textContent = title;
  els.infoBody.innerHTML = html;
  els.infoOverlay.hidden = false;
}
function closeInfo() {
  els.infoOverlay.hidden = true;
  var s = getBattleState();
  if (s) { s.inspected = null; s.inspectedHazard = null; render(); }
}

function hazardInfo(hz) {
  return '<p class="inspect-sub">' + ROW_INFO[hz.row].label + ' · set by ' + sideName(hz.owner).toLowerCase() + '</p>' +
    '<p class="card-rules">' + (hz.kind === 'colorless'
      ? 'Units in this row have no colour. They cannot be effective, and nothing can be effective against them.'
      : 'Units in this row are 1 weaker.') + '</p>' +
    '<p class="inspect-note">A hazard sits on the row itself, so it applies to <b>both halves</b> — ' +
    'whoever set it pays the same price. Cyan Cleanser can clear it.</p>';
}

function tileInfo(ev, t) {
  var s = getBattleState();
  var unit = unitAt(s.board, t.side, t.row, t.index);
  /* Read the live topology, not the pristine one: a severed tile really does
     feed fewer lanes, and the panel is where a player checks why. */
  var topo = C.boardTopo(s.fissures);
  var lanes = C.lanesOfFor(t.side, t.row, t.index, topo);
  var neighbours = C.adjacentTilesFor(t.side, t.row, t.index, topo);
  var natural = adjacentTiles(t.row, t.index);
  var lost = natural.filter(function (n) {
    return !neighbours.some(function (m) { return C.sameTile(m, n); });
  });
  var gained = neighbours.filter(function (n) {
    return !natural.some(function (m) { return C.sameTile(m, n); });
  });
  var touching = C.fissuresTouching(t.side, t.row, t.index, s.fissures);
  var cut = lanesOf(t.row, t.index).filter(function (L) { return lanes.indexOf(L) === -1; });
  var extraLanes = lanes.filter(function (L) { return lanesOf(t.row, t.index).indexOf(L) === -1; });
  function names(list) { return list.map(function (n) { return slotName(n.row, n.index); }).join(' and '); }
  var crackNote = (lost.length || gained.length || touching)
    ? '<p class="inspect-note">' +
      (lost.length
        ? 'A fissure separates this tile from ' + names(lost) +
          '. Nothing carries across it \u2014 no auras, no mixing, no support. '
        : '') +
      (gained.length
        ? 'A fissure has bridged this tile to ' + names(gained) +
          ', and everything carries across. '
        : '') +
      (cut.length
        ? 'It no longer reaches lane ' + cut.map(function (L) { return L + 1; }).join(' or ') + '. '
        : '') +
      (extraLanes.length
        ? 'It now also feeds lane ' + extraLanes.map(function (L) { return L + 1; }).join(' and ') +
          ', thinning every share it sends. '
        : '') +
      (touching
        ? 'A unit here bleeds ' + (C.FISSURE_DRAIN * touching) + ' strength into the fissures.'
        : '') +
      '</p>'
    : ''
  if (!unit) {
    return '<p class="inspect-sub">Empty · needs strength ' + ROW_INFO[t.row].min + '</p>' +
      '<div class="link-row"><span>Feeds lanes</span><span>' +
      lanes.map(function (L) { return L + 1; }).join(', ') + '</span></div>' + crackNote;
  }
  var v = ev.get(t.side, t.row, t.index), cd = CARDS[unit.cardId];
  var html = '<p class="inspect-sub">' + RUN.chip(v.color) + '<b>' + (cd ? cd.name : 'Mixed unit') + '</b></p>';
  html += '<p class="card-rules">' + (cd ? cd.text : 'Mixed units carry no card text.') + '</p>';
  html += '<div class="link-row"><span>Strength now</span><span><b>' + ev.strengthOf(v) + '</b></span></div>';
  html += crackNote;

  if (v.colorless || !C.EFFECTIVE[v.color]) {
    html += '<p class="inspect-note">Colourless — it cannot be effective, and nothing is effective against it.</p>';
  } else {
    var beats = C.EFFECTIVE[v.color];
    var beatenBy = C.COLOR_KEYS.filter(function (k) { return C.isEffective(k, v.color); });
    html += '<div class="matchup"><span class="lbl">Strong against</span><div class="mchips">' +
      beats.map(function (k) { return RUN.chip(k); }).join('') + '</div></div>' +
      '<div class="matchup"><span class="lbl">Weak to</span><div class="mchips">' +
      beatenBy.map(function (k) { return RUN.chip(k); }).join('') + '</div></div>';
    lanes.forEach(function (L) {
      var mine = ev.lanes[L][t.side], foe = ev.lanes[L][otherSide(t.side)];
      if (!mine || !foe) return;
      if (mine.champion.row !== t.row || mine.champion.index !== t.index) return;
      html += '<p class="inspect-note">Lane ' + (L + 1) + ' versus ' + colorInfo(foe.color).name + ' — ' +
        (mine.effective ? '<b class="good">you double here</b>'
         : foe.effective ? '<b class="bad">they double here</b>' : 'neither side is effective') + '.</p>';
    });
  }
  lanes.forEach(function (L) {
    var d = ev.lanes[L][t.side];
    var isFront = d && d.champion.row === t.row && d.champion.index === t.index;
    html += '<div class="link-row"><span>Lane ' + (L + 1) + ' · ' + (isFront ? '<b>frontline</b>' : 'support') +
      '</span><span>' + ev.shares[t.side + '-' + t.row + '-' + t.index][L] + '</span></div>';
  });
  return html;
}

/* Keep an open overlay in step with the board underneath it. */
function renderInfoOverlay(ev) {
  var s = getBattleState();
  if (els.infoOverlay.hidden) return;
  if (s.inspectedHazard) {
    openInfo(s.inspectedHazard.kind === 'colorless' ? 'Colourless Row' : 'Scorched Row', hazardInfo(s.inspectedHazard));
  } else if (s.inspected) {
    openInfo(sideName(s.inspected.side) + ' · ' + slotName(s.inspected.row, s.inspected.index), tileInfo(ev, s.inspected));
  }
}

/* ===================================================================
   BACKGROUND ALIGNMENT
   The painted scene has a natural seam where the wooden path gives way to the
   glowing water, roughly at its own vertical midpoint. background-position's
   Y value ties "which point of the image" to "which point of the container"
   using the same percentage — so to put that seam at an arbitrary on-screen
   spot (the board's vertical centre) we solve for the percentage that makes
   the two agree, rather than just using 50%.
   =================================================================== */
/* ===================================================================
   BOARD SIZING
   Fighting flexbox/dvh over the board's height produced two opposite bugs in
   testing: capped at ~20% of the screen on desktop, or tall enough to push the
   hand off-screen on short phones. Measuring directly and setting an explicit
   height sidesteps both — the board gets literally whatever is left after every
   other row in the battle screen has taken its real, rendered height.
   =================================================================== */
/* Centered rather than merely maximal: the board's own vertical midpoint is
   made to land on the true viewport center, not just "whatever's left after
   screen-battle's own chrome." The runbar/header sit above screen-battle as
   a sibling, not a child of it, so summing only screen-battle's own
   children undercounts everything above the board — screen.getBoundingClientRect().top
   folds that in directly, since it's always viewport-absolute regardless of
   nesting. Sibling heights (not positions) are what get summed for both
   sides deliberately: a position below the panel shifts with the panel's
   own current height, which would make "after" chase its own tail if
   measured that way, whereas height is intrinsic to each element's own
   content and doesn't care what the panel is doing. Whichever side is
   shorter then gets padded out to match the taller one, so both carry
   equal weight and the board's center lands exactly on the viewport's
   center.
   No result caching here on purpose: an earlier version bailed out early
   when this call's measurements matched the previous call's, which is fine
   for panel's own height/margin (idempotent to re-set) but broke the enemy
   row's margin specifically — that margin gets reset to '' at the top of
   every call so a stale value from a differently-sized viewport can't
   compound into the "before" measurement, and an early return after that
   reset (without reaching the code that reapplies it) left the row's
   margin stuck at zero the moment two consecutive calls happened to agree.
   Always finishing the computation and reapplying is the fix — the cost of
   a few extra DOM reads once per render is not worth reintroducing that. */
function sizeBoardStage() {
  var screen = els.screen_battle, panel = document.querySelector('.board-panel');
  var enemyRow = document.querySelector('.enemy-hand-row');
  if (!screen || !panel || screen.hidden) return;
  if (enemyRow) enemyRow.style.marginTop = '';
  var vh = window.innerHeight;
  var screenTop = screen.getBoundingClientRect().top;
  var panelIndex = Array.prototype.indexOf.call(screen.children, panel);
  var beforeWithinScreen = 0, after = 0;
  Array.prototype.forEach.call(screen.children, function (child, i) {
    if (child === panel) return;
    var cs = getComputedStyle(child);
    if (cs.display === 'none') return;
    /* Only things in normal flow take height from the board. An absolutely
       positioned child still reports a real height from getBoundingClientRect,
       so the enemy rules overlay was being counted as chrome: opening a boss
       rule grew its rect, and the next re-measure handed the board a smaller
       target. It shrank on a later render rather than on the tap itself,
       which is why it looked intermittent. */
    if (cs.position === 'absolute' || cs.position === 'fixed') return;
    var h = child.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    if (i < panelIndex) beforeWithinScreen += h; else after += h;
  });
  var before = screenTop + beforeWithinScreen;
  var baseMargin = 4;                                        // the original breathing room, kept as a floor
  var MIN_CENTERED = 100;
  /* A plain "before vs after" symmetric split (the old centering approach)
     only produces a big gap above the enemy row when before and after
     already differ by a lot, which usually isn't true — before and after
     are both modest chrome, close in size, so centering alone left only a
     few px there, nowhere near enough for the art to read as anything.
     EYE_GAP is a hard floor on top of whatever centering would give, so
     the eyes get room to actually show regardless of how balanced the
     chrome happens to be. If honoring it would push the board below a
     usable size, it backs off toward 0 rather than shrink the board
     further — a smaller gap beats an unusable board. */
  var EYE_GAP = 90;
  var symmetric = Math.max(before, after) + baseMargin;
  var topExtra = Math.max(symmetric - before, EYE_GAP);
  var bottomExtra = Math.max(symmetric - after, baseMargin);
  var target = vh - before - after - topExtra - bottomExtra;
  if (target < MIN_CENTERED) {
    var slackAboveMin = vh - before - after - MIN_CENTERED - baseMargin;
    topExtra = Math.max(0, Math.min(EYE_GAP, slackAboveMin));
    bottomExtra = baseMargin;
    target = Math.max(60, vh - before - after - topExtra - bottomExtra);
  }
  panel.style.height = target.toFixed(1) + 'px';
  /* The gap goes on the enemy hand row, not the board panel — the enemy's
     cards sit right above the board now, so the room reserved for the eyes
     belongs above the cards, not between the cards and the board. */
  if (enemyRow) {
    enemyRow.style.marginTop = topExtra.toFixed(1) + 'px';
    panel.style.marginTop = baseMargin.toFixed(1) + 'px';
  } else {
    panel.style.marginTop = (topExtra + baseMargin).toFixed(1) + 'px';
  }
  panel.style.marginBottom = bottomExtra.toFixed(1) + 'px';
  setBoardPerspective(target);
}

/* Perspective is a distance in pixels, so a fixed value tapers a large board
   hard and a small one barely at all — measured across the reference sizes it
   ranged from 6.7% down to 1.7%, which meant the 3D read simply vanished on a
   narrow phone. Tying it to the board's own height keeps the taper constant
   at roughly 5% wherever the board is drawn. The floor stops a very short
   board from converging so hard the near edge swells into the stage. */
function setBoardPerspective(boardH) {
  var stage = document.querySelector('.board-tilt');
  if (!stage || !boardH) return;
  var persp = Math.max(620, boardH * 4);
  stage.style.perspective = persp.toFixed(0) + 'px';
  /* The pass marker rests on the same table, so it borrows the same
     perspective distance and the same lean. Read from the board's own
     computed transform rather than hard-coded, so the two can never drift. */
  var svg = document.getElementById('board');
  var tilt = 40;
  if (svg) {
    var m = /rotateX\((-?[\d.]+)deg\)/.exec(getComputedStyle(svg).transform === 'none'
      ? '' : (svg.style.transform || ''));
    if (m) tilt = parseFloat(m[1]);
    else {
      var css = getComputedStyle(svg).getPropertyValue('transform');
      if (css && css !== 'none') tilt = 40;      // matrix form: the stylesheet value
    }
  }
  var root = document.documentElement;
  root.style.setProperty('--pass-persp', persp.toFixed(0) + 'px');
  root.style.setProperty('--pass-tilt', tilt.toFixed(1) + 'deg');
  /* Level with the board's near edge, so the marker looks like it is lying on
     the table beside the board rather than floating above the top of it. */
  var stageRect = document.querySelector('.board-stage');
  var boardRect = svg && svg.getBoundingClientRect();
  if (stageRect && boardRect) {
    var sr = stageRect.getBoundingClientRect();
    var y = Math.max(6, Math.min(sr.height - 62, boardRect.top - sr.top + boardRect.height * 0.42));
    root.style.setProperty('--pass-y', y.toFixed(0) + 'px');
  }
}

/* Per-act, because each painting frames its room differently. BG_SEAM_FRAC is
   how far down the image the watching eyes sit; the aligner pins that point
   just above the enemy's card row, so the thing in the dark is always looking
   down at the cards it is about to play. A theme with a different composition
   needs its own fraction or the eyes drift off the mark. */
var BG_IMG_W = 840, BG_IMG_H = 1297, BG_SEAM_FRAC = 0.186;
function setBackgroundMetrics(m) {
  if (!m) return;
  BG_IMG_W = m.w; BG_IMG_H = m.h; BG_SEAM_FRAC = m.seam;
  _bgAlign.top = _bgAlign.height = _bgAlign.enemyTop = null;   // force a re-align
  setDrawnEyes(!!m.drawEyes, m.eyeStyle);
  alignRoomBackground();
}
var _bgAlign = { top: null, height: null, enemyTop: null, vw: null, vh: null };

function alignRoomBackground() {
  if (!document.body.classList.contains('battle-mode')) return;
  var boardEl = els.board, enemyRowEl = els.enemyHand;
  if (!boardEl) return;
  var rect = boardEl.getBoundingClientRect();
  if (!rect.height) return;
  var vw = window.innerWidth, vh = window.innerHeight;
  var enemyRowTop = enemyRowEl ? enemyRowEl.getBoundingClientRect().top : rect.top;
  if (_bgAlign.top === rect.top && _bgAlign.height === rect.height &&
      _bgAlign.enemyTop === enemyRowTop &&
      _bgAlign.vw === vw && _bgAlign.vh === vh) return;      // nothing moved
  _bgAlign.top = rect.top; _bgAlign.height = rect.height; _bgAlign.enemyTop = enemyRowTop;
  _bgAlign.vw = vw; _bgAlign.vh = vh;

  var art = document.querySelector('.room-art');
  if (!art) return;
  /* Targets just above the enemy's card row, which now sits right above
     the board rather than right below the header — the eyes in the art
     peer down at that row from above it, reading as the enemy looking at
     its own cards, rather than the cards floating below the eyes. */
  var targetY = enemyRowTop - 14;

  /* CSS "cover" picks whichever scale exactly covers both dimensions, which can
     leave almost no vertical slack when the viewport's aspect ratio happens to
     be close to the image's own — on some phones that left under a pixel of
     room to shift, so the seam landed whereever cover put it (~20-40px off)
     with nowhere left to move it. Setting the scale explicitly guarantees at
     least 32% extra vertical room on every device, so there is always enough
     slack for the seam to reach the target point. */
  var minScale = (vh * 1.32) / BG_IMG_H;
  var scale = Math.max(vw / BG_IMG_W, minScale);
  var scaledW = BG_IMG_W * scale, scaledH = BG_IMG_H * scale;
  var denom = vh - scaledH;
  var posY = Math.abs(denom) < 0.5 ? 50
    : 100 * (targetY - BG_SEAM_FRAC * scaledH) / denom;
  posY = Math.max(-40, Math.min(140, posY));                // guard pathological sizes
  art.style.backgroundSize = scaledW.toFixed(1) + 'px ' + scaledH.toFixed(1) + 'px';
  art.style.backgroundPosition = '50% ' + posY.toFixed(2) + '%';

  /* Drawn eyes go exactly where the painted ones would have. Rather than
     re-derive a position, this reuses the point the seam was just pinned to:
     whatever the aligner decided is correct for this painting is correct for
     the eyes too, so they cannot drift apart on any viewport.

     Where the seam could not be reached (the guard above clamped posY), the
     true landing point is recomputed from the clamped value instead of
     assuming the target was met. */
  var eyes = document.getElementById('roomEyes');
  if (eyes && !eyes.hidden) {
    var actualTop = (denom === 0) ? 0 : (posY / 100) * denom;
    var seamY = actualTop + BG_SEAM_FRAC * scaledH;
    eyes.style.top = seamY.toFixed(1) + 'px';
    // the eyes are part of the painting, so they scale with it
    eyes.style.setProperty('--eye-scale', (scaledH / 1250).toFixed(3));
  }
}

/* Only acts whose painting has no eyes of its own get drawn ones. */
function setDrawnEyes(on, style) {
  var eyes = document.getElementById('roomEyes');
  if (!eyes) return;
  eyes.hidden = !on;
  /* Each secret road watches differently. The style is a class on the layer
     rather than separate markup, so the aligner keeps placing one element and
     the variants are pure CSS. */
  ['choir', 'sundered', 'unblinking'].forEach(function (k) {
    eyes.classList.toggle('eyes-' + k, on && style === k);
  });
  if (on) {
    _bgAlign.top = _bgAlign.height = _bgAlign.enemyTop = null;   // force a re-place
    alignRoomBackground();
  }
}

function render() {
  var s = getBattleState();
  if (!s) return;
  var ev = evaluateBoard(s.board, s.hazards, RUN.evalCtx(s));
  renderTiles(ev); renderStatus(); renderControls(ev); renderHand();
  renderLanes(ev); renderHazardMarks(); renderFissures(); renderInfoOverlay(ev); renderEnemyHand();
  sizeBoardStage();
  alignRoomBackground();
}

/* ===================================================================
   TEACHING TRIGGERS
   Each rule waits for the board to demonstrate it. Checked in priority order
   and only one may open at a time; whichever fires holds the enemy until it
   is dismissed. Turning the tutorial off silences all of them.
   =================================================================== */

/* Is there a mix available that would actually buy an effective matchup? That
   is the moment mixing — and effectiveness — are worth explaining. */
function findTeachingMix(s, ev) {
  if (s.mixTokens[PLAYER] < 1) return null;
  var opts = RUN.mixOptions(s.board, PLAYER), best = null;
  for (var i = 0; i < opts.length && !best; i++) {
    var o = opts[i];
    var g = RUN.simGame(s);
    RUN.applyMix(g, PLAYER, o.base, o.other, 0, false);
    var e2 = C.evaluateBoard(g.board, g.hazards, RUN.evalCtx(g));
    e2.lanes.forEach(function (lane, L) {
      if (best || !lane.bottom || !lane.top || !lane.bottom.effective) return;
      var ch = lane.bottom.champion;
      if (ch.row !== o.base.row || ch.index !== o.base.index) return;
      if (ev.lanes[L].bottom && ev.lanes[L].bottom.effective) return;   // already effective
      best = { base: o.base, other: o.other, strength: e2.strengthOf(ch),
               foe: { row: lane.top.champion.row, index: lane.top.champion.index },
               foeColor: lane.top.color };
    });
  }
  return best;
}

function playerCanAct(s) {
  if (RUN.mixOptions(s.board, PLAYER).length && s.mixTokens[PLAYER] > 0) return true;
  return s.hands[PLAYER].some(function (card) {
    var d = CARDS[card.id];
    if (d.type === 'unit') return legalTiles(s.board, PLAYER, cardStrength(card), C.placeOpts(card.id, s.relics, s.board, PLAYER)).length > 0;
    if (d.type === 'hazard') return freeHazardRows(s.hazards, PLAYER).length > 0;
    return true;
  });
}

function teachNow(ev) {
  var s = getBattleState();
  if (!s || s.resolving || s.battleOver || s.pending) return false;
  if (RUN.tutorialOpen()) return false;
  ev = ev || evaluateBoard(s.board, s.hazards, RUN.evalCtx(s));
  var ctx = { board: s.board, hazards: s.hazards, ev: ev };

  /* Before anything else: on the player's very first turn, say what a turn is. */
  if (s.turn === PLAYER && !s.opponentThinking && RUN.inFirstBattle() && RUN.shouldTeach('play')) {
    var mine = 0;
    eachUnit(s.board, PLAYER, function () { mine++; });
    if (!mine && RUN.teach('play', ctx)) return true;
  }

  // lane lessons, keyed off the row the player just committed to
  if (s.lastPlaced && s.lastPlaced.side === PLAYER) {
    var key = 'lanes_' + s.lastPlaced.row;
    if (RUN.shouldTeach(key) &&
        RUN.teach(key, { board: s.board, hazards: s.hazards, ev: ev, tile: s.lastPlaced })) return true;
  }
  if (s.turn !== PLAYER || s.opponentThinking) return false;

  if (RUN.shouldTeach('mixing')) {
    var opt = findTeachingMix(s, ev);
    if (opt && RUN.teach('mixing', { board: s.board, hazards: s.hazards, ev: ev, opt: opt })) return true;
  }
  if (RUN.shouldTeach('frontline') && ev.lanes.some(function (l) { return l.bottom && l.top; })) {
    if (RUN.teach('frontline', ctx)) return true;
  }
  if (RUN.shouldTeach('rewind') && canRewind()) {
    if (RUN.teach('rewind', ctx)) return true;
  }
  if (RUN.shouldTeach('passing')) {
    var stuck = !playerCanAct(s);
    var commanding = (ev.totals.bottom - ev.totals.top) >= 12 && ev.totals.bottom > 0;
    if (stuck || commanding) {
      ctx.reason = stuck ? 'stuck' : 'ahead';
      if (RUN.teach('passing', ctx)) return true;
    }
  }
  return false;
}

/* ===================================================================
   TURN FLOW
   =================================================================== */
function resetChain(side) {
  var s = getBattleState();
  s.chains = s.chains || { bottom: 0, top: 0 };
  s.chains[side] = 0;
  s.mixChain = 0;
  s.cascadeDepth = 0;
}

/* ===================================================================
   REWIND
   One snapshot, taken the instant before the player commits. Because the
   enemy replies deterministically and nothing in an exchange rolls dice,
   restoring it genuinely rewinds both halves — there is no draw to re-roll
   and no enemy answer to fish for.
   =================================================================== */
function cloneCard(c) { return { id: c.id, up: !!c.up, deckIndex: c.deckIndex }; }

function snapshotForRewind(s) {
  return {
    board: C.cloneBoard(s.board), hazards: C.cloneHazards(s.hazards),
    hands: { bottom: s.hands.bottom.map(cloneCard), top: s.hands.top.map(cloneCard) },
    decks: { bottom: s.decks.bottom.map(cloneCard), top: s.decks.top.map(cloneCard) },
    handCount: { bottom: s.hands.bottom.length, top: s.hands.top.length },
    mixTokens: { bottom: s.mixTokens.bottom, top: s.mixTokens.top },
    chains: { bottom: (s.chains && s.chains.bottom) || 0, top: (s.chains && s.chains.top) || 0 },
    mixChain: s.mixChain || 0,
    mixesThisRound: s.mixesThisRound || 0,
    freeMixesThisRound: s.freeMixesThisRound || 0,
    echoUsedThisRound: !!s.echoUsedThisRound,
    wildPaletteUsed: !!s.wildPaletteUsed,
    quieted: s.quieted ? Object.assign({}, s.quieted) : null,
    bestChain: s.bestChain || 0,
    turn: s.turn, finalTurn: !!s.finalTurn, round: s.round,
    spectrumColor: s.spectrumColor,
    logLen: RUN.log.length
  };
}

/* Only the player's own turns are rewindable, and only the most recent one. */
function markRewindPoint(side) {
  var s = getBattleState();
  if (!s || side !== PLAYER || s.rewindUsedThisRound) return;
  s.rewindSnap = snapshotForRewind(s);
}

function restoreRewind(s, snap) {
  s.board = snap.board; s.hazards = snap.hazards;
  s.hands = { bottom: snap.hands.bottom.map(cloneCard), top: snap.hands.top.map(cloneCard) };
  s.decks = { bottom: snap.decks.bottom.map(cloneCard), top: snap.decks.top.map(cloneCard) };
  s.mixTokens = { bottom: snap.mixTokens.bottom, top: snap.mixTokens.top };
  s.chains = { bottom: snap.chains.bottom, top: snap.chains.top };
  s.mixChain = snap.mixChain;
  s.mixesThisRound = snap.mixesThisRound;
  s.freeMixesThisRound = snap.freeMixesThisRound;
  s.echoUsedThisRound = snap.echoUsedThisRound;
  s.wildPaletteUsed = snap.wildPaletteUsed;
  s.quieted = snap.quieted ? Object.assign({}, snap.quieted) : null;
  s.bestChain = snap.bestChain;
  s.turn = snap.turn; s.finalTurn = snap.finalTurn;
  s.spectrumColor = snap.spectrumColor;
  s.cascadeDepth = 0;
  s.pending = null; s.selectedCard = null; s.mixBase = null; s.mode = 'place';
  s.lastPlaced = null; s.inspected = null; s.curseFired = null;
  while (RUN.log.length > snap.logLen) RUN.log.shift();
}

function canRewind() {
  var s = getBattleState();
  if (!s) return false;
  return !!s.rewindSnap && !s.rewindUsedThisRound && s.turn === PLAYER &&
    !s.resolving && !s.battleOver && !s.opponentThinking && !s.pending;
}

function onRewind() {
  if (!canRewind()) return;
  var s = getBattleState(), r = getActiveRun(), snap = s.rewindSnap;
  var evAfter = evaluateBoard(s.board, s.hazards, RUN.evalCtx(s));
  var evBefore = evaluateBoard(snap.board, snap.hazards, {
    relics: s.relics, enemyMod: s.enemyMod, chains: snap.chains,
    mixChain: snap.mixChain, spectrumColor: snap.spectrumColor, fissures: s.fissures
  });
  var impact = RUN.rewindImpact(snap, s, evBefore, evAfter);
  var chunk = RUN.rewindChunk(r, impact);

  restoreRewind(s, snap);
  s.rewindSnap = null;
  s.rewindUsedThisRound = true;
  r.rewindsUsed = (r.rewindsUsed || 0) + 1;

  addLog('You rewound the exchange.');
  announce('Rewound', 'you');

  /* The debt is settled after the restore, so a fissure born now applies to
     the board the player just took back. */
  var events = RUN.addInstability(chunk, PLAYER, s.board);
  var headline = '';
  events.forEach(function (e) {
    var f = e.born || e.grew;
    newFissures[C.edgeKey(f.side, f.a, f.b)] = 1;
    var pair = slotName(f.a.row, f.a.index) + ' and ' + slotName(f.b.row, f.b.index);
    if (e.grew) {
      addLog('A fissure widens \u2014 ' + pair + ' pull harder at what stands on them.');
      headline = headline || 'The board strains';
    } else if (f.kind === 'bridge') {
      addLog('The board folds \u2014 ' + pair + ' now touch, though they never should.');
      headline = 'The board folds';
    } else {
      addLog('A fissure tears through your board \u2014 ' + pair + ' no longer touch.');
      headline = 'The board tears';
    }
  });
  if (headline) announce(headline, 'enemy');
  render();
}

function beginPlay(side, cardIndex, tile) {
  var s = getBattleState(), card = s.hands[side][cardIndex], d = CARDS[card.id];
  s.pending = { side: side, card: card, cardIndex: cardIndex, tile: tile, picks: [] };
  if (d.targets && d.targets.length) {
    if (!currentTargetOptions().length) { finishPlay(); return; }
    render(); return;
  }
  finishPlay();
}

function beginWild() {
  var s = getBattleState();
  if (s.wildPaletteUsed || s.turn !== PLAYER) return;
  s.pending = { side: PLAYER, kind: 'wild', picks: [] };
  if (!currentTargetOptions().length) { s.pending = null; render(); return; }
  render();
}

function advanceTarget(pick) {
  var s = getBattleState();
  if (!s.pending) return;
  s.pending.picks.push(pick);
  var total = s.pending.kind === 'wild' ? 2 : CARDS[s.pending.card.id].targets.length;
  if (s.pending.picks.length >= total) { finishPlay(); return; }
  if (!currentTargetOptions().length) { finishPlay(); return; }
  render();
}

function finishPlay() {
  showPassPuck(false);
  var s = getBattleState(), p = s.pending;
  if (!p) return;

  if (p.kind === 'wild') {
    if (p.picks.length >= 2) {
      RUN.buildApi(s, PLAYER, []).recolor(PLAYER, p.picks[0], p.picks[1].color);
      s.wildPaletteUsed = true;
      addLog('Wild Palette repainted ' + slotName(p.picks[0].row, p.picks[0].index) + ' ' + COLORS[p.picks[1].color].name + '. Free action.');
    }
    s.pending = null;
    render();          // Wild Palette costs neither turn nor token
    return;
  }

  var card = p.card, d = CARDS[card.id], side = p.side;
  markRewindPoint(side);
  resetChain(side);
  s.hands[side].splice(p.cardIndex, 1);
  var notes = RUN.resolveCard(s, side, card, p.tile, p.picks);
  s.pending = null; s.selectedCard = null;
  if (p.tile) { s.lastPlaced = { side: side, row: p.tile.row, index: p.tile.index }; s.inspected = { side: side, row: p.tile.row, index: p.tile.index }; }
  if (d.type === 'hazard' && p.tile) fxHazard(p.tile.row, d.hazardKind);
  else if (d.type === 'unit' && p.tile) fxBurst(side, p.tile.row, p.tile.index, colorInfo(d.color).hex);
  /* Quick Study fires on the first unit of the round only, so it rewards
     committing a body early rather than sitting on a full hand. */
  if (side === PLAYER && d.type === 'unit' && hasRelic(s.relics, 'quick_study') && !s.quickStudyUsed) {
    s.quickStudyUsed = true;
    if (RUN.drawInto(s, PLAYER, 1)) notes.push('Quick Study drew a card');
  }
  if (s.chains[PLAYER] > s.bestChain) s.bestChain = s.chains[PLAYER];
  addLog(sideName(side) + ' played ' + cardName(card) + (p.tile && d.type !== 'hazard' ? ' \u2192 ' + slotName(p.tile.row, p.tile.index) : '') +
    (notes.length ? ' — ' + notes.join('; ') : '') + '.');
  endTurn(side);
}

function cancelPending() { var s = getBattleState(); if (!s.pending) return; s.pending = null; s.selectedCard = null; render(); }

function performMix(side, base, other) {
  if (side === PLAYER) showPassPuck(false);
  var s = getBattleState();
  var a = unitAt(s.board, side, base.row, base.index), b = unitAt(s.board, side, other.row, other.index);
  var before = colorInfo(a.color).name + ' ' + a.strength + ' + ' + colorInfo(b.color).name + ' ' + b.strength;
  markRewindPoint(side);
  resetChain(side);
  var notes = [];
  var donor = colorInfo(b.color);
  fxFly(side, other, base, donor.hex, donor.ink, b.strength + (b.temp || 0));
  var res = RUN.doMixCascade(s, side, base, other, 0, false, notes);
  s.mixTokens[side]--;
  s.mode = 'place'; s.mixBase = null;
  s.lastPlaced = { side: side, row: base.row, index: base.index };
  s.inspected = { side: side, row: base.row, index: base.index };
  if (s.chains[PLAYER] > s.bestChain) s.bestChain = s.chains[PLAYER];
  addLog(sideName(side) + ' mixed ' + before + ' \u2192 ' + colorInfo(res.color).name + ' ' + res.strength +
    ' (+' + res.bonus + ', chain ' + s.chains[side] + ')' + (notes.length > 1 ? ' — ' + notes.slice(1).join('; ') : '') + '.');
  /* BOSS RULE — echoMix (The Riven Prism). Every mix the player lands is
     answered: its own strongest unit takes a share of what you just made. The
     bigger the fusion the bigger the reply, so the boss turns the game's
     central mechanic into a decision rather than a free action. Small mixes
     and mixless rounds both become real lines of play. */
  if (side === PLAYER && s.enemyMod && s.enemyMod.echoMix) {
    var strongest = null;
    eachUnit(s.board, ENEMY, function (u, row, index) {
      if (!strongest || u.strength > strongest.u.strength) strongest = { u: u, row: row, index: index };
    });
    if (strongest) {
      var gain = Math.max(1, Math.floor(res.strength * s.enemyMod.echoMix));
      strongest.u.strength += gain;
      fxBurst(ENEMY, strongest.row, strongest.index, colorInfo(strongest.u.color).hex);
      addLog(s.enemy.name + ' echoes the mix — its strongest unit gains ' + gain + '.');
    }
  }
  endTurn(side);
}

function onTileActivate(side, row, index) {
  var s = getBattleState();
  if (!s) return;
  var locked = s.resolving || s.battleOver || s.opponentThinking;
  var unit = unitAt(s.board, side, row, index);

  if (s.pending) {
    var opts = currentTargetOptions(), spec = pendingSpec();
    if (spec && spec.kind === 'hazard') {
      var h = opts.filter(function (o) { return o.side === side && o.row === row; })[0];
      if (h) { advanceTarget(h); return; }
    } else {
      var m = opts.filter(function (o) { return o.row === row && o.index === index; })[0];
      if (m && side === s.pending.side) { advanceTarget(m); return; }
    }
    flash(null); return;
  }

  if (!locked && s.turn === PLAYER && side === PLAYER) {
    if (s.mode === 'mix') {
      if (!unit) flash(null);
      else if (!s.mixBase) { s.mixBase = { row: row, index: index }; render(); return; }
      else if (s.mixBase.row === row && s.mixBase.index === index) { s.mixBase = null; render(); return; }
      else {
        var chk = RUN.canMix(s.board, PLAYER, s.mixBase, { row: row, index: index });
        if (chk.ok) { performMix(PLAYER, s.mixBase, { row: row, index: index }); return; }
        addLog('Mix blocked — ' + chk.reason); flash(null);
      }
    } else if (s.selectedCard !== null) {
      var card = s.hands[PLAYER][s.selectedCard], d = CARDS[card.id];
      if (d.type === 'hazard') {
        if (!s.hazards[PLAYER][row]) { beginPlay(PLAYER, s.selectedCard, { row: row, index: index }); return; }
        flash(null);
      } else if (d.type === 'unit' && !unit) {
        var ok = canPlace(s.board, side, row, index, cardStrength(card), C.placeOpts(card.id, side === PLAYER ? s.relics : [], s.board, side));
        if (ok.ok) { beginPlay(PLAYER, s.selectedCard, { row: row, index: index }); return; }
        addLog('Blocked — ' + ok.reason); flash(null);
      }
    }
  }
  s.inspected = { side: side, row: row, index: index };
  s.inspectedHazard = null;
  render();
  var ev2 = evaluateBoard(s.board, s.hazards, RUN.evalCtx(s));
  openInfo(sideName(side) + ' · ' + slotName(row, index), tileInfo(ev2, s.inspected));
}

function flash(n) { if (!n) return; n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); }

function pass(side) {
  var s = getBattleState();
  markRewindPoint(side);
  addLog(sideName(side) + ' passed.');
  /* The enemy's pass is the one that needs saying out loud — the player knows
     perfectly well when they passed themselves. The marker stays down until
     something else happens, so it is still there to read when the turn comes
     back rather than vanishing on a timer the player might miss. */
  if (side === ENEMY) showPassPuck(true);
  resetChain();
  s.selectedCard = null; s.mode = 'place'; s.mixBase = null; s.pending = null;
  if (s.finalTurn) { resolveRound(); return; }
  s.finalTurn = true; s.turn = otherSide(side);
  render(); maybeOpponentMove();
}
function endTurn(side) {
  var s = getBattleState();
  if (s.finalTurn) { resolveRound(); return; }
  s.turn = otherSide(side); s.selectedCard = null; s.mode = 'place'; s.mixBase = null;
  render();
  if (!teachNow()) maybeOpponentMove();
}
function onPass() { var s = getBattleState(); if (s.turn !== PLAYER || s.resolving || s.battleOver || s.opponentThinking || s.pending) return; pass(PLAYER); }

function showPassPuck(on) {
  var el = document.getElementById('passPuck');
  if (!el) return;
  if (on) {
    el.hidden = false;
    // restart the drop, so a second pass in the same battle animates again
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  } else {
    el.hidden = true;
  }
}
function onMixToggle() {
  var s = getBattleState();
  if (s.turn !== PLAYER || s.resolving || s.battleOver || s.opponentThinking || s.pending) return;
  s.mode = s.mode === 'mix' ? 'place' : 'mix'; s.mixBase = null; s.selectedCard = null; render();
}

/* ===================================================================
   AI
   =================================================================== */
/* Split from execution so maybeOpponentMove can time the pause on how
   close the call was before anything actually happens on the board.
   runnerUp tracks the second-best value seen (across cards, tiles, mixes,
   and the option of passing) purely as a side channel — it never changes
   which move wins, only how confident that win looks in hindsight. */
/* ===================================================================
   HOW WELL THE OPPONENT IS ALLOWED TO PLAY
   Skill is not a constant. A first-act brawler should misplay — dump its hand
   into a round it has already won, spend its best unit to gain a point — and
   the same brawler at the end of a long run should not. Tying it to run
   power means the player teaches the world to play well by surviving in it,
   and act one stays the tutorial it is meant to be.

   Each tier only adds; nothing is ever taken away, so a later enemy is
   strictly at least as sharp as an earlier one.

     0  greedy      plays the highest board delta it can find, every turn
     1  measured    stops valuing overkill past a won round
     2  thrifty     charges itself for spending a card that could serve later
     3  patient     concedes a round it cannot win and banks the hand
     4  surgical    spends the cheapest card that does the job

   Elites and bosses are a tier above the road they stand on: an act's boss
   should feel like the sharpest thing in it. */
var SAFE_LEAD = 6;             // beyond this, a round is already in hand

function aiSkill(s) {
  var power = s.power || 0;
  var tier = power >= 40 ? 4 : power >= 28 ? 3 : power >= 17 ? 2 : power >= 8 ? 1 : 0;
  var kind = s.enemy && s.enemy.kind;
  if (kind === 'elite') tier += 1;
  if (kind === 'boss') tier += 1;
  return Math.max(0, Math.min(4, tier));
}

/* Tier 1+. Strength banked past a comfortable win does very little, because a
   round is won by leading, not by leading by twenty. Below tier 1 the raw
   delta is used, which is what makes an early enemy overcommit. */
function shapedLead(delta, tier) {
  if (tier < 1 || delta <= SAFE_LEAD) return delta;
  return SAFE_LEAD + (delta - SAFE_LEAD) * 0.25;
}

/* Tier 2+. A battle is best of three and spent cards are gone for all of it,
   so a card held is a card available later. Zero in the deciding round —
   there is no later to save for — and dearer when reserves are thin. */
function reservePrice(s, side, ai, tier) {
  if (tier < 2) return 0;
  var roundsPlayed = (s.wins[PLAYER] || 0) + (s.wins[ENEMY] || 0);
  if (roundsPlayed >= 2) return 0;
  var reserves = s.hands[side].length + s.decks[side].length;
  var scarcity = reserves <= 3 ? 2.6 : reserves <= 6 ? 1.7 : 1.0;
  return 1.5 * scarcity * (ai.thrift === undefined ? 1 : ai.thrift);
}

/* Tier 3+. Some rounds are simply gone. Rather than feed cards into a lost
   round, bank the hand and take the next two — which is how the format is
   actually won. Never in the deciding round, where there is no next. */
function concedeBonus(s, side, rawLead, tier) {
  if (tier < 3) return 0;
  var roundsPlayed = (s.wins[PLAYER] || 0) + (s.wins[ENEMY] || 0);
  if (roundsPlayed >= 2) return 0;               // must fight for the decider
  var gap = -rawLead;
  if (gap <= 10) return 0;
  /* Scaled, not flat. A flat bonus was worth less than a single good blocking
     play, so the enemy kept "fighting" a round it had lost by seventy — and
     blocking *is* worth doing when it is worth ten points, so the answer is
     not to weaken blocking but to let the concession grow with the size of
     the hole. Holding a round already makes banking more attractive still. */
  var banked = s.wins[side] >= 1 ? 1.5 : 1;
  return Math.min(14, (gap - 10) * 0.4 * banked);
}

/* Tier 4+. Two moves that leave the board in the same place are not equal:
   the one that spent the weaker card is better, because the stronger card is
   still in hand for the next round. This is what makes a late enemy answer a
   frontline with the smallest unit that does it, instead of dropping its best
   body to win a lane by one. */
function spendCost(card, tier) {
  if (tier < 4 || !card) return 0;
  var d = CARDS[card.id];
  if (!d) return 0;
  var rare = d.rarity === 'Rare' ? 1.6 : d.rarity === 'Uncommon' ? 0.8 : 0;
  return (cardStrength(card) * 0.28) + rare;
}

/* Tier 4. Waste is per lane, not per board.

   A lane is won by leading it; every point past that margin is spent for
   nothing, even when the overall score is close. Discounting only the global
   lead missed this entirely, so a surgical enemy still answered a 1-strength
   frontline by dropping a 6-strength Rare on it — a fine play this round and
   a terrible one across three. Charging the surplus lane by lane is what
   actually produces "use the smallest thing that does the job". */
var LANE_MARGIN = 2;

function laneShapedDelta(ev, side, foe) {
  var mine = 0, theirs = 0;
  ev.lanes.forEach(function (lane) {
    var a = lane[side] ? lane[side].strength * lane[side].multiplier : 0;
    var b = lane[foe] ? lane[foe].strength * lane[foe].multiplier : 0;
    var cap = b + LANE_MARGIN;
    if (a > cap) a = cap + (a - cap) * 0.25;
    mine += a; theirs += b;
  });
  return mine - theirs;
}

/* Tier 3+. Look past the resolve. Frontlines break between rounds, so a board
   whose value survives that break is worth more than one propped up entirely
   by units about to be removed. Blended rather than replacing the immediate
   read, because the current round still has to be won. */
function afterBreakValue(g, side, foe) {
  var sim = RUN.simGame(g);
  RUN.clearFrontlines(sim.board, sim.hazards, RUN.evalCtx(sim));
  var e = evaluateBoard(sim.board, sim.hazards, RUN.evalCtx(sim));
  return e.totals[side] - e.totals[foe];
}

function decideOpponentMove() {
  var s = getBattleState(), side = ENEMY, foe = PLAYER, ai = s.enemy.ai || {};
  var tier = aiSkill(s);
  var now = evaluateBoard(s.board, s.hazards, RUN.evalCtx(s));
  var rawLead = tier >= 4 ? laneShapedDelta(now, side, foe)
                          : now.totals[side] - now.totals[foe];
  /* Every move is scored as an *improvement on doing nothing*, and ai.strength
     weights that improvement rather than scaling the board state itself.

     Multiplying the lead directly was wrong twice over: it inflated the value
     of playing while leaving passing untouched, and — because a lead is
     signed — it made a losing position look even worse to sit in, so a
     hopeless round produced frantic play instead of a concession. Scoring the
     delta keeps the sign out of it: an aggressive enemy simply wants gains
     more, whichever side of level it is on. */
  var aggro = ai.strength || 1;
  var baseline = shapedLead(rawLead, tier);
  var passValue = baseline + concedeBonus(s, side, rawLead, tier);
  var hold = reservePrice(s, side, ai, tier);
  var best = null, runnerUp = -Infinity;

  function spreadBonus(board) {
    if (!ai.spread) return 0;
    var seen = {}, n = 0;
    eachUnit(board, side, function (u) { if (u.color && !seen[u.color]) { seen[u.color] = 1; n++; } });
    return n * ai.spread;
  }
  function consider(v, candidate) {
    if (!best || v > best.value) {
      if (best) runnerUp = Math.max(runnerUp, best.value);
      candidate.value = v; best = candidate;
    } else runnerUp = Math.max(runnerUp, v);
  }

  s.hands[side].forEach(function (card, ci) {
    var d = CARDS[card.id], spots = [];
    if (d.type === 'unit') spots = legalTiles(s.board, side, cardStrength(card), C.placeOpts(card.id, side === PLAYER ? s.relics : [], s.board, side));
    else if (d.type === 'hazard') spots = freeHazardRows(s.hazards, side).map(function (r) { return { row: r, index: 0 }; });
    else spots = [null];
    spots.forEach(function (tile) {
      var g = RUN.simGame(s);
      var targets = RUN.autoTargets(g, side, card, tile);
      try { RUN.resolveCard(g, side, card, tile, targets); } catch (e) { return; }
      var e2 = evaluateBoard(g.board, g.hazards, RUN.evalCtx(g));
      var delta = tier >= 4 ? laneShapedDelta(e2, side, foe)
                            : e2.totals[side] - e2.totals[foe];
      // tier 3 looks past the break; below that it only sees this instant
      if (tier >= 3) delta = delta * 0.65 + afterBreakValue(g, side, foe) * 0.35;
      var v = baseline + (shapedLead(delta, tier) - baseline) * aggro
              + spreadBonus(g.board) - hold - spendCost(card, tier);
      consider(v, { type: 'card', cardIndex: ci, tile: tile, targets: targets });
    });
  });

  if (s.mixTokens[side] > 0) {
    RUN.mixOptions(s.board, side).forEach(function (m) {
      var g = RUN.simGame(s);
      RUN.applyMix(g, side, m.base, m.other, 0, false);
      var e2 = evaluateBoard(g.board, g.hazards, RUN.evalCtx(g));
      /* A mix costs no card — it spends a token and consumes units already
         committed — so it is not charged the reserve price. That makes mixing
         the natural move for an enemy that wants to improve without emptying
         its hand, which is exactly the behaviour worth encouraging. */
      var mixDelta = e2.totals[side] - e2.totals[foe];
      if (tier >= 3) mixDelta = mixDelta * 0.65 + afterBreakValue(g, side, foe) * 0.35;
      var v = baseline + (shapedLead(mixDelta, tier) - baseline) * (ai.mix || 1)
              + spreadBonus(g.board);
      consider(v, { type: 'mix', base: m.base, other: m.other });
    });
  }

  runnerUp = Math.max(runnerUp, passValue);
  /* Pass whenever holding beats playing. At tier 0 `hold` is zero and the
     lead is unshaped, so playing essentially always wins and the enemy dumps
     its hand exactly as it used to — which is the intended act-one feel. */
  var willPass = !best || best.value <= passValue;
  // Infinity when there was really only one live option (or passing was
  // the obvious call) — decisionDelay treats that as the easiest case.
  var margin = (!willPass && best) ? best.value - runnerUp : Infinity;
  return { side: side, best: best, willPass: willPass, margin: margin };
}

function runOpponentMove(decision) {
  var side = decision.side, best = decision.best;
  if (decision.willPass) { pass(side); return; }
  if (best.type === 'mix') { performMix(side, best.base, best.other); return; }
  var s = getBattleState();
  s.pending = { side: side, card: s.hands[side][best.cardIndex], cardIndex: best.cardIndex, tile: best.tile, picks: best.targets };
  finishPlay();
}

function opponentMove() { runOpponentMove(decideOpponentMove()); }

/* A close call between the best move and its nearest rival reads as a
   harder decision and earns a longer visible pause; a lopsided choice
   lands quickly. margin arrives as Infinity for a one-option or obvious-
   pass turn, which floors the delay at its minimum. */
function decisionDelay(margin) {
  if (!isFinite(margin)) return 400;
  var extra = Math.max(0, 1000 - margin * 80);
  return 400 + Math.min(1000, extra);
}

function maybeOpponentMove() {
  var s = getBattleState();
  if (!s || s.turn !== ENEMY || s.resolving || s.battleOver) return;
  s.opponentThinking = true; render();
  var decision = decideOpponentMove();
  setTimeout(function () {
    var st = getBattleState();
    if (!st) return;
    st.opponentThinking = false;
    if (st.resolving || st.battleOver) { render(); return; }
    runOpponentMove(decision);
    teachNow();
  }, decisionDelay(decision.margin));
}

/* ===================================================================
   ROUND / BATTLE RESOLUTION
   =================================================================== */
function resolveRound() {
  var s = getBattleState();
  var ev = evaluateBoard(s.board, s.hazards, RUN.evalCtx(s));
  var result = decideRound(ev, s.roundStarter);
  s.wins[result.winner]++;
  s.lastRoundWinner = result.winner;
  s.resolving = true; s.opponentThinking = false;
  /* Once a round is scored it is out of reach for good. */
  s.rewindSnap = null;
  s.mode = 'place'; s.mixBase = null; s.selectedCard = null; s.pending = null;
  if (s.wins[result.winner] >= 2) s.battleOver = true;
  addLog('Round ' + s.round + ' — You ' + result.bottom + ' : ' + result.top + '. ' + sideName(result.winner) + ' won it.');
  render();
  // let the final animation land before the modal covers the board
  setTimeout(function () { if (getBattleState() === s) showResults(ev, result); }, 520);
}

function laneTable(ev) {
  var rows = ev.lanes.map(function (lane) {
    function cell(sd) {
      var d = lane[sd];
      if (!d) return '<td class="muted">—</td><td class="muted">—</td>';
      var c = colorInfo(d.color), cd = CARDS[d.champion.unit.cardId];
      return '<td><span class="chip mini" style="background:' + c.hex + ';color:' + c.ink + '">' + c.name + '</span>' +
        '<em class="detail">' + (cd ? cd.name : 'Mixed') + ' · ' + ROW_INFO[d.champion.row].label.replace('Row ', 'R') + '</em></td>' +
        '<td class="num">' + d.frontStrength + (d.support ? '+' + d.support : '') +
        (d.multiplier > 1 ? ' <b class="fx">\u00d7' + d.multiplier + '</b>' : '') + '<b class="tot">' + d.final + '</b></td>';
    }
    return '<tr><td class="lane-no">' + (lane.index + 1) + '</td>' + cell('bottom') + cell('top') + '</tr>';
  }).join('');
  return '<table class="lane-table"><thead><tr><th>Lane</th><th>Your frontline</th><th>Score</th><th>Enemy frontline</th><th>Score</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function showResults(ev, result) {
  var s = getBattleState(), r = getActiveRun();
  var playerWon = s.wins.bottom >= 2;
  els.resultsTitle.textContent = s.battleOver
    ? (playerWon ? 'Battle won' : 'Battle lost')
    : 'Round ' + s.round + ' — ' + (result.winner === PLAYER ? 'you win' : 'enemy wins');
  els.resultsBody.innerHTML =
    '<p class="result-score"><span class="you">You ' + result.bottom + '</span><span class="vs">:</span><span class="opp">' + result.top + ' ' + s.enemy.name + '</span></p>' +
    (result.note ? '<p class="tiebreak">' + result.note + '</p>' : '') + laneTable(ev) +
    '<p class="match-line">Rounds — You ' + s.wins.bottom + ' : ' + s.wins.top + ' · raw ' + ev.raw.bottom + ' : ' + ev.raw.top +
    ' · longest chain ' + s.bestChain + '</p>';

  if (s.battleOver) {
    els.continueBtn.textContent = playerWon ? 'Claim reward' : 'Continue';
    els.continueBtn.onclick = function () { els.overlay.hidden = true; endBattle(playerWon); };
  } else {
    els.resultsBody.innerHTML += '<p class="rule-note">Frontline units in <b>contested</b> lanes fall before round ' +
      (s.round + 1) + ' — whatever sits behind them steps up. A lane the enemy never contested keeps its unit.</p>';
    els.continueBtn.textContent = 'Start round ' + (s.round + 1);
    els.continueBtn.onclick = function () { els.overlay.hidden = true; nextRound(result.winner); };
  }
  els.overlay.hidden = false;
  els.continueBtn.focus();
}

function nextRound(winner) {
  showPassPuck(false);
  var s = getBattleState();
  // The line breaks: frontline units in contested lanes are spent. Snapshot the
  // board first so the tutorial can show the player exactly what fell and why.
  var ctxNow = RUN.evalCtx(s);
  var preBoard = C.cloneBoard(s.board), preHaz = C.cloneHazards(s.hazards);
  var preEv = evaluateBoard(preBoard, preHaz, ctxNow);
  var fallen = RUN.clearFrontlines(s.board, s.hazards, ctxNow);
  s.round++; s.roundStarter = winner; s.turn = winner;
  s.finalTurn = false; s.resolving = false;
  // one Rewind per round, and it can never reach across the boundary
  s.rewindSnap = null; s.rewindUsedThisRound = false;
  s.inspected = null; s.lastPlaced = null;
  s.mixTokens = { bottom: 1, top: (s.enemyMod && s.enemyMod.mixTokens) || 1 };
  s.mixChain = 0; s.chains = { bottom: 0, top: 0 };
  s.mixesThisRound = 0; s.freeMixesThisRound = 0; s.echoUsedThisRound = false; s.cascadeDepth = 0;
  s.quickStudyUsed = false;
  s.quieted = null;                              // Cyan's reprieve lasts one round
  ['bottom', 'top'].forEach(function (sd) { eachUnit(s.board, sd, function (u) { u.temp = 0; }); });
  /* BOSS RULE — growth (The Verdant Crown). Everything of its that survived
     the break comes back bigger, permanently. A long battle is a losing
     battle: the answer is to take rounds one and two quickly rather than
     grinding, which inverts the usual advice about playing for the long game. */
  if (s.enemyMod && s.enemyMod.growth) {
    var grown = 0;
    eachUnit(s.board, ENEMY, function (u) { u.strength += s.enemyMod.growth; grown++; });
    if (grown) addLog(s.enemy.name + ' puts out new growth — ' + grown +
      ' surviving unit' + (grown === 1 ? '' : 's') + ' gain ' + s.enemyMod.growth + '.');
  }
  if (s.enemyMod && s.enemyMod.rotatingColor) {
    s.spectrumColor = COLOR_KEYS[Math.floor(RUN.getRnd()() * COLOR_KEYS.length)];
    addLog(s.enemy.name + ' turns ' + COLORS[s.spectrumColor].name + ' this round.');
  }
  /* BOSS RULE — devourWeakest (The Spectrum). It eats your weakest surviving
     unit at the start of every round. Chaff you were holding for board
     presence becomes a liability, and the usual habit of padding the back
     rows with cheap bodies actively feeds it. */
  if (s.enemyMod && s.enemyMod.devourWeakest) {
    var weakest = null;
    eachUnit(s.board, PLAYER, function (u, row, index) {
      if (!weakest || u.strength < weakest.u.strength) weakest = { u: u, row: row, index: index };
    });
    if (weakest) {
      s.board[PLAYER][weakest.row][weakest.index] = null;
      addLog(s.enemy.name + ' devours your weakest unit — ' +
        colorInfo(weakest.u.color).name + ' ' + weakest.u.strength + ' is gone.');
    }
  }
  /* BOSS RULE — plantsCurse (The Chorus Eternal). It puts a curse on the
     player's board every round, so the deck-level rot the boss feeds on keeps
     growing during the fight. Board-only: it does not add to the run deck,
     because the boss should not permanently worsen a run you might still
     lose and retry. */
  if (s.enemyMod && s.enemyMod.plantsCurse) {
    var curseId = C.CURSE_KEYS[Math.floor(RUN.getRnd()() * C.CURSE_KEYS.length)];
    var note = C.plantCurse(s, PLAYER, RUN.buildApi(s, PLAYER, []), curseId);
    addLog(s.enemy.name + ' adds its voice \u2014 ' + CARDS[curseId].name + ': ' + note + '.');
  }

  /* BOSS RULE — sunderEachRound (The Long Crack). The ground keeps breaking,
     on BOTH halves. Splitting it evenly is what makes this a shared handicap
     rather than a one-sided punishment \u2014 the fight is about who plays broken
     ground better. */
  if (s.enemyMod && s.enemyMod.sunderEachRound) {
    for (var sc = 0; sc < s.enemyMod.sunderEachRound; sc++) {
      var side1 = RUN.spawnFissure(PLAYER, s.board);
      var side2 = RUN.spawnFissure(ENEMY, s.board);
      if (side1 || side2) addLog('The ground gives way further on both halves.');
    }
  }

  /* Units that dig every round. Counted off the board, so keeping a
     Wellspring alive is the cost of the engine \u2014 it is a frontline body like
     any other and the line still breaks around it. */
  var engineDraw = 0;
  eachUnit(s.board, PLAYER, function (u) {
    var d = CARDS[u.cardId];
    if (d && d.drawsEachRound) engineDraw += d.drawsEachRound;
  });
  if (engineDraw) addLog('Your wellsprings draw ' + engineDraw + ' extra.');
  /* Deep Pockets pays a lean deck directly: every five cards under 25 is
     another card each round. At 15 cards that is two extra draws a round, so
     the endgame target size is something the relic actively argues for. */
  var lean = 0;
  if (hasRelic(s.relics, 'deep_pockets')) {
    lean = Math.max(0, Math.floor((25 - getActiveRun().deck.length) / 5));
    if (lean) addLog('Deep Pockets draws ' + lean + ' extra \u2014 your deck is lean.');
  }
  RUN.drawInto(s, PLAYER, C.ROUND_DRAW + engineDraw + lean + (hasRelic(s.relics, 'recycling_bin') ? 1 : 0));
  RUN.drawInto(s, ENEMY, C.ROUND_DRAW);
  if (fallen.bottom.length || fallen.top.length) {
    addLog('The contested lines break — ' + fallen.bottom.length + ' of yours and ' +
      fallen.top.length + ' enemy frontline unit' + (fallen.top.length === 1 ? '' : 's') + ' fall.');
  } else addLog('No lane was contested, so every unit holds its ground.');
  addLog('Round ' + s.round + ' begins. ' + sideName(winner) + ' starts.');
  render();
  if (!RUN.teach('roundbreak', { board: preBoard, hazards: preHaz, ev: preEv,
      after: s.board, fallen: fallen, evalCtx: ctxNow })) maybeOpponentMove();
}

function endBattle(won) {
  var s = getBattleState(), r = getActiveRun();
  if (won) {
    r.battlesWon++;
    RUN.rollReward(s.node);
    r.gold += r.reward.gold;
    RUN.show('reward');
  } else {
    r.lives = Math.max(0, r.lives - 1);
    RUN.renderRunBar();
    if (r.lives <= 0) { RUN.show('gameover'); return; }
    RUN.advance();
  }
}

/* The suite lives in ./self-test.js. It is 44KB gzipped of code no player
   ever runs, so it is fetched the first time it is asked for rather than
   shipped with the game -- which is most of what having it in its own file
   is worth. Both ways in return a promise: the menu button and
   CV_BATTLE.selfTest(). */
let builtSelfTest = null;
async function selfTest() {
  if (!builtSelfTest) {
    const { createSelfTest } = await import('./self-test.js');
    builtSelfTest = createSelfTest({ S: getBattleState, sizeBoardStage, render, snapshotForRewind, markRewindPoint, restoreRewind, canRewind, pass, showPassPuck, aiSkill, shapedLead, reservePrice, concedeBonus, spendCost, laneShapedDelta, decideOpponentMove, endBattle, C, RUN, COLORS, COLOR_KEYS, CARDS, RELICS, ENEMIES, ROW_INFO, ROWS, PLAYER, ENEMY, GEO, eachUnit, lanesOf, els, tileEls, SAFE_LEAD });
  }
  return builtSelfTest();
}

async function runSelfTestUI() {
  var r = await selfTest(), p = r.filter(function (x) { return x.pass; }).length;
  els.resultsTitle.textContent = 'Self test — ' + p + ' / ' + r.length + ' passed';
  els.resultsBody.innerHTML = '<ul class="test-list">' + r.map(function (x) {
    return '<li class="' + (x.pass ? 'ok' : 'bad') + '"><span>' + (x.pass ? 'PASS' : 'FAIL') + '</span><span>' + x.name +
      (x.detail ? ' <em>(' + x.detail + ')</em>' : '') + '</span></li>';
  }).join('') + '</ul>';
  els.continueBtn.textContent = 'Close';
  els.continueBtn.onclick = function () { els.overlay.hidden = true; };
  els.overlay.hidden = false;
}

/* ===================================================================
   BOOT
   =================================================================== */
/* Wipe everything and drop back to a fresh map. Any open modal is closed first,
   otherwise the old overlay keeps covering the new run. */
function startFreshRun() {
  RUN.suppressSave(false);
  els.overlay.hidden = true;
  els.deckOverlay.hidden = true;
  RUN.closeTutorial();
  RUN.clearSave();
  RUN.setRun(RUN.newRun());
  RUN.setState(null);
  RUN.log.length = 0;
  if (els.logList) els.logList.innerHTML = '';
  RUN.applyActTheme();
  RUN.show('map');
}

/* Pick up where the player left off if there is anything to pick up. A save
   that fails to load for any reason yields null and we start clean rather
   than half-restoring something and limping. */
function resumeSaved() {
  var saved = RUN.loadRun();
  if (!saved) return false;
  RUN.setRun(saved);
  RUN.setState(null);
  RUN.log.length = 0;
  if (els.logList) els.logList.innerHTML = '';
  RUN.applyActTheme();
  var screen = saved.screen;
  // only screens that can be rebuilt from run state alone are safe to reopen
  if (['map', 'act', 'victory', 'shop', 'lab', 'event', 'gameover'].indexOf(screen) === -1) screen = 'map';
  RUN.show(screen);
  return true;
}

/* The title is shown over a live game rather than instead of one: a run is
   always set up underneath, so dismissing the title is one flag and nothing
   has to be constructed at that moment. Continue only appears when there is
   genuinely something to continue. */
function showTitle() {
  var t = document.getElementById('titleScreen');
  var cont = document.getElementById('titleContinue');
  if (cont) cont.hidden = !RUN.hasSave();
  var warn = document.getElementById('titleNewWarn');
  if (warn) warn.hidden = true;
  var nb = document.getElementById('titleNew');
  if (nb) { nb.textContent = 'New run'; nb.dataset.armed = ''; }
  if (t) t.hidden = false;
}
function hideTitle() {
  var t = document.getElementById('titleScreen');
  if (t) t.hidden = true;
}

function bootToTitle() {
  // a run exists behind the title either way, so the interface is never empty
  if (!resumeSaved()) {
    RUN.suppressSave(true);        // scaffolding only — must not become a save
    RUN.setRun(RUN.newRun());
    RUN.applyActTheme();
    RUN.show('map');
    RUN.suppressSave(false);
  }
  showTitle();
}

function init() {
  ['board', 'controls', 'battleHud',
   'passBtn', 'rewindBtn', 'chainCount', 'cancelBtn', 'wildBtn', 'colorPicker', 'pipsYou', 'pipsOpp',
   'scoreYou', 'scoreOpp', 'enemyOmens', 'chainBadge',
   'logList', 'overlay', 'resultsTitle', 'resultsBody', 'continueBtn',
   'hand', 'handCount', 'cardPeek', 'lanes', 'enemyName', 'enemyRank', 'enemyRules', 'enemyRuleText', 'enemyRulesLayer',
   'lanesOverlay', 'logOverlay', 'infoOverlay', 'infoTitle', 'infoBody',
   'runLives', 'runGold', 'runDepth', 'runAct', 'runRelics', 'mapBody',
   'enemyColors', 'enemyHand', 'enemyDeckCount', 'actionToast',
   'rewardCards', 'rewardRelic', 'rewardRot', 'shopCards', 'shopRelics', 'shopRemove',
   'deckBtn', 'deckBtnCount', 'relicBtnCount', 'deckOverlay', 'deckModalBody', 'mapScroll', 'mapLegend',
   'tutorialOverlay', 'tutorialBody', 'tutorialBack', 'tutorialNext', 'tutorialSkip', 'tutorialOff',
   'tutorialToggle', 'easeNote', 'menuBtn', 'menuDropdown', 'logBtn',
   'labBody', 'eventBody', 'gameoverBody', 'actBody', 'victoryBody'
  ].forEach(function (id) { els[id] = document.getElementById(id); });
  ['map', 'act', 'victory', 'loadout', 'battle', 'reward', 'shop', 'lab', 'event', 'gameover'].forEach(function (s) {
    els['screen_' + s] = document.getElementById('screen-' + s);
  });

  RUN.setRun(RUN.newRun());   // placeholder so early renders have a run to read
  buildBoard();
  var _bgRaf = null;
  window.addEventListener('resize', function () {
    if (_bgRaf) return;
    _bgRaf = requestAnimationFrame(function () { _bgRaf = null; sizeBoardStage(); alignRoomBackground(); });
  });
  /* Self-healing: any layout shift in the battle screen — a wrapped header, a
     longer enemy name, fonts finishing their load — re-triggers both, rather
     than relying only on game-state renders to happen to fire again. */
  if (window.ResizeObserver && els.screen_battle) {
    var _ro = new ResizeObserver(function () {
      if (_bgRaf) return;
      _bgRaf = requestAnimationFrame(function () { _bgRaf = null; sizeBoardStage(); alignRoomBackground(); });
    });
    _ro.observe(els.screen_battle);
  }

  els.passBtn.addEventListener('click', onPass);
  els.rewindBtn.addEventListener('click', onRewind);
  els.cancelBtn.addEventListener('click', cancelPending);
  els.wildBtn.addEventListener('click', beginWild);
  document.getElementById('leaveShopBtn').addEventListener('click', function () { RUN.advance(); });
  document.getElementById('skipRewardBtn').addEventListener('click', function () {
    var r = getActiveRun();
    if (!r.reward || r.reward.cardTaken) return;
    r.reward.cardTaken = true;
    r.gold += RUN.skipValue();
    RUN.renderRunBar();
    // a relic on the same reward is still there to take — only leave once both are resolved
    if (r.reward.relic && !r.reward.relicTaken) RUN.show('reward');
    else { r.reward.taken = true; RUN.advance(); }
  });
  els.deckBtn.addEventListener('click', function () { RUN.renderDeckModal(); });
  /* The menu only holds toggles/one-shot actions, so it stays open on an
     inner click — New Run's arm-then-confirm needs the dropdown to survive
     its first tap — and closes on an outside tap, Escape, or re-toggling. */
  function closeMenu() {
    els.menuDropdown.hidden = true;
    els.menuBtn.setAttribute('aria-expanded', 'false');
  }
  /* One-shot, not a toggle — unlike the rest of the menu this one closes
     itself, since leaving the dropdown open behind the log modal would
     just be clutter once something else is on screen. */
  els.logBtn.addEventListener('click', function () {
    els.logOverlay.hidden = false;
    closeMenu();
  });
  els.menuBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var opening = els.menuDropdown.hidden;
    els.menuDropdown.hidden = !opening;
    els.menuBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
  });
  document.addEventListener('click', function (e) {
    if (els.menuDropdown.hidden) return;
    if (els.menuBtn.contains(e.target) || els.menuDropdown.contains(e.target)) return;
    closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !els.menuDropdown.hidden) closeMenu();
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-close');
      if (id === 'infoOverlay') closeInfo();
      else document.getElementById(id).hidden = true;
    });
  });
  // tapping the backdrop dismisses these light overlays
  ['lanesOverlay', 'logOverlay', 'infoOverlay'].forEach(function (id) {
    els[id].addEventListener('click', function (e) {
      if (e.target !== els[id]) return;
      if (id === 'infoOverlay') closeInfo(); else els[id].hidden = true;
    });
  });
  els.tutorialBack.addEventListener('click', function () { RUN.tutorialStep(-1); });
  els.tutorialNext.addEventListener('click', function () { RUN.tutorialStep(1); });
  els.tutorialSkip.addEventListener('click', function () { RUN.closeTutorial(); });
  els.tutorialOff.addEventListener('change', function () {
    RUN.setTutorial(!els.tutorialOff.checked);
    if (els.tutorialOff.checked) RUN.closeTutorial();
  });
  els.tutorialToggle.addEventListener('click', function () {
    var on = !RUN.tutorial.enabled;
    RUN.setTutorial(on);
    els.tutorialOff.checked = !on;
  });
  RUN.setTutorial(RUN.tutorial.enabled);
  els.deckCloseBtn = document.getElementById('deckCloseBtn');
  els.deckCloseBtn.addEventListener('click', function () { els.deckOverlay.hidden = true; });

  /* The overlay the peek strip opens. Built from the same card data the
     small hand button and the peek strip already read — a bigger rendering
     of the same card, not a second source of truth for what it says. */
  function openCardDetail(cardId) {
    if (!cardId) return;
    var overlay = document.getElementById('cardDetailOverlay');
    var body = document.getElementById('cardDetailBody');
    if (!overlay || !body) return;
    var html;
    if (cardId === '__mix__') {
      html = '<div class="cd-card" style="--card:' + colorInfo(null).hex + ';--card-ink:' + colorInfo(null).ink + '">' +
        '<div class="cd-top"><span class="cd-badge">' + (getBattleState() ? getBattleState().mixTokens[PLAYER] : 1) + '</span>' +
        '<div><div class="cd-name">Mix</div><div class="cd-meta">Action</div></div></div>' +
        '<div class="cd-icons">' + C.iconRow('__mix__') + '</div>' +
        '<div class="cd-text">Fuse two touching friendly units. Colours combine, strengths add plus one.</div></div>';
    } else {
      var d = CARDS[cardId];
      if (!d) return;
      var c = colorInfo(d.color);
      var badge = d.type === 'unit' ? (CARDS[cardId] ? cardStrengthDisplay(cardId) : d.strength)
        : d.type === 'hazard' ? 'HAZ' : 'SPL';
      html = '<div class="cd-card" style="--card:' + c.hex + ';--card-ink:' + c.ink + '">' +
        '<div class="cd-top"><span class="cd-badge">' + badge + '</span>' +
        '<div><div class="cd-name">' + d.name + '</div>' +
        '<div class="cd-meta">' + d.rarity + (d.color ? ' \u00b7 ' + c.name : '') + '</div></div></div>' +
        '<div class="cd-icons">' + C.iconRow(cardId) + '</div>' +
        '<div class="cd-text">' + (d.text || 'No effect. Just muscle.') + '</div></div>';
    }
    body.innerHTML = html;
    overlay.hidden = false;
  }
  /* The card currently selected for play may carry an upgrade (+1) that a
     bare CARDS[cardId].strength would miss — read it off the hand entry
     when one matches, same as the small card button already does. */
  function cardStrengthDisplay(cardId) {
    var s = getBattleState();
    var entry = s && s.hands[PLAYER].filter(function (c) { return c.id === cardId; })[0];
    return entry ? cardStrength(entry) : CARDS[cardId].strength;
  }
  els.cardPeek = document.getElementById('cardPeek');
  els.cardPeek.addEventListener('click', function () { openCardDetail(this.dataset.cardId); });
  var cardDetailOverlay = document.getElementById('cardDetailOverlay');
  document.getElementById('cardDetailCloseBtn').addEventListener('click', function () { cardDetailOverlay.hidden = true; });
  cardDetailOverlay.addEventListener('click', function (e) { if (e.target === cardDetailOverlay) cardDetailOverlay.hidden = true; });
  /* Two-step confirm rather than window.confirm(): browsers let people tick
     "prevent this page from creating more dialogs", after which confirm()
     silently returns false and the button looks broken. */
  var newRunBtn = document.getElementById('newRunBtn'), armed = null;
  function disarmNewRun() {
    clearTimeout(armed); armed = null;
    newRunBtn.textContent = 'New run';
    newRunBtn.classList.remove('armed');
  }
  newRunBtn.addEventListener('click', function () {
    if (!armed) {
      newRunBtn.textContent = 'Abandon run?';
      newRunBtn.classList.add('armed');
      armed = setTimeout(disarmNewRun, 4000);
      return;
    }
    disarmNewRun();
    startFreshRun();
  });
  document.getElementById('restartBtn').addEventListener('click', startFreshRun);

  /* ---- title screen ---- */
  document.getElementById('titleContinue').addEventListener('click', function () {
    if (resumeSaved()) hideTitle();
  });
  document.getElementById('titleNew').addEventListener('click', function () {
    var b2 = this, warn = document.getElementById('titleNewWarn');
    /* Starting over wipes a saved run, so it arms first when one exists.
       Without the confirm a mis-tap on the very first screen destroys a run
       the player never got to see. */
    if (RUN.hasSave() && b2.dataset.armed !== '1') {
      b2.dataset.armed = '1';
      b2.textContent = 'Start over \u2014 tap again';
      if (warn) warn.hidden = false;
      return;
    }
    startFreshRun();
    hideTitle();
  });
  document.getElementById('titleGlossary').addEventListener('click', function () {
    RUN.openGlossary();
  });
  document.getElementById('glossaryBtn').addEventListener('click', function () {
    RUN.openGlossary();
  });
  document.getElementById('titleBtn').addEventListener('click', function () {
    // the run is already saved on every settled screen, so this is safe to do
    RUN.saveRun();
    showTitle();
  });
  document.getElementById('glossaryClose').addEventListener('click', function () {
    RUN.closeGlossary();
  });
  document.getElementById('glossary').addEventListener('click', function (e) {
    if (e.target === this) RUN.closeGlossary();     // tap the backdrop to dismiss
  });
  Array.prototype.forEach.call(document.querySelectorAll('.gl-tab'), function (b2) {
    b2.addEventListener('click', function () { RUN.setGlossaryTab(b2.getAttribute('data-tab')); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !document.getElementById('glossary').hidden) RUN.closeGlossary();
  });
  document.getElementById('selfTestBtn').addEventListener('click', runSelfTestUI);
  /* Removal used to read r.active, a field that does not exist, so the button
     threw the moment it was clicked; and it removed a card at random, which is
     no use at all to someone trying to cut one specific curse out of a deck.
     Now it arms a picker and the player chooses. */
  els.shopRemove.addEventListener('click', function () {
    var r = getActiveRun();
    if (r.gold < RUN.removalCost(r.shop) || r.deck.length <= 5) return;
    if (RUN.removalsLeft(r.shop) <= 0) return;
    r.shop.removing = !r.shop.removing;
    RUN.show('shop');
  });

  document.addEventListener('keydown', function (e) {
    var s = getBattleState();
    if (e.key === 'Escape') {
      if (!els.infoOverlay.hidden) { closeInfo(); return; }
      if (!els.lanesOverlay.hidden) { els.lanesOverlay.hidden = true; return; }
      if (!els.logOverlay.hidden) { els.logOverlay.hidden = true; return; }
    }
    if (!els.tutorialOverlay.hidden && e.key === 'Escape') { RUN.closeTutorial(); return; }
    if (!els.deckOverlay.hidden && e.key === 'Escape') { els.deckOverlay.hidden = true; return; }
    if (!document.getElementById('cardDetailOverlay').hidden && e.key === 'Escape') { document.getElementById('cardDetailOverlay').hidden = true; return; }
    if (!els.overlay.hidden && e.key === 'Escape') { els.overlay.hidden = true; return; }
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (!s || getActiveRun().screen !== 'battle') return;
    var k = e.key.toLowerCase();
    if (k === 'escape') { if (s.pending) cancelPending(); else if (s.mode === 'mix') { s.mode = 'place'; s.mixBase = null; render(); } return; }
    if (s.pending) return;
    if (k === 'p') onPass();
    if (k === 'r') onRewind();
    if (k === 'm') onMixToggle();
    if (/^[1-9]$/.test(k)) {
      var i = +k - 1;
      if (s.hands[PLAYER][i]) {
        s.mode = 'place'; s.mixBase = null;
        s.selectedCard = s.selectedCard === i ? null : i;
        if (CARDS[s.hands[PLAYER][i].id].type === 'spell' && s.selectedCard !== null) beginPlay(PLAYER, i, null);
        else render();
      }
    }
  });

  RUN.loadCodex();
  bootToTitle();
}

const CV_BATTLE = {
  init: init, selfTest: selfTest, render: render, buildBoard: buildBoard, startFreshRun: startFreshRun,
  alignRoomBackground: alignRoomBackground, sizeBoardStage: sizeBoardStage,
  setBackgroundMetrics: setBackgroundMetrics, setDrawnEyes: setDrawnEyes,
  teachNow: teachNow, findTeachingMix: findTeachingMix, playerCanAct: playerCanAct,
  showPassPuck: showPassPuck,
  shapedLead: shapedLead, reservePrice: reservePrice, decideOpponentMove: decideOpponentMove,
  aiSkill: aiSkill, concedeBonus: concedeBonus, spendCost: spendCost, SAFE_LEAD: SAFE_LEAD,
  laneShapedDelta: laneShapedDelta,
  flushCurses: flushCurses,
  maybeOpponentMove: maybeOpponentMove, opponentMove: opponentMove,
  runOpponentMove: runOpponentMove, decisionDelay: decisionDelay,
  beginPlay: beginPlay, advanceTarget: advanceTarget, finishPlay: finishPlay,
  performMix: performMix, pass: pass, onPass: onPass, resolveRound: resolveRound,
  onRewind: onRewind, canRewind: canRewind, snapshotForRewind: snapshotForRewind,
  restoreRewind: restoreRewind, markRewindPoint: markRewindPoint,
  endBattle: endBattle, nextRound: nextRound, beginWild: beginWild,
  currentTargetOptions: currentTargetOptions, pendingSpec: pendingSpec
};

// Public surface used by tests and the console
window.ColorVibes = {
  init: init, selfTest: selfTest, render: render,
  core: C, run: RUN, battle: window.CV_BATTLE,
  getState: RUN.getState, getRun: RUN.getRun, setRun: RUN.setRun, setState: RUN.setState,
  show: RUN.show, advance: RUN.advance, enterNode: RUN.enterNode, beginBattle: RUN.beginBattle,
  CARDS: CARDS, RELICS: RELICS, ENEMIES: ENEMIES, COLORS: COLORS, COLOR_KEYS: COLOR_KEYS,
  evaluateBoard: C.evaluateBoard, legalTiles: legalTiles, mixOptions: RUN.mixOptions,
  autoTargets: RUN.autoTargets, legalTargets: RUN.legalTargets, makeCard: C.makeCard,
  emptyBoard: C.emptyBoard, emptyHazards: C.emptyHazards, applyMix: RUN.applyMix,
  setRnd: RUN.setRnd, newRun: RUN.newRun
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.CV_BATTLE = CV_BATTLE;
export default CV_BATTLE;
