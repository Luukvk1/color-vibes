/* Enemy and boss definitions, including the signature rule each act boss plays by. */

import { CARDS } from './cards.js';
import { CURSE_KEYS, DRAWABLE, makeCard } from './deck.js';

/* ===================================================================
   6. ENEMIES  (GDD §31-33)
   =================================================================== */
export var ENEMIES = {
  brawler:   { name: 'The Brawler', kind: 'normal', colors: ['red', 'green', 'yellow'],
    behaviour: 'Plays the biggest legal unit it can.', ai: { strength: 1.2, mix: 0.6 } },
  controller:{ name: 'The Controller', kind: 'normal', colors: ['blue', 'cyan', 'magenta'],
    behaviour: 'Goes after your strongest frontline.', ai: { strength: 1, mix: 0.9, disrupt: 1.4 } },
  cultist:   { name: 'The Cultist', kind: 'normal', colors: ['black', 'red', 'cyan'],
    behaviour: 'Feeds weak units into big Black ones.',
    ai: { strength: 1, mix: 1.5 } },
  alchemist: { name: 'The Alchemist', kind: 'normal', colors: ['yellow', 'magenta', 'green'],
    behaviour: 'Mixes at every opportunity.', ai: { strength: 0.9, mix: 2 } },
  prism:     { name: 'The Prism', kind: 'normal', colors: ['red', 'blue', 'green', 'yellow', 'cyan'],
    behaviour: 'Keeps a wide spread of colours on the board.', ai: { strength: 1, mix: 1, spread: 1.5 } },

  /* ---- Verdant Path ---- */
  bramble_warden: { name: 'The Bramble Warden', kind: 'elite', colors: ['green', 'cyan', 'blue'],
    behaviour: 'Its Green units are 2 stronger.',
    mod: { colorBonus: { green: 2 } }, ai: { strength: 1.1, mix: 0.8, spread: 1.1 } },
  verdant_crown: { name: 'The Verdant Crown', kind: 'boss', colors: ['green', 'cyan', 'yellow', 'blue'],
    behaviour: 'OVERGROWTH \u2014 every one of its units that survives a round comes back permanently 2 stronger. Take the first two rounds fast; a long fight is a lost one.',
    mod: { colorBonus: { green: 1 }, growth: 2 }, ai: { strength: 1.15, mix: 1.0, spread: 1.2 } },

  /* ---- Crimson Cliffs ---- */
  ash_marshal: { name: 'The Ash Marshal', kind: 'elite', colors: ['red', 'black', 'yellow'],
    behaviour: 'Its Red units are 2 stronger.',
    mod: { colorBonus: { red: 2 } }, ai: { strength: 1.35, mix: 0.7 } },
  cinder_tyrant: { name: 'The Cinder Tyrant', kind: 'boss', colors: ['red', 'black', 'magenta', 'yellow'],
    behaviour: 'SCORCHED LINE \u2014 only your front rank counts for full. Everything supporting from behind contributes half. Play wide, not deep.',
    mod: { colorBonus: { red: 1 }, supportPenalty: 0.5, mixTokens: 2 }, ai: { strength: 1.4, mix: 1.2 } },

  /* ---- Indigo Hollow ---- */
  tide_reader: { name: 'The Tide Reader', kind: 'elite', colors: ['blue', 'cyan', 'magenta'],
    behaviour: 'Its Blue units are 2 stronger.',
    mod: { colorBonus: { blue: 2 } }, ai: { strength: 0.9, mix: 1.0, spread: 1.3 } },
  drowned_archive: { name: 'The Drowned Archive', kind: 'boss', colors: ['blue', 'cyan', 'magenta', 'black'],
    behaviour: 'UNDERTOW \u2014 it reads whichever lane you have invested in most and takes half that lane\'s strength for its own frontline there. Spread evenly or feed it.',
    mod: { colorBonus: { blue: 1 }, echoBestLane: 0.5 }, ai: { strength: 0.95, mix: 1.15, spread: 1.6 } },

  /* ---- Radiant Grove ---- */
  gilded_herald: { name: 'The Gilded Herald', kind: 'elite', colors: ['yellow', 'green', 'red'],
    behaviour: 'Its Yellow units are 2 stronger.',
    mod: { colorBonus: { yellow: 2 } }, ai: { strength: 1.15, mix: 1.1, spread: 1.0 } },
  hollow_sun: { name: 'The Hollow Sun', kind: 'boss', colors: ['yellow', 'red', 'green', 'black'],
    behaviour: 'EXPOSURE \u2014 whichever colour you field most loses 2 per unit. Split your board evenly and the tax finds nothing to land on.',
    mod: { colorBonus: { yellow: 1 }, taxDominantColor: 2 }, ai: { strength: 1.3, mix: 1.2 } },

  /* ---- Amethyst Depths ---- */
  crystal_echo: { name: 'The Crystal Echo', kind: 'elite', colors: ['magenta', 'blue', 'red'],
    behaviour: 'Its Magenta units are 2 stronger.',
    mod: { colorBonus: { magenta: 2 } }, ai: { strength: 1.0, mix: 1.4, spread: 1.1 } },
  riven_prism: { name: 'The Riven Prism', kind: 'boss', colors: ['magenta', 'blue', 'red', 'cyan'],
    behaviour: 'REFRACTION \u2014 every mix you land is answered: its strongest unit gains half what you just made. Mix small, or win without mixing at all.',
    mod: { colorBonus: { magenta: 1 }, echoMix: 0.5 }, ai: { strength: 1.05, mix: 1.3, spread: 1.2 } },

  /* ---- Cerulean Pools ---- */
  still_warden: { name: 'The Still Warden', kind: 'elite', colors: ['cyan', 'blue', 'green'],
    behaviour: 'Its Cyan units are 2 stronger.',
    mod: { colorBonus: { cyan: 2 } }, ai: { strength: 0.95, mix: 0.9, spread: 1.2 } },
  glass_tide: { name: 'The Glass Tide', kind: 'boss', colors: ['cyan', 'blue', 'green', 'magenta'],
    behaviour: 'STILL WATER \u2014 it shields the two lanes it is weakest in: your matchup bonus is cancelled there. Your counters only pay off where it is already strong.',
    mod: { colorBonus: { cyan: 1 }, wardWeakLanes: 2 }, ai: { strength: 1.0, mix: 1.1, spread: 1.4 } },

  /* ---- Ashen Wastelands ---- */
  chromatic_knight: { name: 'The Chromatic Knight', kind: 'elite', colors: ['black', 'red', 'blue', 'green'],
    behaviour: 'Its Black units are 2 stronger.',
    mod: { colorBonus: { black: 2 } }, ai: { strength: 1.3, mix: 0.9 } },
  the_mixer: { name: 'The Mixer', kind: 'elite', colors: ['black', 'magenta', 'yellow', 'cyan'],
    behaviour: 'It mixes twice a round, and its Black units are 2 stronger.',
    mod: { colorBonus: { black: 2 }, mixTokens: 2 }, ai: { strength: 0.9, mix: 1.6 } },
  /* ---- The Unbroken Light (secret) ----
     Measured against real full-clear decks: a run deep enough to reach White
     carries a median of 4 Black cards, about 19% of the deck and up to 37%,
     while already fielding 6 distinct colours. So a boss that punished colour
     *breadth* would have been weakest against exactly the decks that get
     here — the Black-heavy ones field fewer colours, not more. Punishing
     Black directly is what actually bites the archetype the run converges on,
     and it asks the player to win with the colours they spent the whole game
     mixing away. */
  unbroken_light: { name: 'The Unbroken Light', kind: 'boss',
    colors: ['white', 'yellow', 'cyan', 'magenta'],
    behaviour: 'JUDGEMENT — your Black units are 5 weaker here, and every colour you field beyond the second strengthens your whole line by 1. It cannot be beaten with the dark alone.',
    mod: { punishColor: { black: 5 }, spectrumReward: 1 },
    ai: { strength: 1.3, mix: 1.3, spread: 1.4 } },

  /* ---- The Chorus Eternal (secret: rot) ----
     The curse road's boss turns your own accumulated rot into its engine. A
     player who qualifies for this act by definition carries curses, so the
     boss is guaranteed to have something to feed on \u2014 the question it asks is
     whether you cleaned house on the way here or just kept carrying. */
  the_chorus_eternal: { name: 'The Chorus Eternal', kind: 'boss',
    colors: ['black', 'magenta', 'cyan', 'red'],
    behaviour: 'THE CHOIR \u2014 it is 3 stronger for every curse in your deck, and plants one on your board at the start of each round. What you carried here is what it is made of.',
    mod: { feedsOnCurses: 3, plantsCurse: true },
    ai: { strength: 1.25, mix: 1.2, spread: 1.2 } },

  /* ---- The Long Crack (secret: rift) ----
     The fissure road's boss. Its own half is broken too, so it is genuinely
     playing the same handicap \u2014 the fight is about who exploits broken ground
     better, not about surviving a one-sided punishment. */
  the_long_crack: { name: 'The Long Crack', kind: 'boss',
    colors: ['cyan', 'blue', 'black', 'green'],
    behaviour: 'THE SUNDERING \u2014 the ground breaks further every round, on both halves. Your units bleed into the cracks twice as hard; it feeds on its own.',
    mod: { sunderEachRound: 1, drainMultiplier: 2, feedsOnFissures: 2 },
    ai: { strength: 1.15, mix: 1.1, spread: 1.45 } },

  spectrum: { name: 'The Spectrum', kind: 'boss', colors: ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'black'],
    behaviour: 'THE LAST COLOUR \u2014 each round it becomes a colour at random and its units of that colour are 2 stronger, and it devours your weakest unit as the round begins. Cheap bodies are food.',
    mod: { rotatingColor: 2, devourWeakest: true }, ai: { strength: 1.2, mix: 1.2, spread: 1.2 } }
};

/* Build an enemy deck from its colours. Quality is gated by how deep in the
   act we are: early enemies field commons only, uncommons appear from the
   middle, and rares are reserved for the elite onward. Without this gate a
   depth-1 enemy could open with two Rares against the starting deck. */
/* `power` is a run-wide level, not the node's depth inside its own act. Using
   the local depth meant an act-two opener fielded nothing but commons again,
   so the difficulty sawtoothed back down every time a new act began. */
/* How many cards the enemy brings. A flat DECK_SIZE meant the enemy was
   drawing from the same ten cards the player starts with, while the player's
   deck grew all run — so by the third round the enemy routinely had nothing
   left to play and the fight ended by default rather than by decision. It
   grows with power, and elites and bosses bring more still. */
export function enemyDeckSize(enemy, power) {
  var base = 14 + Math.floor(power / 6);
  if (enemy.kind === 'elite') base += 2;
  if (enemy.kind === 'boss') base += 4;
  return Math.min(26, base);
}

/* Curses in the enemy's deck used to be `min(3, floor(corruption/2))` — a
   step function with no randomness, so from the moment corruption hit 2 the
   enemy carried a curse in *every* fight, forever. Now it is a roll per slot,
   weighted by how cursed the player's own deck is: a player carrying one
   curse sees them rarely, a player carrying five sees them often. The world
   rots at the rate you rot it. */
export function enemyCurseCount(playerCurses, corruption, rnd) {
  var pressure = Math.min(0.42, (playerCurses || 0) * 0.07 + (corruption || 0) * 0.02);
  var curseCount = 0;
  for (var rollIndex = 0; rollIndex < 3; rollIndex++) if (rnd() < pressure) curseCount++;
  return curseCount;
}

/* Cards that turn curses to advantage. A normal foe almost never has them;
   elites and bosses do, and more of them deeper in. They are pointless
   without curses on the board, so the chance is also gated on there being
   some rot about. */
export var ENEMY_CURSE_TECH = ['black_gravebloom', 'black_reclaimer', 'cyan_absolver'];
export function curseTechChance(enemy, power, cursesInPlay) {
  if (!cursesInPlay) return 0;
  var base = enemy.kind === 'boss' ? 0.34 : enemy.kind === 'elite' ? 0.22 : 0.04;
  return Math.min(0.6, base + power * 0.006);
}

/* `actTraits` carries the road's own character into the deck build. On the
   rot road every enemy is a curse deck whether or not the player is cursed;
   on every other road that stays a roll. */
export function buildEnemyDeck(enemy, power, rnd, corruption, playerCurses, actTraits) {
  var traits = actTraits || {};
  var depth = power;
  var allowUncommon = depth >= 3, allowRare = depth >= 8;
  function allowed(cardId) {
    var rarity = CARDS[cardId].rarity;
    if (rarity === 'Rare') return allowRare;
    if (rarity === 'Uncommon') return allowUncommon;
    return true;
  }
  /* Situational cards are kept out of the generic roll and only ever added
     deliberately below. Otherwise the curse tech turned up in 63% of decks
     against a completely uncursed player — the ordinary pool was handing out
     the same cards the tech roll was supposed to be gating. */
  var SITUATIONAL = ENEMY_CURSE_TECH.concat(['black_riftwalker', 'black_chorus',
                                             'cyan_mender', 'cyan_keystone']);
  var pool = DRAWABLE.filter(function (cardId) {
    if (!allowed(cardId)) return false;
    if (SITUATIONAL.indexOf(cardId) !== -1) return false;
    var cardDef = CARDS[cardId];
    if (cardDef.type !== 'unit') return true;
    return enemy.colors.indexOf(cardDef.color) !== -1;
  });
  var units = pool.filter(function (cardId) { return CARDS[cardId].type === 'unit'; });
  var others = pool.filter(function (cardId) { return CARDS[cardId].type !== 'unit'; });
  if (!units.length) units = DRAWABLE.filter(function (cardId) { return CARDS[cardId].type === 'unit' && CARDS[cardId].rarity === 'Common'; });
  // Rarity is weighted even where it is allowed, so rares stay a spike not a staple.
  function pickFrom(cardIds) {
    var weights = { Common: 6, Uncommon: allowRare ? 3 : 4, Rare: 1 };
    for (var tries = 0; tries < 20; tries++) {
      var cardId = cardIds[Math.floor(rnd() * cardIds.length)];
      if (rnd() * 6 < weights[CARDS[cardId].rarity]) return cardId;
    }
    return cardIds[Math.floor(rnd() * cardIds.length)];
  }
  var deck = [], slotIndex;
  var upgradeChance = Math.min(0.55, Math.max(0, depth - 2) * 0.055);
  var size = enemyDeckSize(enemy, power);
  /* Once the world starts breaking, it breaks for everyone: the rot turns up in
     enemy decks too, and it lands on them exactly as it lands on you. */
  /* The Rotting Choir seeds every deck with rot regardless of how clean the
     player is: it is the road's whole identity, not a reaction to them. */
  var curseCount = traits.alwaysCurses
    ? 2 + (enemy.kind === 'boss' ? 2 : enemy.kind === 'elite' ? 1 : 0)
    : enemyCurseCount(playerCurses, corruption, rnd);
  for (slotIndex = 0; slotIndex < curseCount; slotIndex++) deck.push(makeCard(CURSE_KEYS[Math.floor(rnd() * CURSE_KEYS.length)], false));
  // an elite or boss that expects rot brings the tools to profit from it
  var techChance = traits.alwaysCurses ? 1
    : curseTechChance(enemy, power, curseCount + (playerCurses || 0));
  var tech = ENEMY_CURSE_TECH.filter(function (cardId) {
    return CARDS[cardId] && enemy.colors.indexOf(CARDS[cardId].color) !== -1;
  });
  if (tech.length && rnd() < techChance) {
    deck.push(makeCard(tech[Math.floor(rnd() * tech.length)], false));
    if (enemy.kind === 'boss' && rnd() < techChance) {
      deck.push(makeCard(tech[Math.floor(rnd() * tech.length)], false));
    }
  }
  for (slotIndex = deck.length; slotIndex < size; slotIndex++) {
    var pickPool = (rnd() < 0.8 || !others.length) ? units : others;
    deck.push(makeCard(pickFrom(pickPool), rnd() < upgradeChance));
  }
  return deck;
}
