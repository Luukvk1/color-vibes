/* Just enough of a browser for the parts of the code that ask for one.

   The game never does. The self-test suite's save round-trip checks go through
   the session, which reads localStorage, so give it a small in-memory one. Any
   check that wants a real page (`document`, layout) will throw without it and be
   reported as needing a browser. */

var memory = {};
globalThis.window = globalThis.window || {
  localStorage: {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
    setItem: function (key, value) { memory[key] = String(value); },
    removeItem: function (key) { delete memory[key]; }
  }
};
