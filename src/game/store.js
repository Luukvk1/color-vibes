/* The state holder, and how the engine talks to whoever is listening.

   One mutable object rather than a handful of module variables, because an ES
   module cannot reassign a binding it exports: `store.run = ...` can be done
   from any file. Nothing outside src/game reads or writes it directly except
   through the game's public surface.

   The engine never calls the interface or the session. It changes state and
   says what happened; the view and the session subscribe. 'change' fires once
   when an action has finished, so a listener always sees a settled state. The
   rest ('log', 'fx', 'announce', 'passPuck', 'fissure') are one-off happenings
   a picture of the state could not show. */

import { codex } from './codex.js';

export var store = {
  run: null,            // the run in progress
  state: null,          // the battle in progress, or null between battles
  rnd: Math.random,     // every roll in the game goes through this, so a test can seed it
  log: [],              // the battle log, newest first
  checkpoint: null,     // the run as text, the last time it was standing still
  scaffold: true        // a run that exists only so there is something behind the title screen
};

export function getBattleState() { return store.state; }
export function getActiveRun() { return store.run; }
export function getState() { return store.state; }
export function getRun() { return store.run; }
export function setState(newState) { store.state = newState; }
export function setRun(newRun) { store.run = newRun; }
export function getLog() { return store.log; }
export function getRnd() { return store.rnd; }
export function setRnd(newRnd) { store.rnd = newRnd; }

var listeners = [];
export function subscribe(listener) {
  listeners.push(listener);
  return function () { var at = listeners.indexOf(listener); if (at !== -1) listeners.splice(at, 1); };
}
export function emit(type, payload) {
  listeners.slice().forEach(function (listener) { listener(type, payload); });
}

/* The run is worth keeping at every point where it is standing still — a map,
   a shop, a fork in the road — and never mid-battle. A battle is a single
   sitting: quit in the middle of one and you come back to the map with that
   node still unspent, which costs you the fight but never the run. Saving a
   half-resolved board would mean serialising a live battle state that holds
   references into the map and the fissure list, and getting that subtly wrong
   corrupts a run in ways that only show up hours later.

   The engine keeps that moment itself, as text. Whatever wants it on disk asks
   for a snapshot(); resuming reads it back from here, not from anywhere else.
   A scaffolding run — the one behind the title screen on a fresh install — is
   never kept, or Continue would offer a run nobody played. */
function settled() { return !!store.run && !store.run.pvp && store.run.screen !== 'battle'; }

var actionDepth = 0;
/* Wraps an entry point. Actions call each other freely; only the outermost one
   announces the result. */
export function act(action) {
  return function () {
    actionDepth++;
    try { return action.apply(this, arguments); }
    finally {
      if (--actionDepth === 0) {
        if (settled() && !store.scaffold) store.checkpoint = JSON.stringify(store.run);
        emit('change');
      }
    }
  };
}

/* What is worth persisting right now: the last settled run (or null) and the
   codex, which outlives every run. */
export function snapshot() {
  return { run: store.checkpoint && !store.scaffold ? JSON.parse(store.checkpoint) : null, codex: codex };
}
export function hasCheckpoint() { return !!store.checkpoint && !store.scaffold; }
