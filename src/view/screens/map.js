/* The map, drawn as SVG so the edges between nodes are visible: you can see
   which branches a node leads to and plan a route to the boss. */

import { rules as C } from '../../game/index.js';
import { MAP_COLS, currentNodes, enterNode, store } from '../../game/index.js';
import { els } from '../dom.js';

var COLORS = C.COLORS;
var ENEMIES = C.ENEMIES;

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
  var radius = 24, gap = colors.length > 1 ? 0.16 : 0, svg = '';
  colors.forEach(function (colorKey, index) {
    var startAngle = -Math.PI / 2 + (index / colors.length) * Math.PI * 2 + gap / 2;
    var endAngle = -Math.PI / 2 + ((index + 1) / colors.length) * Math.PI * 2 - gap / 2;
    var largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
    if (colors.length === 1) {
      svg += '<circle class="mn-ring" r="' + radius + '" fill="none" stroke="' + COLORS[colorKey].hex + '"/>';
      return;
    }
    svg += '<path class="mn-ring" fill="none" stroke="' + COLORS[colorKey].hex + '" d="M' +
      (Math.cos(startAngle) * radius).toFixed(2) + ',' + (Math.sin(startAngle) * radius).toFixed(2) +
      ' A' + radius + ',' + radius + ' 0 ' + largeArc + ' 1 ' +
      (Math.cos(endAngle) * radius).toFixed(2) + ',' + (Math.sin(endAngle) * radius).toFixed(2) + '"/>';
  });
  return svg;
}

var MAP_LABEL = { battle: 'Battle', elite: 'Elite', shop: 'Shop', lab: 'Colour Lab', event: 'Event', boss: 'Boss', volatile: 'Volatile Lab' };

export function renderMap() {
  var open = currentNodes();
  var mapWidth = 320, rowHeight = 74, padding = 34;
  var mapHeight = store.run.map.length * rowHeight + padding;
  /* x comes from the node's grid column, not its index in the row, so a node
     keeps the same horizontal position whatever else that row contains. */
  function nodeX(depth, colIndex) {
    var node = store.run.map[depth][colIndex];
    return padding + (node.col + 0.5) * (mapWidth - padding * 2) / MAP_COLS;
  }
  function nodeY(depth) { return padding / 2 + depth * rowHeight + 26; }

  var edges = '', nodes = '';
  store.run.map.forEach(function (row, depth) {
    if (depth >= store.run.map.length - 1) return;
    row.forEach(function (node, index) {
      node.next.forEach(function (nextIndex) {
        var x1 = nodeX(depth, index), y1 = nodeY(depth) + 20, x2 = nodeX(depth + 1, nextIndex), y2 = nodeY(depth + 1) - 20;
        var midY = (y1 + y2) / 2;
        var taken = (store.run.history[depth] === index && store.run.history[depth + 1] === nextIndex);
        var live = (depth === store.run.depth && open.indexOf(index) !== -1) ||
                   (depth === store.run.depth - 1 && store.run.history[depth] === index);
        var cls = 'map-edge' + (taken ? ' taken' : live ? ' live' : '');
        edges += '<path class="' + cls + '" d="M' + x1 + ',' + y1 +
          ' C' + x1 + ',' + midY + ' ' + x2 + ',' + midY + ' ' + x2 + ',' + y2 + '"/>';
      });
    });
  });

  store.run.map.forEach(function (row, depth) {
    row.forEach(function (node, index) {
      var x = nodeX(depth, index), y = nodeY(depth);
      var reachable = (depth === store.run.depth && open.indexOf(index) !== -1);
      var past = depth < store.run.depth, taken = past && store.run.history[depth] === index;
      var cls = 'map-node t-' + node.type + (reachable ? ' open' : '') + (past ? ' past' : '') + (taken ? ' taken' : '');
      var enemy = node.enemy ? ENEMIES[node.enemy] : null;
      var title = node.hidden ? 'Unknown — something is waiting on this road'
        : MAP_LABEL[node.type] + (enemy ? ' — ' + enemy.name + ' · ' +
          enemy.colors.map(function (colorKey) { return COLORS[colorKey].name; }).join(', ') : '');
      nodes += '<g class="' + cls + (node.hidden ? ' hidden-node' : '') + (node.dangerous ? ' danger' : '') +
        '" transform="translate(' + x + ',' + y + ')"' +
        (reachable ? ' data-col="' + index + '" tabindex="0" role="button"' : '') +
        ' aria-label="' + title + '"><title>' + title + '</title>' +
        (enemy && !node.hidden ? colorRing(enemy.colors) : '') +
        '<circle class="mn-disc" r="19"/>' +
        '<g class="mn-icon">' + MAP_ICONS[node.hidden ? 'unknown' : node.type] + '</g>' +
        (reachable ? '<circle class="mn-halo" r="25" fill="none"/>' : '') +
        '</g>';
    });
  });

  els.mapBody.innerHTML =
    '<svg class="map-svg" viewBox="0 0 ' + mapWidth + ' ' + mapHeight + '" ' +
    'xmlns="http://www.w3.org/2000/svg">' + edges + nodes + '</svg>';

  Array.prototype.forEach.call(els.mapBody.querySelectorAll('.map-node.open'), function (nodeEl) {
    function go() { enterNode(+nodeEl.getAttribute('data-col')); }
    nodeEl.addEventListener('click', go);
    nodeEl.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } });
  });

  // keep the live row in view
  if (els.mapScroll) {
    var svgEl = els.mapBody.querySelector('.map-svg');
    var drawn = svgEl ? svgEl.getBoundingClientRect().height : mapHeight;
    var top = nodeY(store.run.depth) / mapHeight * drawn;
    els.mapScroll.scrollTop = Math.max(0, top - els.mapScroll.clientHeight * 0.45);
  }
}

export function renderMapLegend() {
  if (els.mapLegend.dataset.built) return;
  els.mapLegend.innerHTML = ['battle', 'elite', 'boss', 'shop', 'lab', 'volatile', 'event', 'unknown'].map(function (type) {
    return '<span class="legend-item t-' + type + '"><svg viewBox="-16 -16 32 32" class="legend-ic">' +
      '<g class="mn-icon">' + MAP_ICONS[type] + '</g></svg>' + (MAP_LABEL[type] || 'Unknown') + '</span>';
  }).join('');
  els.mapLegend.dataset.built = '1';
}
