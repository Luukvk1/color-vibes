// Builds the deployable site into build/. Bundles and minifies src/ with
// esbuild, keeping the self-test suite as its own chunk (it is dynamically
// imported on demand, not shipped with the initial page — see
// src/view/menu.js), and copies the static files alongside it unchanged.
import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const OUT = 'build';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: true,
  sourcemap: true,
  outdir: `${OUT}/src`,
});

await build({
  entryPoints: ['styles/game.css'],
  minify: true,
  outdir: `${OUT}/styles`,
});

cpSync('index.html', `${OUT}/index.html`);
cpSync('.nojekyll', `${OUT}/.nojekyll`);
cpSync('assets/art', `${OUT}/assets/art`, { recursive: true });

console.log(`built ${OUT}/`);
