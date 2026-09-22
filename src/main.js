/* Entry point.

   The three layers import each other in dependency order, so importing the
   battle layer pulls run/ and core/ in behind it. The battle module starts
   itself once the DOM is ready; this file exists so the page has one obvious
   thing to load, and so anything about being a web page rather than about the
   game has somewhere to live. */

import './battle/index.js';

if (!window.CV_CORE || !window.CV_RUN || !window.CV_BATTLE) {
  console.error('Colour Vibes: a module failed to load — check the paths under src/.');
}
