/* Entry point: the one place the three layers meet.

   game/     the rules and everything the player decides. Knows nothing else.
   session/  localStorage. Knows nothing else.
   view/     what the player sees and touches. Imports game/.

   main.js loads what the session saved, hands it to the game, and from then on
   writes the game's snapshot back whenever the game says something changed. */

import * as game from './game/index.js';
import * as session from './session/index.js';
import { mount, render, selfTest } from './view/index.js';

var saved = session.load();
game.loadCodex(saved.codex);
game.start(saved.run);
game.subscribe(function (type) { if (type === 'change') session.save(game.snapshot()); });

mount();

// The console, the browser tests and the self-test suite reach the game from here.
window.ColorVibes = { game: game, session: session, selfTest: selfTest, render: render, core: game.rules };
