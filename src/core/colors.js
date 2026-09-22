/* Colour identity and the mixing wheel.
   Which colours exist, what beats what, and the subtractive rules that decide what
   two colours make when mixed. */

export var SVG_NS = 'http://www.w3.org/2000/svg';


/* ===================================================================
   1. COLOURS
   =================================================================== */
/* The three primaries as bit flags, so a secondary is just its two
   primaries OR'd together (e.g. yellow = RED_BIT | GREEN_BIT) and mixing
   two colours together is a single bitwise OR — see mixColor below. */
export var RED_BIT = 4, GREEN_BIT = 2, BLUE_BIT = 1;
export var COLORS = {
  red:     { key: 'red',     name: 'Red',     bits: RED_BIT,                       hex: '#e04a3c', ink: '#ffffff' },
  green:   { key: 'green',   name: 'Green',   bits: GREEN_BIT,                     hex: '#43a94c', ink: '#ffffff' },
  blue:    { key: 'blue',    name: 'Blue',    bits: BLUE_BIT,                      hex: '#3d76d4', ink: '#ffffff' },
  yellow:  { key: 'yellow',  name: 'Yellow',  bits: RED_BIT | GREEN_BIT,           hex: '#e8c334', ink: '#241d05' },
  cyan:    { key: 'cyan',    name: 'Cyan',    bits: GREEN_BIT | BLUE_BIT,          hex: '#3ec6cf', ink: '#052220' },
  magenta: { key: 'magenta', name: 'Magenta', bits: RED_BIT | BLUE_BIT,            hex: '#c451b5', ink: '#ffffff' },
  black:   { key: 'black',   name: 'Black',   bits: RED_BIT | GREEN_BIT | BLUE_BIT, hex: '#25252b', ink: '#f2ece0' },
  /* White has no bits and is deliberately absent from COLOR_KEYS: it is not a
     mixable colour, it is what the wheel looks like from outside. Present
     only so the secret act has a palette to draw chips and art from. */
  white:   { key: 'white',   name: 'White',   bits: 0,         hex: '#efe9dd', ink: '#241f18' }
};
export var COLOR_KEYS = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'black'];
export var COLORLESS = { key: null, name: 'Colourless', hex: '#6f6a60', ink: '#12100d' };
export var BITS_TO_COLOR = {};
COLOR_KEYS.forEach(function (colorKey) { BITS_TO_COLOR[COLORS[colorKey].bits] = colorKey; });

export var EFFECTIVE = {
  red:     ['magenta', 'yellow', 'green'],
  blue:    ['magenta', 'black', 'red'],
  green:   ['blue', 'yellow', 'black'],
  yellow:  ['blue', 'cyan', 'magenta'],
  cyan:    ['red', 'blue', 'green'],
  magenta: ['black', 'cyan', 'green'],
  black:   ['red', 'yellow', 'cyan']
};
export function isEffective(attackerColor, defenderColor) {
  return !!attackerColor && !!defenderColor && EFFECTIVE[attackerColor].indexOf(defenderColor) !== -1;
}
export function colorInfo(colorKey) { return colorKey ? COLORS[colorKey] : COLORLESS; }
/* The pure bits union of two colours — what mixing them adds up to, with no
   regard for the mixAllowed exception below. Anything that just wants to
   classify a pair (not produce a real mix event) should call this. */
export function mixColor(colorA, colorB) {
  if (!colorA && !colorB) return null;
  if (!colorA) return colorB;
  if (!colorB) return colorA;
  return BITS_TO_COLOR[COLORS[colorA].bits | COLORS[colorB].bits];
}

export var SECONDARY_COLORS = ['yellow', 'cyan', 'magenta'];
export function isSecondary(colorKey) { return SECONDARY_COLORS.indexOf(colorKey) !== -1; }

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
export function mixAllowed(colorA, colorB) {
  var mixedColor = mixColor(colorA, colorB);
  if (mixedColor !== 'black') return true;
  if (colorA === 'black' || colorB === 'black') return true;
  return isSecondary(colorA) && isSecondary(colorB);
}
/* The colour a real mix event actually produces. mixColor is the pure bits
   union and stays that way for anything that just wants to classify a pair;
   this is the one call-site every mix, fusion and preview should use to
   decide what lands on the board. */
export function mixResultColor(colorA, colorB) {
  var rawColor = mixColor(colorA, colorB);
  if (rawColor !== 'black') return rawColor;
  if (mixAllowed(colorA, colorB)) return rawColor;
  // exactly one side is a secondary in every blocked case — that one wins
  return isSecondary(colorA) ? colorA : colorB;
}
