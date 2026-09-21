/* Colour Vibes — generated from the single-file build by build/split.py.
   Edit color-vibes-act1.html, then re-run the script. */

/* The glyph vocabulary cards are read by.
   Deliberately tiny so it can be learned once and read at a glance; the full prose
   still lives in the card detail overlay. */

import { COLORS, mixResultColor } from './colors.js';
import { CARDS } from './cards.js';
import { ENEMIES } from './enemies.js';

/* ===================================================================
   EFFECT ICONS
   Cards read as symbols on the table rather than paragraphs. Each glyph is a
   path drawn in a 24-unit box centred on the origin; a card is one to three of
   them, optionally carrying a number. Full prose still lives in the deck viewer.
   =================================================================== */
export var GLYPHS = {
  plus:      'M0,-8 V8 M-8,0 H8',
  minus:     'M-8,0 H8',
  draw:      'M-7,-9 h9 a1,1 0 0,1 1,1 v14 a1,1 0 0,1 -1,1 h-9 a1,1 0 0,1 -1,-1 v-14 a1,1 0 0,1 1,-1 Z M6,-4 h6 M9,-7 l3,3 l-3,3',
  mix:       'M-4,-2 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M4,2 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0',
  freemix:   'M-4,-2 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M4,2 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M8,-8 l2,-3 l2,3 l3,1 l-3,1 l-2,3 l-2,-3 l-3,-1 Z',
  move:      'M-9,4 q4,-12 16,-10 M2,-7 l5,-1 l-1,5',
  destroy:   'M-7,-7 L7,7 M7,-7 L-7,7',
  create:    'M0,9 V-2 M0,-2 q-7,0 -7,-6 q7,0 7,6 M0,-2 q7,0 7,-6 q-7,0 -7,6',
  touch:     'M-6,0 m-3.5,0 a3.5,3.5 0 1,0 7,0 a3.5,3.5 0 1,0 -7,0 M6,0 m-3.5,0 a3.5,3.5 0 1,0 7,0 a3.5,3.5 0 1,0 -7,0 M-2,0 H2',
  row:       'M-9,-5 H9 M-9,0 H9 M-9,5 H9',
  lane:      'M-6,7 L-6,-4 M0,7 L0,-7 M6,7 L6,-4 M-9,-7 l3,-3 l3,3 M-3,-10 l3,-3 l3,3 M3,-7 l3,-3 l3,3',
  enemy:     'M-8,-5 H8 L0,7 Z',
  friendly:  'M-8,5 H8 L0,-7 Z',
  aura:      'M0,0 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0 M0,0 m-7,0 a7,7 0 1,0 14,0 a7,7 0 1,0 -14,0',
  palette:   'M0,0 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0 M-4,-3 h.01 M3,-4 h.01 M4,3 h.01 M-3,4 h.01',
  chain:     'M-7,-2 a4.5,4.5 0 0,1 0,-6.5 a4.5,4.5 0 0,1 6.5,0 M7,2 a4.5,4.5 0 0,1 0,6.5 a4.5,4.5 0 0,1 -6.5,0 M-3,1 L3,-1',
  shield:    'M0,-9 L8,-5 V2 Q8,7 0,9 Q-8,7 -8,2 V-5 Z',
  cleanse:   'M0,-9 L8,-5 V2 Q8,7 0,9 Q-8,7 -8,2 V-5 Z M-4,-1 l3,3 l6,-6',
  hazard:    'M-9,-4 q4.5,-4 9,0 t9,0 M-9,3 q4.5,-4 9,0 t9,0',
  colourless:'M0,0 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M-6,6 L6,-6',
  stack:     'M-8,4 H8 M-8,0 H8 M-8,-4 H8 M-8,-8 H8',
  x2:        'M-9,-6 L-1,6 M-1,-6 L-9,6 M3,-6 h5 v12 h-5 M8,0 h-5',
  block:     'M-7,-7 h14 v14 h-14 Z M-7,-7 L7,7',
  front:     'M-9,3 H9 M-6,-2 H6 M-3,-7 H3',
  /* --- rank marks: what kind of thing you are about to fight --- */
  elite:     'M0,-10 L2.8,-3.2 L10,-3.2 L4.2,1.2 L6.4,8.4 L0,4 L-6.4,8.4 L-4.2,1.2 L-10,-3.2 L-2.8,-3.2 Z',
  boss:      'M-11,6 L-11,-7 L-5.5,-1 L0,-9 L5.5,-1 L11,-7 L11,6 Z',
  /* --- boss rules --- */
  growth:    'M0,9 V-3 M0,-3 q-8,0 -8,-7 q8,0 8,7 M0,1 q7,0 7,-6 q-7,0 -7,6 M-9,9 H9',
  support:   'M-9,7 H9 M-9,7 V2 M9,7 V2 M-5,-2 H5 M0,-2 V-9 M-4,-6 L0,-9 L4,-6',
  echoLane:  'M-7,8 V-2 M0,8 V-8 M7,8 V-2 M-3,-5 L0,-8 L3,-5 M-10,3 q5,-5 10,0 t10,0',
  tax:       'M0,0 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0 M-6,6 L6,-6 M-3,-4 h.01 M3,4 h.01',
  echoMix:   'M-4,-2 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M4,2 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M8,-9 q5,4 0,8',
  ward:      'M0,-9 L8,-5 V2 Q8,7 0,9 Q-8,7 -8,2 V-5 Z M-5,-6 L5,4',
  devour:    'M-9,-6 q9,7 18,0 M-9,6 q9,-7 18,0 M-3,-1 h.01 M3,-1 h.01',
  rotate:    'M0,0 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M-4,-3 h.01 M3,-4 h.01 M4,3 h.01 M8,-8 l1,4 l-4,1',
  mixtoken:  'M-4,-2 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M4,2 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M9,-9 v6 M6,-6 h6'
};

/* One to three glyphs per card. Numbers ride on the glyph they modify. */
export var CARD_ICONS = {
  red_scout:            [{ i: 'plus', v: 1 }, { i: 'touch' }],
  red_brute:            [],
  red_breaker:          [{ i: 'enemy' }, { i: 'front' }, { i: 'minus', v: 1 }],
  red_ravager:          [{ i: 'plus', v: 2 }, { i: 'x2' }],
  red_titan:            [{ i: 'plus', v: 3 }, { i: 'lane' }],
  blue_scout:           [{ i: 'draw', v: 1 }],
  blue_current:         [{ i: 'move' }],
  red_forgeheart:       [{ i: 'front' }, { i: 'plus', v: 4 }],
  green_worldroot:      [{ i: 'aura' }, { i: 'plus', v: 2 }],
  blue_deepcurrent:     [{ i: 'draw', v: 2 }, { i: 'stack' }],
  yellow_noonday:       [{ i: 'row' }, { i: 'plus', v: 2 }],
  cyan_aegis:           [{ i: 'shield' }, { i: 'touch' }, { i: 'plus', v: 1 }],
  magenta_refractor:    [{ i: 'chain' }, { i: 'plus', v: 2 }],
  black_devouring_star: [{ i: 'destroy' }, { i: 'touch' }, { i: 'plus' }],
  white_prism_crown:    [{ i: 'palette' }, { i: 'plus', v: 2 }],
  white_absolute_zero:  [{ i: 'shield' }, { i: 'touch' }],
  white_last_verdict:   [{ i: 'enemy' }, { i: 'minus', v: 3 }],
  rot_reliquary:        [{ i: 'block' }, { i: 'plus', v: 3 }],
  rot_plague_herald:    [{ i: 'destroy' }, { i: 'touch' }, { i: 'plus', v: 8 }],
  rot_undying_choir:    [{ i: 'block' }, { i: 'plus', v: 2 }],
  rift_keystone:        [{ i: 'touch' }, { i: 'plus', v: 3 }],
  rift_bridgewalker:    [{ i: 'shield' }, { i: 'touch' }],
  rift_the_widening:    [{ i: 'enemy' }, { i: 'plus', v: 6 }],
  blue_archivist:       [{ i: 'draw', v: 2 }],
  blue_tideline:        [{ i: 'draw' }, { i: 'plus' }],
  cyan_wellspring:      [{ i: 'draw', v: 1 }, { i: 'stack' }],
  colorless_ledger:     [{ i: 'draw', v: 3 }],
  blue_controller:      [{ i: 'enemy' }, { i: 'front' }, { i: 'minus', v: 1 }],
  green_seed:           [{ i: 'plus', v: 2 }, { i: 'touch' }],
  green_gardener:       [{ i: 'aura' }, { i: 'plus', v: 1 }],
  green_colony:         [{ i: 'create' }],
  green_titan:          [{ i: 'plus', v: 1 }, { i: 'stack' }],
  green_seedling:       [],
  yellow_spark:         [{ i: 'friendly' }, { i: 'plus', v: 1 }],
  yellow_banner:        [{ i: 'row' }, { i: 'plus', v: 1 }],
  yellow_alchemist:     [{ i: 'freemix' }],
  yellow_champion:      [{ i: 'palette' }, { i: 'plus', v: 1 }],
  cyan_shield:          [{ i: 'hazard' }, { i: 'plus', v: 2 }],
  cyan_cleanser:        [{ i: 'cleanse' }],
  cyan_guardian:        [{ i: 'shield' }, { i: 'touch' }],
  cyan_mender:          [{ i: 'cleanse' }],
  cyan_keystone:        [{ i: 'cleanse' }, { i: 'touch' }],
  magenta_spark:        [{ i: 'mix' }, { i: 'draw' }],
  magenta_chain:        [{ i: 'mix' }, { i: 'plus', v: 2 }],
  magenta_echo:         [{ i: 'chain' }, { i: 'plus', v: 2 }],
  magenta_kaleidoscope: [{ i: 'palette' }, { i: 'freemix' }],
  black_voidling:       [{ i: 'mix' }, { i: 'plus', v: 3 }],
  black_devourer:       [{ i: 'destroy' }, { i: 'touch' }, { i: 'plus' }],
  black_eraser:         [{ i: 'enemy' }, { i: 'front' }, { i: 'minus', v: 3 }],
  black_singularity:    [{ i: 'chain' }, { i: 'plus', v: 2 }],
  black_ember:          [{ i: 'front' }, { i: 'plus', v: 2 }],
  magenta_lancer:       [{ i: 'enemy' }, { i: 'row' }, { i: 'minus', v: 4 }],
  cyan_bulwark:         [{ i: 'shield' }, { i: 'touch' }],
  green_hivemind:       [{ i: 'friendly' }, { i: 'plus', v: 1 }],
  yellow_multitude:     [{ i: 'friendly' }, { i: 'plus', v: 4 }],
  green_spore:          [{ i: 'create' }, { i: 'touch' }],
  red_colossus:         [{ i: 'friendly' }, { i: 'minus', v: 2 }],
  black_solitude:       [{ i: 'friendly' }, { i: 'plus', v: 4 }],
  blue_undertow:        [{ i: 'draw' }, { i: 'plus', v: 1 }],
  cyan_reservoir:       [{ i: 'draw' }, { i: 'stack' }, { i: 'plus', v: 3 }],
  magenta_crescendo:    [{ i: 'mix' }, { i: 'plus', v: 2 }],
  black_hermit:         [{ i: 'x2' }, { i: 'block' }],
  cyan_monolith:        [{ i: 'block' }, { i: 'plus', v: 3 }],
  green_burrower:       [{ i: 'stack' }, { i: 'friendly' }, { i: 'plus', v: 1 }],
  yellow_herald:        [{ i: 'stack' }, { i: 'palette' }, { i: 'plus', v: 2 }],
  cyan_footing:         [{ i: 'stack' }, { i: 'row' }],
  blue_archive:         [{ i: 'draw' }, { i: 'aura' }, { i: 'plus', v: 1 }],
  blue_hoard:           [{ i: 'draw' }, { i: 'plus', v: 2 }],
  cyan_reservoir:       [{ i: 'draw' }, { i: 'plus', v: 1 }],
  magenta_relay:        [{ i: 'chain' }, { i: 'plus', v: 2 }],
  black_wither:         [{ i: 'enemy' }, { i: 'minus', v: 2 }],
  blue_siphon:          [{ i: 'enemy' }, { i: 'row' }, { i: 'plus', v: 3 }],
  yellow_mosaic:        [{ i: 'palette' }, { i: 'plus', v: 2 }],
  yellow_pilgrim:       [{ i: 'palette' }, { i: 'touch' }],
  colorless_prismstone: [{ i: 'palette' }, { i: 'plus', v: 2 }],
  cyan_sanctum:         [{ i: 'shield' }, { i: 'plus', v: 3 }],
  green_bramblewall:    [{ i: 'shield' }, { i: 'row' }, { i: 'front' }],
  green_swarmling:      [{ i: 'friendly' }, { i: 'plus', v: 1 }],
  red_standard:         [{ i: 'palette' }, { i: 'plus', v: 3 }],
  blue_lens:            [{ i: 'palette' }, { i: 'plus', v: 1 }],
  green_banner_wide:    [{ i: 'palette' }, { i: 'plus', v: 2 }],
  red_ironhide:         [{ i: 'shield' }, { i: 'front' }],
  blue_bastion:         [{ i: 'shield' }, { i: 'row' }],
  green_ferment:        [{ i: 'chain' }, { i: 'plus', v: 2 }],
  green_broodmother:    [{ i: 'friendly' }, { i: 'aura' }, { i: 'plus', v: 1 }],
  red_warband:          [{ i: 'friendly' }, { i: 'plus', v: 2 }],
  yellow_conscript:     [{ i: 'row' }, { i: 'plus', v: 1 }],
  yellow_prismatic:     [{ i: 'palette' }, { i: 'plus', v: 2 }],
  cyan_covenant:        [{ i: 'palette' }, { i: 'plus', v: 3 }],
  magenta_harlequin:    [{ i: 'touch' }, { i: 'palette' }, { i: 'plus', v: 1 }],
  magenta_cascade:      [{ i: 'chain' }, { i: 'plus', v: 3 }],
  red_kindler:          [{ i: 'mix' }, { i: 'plus', v: 1 }],
  blue_conduit:         [{ i: 'mix' }, { i: 'draw', v: 1 }],
  red_harrier:          [{ i: 'enemy' }, { i: 'touch' }, { i: 'minus', v: 1 }],
  black_famine:         [{ i: 'enemy' }, { i: 'minus', v: 1 }],
  magenta_thief:        [{ i: 'enemy' }, { i: 'front' }, { i: 'minus', v: 2 }, { i: 'plus' }],
  cyan_anchor:          [{ i: 'front' }, { i: 'plus', v: 2 }],
  green_deeproot:       [{ i: 'row' }, { i: 'plus', v: 3 }],
  green_chorister:      [{ i: 'friendly' }, { i: 'draw' }],
  cyan_lattice:         [{ i: 'shield' }, { i: 'touch' }, { i: 'plus', v: 1 }],
  blue_cartographer:    [{ i: 'draw' }, { i: 'plus', v: 1 }],
  green_thicket:        [{ i: 'shield' }],
  magenta_recluse:      [{ i: 'shield' }, { i: 'block' }],
  yellow_oath:          [{ i: 'shield' }, { i: 'row' }, { i: 'front' }],
  blue_saboteur:        [{ i: 'enemy' }, { i: 'row' }, { i: 'minus', v: 1 }],
  yellow_arclight:      [{ i: 'enemy' }, { i: 'row' }, { i: 'minus', v: 2 }],
  red_javelin:          [{ i: 'enemy' }, { i: 'row' }, { i: 'minus', v: 2 }],
  black_shroud:         [{ i: 'enemy' }, { i: 'touch' }, { i: 'minus', v: 1 }],
  black_maw:            [{ i: 'enemy' }, { i: 'front' }, { i: 'minus', v: 2 }],
  black_obelisk:        [{ i: 'friendly' }, { i: 'plus', v: 1 }],
  black_gravebloom:     [{ i: 'touch' }, { i: 'block' }, { i: 'plus', v: 4 }],
  black_reclaimer:      [{ i: 'destroy' }, { i: 'block' }, { i: 'plus', v: 5 }],
  cyan_absolver:        [{ i: 'destroy' }, { i: 'block' }],
  overcharge:           [{ i: 'friendly' }, { i: 'plus', v: 3 }],
  catalyst:             [{ i: 'freemix' }, { i: 'plus', v: 2 }],
  spectrum_shift:       [{ i: 'palette' }],
  colorless_row:        [{ i: 'row' }, { i: 'colourless' }],
  scorched_row:         [{ i: 'row' }, { i: 'minus', v: 1 }],
  curse_husk:           [{ i: 'block' }],
  curse_idol:           [{ i: 'aura' }, { i: 'minus', v: 1 }],
  curse_pillar:         [{ i: 'row' }, { i: 'minus', v: 1 }],
  curse_beacon:         [{ i: 'enemy' }, { i: 'plus', v: 2 }],
  __mix__:              [{ i: 'mix' }, { i: 'touch' }]
};
export function iconsFor(id) { return CARD_ICONS[id] || []; }

/* ---- what an enemy does, as icons ----
   Derived from the enemy's own `mod` rather than written out by hand, so the
   icons cannot drift from the rules: change the number on a boss and its
   icon changes with it. Each entry carries a plain-language `t` used as the
   tooltip and in the glossary, which keeps one description doing both jobs. */
export function enemyIcons(key) {
  var e = ENEMIES[key];
  if (!e) return [];
  var m = e.mod || {}, out = [];
  if (m.colorBonus) {
    Object.keys(m.colorBonus).forEach(function (c) {
      out.push({ i: 'plus', v: m.colorBonus[c], colour: c,
        t: 'Its ' + COLORS[c].name + ' units are ' + m.colorBonus[c] + ' stronger.' });
    });
  }
  if (m.growth) out.push({ i: 'growth', v: m.growth,
    t: 'OVERGROWTH \u2014 every unit of its that survives a round comes back permanently ' +
       m.growth + ' stronger. Win early; a long fight favours it.' });
  if (m.supportPenalty) out.push({ i: 'support',
    t: 'SCORCHED LINE \u2014 your units behind the front count for half. Play wide, not deep.' });
  if (m.echoBestLane) out.push({ i: 'echoLane',
    t: 'UNDERTOW \u2014 it takes half the strength of whichever lane you invested in most, ' +
       'for its own frontline there. Spread out.' });
  if (m.taxDominantColor) out.push({ i: 'tax', v: m.taxDominantColor,
    t: 'EXPOSURE \u2014 whichever colour you field most loses ' + m.taxDominantColor +
       ' per unit. An even split is taxed nothing.' });
  if (m.echoMix) out.push({ i: 'echoMix',
    t: 'REFRACTION \u2014 every mix you land gives its strongest unit half that value. ' +
       'Mix small, or not at all.' });
  if (m.wardWeakLanes) out.push({ i: 'ward', v: m.wardWeakLanes,
    t: 'STILL WATER \u2014 it shields the ' + m.wardWeakLanes +
       ' lanes it is weakest in: your matchup bonus is cancelled there.' });
  if (m.punishColor) {
    Object.keys(m.punishColor).forEach(function (c) {
      out.push({ i: 'minus', v: m.punishColor[c], colour: c,
        t: 'JUDGEMENT \u2014 your ' + COLORS[c].name + ' units are ' + m.punishColor[c] +
           ' weaker here. It cannot be beaten with the dark alone.' });
    });
  }
  if (m.feedsOnCurses) out.push({ i: 'block', v: m.feedsOnCurses,
    t: 'THE CHOIR \u2014 it is ' + m.feedsOnCurses + ' stronger for every curse in your deck. ' +
       'What you carried here is what it is made of.' });
  if (m.plantsCurse) out.push({ i: 'hazard',
    t: 'It plants a curse on your board at the start of every round.' });
  if (m.sunderEachRound) out.push({ i: 'destroy', v: m.sunderEachRound,
    t: 'THE SUNDERING \u2014 the ground breaks further every round, on both halves.' });
  if (m.drainMultiplier) out.push({ i: 'minus', v: m.drainMultiplier,
    t: 'Your units bleed into the cracks ' + m.drainMultiplier + ' times as hard here.' });
  if (m.feedsOnFissures) out.push({ i: 'plus', v: m.feedsOnFissures,
    t: 'Its own units feed on the cracks instead of bleeding into them, ' +
       m.feedsOnFissures + ' per crack.' });
  if (m.spectrumReward) out.push({ i: 'palette', v: m.spectrumReward,
    t: 'Every colour you field beyond the second strengthens your whole line by ' +
       m.spectrumReward + '. Breadth is the answer, not bigger units.' });
  if (m.devourWeakest) out.push({ i: 'devour',
    t: 'It devours your weakest unit at the start of every round. Cheap bodies are food.' });
  if (m.rotatingColor) out.push({ i: 'rotate', v: m.rotatingColor,
    t: 'Each round it becomes a colour at random; its units of that colour are ' +
       m.rotatingColor + ' stronger.' });
  if (m.mixTokens && m.mixTokens > 1) out.push({ i: 'mixtoken', v: m.mixTokens,
    t: 'It mixes ' + m.mixTokens + ' times a round instead of once.' });
  if (m.punishEffective) out.push({ i: 'front', v: m.punishEffective,
    t: 'Every lane where you hold the effective matchup makes its frontline ' +
       m.punishEffective + ' stronger.' });
  return out;
}
/* The rank mark, shown before the rule icons. */
export function rankIcon(key) {
  var e = ENEMIES[key];
  if (!e || e.kind === 'normal') return null;
  return e.kind === 'boss'
    ? { i: 'boss', t: 'Act boss \u2014 beat it to end the act and choose your next road.' }
    : { i: 'elite', t: 'Elite \u2014 tougher than a normal fight, and always drops a relic.' };
}
/* Rank mark plus rules, as one row. Colour-tinted where the icon refers to a
   specific colour, so a glance tells you which colour is being buffed. */
export function enemyIconRow(key, cls) {
  var list = [], rank = rankIcon(key);
  if (rank) list.push(rank);
  list = list.concat(enemyIcons(key));
  if (!list.length) return '';
  return '<span class="iconrow enemy-icons">' + list.map(function (e) {
    var style = e.colour ? ' style="color:' + COLORS[e.colour].hex + '"' : '';
    return '<span class="ic" title="' + String(e.t || '').replace(/"/g, '&quot;') + '"' + style + '>' +
      glyphSvg(e.i, cls) + (e.v !== undefined ? '<i class="icn">' + e.v + '</i>' : '') + '</span>';
  }).join('') + '</span>';
}
export function glyphSvg(name, cls) {
  return '<svg class="' + (cls || 'glyph') + '" viewBox="-13 -13 26 26" aria-hidden="true"><path d="' +
    (GLYPHS[name] || '') + '"/></svg>';
}
/* A fused card inherits nothing, so it shows a fusion mark instead. */
export function iconRow(cardId, cls) {
  var d = CARDS[cardId];
  var list = iconsFor(cardId);
  if (!list.length && d && (d.fused || cardId === null)) list = [{ i: 'mix' }];
  if (!list.length) return '';
  return '<span class="iconrow">' + list.map(function (e) {
    return '<span class="ic">' + glyphSvg(e.i, cls) +
      (e.v !== undefined ? '<i class="icn">' + e.v + '</i>' : '') + '</span>';
  }).join('') + '</span>';
}

export var HAZARD_TEXT = { colorless: 'Colourless Row — no colour in this row', scorch: 'Scorched Row — 1 weaker in this row' };
/* bossOnly and secretOnly cards are excluded here, which keeps them out of
   rewards, shops, enemy decks and every random roll at once \u2014 DRAWABLE is
   the single source for all of them. The boss reward, and the secret-act
   trophy reward, each reach past it deliberately. */
export var DRAWABLE = Object.keys(CARDS).filter(function (k) {
  return !CARDS[k].token && !CARDS[k].curse && !CARDS[k].bossOnly && !CARDS[k].secretOnly;
});
export var BOSS_CARDS = Object.keys(CARDS).filter(function (k) { return CARDS[k].bossOnly; });
/* One road, one set of three — never rolled, never shared with the ordinary
   seven. Keyed by act so the reward code can look a road up directly rather
   than filtering the whole card table on every visit. */
export var SECRET_TROPHIES = {
  white: ['white_prism_crown', 'white_absolute_zero', 'white_last_verdict'],
  rot: ['rot_reliquary', 'rot_plague_herald', 'rot_undying_choir'],
  rift: ['rift_keystone', 'rift_bridgewalker', 'rift_the_widening']
};
export var CURSE_KEYS = Object.keys(CARDS).filter(function (k) { return CARDS[k].curse; });
export function cardsOfRarity(r) { return DRAWABLE.filter(function (k) { return CARDS[k].rarity === r; }); }

/* An upgraded card is +1 strength (units) or costs nothing extra (spells). */
export function cardStrength(entry) {
  var d = CARDS[entry.id];
  return d.strength + (entry.up && d.type === 'unit' ? 1 : 0);
}
export function cardName(entry) { return CARDS[entry.id].name + (entry.up ? '+' : ''); }

export var cardSeq = 0;
/* deckIndex ties a battle-instance card back to its exact slot in the
   persistent run.deck, so a permanent on-play buff can be written back to
   the run rather than just the disposable board copy. Only meaningful for
   the player's own run-sourced cards — tokens, test-harness cards, and
   the enemy's freshly-built deck all leave it undefined, which is exactly
   right: there's nothing in a persistent deck for them to write back to. */
export function makeCard(id, up, deckIndex) { return { uid: 'u' + (++cardSeq), id: id, up: !!up, deckIndex: deckIndex }; }

/* A permanent fusion mints a brand new card definition at runtime. It follows
   the same maths as mixing on the board — components combine, strengths add
   plus one, plus two if Black is involved — and, like a mixed unit, it carries
   no rules text. Registered outside DRAWABLE so it can never turn up in a shop. */
export var fusionSeq = 0;
/* ---- what a fusion inherits ----
   A fused card used to be silenced: pure numbers, no rules. That made fusing
   a stat-upgrade button rather than a build decision, and it is the whole
   reason a run collapsed toward the same pile of enormous Black Amalgams.
   Whatever you started as, fusing erased it.

   Now a fusion carries its parents' rules forward, so identity compounds down
   a chain instead of burning off at the first bench.

   Three effects is the ceiling. Past that a random one is dropped to make
   room, which keeps a long fusion chain from being strictly additive: late
   fusions are a trade, and which rule you lose is not yours to choose. */
export var FUSED_EFFECT_CAP = 3;

/* Hooks an inherited effect can carry. onPlay/targets are handled separately
   because they drive the targeting UI and cannot meaningfully run three times
   over; only the first inherited one is kept. */
export var INHERITED_HOOKS = ['passive', 'aura', 'rowAura', 'enemyAura', 'matchup',
                       'onMixConsumed', 'onMixConsumedChain', 'onFriendlyMix',
                       'fissure', 'mixBonus', 'guardsColour', 'drawsEachRound',
                       'swarmAura', 'enemyFieldAura', 'warded', 'wardsAdjacent',
                       'wardsWhenAlone', 'wardsRowWhenFront', 'wardsRow',
                       'wardsSelfWhenFront'];
/* Data-shaped effects, inherited by merging rather than by composing calls. */
export var INHERITED_DATA = ['enemyRowAura'];

export function hasAnyHook(d) {
  if (!d) return false;
  if (d.onPlay || d.targets) return true;
  return INHERITED_HOOKS.concat(INHERITED_DATA).some(function (h) { return d[h] !== undefined; });
}
/* The effect ids a card brings to a fusion: its own inherited list if it is
   already a fusion, otherwise itself when it actually does something. */
export function effectSourcesOf(cardId) {
  var d = CARDS[cardId];
  if (!d) return [];
  if (d.effectSources) return d.effectSources.slice();
  return hasAnyHook(d) ? [cardId] : [];
}

/* Compose inherited hooks onto a fused definition: numeric hooks sum, flags
   OR together, onPlay/targets take the first carrier. */
export function applyInheritedEffects(def, sources) {
  var defs = sources.map(function (k) { return CARDS[k]; }).filter(Boolean);
  /* Three shapes of hook, and mixing them up produces silent nonsense: a
     numeric one wrapped as a function ends up added to a strength as NaN, and
     a boolean flag turned into a function is always truthy. They are listed
     explicitly rather than inferred, so adding a hook forces the author to
     say which kind it is. */
  var FLAG_HOOKS = { guardsColour: 1, warded: 1, wardsAdjacent: 1, wardsWhenAlone: 1,
                     wardsRowWhenFront: 1, wardsRow: 1, wardsSelfWhenFront: 1,
                     enemyFieldAura: 1 };
  var NUMBER_HOOKS = { mixBonus: 1, drawsEachRound: 1, swarmAura: 1,
                        onMixConsumed: 1, onMixConsumedChain: 1 };
  INHERITED_HOOKS.forEach(function (hook) {
    var carriers = defs.filter(function (d) { return d[hook] !== undefined; });
    if (!carriers.length) return;
    if (FLAG_HOOKS[hook]) {
      def[hook] = carriers.some(function (d) { return d[hook]; });
      return;
    }
    if (NUMBER_HOOKS[hook]) {
      def[hook] = carriers.reduce(function (n, d) { return n + (d[hook] || 0); }, 0);
      return;
    }
    def[hook] = function () {
      var args = arguments, total = 0;
      carriers.forEach(function (d) {
        if (typeof d[hook] === 'function') total += d[hook].apply(null, args) || 0;
      });
      return total;
    };
  });
  INHERITED_DATA.forEach(function (hook) {
    var carriers = defs.filter(function (d) { return d[hook]; });
    if (!carriers.length) return;
    // same row: amounts add. Different rows: the first one wins.
    var first = carriers[0][hook];
    var total = carriers.reduce(function (n, d) {
      return d[hook].row === first.row ? n + (d[hook].amount || 0) : n;
    }, 0);
    def[hook] = { row: first.row, amount: total };
  });
  /* onPlay and targets compose too, and this is the one place the old code
     actually dropped an effect rather than merely under-describing it: it
     kept only the FIRST carrier with onPlay and discarded the rest, while
     `text` above already joins every source's line unconditionally. So a
     fusion of Blue Scout (draw a card) and Black Maw (damage a frontline)
     printed both sentences but only ever drew the card — the damage had no
     path left to run.

     The targeting UI already treats `targets` as one flat list: it prompts
     through `list[picks.length]` and hands the whole resolved `targets`
     array to a single `onPlay` call, with no idea how many specs belong to
     which effect. So the fix is to make that one call actually be many:
     concatenate every carrier's own targets in order, and close over how
     many entries each one owns so the composed onPlay can slice the
     resolved picks back apart and call each carrier with its own share. A
     carrier that takes no targets (like the draw) simply gets an empty
     slice, exactly as it would if played alone. */
  var acting = defs.filter(function (d) { return typeof d.onPlay === 'function'; });
  if (acting.length) {
    var mergedTargets = [];
    var shares = acting.map(function (d) {
      /* A spec's `ref` (e.g. "an empty tile touching the unit from step 0")
         is authored as an index into that CARD's own targets array. Simply
         concatenating arrays leaves those indices pointing at whatever
         landed in that slot globally, which is only correct by accident —
         put a second carrier ahead of this one and `ref: 0` now names a
         completely different card's pick. Offsetting by how many target
         slots the merge has already used keeps every ref pointing at the
         same pick it meant before the fusion existed. */
      var offset = mergedTargets.length;
      var own = (d.targets || []).map(function (spec) {
        return spec.ref === undefined ? spec : Object.assign({}, spec, { ref: spec.ref + offset });
      });
      mergedTargets = mergedTargets.concat(own);
      return { onPlay: d.onPlay, count: own.length };
    });
    if (mergedTargets.length) def.targets = mergedTargets;
    def.onPlay = function (g, side, at, t, api) {
      var picks = t || [], idx = 0, notes = [];
      shares.forEach(function (share) {
        var slice = picks.slice(idx, idx + share.count);
        idx += share.count;
        var note = share.onPlay(g, side, at, slice, api);
        if (note) notes.push(note);
      });
      return notes.join('; ');
    };
  }
  return def;
}

/* `forced` replays an exact effect list from a save. Once the cap starts
   biting a fusion is no longer deterministic, so the chosen list has to be
   recorded rather than recomputed on load. */
export function fuseCards(a, b, forced) {
  var da = CARDS[a.id], db = CARDS[b.id];
  var color = mixResultColor(da.color, db.color) || 'red';
  var bonus = (da.color === 'black' || db.color === 'black') ? 2 : 1;
  var strength = cardStrength(a) + cardStrength(b) + bonus;
  var id = 'fusion_' + (++fusionSeq);

  var sources;
  if (forced) sources = forced.slice();
  else {
    sources = effectSourcesOf(a.id).concat(effectSourcesOf(b.id));
    while (sources.length > FUSED_EFFECT_CAP) {
      sources.splice(Math.floor(Math.random() * sources.length), 1);
    }
  }

  var lines = sources.map(function (k) { return CARDS[k] && CARDS[k].text; }).filter(Boolean);
  var def = {
    name: COLORS[color].name + ' Amalgam', color: color, strength: strength,
    rarity: 'Fused', type: 'unit', cost: 40 + strength * 8, fused: true,
    effectSources: sources.slice(),
    text: lines.length ? lines.join(' ')
      : 'Fused from ' + da.name + ' and ' + db.name + '. No rules text.'
  };
  /* Only a fusion that inherited nothing stays silenced. One carrying rules is
     a real card and should be liftable by auras like any other — the silencing
     existed to justify free stats, and the stats are no longer free of
     anything. */
  if (!sources.length) def.silenced = true;
  CARDS[id] = applyInheritedEffects(def, sources);
  return { id: id, up: false, effectSources: sources.slice() };
}
export function fusePreview(a, b) {
  var da = CARDS[a.id], db = CARDS[b.id];
  var color = mixResultColor(da.color, db.color) || 'red';
  var bonus = (da.color === 'black' || db.color === 'black') ? 2 : 1;
  return { color: color, strength: cardStrength(a) + cardStrength(b) + bonus, bonus: bonus };
}
