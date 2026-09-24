/* The acts: every road is a colour, with its own elites, boss and rules. */


/* ===================================================================
   RUN / MAP  (GDD §25, §38)
   =================================================================== */
export var NORMAL_ENEMIES = ['brawler', 'controller', 'cultist', 'alchemist', 'prism'];

/* ===================================================================
   ACTS
   Every act is a colour. Its theme, its road, its elites and its boss all
   belong to that colour, so the ring around a node on the map and the room
   you are standing in tell you the same thing. Reaching an act means holding
   its colour in your deck; the primaries are free because you start with
   them, and everything past them has to come out of the Colour Lab.
   =================================================================== */
export var ACTS = {
  green: {
    key: 'green', color: 'green', name: 'The Verdant Path',
    blurb: 'Everything here grows, and none of it grows alone.',
    normals: ['brawler', 'alchemist', 'prism', 'controller'],
    elite: 'bramble_warden', boss: 'verdant_crown'
  },
  red: {
    key: 'red', color: 'red', name: 'The Crimson Cliffs',
    blurb: 'Nothing on this road is interested in a long game.',
    normals: ['brawler', 'cultist', 'prism', 'alchemist'],
    elite: 'ash_marshal', boss: 'cinder_tyrant'
  },
  blue: {
    key: 'blue', color: 'blue', name: 'The Indigo Hollow',
    blurb: 'Everything down here is already three moves ahead of you.',
    normals: ['controller', 'prism', 'alchemist', 'brawler'],
    elite: 'tide_reader', boss: 'drowned_archive'
  },
  yellow: {
    key: 'yellow', color: 'yellow', name: 'The Radiant Grove',
    blurb: 'The light is generous, and it is not on your side.',
    normals: ['brawler', 'alchemist', 'prism', 'cultist'],
    elite: 'gilded_herald', boss: 'hollow_sun'
  },
  magenta: {
    key: 'magenta', color: 'magenta', name: 'The Amethyst Depths',
    blurb: 'Every strike here lands twice, and the second one is worse.',
    normals: ['alchemist', 'controller', 'prism', 'cultist'],
    elite: 'crystal_echo', boss: 'riven_prism'
  },
  cyan: {
    key: 'cyan', color: 'cyan', name: 'The Cerulean Pools',
    blurb: 'Nothing moves here, and nothing you do to it seems to stick.',
    normals: ['controller', 'prism', 'brawler', 'alchemist'],
    elite: 'still_warden', boss: 'glass_tide'
  },
  black: {
    key: 'black', color: 'black', name: 'The Ashen Wastelands',
    blurb: 'Every colour you ever made ends up here, drained.',
    normals: ['cultist', 'prism', 'alchemist', 'controller'],
    /* The last road is the only one that fields two different elites, so the
       two orphaned designs both get a home and the run's final act is the one
       place you cannot predict which elite is waiting. */
    elite: ['chromatic_knight', 'the_mixer'], boss: 'spectrum'
  },
  /* ---- secret ----
     White is not on the wheel and cannot be mixed: in a subtractive system
     there is no recipe for it. It is reached by having walked everything
     else, which makes it a coverage prize rather than an accumulation one —
     the only road you earn by breadth instead of by depth. Kept out of
     ACT_KEYS so it never appears in an ordinary fork, never counts toward a
     full clear, and never shows up in the roads glossary until it is met. */
  white: {
    key: 'white', color: 'white', name: 'The Unbroken Light', secret: true,
    blurb: 'Everything you drained away is still here, and it remembers.',
    normals: ['prism', 'alchemist', 'controller', 'brawler'],
    elite: ['chromatic_knight', 'the_mixer'], boss: 'unbroken_light'
  },
  /* Two more roads that are not on the wheel. Where White is earned by
     breadth, these are earned by what a run did to itself: the rot it
     accumulated, and the ground it broke. Neither is a colour, so neither can
     be mixed toward — you qualify by having lived a certain way. */
  rot: {
    key: 'rot', color: 'black', name: 'The Rotting Choir', secret: true,
    blurb: 'Everything you were given and could not put down is singing here.',
    normals: ['cultist', 'alchemist', 'prism', 'controller'],
    elite: ['ash_marshal', 'crystal_echo'], boss: 'the_chorus_eternal',
    /* Every enemy on this road plays the curse game, so the tech roll is
       forced rather than chanced and the decks are seeded with rot. */
    alwaysCurses: true
  },
  rift: {
    key: 'rift', color: 'cyan', name: 'The Sundered Ground', secret: true,
    blurb: 'The ground here was broken long before you arrived, and it is still going.',
    normals: ['controller', 'brawler', 'prism', 'cultist'],
    elite: ['tide_reader', 'bramble_warden'], boss: 'the_long_crack',
    /* The enemy's half is broken too — the only road where it is. */
    alwaysFissures: true
  }
};

/* Every act is built. Secret acts (the Dimensional Drift ending) are not
   listed here — they are not reached through the colour gate. */
export var ACT_PLANNED = {};

/* An act may name one elite or several; a map picks per node. */
export function eliteFor(act, rnd) {
  var elite = act.elite;
  if (!Array.isArray(elite)) return elite;
  return elite[Math.floor(rnd() * elite.length)];
}

export function elitesOf(act) { return Array.isArray(act.elite) ? act.elite : [act.elite]; }

/* ACT_KEYS is the seven roads of the wheel. Secret acts are deliberately
   excluded: every gate, fork, glossary count and full-clear check reads this
   list, so leaving White out of it means none of them need to know it
   exists. */
export var ACT_KEYS = Object.keys(ACTS).filter(function (key) { return !ACTS[key].secret; });

export var SECRET_ACT_KEYS = Object.keys(ACTS).filter(function (key) { return ACTS[key].secret; });

export var ACT_LENGTH = 13;          // nodes per act; every act is the same length
