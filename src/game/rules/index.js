/* The rules engine's public surface.
   Assembles the sections beside it into one object. Everything here is pure
   data and functions: no DOM, no storage, no state of its own. */

import { COLORLESS, COLORS, COLOR_KEYS, EFFECTIVE, SECONDARY_COLORS, colorInfo, isEffective, isSecondary, mixAllowed, mixColor, mixResultColor } from './colors.js';
import { ACT_REQUIREMENT, ACT_REQUIREMENT_BY_COLOR, DECK_SIZE, EDGE_GEO, ENEMY, FISSURE_CONCENTRATES, FISSURE_DRAIN, FISSURE_MAX_POWER, GEO, HAND_LIMIT, LANE_CANDIDATES, LANE_COUNT, OPENING_HAND, PLAYER, PRIMARY_COLORS, RELIC_LIMIT, ROUND_DRAW, ROWS, ROW_INFO, VIEWBOX, actUnlocked, adjacentTiles, adjacentTilesFor, boardTopo, bridgePairs, bridgeableLinks, colourCounts, edgeKey, fissurePower, fissuresTouching, laneMembersFor, lanesOf, lanesOfFor, requirementFor, sameTile, seamOf, severableLinks, sharedCorner } from './board-shape.js';
import { canPlace, cloneBoard, cloneHazards, eachUnit, emptyBoard, emptyHazards, freeHazardRows, hazardsOnRow, legalTiles, otherSide, placeOpts, rowHasHazard, sideName, slotName, splitStrength, unitAt } from './primitives.js';
import { CARDS, plantCurse } from './cards.js';
import { BOSS_CARDS, CURSE_KEYS, DRAWABLE, FUSED_EFFECT_CAP, HAZARD_TEXT, SECRET_TROPHIES, cardName, cardStrength, cardsOfRarity, effectSourcesOf, fuseCards, fusePreview, makeCard } from './deck.js';
import { RELICS, RELIC_KEYS, hasRelic } from './relics.js';
import { ENEMIES, ENEMY_CURSE_TECH, buildEnemyDeck, curseTechChance, enemyCurseCount, enemyDeckSize } from './enemies.js';
import { decideRound, evaluateBoard } from './evaluation.js';

const rules = {
  COLORS: COLORS, COLOR_KEYS: COLOR_KEYS, COLORLESS: COLORLESS, EFFECTIVE: EFFECTIVE,
  isEffective: isEffective, colorInfo: colorInfo, mixColor: mixColor,
  mixAllowed: mixAllowed, mixResultColor: mixResultColor,
  FUSED_EFFECT_CAP: FUSED_EFFECT_CAP, effectSourcesOf: effectSourcesOf,
  isSecondary: isSecondary, SECONDARY_COLORS: SECONDARY_COLORS,
  ROW_INFO: ROW_INFO, ROWS: ROWS, PLAYER: PLAYER, ENEMY: ENEMY, LANE_COUNT: LANE_COUNT,
  HAND_LIMIT: HAND_LIMIT, OPENING_HAND: OPENING_HAND, DECK_SIZE: DECK_SIZE,
  ROUND_DRAW: ROUND_DRAW, RELIC_LIMIT: RELIC_LIMIT,
  ACT_REQUIREMENT: ACT_REQUIREMENT, PRIMARY_COLORS: PRIMARY_COLORS,
  ACT_REQUIREMENT_BY_COLOR: ACT_REQUIREMENT_BY_COLOR, requirementFor: requirementFor,
  colourCounts: colourCounts, actUnlocked: actUnlocked,
  adjacentTiles: adjacentTiles, lanesOf: lanesOf, LANE_CANDIDATES: LANE_CANDIDATES,
  boardTopo: boardTopo, severSet: boardTopo, lanesOfFor: lanesOfFor, laneMembersFor: laneMembersFor,
  bridgeableLinks: bridgeableLinks, bridgePairs: bridgePairs, fissurePower: fissurePower,
  FISSURE_MAX_POWER: FISSURE_MAX_POWER, sameTile: sameTile,
  FISSURE_CONCENTRATES: FISSURE_CONCENTRATES,
  severableLinks: severableLinks, adjacentTilesFor: adjacentTilesFor,
  edgeKey: edgeKey, fissuresTouching: fissuresTouching, FISSURE_DRAIN: FISSURE_DRAIN,
  plantCurse: plantCurse,
  GEO: GEO, VIEWBOX: VIEWBOX, EDGE_GEO: EDGE_GEO, seamOf: seamOf, sharedCorner: sharedCorner,
  emptyBoard: emptyBoard, emptyHazards: emptyHazards, cloneBoard: cloneBoard, cloneHazards: cloneHazards,
  otherSide: otherSide, unitAt: unitAt, sideName: sideName, slotName: slotName, eachUnit: eachUnit,
  canPlace: canPlace, legalTiles: legalTiles, placeOpts: placeOpts, splitStrength: splitStrength,
  hazardsOnRow: hazardsOnRow, rowHasHazard: rowHasHazard, freeHazardRows: freeHazardRows,
  CARDS: CARDS, HAZARD_TEXT: HAZARD_TEXT, DRAWABLE: DRAWABLE, BOSS_CARDS: BOSS_CARDS,
  SECRET_TROPHIES: SECRET_TROPHIES,
  cardsOfRarity: cardsOfRarity,
  cardStrength: cardStrength, cardName: cardName, makeCard: makeCard,
  CURSE_KEYS: CURSE_KEYS, fuseCards: fuseCards, fusePreview: fusePreview,
  RELICS: RELICS, RELIC_KEYS: RELIC_KEYS, hasRelic: hasRelic,
  ENEMIES: ENEMIES, buildEnemyDeck: buildEnemyDeck, enemyDeckSize: enemyDeckSize,
  NEEDS_CURSES_IDS: ENEMY_CURSE_TECH,
  enemyCurseCount: enemyCurseCount, curseTechChance: curseTechChance,
  evaluateBoard: evaluateBoard, decideRound: decideRound
};

export default rules;
