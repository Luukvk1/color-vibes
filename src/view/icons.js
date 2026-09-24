/* The glyph vocabulary cards are read by.
   Deliberately tiny so it can be learned once and read at a glance; the full prose
   still lives in the card detail overlay. */

import { rules } from '../game/index.js';

var COLORS = rules.COLORS, CARDS = rules.CARDS, ENEMIES = rules.ENEMIES;


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
export function iconsFor(cardId) { return CARD_ICONS[cardId] || []; }

/* ---- what an enemy does, as icons ----
   Derived from the enemy's own `mod` rather than written out by hand, so the
   icons cannot drift from the rules: change the number on a boss and its
   icon changes with it. Each entry carries a plain-language `t` used as the
   tooltip and in the glossary, which keeps one description doing both jobs. */
export function enemyIcons(enemyKey) {
  var enemyDef = ENEMIES[enemyKey];
  if (!enemyDef) return [];
  var mod = enemyDef.mod || {}, icons = [];
  if (mod.colorBonus) {
    Object.keys(mod.colorBonus).forEach(function (colorKey) {
      icons.push({ i: 'plus', v: mod.colorBonus[colorKey], colour: colorKey,
        t: 'Its ' + COLORS[colorKey].name + ' units are ' + mod.colorBonus[colorKey] + ' stronger.' });
    });
  }
  if (mod.growth) icons.push({ i: 'growth', v: mod.growth,
    t: 'OVERGROWTH \u2014 every unit of its that survives a round comes back permanently ' +
       mod.growth + ' stronger. Win early; a long fight favours it.' });
  if (mod.supportPenalty) icons.push({ i: 'support',
    t: 'SCORCHED LINE \u2014 your units behind the front count for half. Play wide, not deep.' });
  if (mod.echoBestLane) icons.push({ i: 'echoLane',
    t: 'UNDERTOW \u2014 it takes half the strength of whichever lane you invested in most, ' +
       'for its own frontline there. Spread out.' });
  if (mod.taxDominantColor) icons.push({ i: 'tax', v: mod.taxDominantColor,
    t: 'EXPOSURE \u2014 whichever colour you field most loses ' + mod.taxDominantColor +
       ' per unit. An even split is taxed nothing.' });
  if (mod.echoMix) icons.push({ i: 'echoMix',
    t: 'REFRACTION \u2014 every mix you land gives its strongest unit half that value. ' +
       'Mix small, or not at all.' });
  if (mod.wardWeakLanes) icons.push({ i: 'ward', v: mod.wardWeakLanes,
    t: 'STILL WATER \u2014 it shields the ' + mod.wardWeakLanes +
       ' lanes it is weakest in: your matchup bonus is cancelled there.' });
  if (mod.punishColor) {
    Object.keys(mod.punishColor).forEach(function (colorKey) {
      icons.push({ i: 'minus', v: mod.punishColor[colorKey], colour: colorKey,
        t: 'JUDGEMENT \u2014 your ' + COLORS[colorKey].name + ' units are ' + mod.punishColor[colorKey] +
           ' weaker here. It cannot be beaten with the dark alone.' });
    });
  }
  if (mod.feedsOnCurses) icons.push({ i: 'block', v: mod.feedsOnCurses,
    t: 'THE CHOIR \u2014 it is ' + mod.feedsOnCurses + ' stronger for every curse in your deck. ' +
       'What you carried here is what it is made of.' });
  if (mod.plantsCurse) icons.push({ i: 'hazard',
    t: 'It plants a curse on your board at the start of every round.' });
  if (mod.sunderEachRound) icons.push({ i: 'destroy', v: mod.sunderEachRound,
    t: 'THE SUNDERING \u2014 the ground breaks further every round, on both halves.' });
  if (mod.drainMultiplier) icons.push({ i: 'minus', v: mod.drainMultiplier,
    t: 'Your units bleed into the cracks ' + mod.drainMultiplier + ' times as hard here.' });
  if (mod.feedsOnFissures) icons.push({ i: 'plus', v: mod.feedsOnFissures,
    t: 'Its own units feed on the cracks instead of bleeding into them, ' +
       mod.feedsOnFissures + ' per crack.' });
  if (mod.spectrumReward) icons.push({ i: 'palette', v: mod.spectrumReward,
    t: 'Every colour you field beyond the second strengthens your whole line by ' +
       mod.spectrumReward + '. Breadth is the answer, not bigger units.' });
  if (mod.devourWeakest) icons.push({ i: 'devour',
    t: 'It devours your weakest unit at the start of every round. Cheap bodies are food.' });
  if (mod.rotatingColor) icons.push({ i: 'rotate', v: mod.rotatingColor,
    t: 'Each round it becomes a colour at random; its units of that colour are ' +
       mod.rotatingColor + ' stronger.' });
  if (mod.mixTokens && mod.mixTokens > 1) icons.push({ i: 'mixtoken', v: mod.mixTokens,
    t: 'It mixes ' + mod.mixTokens + ' times a round instead of once.' });
  if (mod.punishEffective) icons.push({ i: 'front', v: mod.punishEffective,
    t: 'Every lane where you hold the effective matchup makes its frontline ' +
       mod.punishEffective + ' stronger.' });
  return icons;
}
/* The rank mark, shown before the rule icons. */
export function rankIcon(enemyKey) {
  var enemyDef = ENEMIES[enemyKey];
  if (!enemyDef || enemyDef.kind === 'normal') return null;
  return enemyDef.kind === 'boss'
    ? { i: 'boss', t: 'Act boss \u2014 beat it to end the act and choose your next road.' }
    : { i: 'elite', t: 'Elite \u2014 tougher than a normal fight, and always drops a relic.' };
}
/* Rank mark plus rules, as one row. Colour-tinted where the icon refers to a
   specific colour, so a glance tells you which colour is being buffed. */
export function enemyIconRow(enemyKey, cls) {
  var icons = [], rank = rankIcon(enemyKey);
  if (rank) icons.push(rank);
  icons = icons.concat(enemyIcons(enemyKey));
  if (!icons.length) return '';
  return '<span class="iconrow enemy-icons">' + icons.map(function (icon) {
    var style = icon.colour ? ' style="color:' + COLORS[icon.colour].hex + '"' : '';
    return '<span class="ic" title="' + String(icon.t || '').replace(/"/g, '&quot;') + '"' + style + '>' +
      glyphSvg(icon.i, cls) + (icon.v !== undefined ? '<i class="icn">' + icon.v + '</i>' : '') + '</span>';
  }).join('') + '</span>';
}
export function glyphSvg(name, cls) {
  return '<svg class="' + (cls || 'glyph') + '" viewBox="-13 -13 26 26" aria-hidden="true"><path d="' +
    (GLYPHS[name] || '') + '"/></svg>';
}
/* A fused card inherits nothing, so it shows a fusion mark instead. */
export function iconRow(cardId, cls) {
  var cardDef = CARDS[cardId];
  var icons = iconsFor(cardId);
  if (!icons.length && cardDef && (cardDef.fused || cardId === null)) icons = [{ i: 'mix' }];
  if (!icons.length) return '';
  return '<span class="iconrow">' + icons.map(function (icon) {
    return '<span class="ic">' + glyphSvg(icon.i, cls) +
      (icon.v !== undefined ? '<i class="icn">' + icon.v + '</i>' : '') + '</span>';
  }).join('') + '</span>';
}