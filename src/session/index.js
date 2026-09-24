/* Session storage: the only place that touches localStorage.

   It knows nothing about the game. It reads what the game handed it last time
   and writes what the game hands it now, and every failure ends in "nothing
   saved" rather than an error: a save from an older build must never be able to
   brick the game, and storage that is private, full or missing only means the
   run will not persist. Deciding whether what it loaded still makes sense for
   this version of the game is the game's job (restoreRun). */

var RUN_KEY = 'colorvibes.run.v1';
var CODEX_KEY = 'colorvibes.codex.v1';
var SANDBOX_PREFIX = 'sandbox.';
var sandboxed = false;

/* While the self-test suite drives the game it saves and loads like a player
   would; pointed here it does so somewhere the player's own save is not. */
export function sandbox(on) { sandboxed = !!on; }
/* Where the run is stored right now; the self-test forges corrupt saves there. */
export function storageKey() { return keyFor(RUN_KEY); }
function keyFor(key) { return (sandboxed ? SANDBOX_PREFIX : '') + key; }

function read(key) {
  try {
    var raw = window.localStorage.getItem(keyFor(key));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function write(key, value) {
  try { window.localStorage.setItem(keyFor(key), JSON.stringify(value)); } catch (e) { /* the game still plays */ }
}

/* Everything saved, as the game will want it: { run, codex }, each null if there
   is nothing usable. The run is only unwrapped from its version envelope here,
   never inspected. */
export function load() {
  var runData = read(RUN_KEY), codexData = read(CODEX_KEY);
  return {
    run: runData && runData.v === 1 && runData.run ? runData.run : null,
    codex: codexData && codexData.cards && codexData.foes ? codexData : null
  };
}

/* Takes a game snapshot: { run, codex }. Whatever is null is left as it was. */
export function save(snapshot) {
  if (snapshot.run) write(RUN_KEY, { v: 1, run: snapshot.run });
  if (snapshot.codex) write(CODEX_KEY, snapshot.codex);
}

export function clear() {
  try {
    window.localStorage.removeItem(keyFor(RUN_KEY));
    window.localStorage.removeItem(keyFor(CODEX_KEY));
  } catch (e) { /* nothing to clear */ }
}
