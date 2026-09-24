/* Words and pictures the interface owns: how each road announces itself, why a
   secret road opened, and the painting behind each room. */


/* An act is behind you. What comes next depends entirely on the deck you
   built inside it — which is the whole point of gating acts by colour rather
   than marching through them in a fixed order. */
/* ---- how a road announced itself ----
   One line per act, written into the codex the first time that act becomes
   reachable. Deliberately oblique: it should read as a memory of the moment
   the colour turned into a place, not as an instruction for repeating it. The
   requirement is never named — a player who wants the rule can infer it from
   their own deck, and a player who does not still gets the sense that the
   world responded to something they made. */
export var ACT_OMENS = {
  red:     'You carried Red from the first hour; it was never something you had to earn. Something was already burning at the edge of the map, and it did not need an invitation.',
  green:   'You carried Green from the first hour. The first shoot came up through the floorboards while you slept, and by morning there was a road.',
  blue:    'You carried Blue from the first hour. The water in the flasks began leaning the same way, all of them, toward somewhere below.',
  yellow:  'Red met Green on the bench and the mixture would not stop giving off light. The residue crept off the table and became a grove.',
  cyan:    'Green met Blue and the room went quiet all at once \u2014 and the quiet turned out to have a floor you could stand on.',
  magenta: 'Red met Blue and did not stop ringing. The sound cut a stair down into the rock.',
  /* Black names its parents in the plural on purpose: two secondaries, never
     a secondary and a primary. The line is the only place the rule is stated
     anywhere in the game. */
  black:   'You fused one made colour into another \u2014 two mixtures, each already a mixture \u2014 and what came out had no colour left in it at all. It knew the way to you before you finished.'
};

/* Why each secret road opened, in the player's own terms. Shown on the card
   so a run that qualified for two or three can see which of its own habits
   earned which door. */
export var SECRET_REASON = {
  white: 'Every road of the wheel is behind you, and that is the only thing that opens this one.',
  rot:   'You are still carrying what the labs gave you. It has been following.',
  rift:  'You broke the ground this many times. Something down there kept count.'
};

/* The room you are standing in is the act you are in. Each theme carries its
   own painting plus the seam fraction that tells the battle screen where the
   eyes sit in it, so the art keeps lining up with the enemy's cards. */
/* seam  = where the watching eyes sit, as a fraction of image height.
   dim   = extra veil, scaled off how bright the painting's floor is. The
           board's grid is drawn in one colour across every act, so a room lit
           like an afternoon has to be pulled down or the grid stops reading.
           Measured floor luminance: blue 16, magenta 21, red 23, green 26,
           yellow 55 — only the Grove is an outlier, and only it is dimmed. */
export var ACT_ART = {
  green:   { varName: '--art-green',   w: 840, h: 1297, seam: 0.186, dim: 0 },
  red:     { varName: '--art-red',     w: 728, h: 1176, seam: 0.227, dim: 0 },
  blue:    { varName: '--art-blue',    w: 728, h: 1260, seam: 0.258, dim: 0 },
  yellow:  { varName: '--art-yellow',  w: 784, h: 1260, seam: 0.257, dim: 0.72 },
  magenta: { varName: '--art-magenta', w: 784, h: 1260, seam: 0.262, dim: 0 },
  cyan:    { varName: '--art-cyan',    w: 756, h: 1260, seam: 0.263, dim: 0 },
  /* The Wastelands are the one room with nothing watching from the dark, so
     the eyes are drawn rather than painted — see .room-eyes. They sit exactly
     where every other act's eyes sit, because the aligner pins the seam to
     the same point on screen regardless of which painting is behind it. */
  black:   { varName: '--art-black',   w: 784, h: 1204, seam: 0.255, dim: 0.12,
             drawEyes: true },
  /* Each secret road now has its own painting. None of the three had a watcher
     painted in, so all three draw their eyes — but each draws a different kind,
     keyed to what the road is about. See .room-eyes for the variants.

     The White terrace is lit like noon, so it carries a heavier veil for the
     same reason the Radiant Grove does. */
  white:   { varName: '--art-white',   w: 728, h: 1004, seam: 0.397, dim: 0.52,
             drawEyes: true, eyeStyle: 'unblinking' },
  rot:     { varName: '--art-rot',     w: 728, h: 1078, seam: 0.402, dim: 0.10,
             drawEyes: true, eyeStyle: 'choir' },
  rift:    { varName: '--art-rift',    w: 728, h: 1186, seam: 0.337, dim: 0.24,
             drawEyes: true, eyeStyle: 'sundered' }
};
