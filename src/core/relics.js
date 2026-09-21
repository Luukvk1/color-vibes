/* Colour Vibes — generated from the single-file build by build/split.py.
   Edit color-vibes-act1.html, then re-run the script. */

/* Run-long modifiers. Each is a small rule the rest of the engine asks about by
   key, rather than a special case spread through the code. */

/* ===================================================================
   5. RELICS  (GDD §29)
   =================================================================== */
export var RELICS = {
  prism_core:       { name: 'Prism Core', rarity: 'Uncommon', cost: 90,  text: 'The first mix each round makes the result 2 stronger.' },
  double_rainbow:   { name: 'Double Rainbow', rarity: 'Rare', cost: 130, text: 'The first Free Mix each round counts as 3 links in the chain.' },
  color_lens:       { name: 'Colour Lens', rarity: 'Common', cost: 80,   text: 'Your strongest effective lane scores x2.5 instead of x2.' },
  stable_fusion:    { name: 'Stable Fusion', rarity: 'Uncommon', cost: 100, text: 'Mixing adds 2 instead of 1.' },
  volatile_fusion:  { name: 'Volatile Fusion', rarity: 'Rare', cost: 140, text: 'Your first mix each round sets off a Free Mix, and every third link after that does too.' },
  chromatic_memory: { name: 'Chromatic Memory', rarity: 'Uncommon', cost: 95, text: 'When a unit changes colour it gains a quarter of its strength for the round.' },
  empty_palette:    { name: 'Empty Palette', rarity: 'Rare', cost: 120,  text: 'A colourless frontline scores x1.25 instead of x1.' },
  heavy_brush:      { name: 'Heavy Brush', rarity: 'Common', cost: 70,   text: 'Units gain +1 permanently when placed in Row 3.' },
  glass_cannon:     { name: 'Glass Cannon', rarity: 'Uncommon', cost: 90, text: 'Your frontline units are 1 stronger, but lose 2 each time they are damaged.' },
  recycling_bin:    { name: 'Recycling Bin', rarity: 'Common', cost: 65,  text: 'Draw one extra card at the start of every round.' },
  echo_chamber:     { name: 'Echo Chamber', rarity: 'Rare', cost: 115,   text: 'The first card that draws a card each round draws one more.' },
  wild_palette:     { name: 'Wild Palette', rarity: 'Rare', cost: 125,   text: 'Once per battle, repaint any unit for free without using your turn.' },
  black_paint:      { name: 'Black Paint', rarity: 'Uncommon', cost: 95, text: 'Whenever a unit becomes Black it gains 3 strength for the round.' },
  collectors_frame: { name: "Collector's Frame", rarity: 'Common', cost: 75, text: 'Card rewards offer one extra choice.' },
  /* Draw payoffs. Deep Pockets is the archetype's keystone: it makes a small
     deck strictly better rather than merely tidier, which is what turns
     thinning from good discipline into an actual build. */
  deep_pockets:     { name: 'Deep Pockets', rarity: 'Rare', cost: 135,  text: 'Draw one extra card each round for every 5 cards below 25 your deck holds.' },
  open_ledger:      { name: 'The Open Ledger', rarity: 'Uncommon', cost: 100, text: 'Your opening hand is 2 cards larger.' },
  quick_study:      { name: 'Quick Study', rarity: 'Uncommon', cost: 95, text: 'The first unit you play each round draws a card.' },
  /* The keystone for every cheap-unit build. Row minimums were the reason
     swarm and coverage decks played a smaller board than everyone else; this
     hands them the other five tiles. */
  field_commission: { name: 'Field Commission', rarity: 'Rare', cost: 140, text: 'Your units may stand in any row, whatever their strength.' }
};
export var RELIC_KEYS = Object.keys(RELICS);
export function hasRelic(relics, key) { return relics.indexOf(key) !== -1; }
