/* The game: rules, run, battle and everything the player decides, with no idea
   what a screen is or where a save goes.

   This file is its whole public surface. The view, the tests and main.js import
   from here and nowhere deeper. Every entry point that changes something is an
   action: it does its work and then announces once through subscribe(), so a
   listener — the view, or whatever persists snapshot() — always sees a
   settled state.

   Startup, in order: loadCodex(saved.codex), start(saved.run). Nothing here
   ever reads or writes storage itself. */

export { default as rules } from './rules/index.js';
export { SAFE_LEAD, aiSkill, concedeBonus, decideOpponentMove, decisionDelay, laneShapedDelta, reservePrice, shapedLead, spendCost } from './battle/ai.js';
export { applyMix, buildApi, canMix, doMixCascade, drawInto, evalCtx, fireFriendlyMix, mixOptions, simGame } from './battle/engine.js';
export { REWIND, addInstability, canRewind, markRewindPoint, onRewind, restoreRewind, rewindChunk, rewindImpact, snapshotForRewind, spawnFissure } from './battle/rewind.js';
export { EASE_IN_BATTLES, addLog, clearFrontlines, depthBonusFor, easeInHand, flushCurses, newBattle, resetChain, shuffle, tileKey } from './battle/setup.js';
export { autoTargets, currentTargetOptions, legalTargets, pendingSpec, resolveCard } from './battle/targeting.js';
export { advanceTarget, beginPlay, beginWild, cancelPending, cancelSelection, clearInspection, continueBattle, endBattle, finishPlay, inspectHazard, nextRound, onMixToggle, onPass, onTileActivate, opponentAct, opponentMove, opponentThink, pass, performMix, resolveRound, runOpponentMove, selectCard } from './battle/turns.js';
export { DRAFT, MODES, PVP, canTakeSeat, draftCardsMissing, pvpChooseMode, pvpDraftPick, pvpSetPlayerName, coloursOf, copyLimit, deckProblems, enterPvp, leavePvp, needsHandoff, pvpAddCard, pvpBan, pvpConfirmDeck, pvpContinue, pvpPool, pvpRematch, pvpRemoveCard, pvpReady, pvpResetSwaps, pvpSetName, pvpSwap, takeSeat } from './pvp.js';
export { codex, codexCounts, discoverCard, discoverFoe, loadCodex } from './codex.js';
export { ACTS, ACT_KEYS, ACT_LENGTH, ACT_PLANNED, NORMAL_ENEMIES, SECRET_ACT_KEYS, eliteFor, elitesOf } from './content/acts.js';
export { EVENTS, chooseEventOption, cutEventCard, rollEvent } from './run/events.js';
export { RIFT_THRESHOLD, ROT_THRESHOLD, advance, allActsConquered, beginAct, beginBattle, currentNodes, curseCount, eligibleActs, endAsVictory, enterNode, finishAct, gainCurse, goEndless, newGame, newRun, noteActOmens, powerAt, restoreRun, resume, riftUnlocked, rotUnlocked, secretOffers, show, start, startingDeck, whiteUnlocked } from './run/flow.js';
export { LAB_SCENARIOS, applyVolatile, boostUnit, confirmFusion, curseRisk, deckUnits, recolourPalette, rollLab, toggleLabPick, volatilePress } from './run/lab.js';
export { MAP_COLS, buildMap, carveVolatileBranch } from './run/map.js';
export { fuseInDeck, liftStrength, recolourCard, replayMints } from './run/mints.js';
export { NEEDS_CURSES, NEEDS_FISSURES, NEEDS_HAZARDS, offerableCards, rarityWeights, rollReward, situationalOk, skipReward, skipValue, takeRewardCard, takeRewardRelic } from './run/rewards.js';
export { SHOP_REMOVAL_LIMIT, burnShopCard, buyShopCard, buyShopRelic, removalCost, removalsLeft, rollShop, shopRelicPrice, toggleShopRemoval } from './run/shop.js';
export { act, emit, getActiveRun, getBattleState, getLog, getRnd, getRun, getState, hasCheckpoint, setRnd, setRun, setState, snapshot, store, subscribe } from './store.js';
export { bestFrontlineLane, closeTutorial, dismissTutorial, findTeachingMix, inFirstBattle, lessonApplies, playerCanAct, setTutorial, shouldTeach, teach, teachNow, tutorial, tutorialActive, tutorialOpen } from './tutorial.js';
