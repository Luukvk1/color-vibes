/* Colour identity and the mixing wheel.
   Which colours exist, what beats what, and the subtractive rules that decide what
   two colours make when mixed. */

export var SVG_NS = 'http://www.w3.org/2000/svg';


/* ===================================================================
   1. COLOURS
   =================================================================== */
export var R = 4, G = 2, B = 1;
export var COLORS = {
  red:     { key: 'red',     name: 'Red',     bits: R,         hex: '#e04a3c', ink: '#ffffff' },
  green:   { key: 'green',   name: 'Green',   bits: G,         hex: '#43a94c', ink: '#ffffff' },
  blue:    { key: 'blue',    name: 'Blue',    bits: B,         hex: '#3d76d4', ink: '#ffffff' },
  yellow:  { key: 'yellow',  name: 'Yellow',  bits: R | G,     hex: '#e8c334', ink: '#241d05' },
  cyan:    { key: 'cyan',    name: 'Cyan',    bits: G | B,     hex: '#3ec6cf', ink: '#052220' },
  magenta: { key: 'magenta', name: 'Magenta', bits: R | B,     hex: '#c451b5', ink: '#ffffff' },
  black:   { key: 'black',   name: 'Black',   bits: R | G | B, hex: '#25252b', ink: '#f2ece0' },
  /* White has no bits and is deliberately absent from COLOR_KEYS: it is not a
     mixable colour, it is what the wheel looks like from outside. Present
     only so the secret act has a palette to draw chips and art from. */
  white:   { key: 'white',   name: 'White',   bits: 0,         hex: '#efe9dd', ink: '#241f18' }
};
export var COLOR_KEYS = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'black'];
export var COLORLESS = { key: null, name: 'Colourless', hex: '#6f6a60', ink: '#12100d' };
export var BITS_TO_COLOR = {};
COLOR_KEYS.forEach(function (k) { BITS_TO_COLOR[COLORS[k].bits] = k; });

export var EFFECTIVE = {
  red:     ['magenta', 'yellow', 'green'],
  blue:    ['magenta', 'black', 'red'],
  green:   ['blue', 'yellow', 'black'],
  yellow:  ['blue', 'cyan', 'magenta'],
  cyan:    ['red', 'blue', 'green'],
  magenta: ['black', 'cyan', 'green'],
  black:   ['red', 'yellow', 'cyan']
};
export function isEffective(a, d) { return !!a && !!d && EFFECTIVE[a].indexOf(d) !== -1; }
export function colorInfo(k) { return k ? COLORS[k] : COLORLESS; }
export function mixColor(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return BITS_TO_COLOR[COLORS[a].bits | COLORS[b].bits];
}

export var SECONDARY_COLORS = ['yellow', 'cyan', 'magenta'];
export function isSecondary(c) { return SECONDARY_COLORS.indexOf(c) !== -1; }

/* Black is made from two secondaries, and only from two secondaries — but a
   mix is never refused for it. By raw bits Black is simply R|G|B, so Yellow
   plus Blue reached it just as readily as Yellow plus Cyan, in one fusion
   instead of two. Refusing that mix outright was the first fix, and it was
   the wrong shape: a player mid-battle who reached for a mix and got a wall
   of text back learns to stop reaching for mixes, and mixing is supposed to
   stay a live tactical option at all times.

   So instead the mix still happens, and mixAllowed governs what it becomes.
   Two secondaries — or anything touching a unit that is already Black —
   really does produce Black; that path is untouched. Everything else that
   would have hit Black by raw bits (a secondary and the one primary it does
   not already contain) resolves to the secondary itself instead, added
   together and stronger. Nothing is lost by attempting it. */
export function mixAllowed(a, b) {
  var res = mixColor(a, b);
  if (res !== 'black') return true;
  if (a === 'black' || b === 'black') return true;
  return isSecondary(a) && isSecondary(b);
}
/* The colour a real mix event actually produces. mixColor is the pure bits
   union and stays that way for anything that just wants to classify a pair;
   this is the one call-site every mix, fusion and preview should use to
   decide what lands on the board. */
export function mixResultColor(a, b) {
  var raw = mixColor(a, b);
  if (raw !== 'black') return raw;
  if (mixAllowed(a, b)) return raw;
  // exactly one side is a secondary in every blocked case — that one wins
  return isSecondary(a) ? a : b;
}
