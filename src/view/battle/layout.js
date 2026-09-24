/* Fitting the board to the viewport and lining the painted room up behind it. */

import { els } from '../dom.js';

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
export function sizeBoardStage() {
  var screen = els.screen_battle, panel = document.querySelector('.board-panel');
  var enemyRow = document.querySelector('.enemy-hand-row');
  if (!screen || !panel || screen.hidden) return;
  if (enemyRow) enemyRow.style.marginTop = '';
  var viewportHeight = window.innerHeight;
  var screenTop = screen.getBoundingClientRect().top;
  var panelIndex = Array.prototype.indexOf.call(screen.children, panel);
  var beforeWithinScreen = 0, after = 0;
  Array.prototype.forEach.call(screen.children, function (child, childIndex) {
    if (child === panel) return;
    var childStyle = getComputedStyle(child);
    if (childStyle.display === 'none') return;
    /* Only things in normal flow take height from the board. An absolutely
       positioned child still reports a real height from getBoundingClientRect,
       so the enemy rules overlay was being counted as chrome: opening a boss
       rule grew its rect, and the next re-measure handed the board a smaller
       target. It shrank on a later render rather than on the tap itself,
       which is why it looked intermittent. */
    if (childStyle.position === 'absolute' || childStyle.position === 'fixed') return;
    var childOuterHeight = child.getBoundingClientRect().height + parseFloat(childStyle.marginTop) + parseFloat(childStyle.marginBottom);
    if (childIndex < panelIndex) beforeWithinScreen += childOuterHeight; else after += childOuterHeight;
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
  var target = viewportHeight - before - after - topExtra - bottomExtra;
  if (target < MIN_CENTERED) {
    var slackAboveMin = viewportHeight - before - after - MIN_CENTERED - baseMargin;
    topExtra = Math.max(0, Math.min(EYE_GAP, slackAboveMin));
    bottomExtra = baseMargin;
    target = Math.max(60, viewportHeight - before - after - topExtra - bottomExtra);
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
function setBoardPerspective(boardHeight) {
  var stage = document.querySelector('.board-tilt');
  if (!stage || !boardHeight) return;
  var perspective = Math.max(620, boardHeight * 4);
  stage.style.perspective = perspective.toFixed(0) + 'px';
  /* The pass marker rests on the same table, so it borrows the same
     perspective distance and the same lean. Read from the board's own
     computed transform rather than hard-coded, so the two can never drift. */
  var svg = document.getElementById('board');
  var tilt = 40;
  if (svg) {
    var rotateMatch = /rotateX\((-?[\d.]+)deg\)/.exec(getComputedStyle(svg).transform === 'none'
      ? '' : (svg.style.transform || ''));
    if (rotateMatch) tilt = parseFloat(rotateMatch[1]);
    else {
      var transformValue = getComputedStyle(svg).getPropertyValue('transform');
      if (transformValue && transformValue !== 'none') tilt = 40;      // matrix form: the stylesheet value
    }
  }
  var root = document.documentElement;
  root.style.setProperty('--pass-persp', perspective.toFixed(0) + 'px');
  root.style.setProperty('--pass-tilt', tilt.toFixed(1) + 'deg');
  /* Level with the board's near edge, so the marker looks like it is lying on
     the table beside the board rather than floating above the top of it. */
  var stageEl = document.querySelector('.board-stage');
  var boardBounds = svg && svg.getBoundingClientRect();
  if (stageEl && boardBounds) {
    var stageBounds = stageEl.getBoundingClientRect();
    var passY = Math.max(6, Math.min(stageBounds.height - 62, boardBounds.top - stageBounds.top + boardBounds.height * 0.42));
    root.style.setProperty('--pass-y', passY.toFixed(0) + 'px');
  }
}

/* Per-act, because each painting frames its room differently. BG_SEAM_FRAC is
   how far down the image the watching eyes sit; the aligner pins that point
   just above the enemy's card row, so the thing in the dark is always looking
   down at the cards it is about to play. A theme with a different composition
   needs its own fraction or the eyes drift off the mark. */
var BG_IMG_W = 840, BG_IMG_H = 1297, BG_SEAM_FRAC = 0.186;

export function setBackgroundMetrics(metrics) {
  if (!metrics) return;
  BG_IMG_W = metrics.w; BG_IMG_H = metrics.h; BG_SEAM_FRAC = metrics.seam;
  _bgAlign.top = _bgAlign.height = _bgAlign.enemyTop = null;   // force a re-align
  setDrawnEyes(!!metrics.drawEyes, metrics.eyeStyle);
  alignRoomBackground();
}

var _bgAlign = { top: null, height: null, enemyTop: null, vw: null, vh: null };

export function alignRoomBackground() {
  if (!document.body.classList.contains('battle-mode')) return;
  var boardEl = els.board, enemyRowEl = els.enemyHand;
  if (!boardEl) return;
  var rect = boardEl.getBoundingClientRect();
  if (!rect.height) return;
  var viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
  var enemyRowTop = enemyRowEl ? enemyRowEl.getBoundingClientRect().top : rect.top;
  if (_bgAlign.top === rect.top && _bgAlign.height === rect.height &&
      _bgAlign.enemyTop === enemyRowTop &&
      _bgAlign.vw === viewportWidth && _bgAlign.vh === viewportHeight) return;      // nothing moved
  _bgAlign.top = rect.top; _bgAlign.height = rect.height; _bgAlign.enemyTop = enemyRowTop;
  _bgAlign.vw = viewportWidth; _bgAlign.vh = viewportHeight;

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
  var minScale = (viewportHeight * 1.32) / BG_IMG_H;
  var scale = Math.max(viewportWidth / BG_IMG_W, minScale);
  var scaledW = BG_IMG_W * scale, scaledH = BG_IMG_H * scale;
  var heightGap = viewportHeight - scaledH;
  var posY = Math.abs(heightGap) < 0.5 ? 50
    : 100 * (targetY - BG_SEAM_FRAC * scaledH) / heightGap;
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
    var actualTop = (heightGap === 0) ? 0 : (posY / 100) * heightGap;
    var seamY = actualTop + BG_SEAM_FRAC * scaledH;
    eyes.style.top = seamY.toFixed(1) + 'px';
    // the eyes are part of the painting, so they scale with it
    eyes.style.setProperty('--eye-scale', (scaledH / 1250).toFixed(3));
  }
}

/* Only acts whose painting has no eyes of its own get drawn ones. */
export function setDrawnEyes(on, style) {
  var eyes = document.getElementById('roomEyes');
  if (!eyes) return;
  eyes.hidden = !on;
  /* Each secret road watches differently. The style is a class on the layer
     rather than separate markup, so the aligner keeps placing one element and
     the variants are pure CSS. */
  ['choir', 'sundered', 'unblinking'].forEach(function (styleKey) {
    eyes.classList.toggle('eyes-' + styleKey, on && style === styleKey);
  });
  if (on) {
    _bgAlign.top = _bgAlign.height = _bgAlign.enemyTop = null;   // force a re-place
    alignRoomBackground();
  }
}
