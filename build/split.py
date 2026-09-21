#!/usr/bin/env python3
"""
Split the single-file build into a browser-ready ES-module project.

The monolith was the right shape while the game was being designed: one file,
no build step, runs from a double-click. It is the wrong shape to hand to other
people. Every painting is inlined as base64, so a browser downloads ~1.4MB of
art before it can draw anything, and the whole rules engine, run manager and
battle renderer share one 12,000-line file that cannot be reviewed, diffed or
replaced in pieces.

This is a transformation of the monolith rather than a hand-split copy, so the
single file stays the source of truth and can be re-split at any time without
the two versions drifting apart.

The split follows the code's own architecture. The three IIFEs are already a
clean three-layer separation and become three module directories:

    core/    the rules   - colours, board geometry, cards, relics, enemies and
                           the evaluation pipeline that scores a board. Pure:
                           it never touches the DOM or run state.
    run/     the session - acts, map, rewards, shops, labs, saving.
    battle/  the table   - rendering, input, opponent AI, turn flow.

core/ splits further along its own numbered sections, which form a forward-only
dependency chain, so each becomes a real ES module whose imports are computed
from that chain rather than guessed.

run/ and battle/ stay one file each. Both are built around shared mutable state
that every section reassigns (`run` alone is read 388 times), and an ES module
cannot reassign an imported binding -- splitting them means routing ~700
references through a state holder, a real refactor that does not belong in the
same change as "make it shareable". battle/ does give up its 3,500-line
self-test suite, which is one self-contained function and lifts out cleanly.
"""
import base64
import os
import re
import shutil
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else 'color-vibes-act1.html'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'colour-vibes'

src = open(SRC, encoding='utf-8').read()

# Clear only what this script generates. Deleting the whole target would take
# the repository -- README, .git, and the script's own copy of itself -- with it
# the first time someone regenerates the tree in place.
for d in ('src', 'styles', os.path.join('assets', 'art')):
    if os.path.isdir(os.path.join(OUT, d)):
        shutil.rmtree(os.path.join(OUT, d))
for d in ('styles', 'assets/art', 'src/core', 'src/run', 'src/battle'):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

BANNER = ('/* Colour Vibes — generated from the single-file build by build/split.py.\n'
          '   Edit color-vibes-act1.html, then re-run the script. */\n')

# ---------------------------------------------------------------- structure
style_open, style_close = src.index('<style>'), src.index('</style>')
script_open, script_close = src.index('<script>'), src.index('</script>')

head = src[:style_open]
css = src[style_open + len('<style>'):style_close]
markup = src[style_close + len('</style>'):script_open]
js = src[script_open + len('<script>'):script_close]

# ---------------------------------------------------------------- the art
# Each painting sits in a CSS custom property as a base64 data url. Pulling
# them out is the single biggest win: it takes the initial download from ~2.6MB
# to a few hundred KB, lets the browser cache each room separately, and makes
# the art reviewable and replaceable as ordinary files.
extracted = []


def write_art(m):
    name, fmt, payload = m.group(1), m.group(2), m.group(3)
    ext = 'jpg' if fmt == 'jpeg' else fmt
    filename = '%s.%s' % (name, ext)
    data = base64.b64decode(payload)
    with open(os.path.join(OUT, 'assets', 'art', filename), 'wb') as fh:
        fh.write(data)
    extracted.append((filename, len(data)))
    return "--art-%s:url('../assets/art/%s');" % (name, filename)   # relative to styles/


css = re.sub(r"--art-([a-z]+):url\('data:image/(jpeg|png);base64,([^']+)'\);", write_art, css)
with open(os.path.join(OUT, 'styles', 'game.css'), 'w', encoding='utf-8') as fh:
    fh.write(BANNER + css.strip() + '\n')

# ---------------------------------------------------------------- module bodies
lines = js.split('\n')
opens = [i for i, l in enumerate(lines) if l.startswith('(function (global) {')]
closes = [i for i, l in enumerate(lines) if l.startswith('})(window);')]
assert len(opens) == 3 and len(closes) == 3, 'expected exactly three IIFE modules'


def clean(body):
    """Strip IIFE scaffolding and dedent one level.

    Safe to dedent: the source has no multi-line template literals and no
    backslash line-continuations, so no string's contents can shift.
    """
    out = [l[2:] if l.startswith('  ') else l
           for l in body if l.strip() != "'use strict';"]
    while out and not out[0].strip():
        out.pop(0)
    while out and not out[-1].strip():
        out.pop()
    return out


core = clean(lines[opens[0] + 1:closes[0]])
run_body = clean(lines[opens[1] + 1:closes[1]])
bat_body = clean(lines[opens[2] + 1:closes[2]])


def blank(text):
    """Blank out comments and string bodies, keeping every line and column.

    Both the declaration scan and the reference scan run on this rather than on
    the raw source, so prose can never be mistaken for code -- a comment reading
    "always reachable, never need the Lab" otherwise parses as a second
    declarator called `never`.
    """
    out, i, n = [], 0, len(text)
    # A `/` starts a regex only where a value cannot already have ended -- after
    # an operator, a comma, an opening bracket or a keyword. Without this,
    # `.replace(/"/g, '&quot;')` reads as a stray quote and every string after it
    # is mis-paired.
    prev_tok = ''

    def regex_here():
        if not prev_tok:
            return True
        if prev_tok in '(,=:[!&|?{};+-*%~^<>':
            return True
        return prev_tok in ('return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void')

    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ''
        if c == '/' and nxt not in '/*' and regex_here():
            j, cls = i + 1, False
            while j < n and text[j] != '\n':
                ch = text[j]
                if ch == '\\':
                    j += 2
                    continue
                if ch == '[':
                    cls = True
                elif ch == ']':
                    cls = False
                elif ch == '/' and not cls:
                    break
                j += 1
            if j < n and text[j] == '/':
                j += 1
                while j < n and text[j].isalpha():   # flags
                    j += 1
                out.append(' ' * (j - i))
                prev_tok = ')'                       # a regex is a value
                i = j
                continue
        if c == '/' and nxt == '/':
            j = text.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i))
            i = j
        elif c == '/' and nxt == '*':
            j = text.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(''.join(ch if ch == '\n' else ' ' for ch in text[i:j]))
            i = j
        elif c in '\'"`':
            j = i + 1
            while j < n and text[j] != c:
                j += 2 if text[j] == '\\' else 1
            j = min(j + 1, n)
            out.append(c + ''.join(ch if ch == '\n' else ' ' for ch in text[i + 1:j - 1]) + c)
            prev_tok = c
            i = j
        else:
            out.append(c)
            if not c.isspace():
                prev_tok = (prev_tok + c) if (c.isalnum() or c == '_') and \
                    (prev_tok[-1:].isalnum() or prev_tok[-1:] == '_') else c
            i += 1
    return ''.join(out)


def retoken(text, old, new):
    """Rename an identifier in code only, leaving comments and strings alone."""
    code, out, last = blank(text), [], 0
    for m in re.finditer(r'(?<![\w.$])%s(?![\w$])' % re.escape(old), code):
        out.append(text[last:m.start()])
        out.append(new)
        last = m.end()
    out.append(text[last:])
    return ''.join(out)


def top_level_names(text):
    """Every symbol a chunk declares at top level, incl. `var a = 1, b = 2`."""
    text = blank(text)
    names = [m.group(1) for m in re.finditer(r'^function\s+(\w+)', text, re.M)]
    for m in re.finditer(r'^var\s+', text, re.M):
        # Walk the declaration to its terminating `;` at bracket depth 0, so a
        # `var` spanning several lines yields every declarator it introduces.
        i, depth, buf = m.end(), 0, ''
        while i < len(text):
            ch = text[i]
            if ch in '([{':
                depth += 1
            elif ch in ')]}':
                depth -= 1
            if depth == 0 and ch in ',;':
                nm = re.match(r'\s*(\w+)', buf)
                if nm:
                    names.append(nm.group(1))
                buf = ''
                if ch == ';':
                    break
            else:
                buf += ch
            i += 1
    return names


# ---------------------------------------------------------------- core split
CORE_TITLES = [
    ('colors',      '1. COLOURS'),
    ('board-shape', '2. BOARD SHAPE'),
    ('primitives',  '3. PRIMITIVES'),
    ('cards',       '4. CARDS'),
    ('card-icons',  'EFFECT ICONS'),
    ('relics',      '5. RELICS  (GDD §29)'),
    ('enemies',     '6. ENEMIES  (GDD §31-33)'),
    ('evaluation',  '7. EVALUATION  (stages A-G, now relic and enemy aware)'),
]
CORE_ORDER = [k for k, _ in CORE_TITLES]

starts = {}
for i, l in enumerate(core):
    t = l.strip()
    for key, title in CORE_TITLES:
        if t == title and key not in starts:
            starts[key] = i - 1          # the /* ===== line above the title
missing = [k for k in CORE_ORDER if k not in starts]
assert not missing, 'core sections not found: %s' % missing

export_start = next(i for i, l in enumerate(core) if l.startswith('global.CV_CORE ='))
ranges = {}
for n, key in enumerate(CORE_ORDER):
    ranges[key] = (starts[key],
                   starts[CORE_ORDER[n + 1]] if n + 1 < len(CORE_ORDER) else export_start)

preamble = '\n'.join(core[:starts[CORE_ORDER[0]]])
texts = {k: '\n'.join(core[a:b]) for k, (a, b) in ranges.items()}

# Fold the small shared preamble into the first section file.
texts[CORE_ORDER[0]] = (preamble + '\n\n' + texts[CORE_ORDER[0]]) if preamble.strip() \
    else texts[CORE_ORDER[0]]

declared, clashes = {}, []
for key in CORE_ORDER:
    for nm in top_level_names(texts[key]):
        if nm in declared and declared[nm] != key:
            clashes.append((nm, declared[nm], key))
        declared.setdefault(nm, key)
# A name declared in two sections would become both a local `var` and an import
# in the second file -- a duplicate binding, and a SyntaxError. Catch it here
# rather than in the browser.
assert not clashes, 'name declared in two core sections: %s' % clashes

code = {k: blank(v) for k, v in texts.items()}
imports = {k: {} for k in CORE_ORDER}
for key in CORE_ORDER:
    for nm in sorted(set(re.findall(r'(?<![\w.$])([A-Za-z_]\w*)', code[key]))):
        home = declared.get(nm)
        if home and home != key:
            imports[key].setdefault(home, set()).add(nm)

CORE_DOC = {
    'colors': "Colour identity and the mixing wheel.\nWhich colours exist, what beats what, and"
              " the subtractive rules that decide what\ntwo colours make when mixed.",
    'board-shape': "The board's geometry.\nEighteen triangular tiles: which touch, which lanes"
                   " they belong to, and the SVG\ncoordinates each is drawn at. Pure maths —"
                   " no game state.",
    'primitives': "Small operations every other file needs: reading a unit off the board,"
                  "\nwalking a side, placement legality, and building a card instance.",
    'cards': "Every card in the game.\nA card is data plus optional hooks (passive, aura, onPlay,"
             " …) that the evaluation\npipeline and the battle loop call at the right moment.",
    'card-icons': "The glyph vocabulary cards are read by.\nDeliberately tiny so it can be learned"
                  " once and read at a glance; the full prose\nstill lives in the card detail overlay.",
    'relics': "Run-long modifiers. Each is a small rule the rest of the engine asks about by"
              "\nkey, rather than a special case spread through the code.",
    'enemies': "Enemy and boss definitions, including the signature rule each act boss plays by.",
    'evaluation': "The scoring pipeline.\nTakes a board and returns what every unit and lane is"
                  " actually worth, with auras,\nhazards, fissures, wards and the current boss rule"
                  " applied in a fixed order. The\nsingle source of truth for any strength the game"
                  " shows or acts on.",
}

for key in CORE_ORDER:
    parts = [BANNER, '\n/* ' + CORE_DOC[key].replace('\n', '\n   ') + ' */\n\n']
    for dep in CORE_ORDER:                       # import order == dependency order
        if dep in imports[key]:
            parts.append("import { %s } from './%s.js';\n"
                         % (', '.join(sorted(imports[key][dep])), dep))
    if imports[key]:
        parts.append('\n')
    # Export every top-level declaration. Which lines those are is decided on the
    # blanked text, so a line of prose can never be turned into an export.
    decl = {n for n, l in enumerate(code[key].split('\n'))
            if re.match(r'(var\s|function\s+\w)', l)}
    body = '\n'.join(('export ' + l) if n in decl else l
                     for n, l in enumerate(texts[key].split('\n')))
    body = retoken(body, 'global', 'window')   # the IIFE's window, now just the window
    parts.append(body.strip() + '\n')
    with open(os.path.join(OUT, 'src', 'core', key + '.js'), 'w', encoding='utf-8') as fh:
        fh.write(''.join(parts))

# core/index.js -- assembles the public surface and publishes it
export_text = retoken('\n'.join(core[export_start:]).replace('global.CV_CORE =', 'const CV_CORE ='),
                      'global', 'window')
idx_imports = {}
for nm in sorted(set(re.findall(r'(?<![\w.$])([A-Za-z_]\w*)', blank(export_text)))):
    home = declared.get(nm)
    if home:
        idx_imports.setdefault(home, set()).add(nm)

idx = [BANNER,
       "\n/* The rules engine's public surface.\n"
       "   Assembles the sections above into one object and publishes it. Still attached\n"
       "   to `window` because the run and battle layers, the self-tests and the browser\n"
       "   console all reach for CV_CORE by name. */\n\n"]
for dep in CORE_ORDER:
    if dep in idx_imports:
        idx.append("import { %s } from './%s.js';\n" % (', '.join(sorted(idx_imports[dep])), dep))
idx.append('\n' + export_text.strip() + '\n\nwindow.CV_CORE = CV_CORE;\nexport default CV_CORE;\n')
with open(os.path.join(OUT, 'src', 'core', 'index.js'), 'w', encoding='utf-8') as fh:
    fh.write(''.join(idx))

# ---------------------------------------------------------------- run
run_text = '\n'.join(run_body)
# `global` was the IIFE's name for the window object; in a module it just is
# the window. The one exception is the export itself, which becomes a binding
# this module owns and publishes explicitly at the bottom.
run_text = retoken(run_text.replace('global.CV_RUN =', 'const CV_RUN ='), 'global', 'window')

run_doc = (BANNER +
           "\n/* The run layer: everything between battles.\n"
           "   Acts and the map that threads them, rewards, shops, the colour labs, the\n"
           "   codex and the save file. Owns the run's mutable state and is the only place\n"
           "   that writes to it.\n\n"
           "   One file on purpose. Every section here reassigns shared state — `run` alone\n"
           "   is read 388 times — and an ES module cannot reassign an imported binding, so\n"
           "   splitting it means routing those references through a state holder. That is a\n"
           "   real refactor with real regression risk and belongs in a change of its own.\n"
           "   Navigate by the section banners. */\n\n"
           "import '../core/index.js';\n\n")
with open(os.path.join(OUT, 'src', 'run', 'index.js'), 'w', encoding='utf-8') as fh:
    fh.write(run_doc + run_text.strip() + '\n\nwindow.CV_RUN = CV_RUN;\nexport default CV_RUN;\n')

# ---------------------------------------------------------------- battle
st_start = next(i for i, l in enumerate(bat_body) if l.startswith('function selfTest()'))
st_end = next(i for i, l in enumerate(bat_body) if l.startswith('function runSelfTestUI()'))
# pull the SELF TEST banner comment along with the tests
banner_start = st_start
while banner_start > 0 and not bat_body[banner_start - 1].startswith('/* ====='):
    banner_start -= 1
banner_start = max(0, banner_start - 1)

selftest_src = '\n'.join(bat_body[banner_start:st_end]).strip()
battle_src = '\n'.join(bat_body[:banner_start] + bat_body[st_end:])

# The suite only READS battle scope, so it takes that scope as a context object.
# What the suite needs from battle scope is not a list worth maintaining by
# hand: it is exactly the battle module's own top-level declarations that the
# suite mentions. Computing it means a test that reaches for a new symbol keeps
# working without anyone remembering to add it here.
bat_decl = list(dict.fromkeys(top_level_names(battle_src)))
used = set(re.findall(r'(?<![\w.$])([A-Za-z_]\w*)', blank(selftest_src)))
bind = [n for n in bat_decl if n in used]
test_count = len(re.findall(r'\bcheck\(', selftest_src))


def indent(text, n=2):
    return '\n'.join((' ' * n + l) if l.strip() else l for l in text.split('\n'))


with open(os.path.join(OUT, 'src', 'battle', 'self-test.js'), 'w', encoding='utf-8') as fh:
    fh.write(BANNER +
             "\n/* The self-test suite: %d checks covering the rules, board evaluation, the\n"
             "   colour gate, saves, map generation, AI behaviour and layout invariants. Run\n"
             "   it from the in-game menu, or from a console with:\n"
             "     CV_BATTLE.selfTest().filter(t => !t.pass)\n\n"
             "   It is one self-contained function that only reads battle scope, so it takes\n"
             "   that scope as a context object rather than closing over it — which is what\n"
             "   lets 3,500 lines of tests live outside the module they test. */\n\n"
             "export function createSelfTest(ctx) {\n"
             "  const { %s } = ctx;\n\n%s\n\n  return selfTest;\n}\n"
             % (test_count, ', '.join(bind), indent(selftest_src)))

battle_text = battle_src
battle_text = retoken(battle_text.replace('global.CV_BATTLE =', 'const CV_BATTLE ='),
                      'global', 'window')

hook = ('/* The suite lives in ./self-test.js. It is 44KB gzipped of code no player\n'
        '   ever runs, so it is fetched the first time it is asked for rather than\n'
        '   shipped with the game -- which is most of what having it in its own file\n'
        '   is worth. Both ways in return a promise: the menu button and\n'
        '   CV_BATTLE.selfTest(). */\n'
        'let builtSelfTest = null;\n'
        'async function selfTest() {\n'
        '  if (!builtSelfTest) {\n'
        "    const { createSelfTest } = await import('./self-test.js');\n"
        '    builtSelfTest = createSelfTest({ %s });\n'
        '  }\n'
        '  return builtSelfTest();\n'
        '}\n\n' % ', '.join(bind))
at = battle_text.index('function runSelfTestUI()')
battle_text = battle_text[:at] + hook + battle_text[at:]
# the one caller now awaits it
battle_text = battle_text.replace('function runSelfTestUI() {\n  var r = selfTest(),',
                                  'async function runSelfTestUI() {\n  var r = await selfTest(),', 1)
assert 'async function runSelfTestUI' in battle_text, 'runSelfTestUI call site changed shape'

battle_doc = (BANNER +
              "\n/* The battle layer: the table itself.\n"
              "   Draws the board and the hand, turns taps into moves, runs the opponent AI\n"
              "   and resolves rounds. Reads the rules from core/ and the run's state from\n"
              "   run/, and owns only what is on screen.\n\n"
              "   One file for the same reason run/ is: shared mutable render state that every\n"
              "   section reassigns. The self-test suite, being self-contained, has been\n"
              "   lifted out to ./self-test.js. Navigate by the section banners. */\n\n"
              "import '../run/index.js';\n\n")
with open(os.path.join(OUT, 'src', 'battle', 'index.js'), 'w', encoding='utf-8') as fh:
    fh.write(battle_doc + battle_text.strip() +
             '\n\nwindow.CV_BATTLE = CV_BATTLE;\nexport default CV_BATTLE;\n')

# ---------------------------------------------------------------- entry point
with open(os.path.join(OUT, 'src', 'main.js'), 'w', encoding='utf-8') as fh:
    fh.write(BANNER +
             "\n/* Entry point.\n\n"
             "   The three layers import each other in dependency order, so importing the\n"
             "   battle layer pulls run/ and core/ in behind it. The battle module starts\n"
             "   itself once the DOM is ready; this file exists so the page has one obvious\n"
             "   thing to load, and so anything about being a web page rather than about the\n"
             "   game has somewhere to live. */\n\n"
             "import './battle/index.js';\n\n"
             "if (!window.CV_CORE || !window.CV_RUN || !window.CV_BATTLE) {\n"
             "  console.error('Colour Vibes: a module failed to load — check the paths under src/.');\n"
             "}\n")

# ---------------------------------------------------------------- index.html
# The <style> block sat inside <head>, so the head half ends mid-head and the
# markup half opens with the closing tag. Rejoin them around the stylesheet link.
head = head.replace('</head>', '').rstrip()
body = markup.strip()
if body.startswith('</head>'):
    body = body[len('</head>'):].lstrip()
html = (head + '\n'
        '  <link rel="stylesheet" href="styles/game.css">\n'
        '  <meta name="color-scheme" content="dark">\n'
        '</head>\n'
        + body + '\n'
        '<script type="module" src="src/main.js"></script>\n'
        '</body>\n</html>\n')
with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as fh:
    fh.write(html)

# ---------------------------------------------------------------- provenance
# The generator and its input ship inside the repo, so the whole tree can be
# rebuilt from one command by anyone who clones it.
os.makedirs(os.path.join(OUT, 'build'), exist_ok=True)
dest_src = os.path.join(OUT, 'build', os.path.basename(SRC))
if os.path.abspath(dest_src) != os.path.abspath(SRC):
    shutil.copy(SRC, dest_src)
dest = os.path.join(OUT, 'build', 'split.py')
if os.path.abspath(dest) != os.path.abspath(__file__):
    shutil.copy(__file__, dest)

# GitHub Pages runs the repo through Jekyll by default, which ignores any path
# beginning with an underscore. This switches that off.
open(os.path.join(OUT, '.nojekyll'), 'w').close()

# ---------------------------------------------------------------- report
kb = lambda p: os.path.getsize(p) / 1024
print('wrote %s/' % OUT)
for name, size in sorted(extracted):
    print('  art   %-16s %6.0f KB' % (name, size / 1024))
for key in CORE_ORDER + ['index']:
    print('  core  %-16s %6.0f KB' % (key + '.js', kb(os.path.join(OUT, 'src', 'core', key + '.js'))))
print('  run   %-16s %6.0f KB' % ('index.js', kb(os.path.join(OUT, 'src', 'run', 'index.js'))))
print('  bat   %-16s %6.0f KB' % ('self-test.js', kb(os.path.join(OUT, 'src', 'battle', 'self-test.js'))))
print('  bat   %-16s %6.0f KB' % ('index.js', kb(os.path.join(OUT, 'src', 'battle', 'index.js'))))
print('  css   %-16s %6.0f KB' % ('game.css', kb(os.path.join(OUT, 'styles', 'game.css'))))
print('  html  %-16s %6.0f KB' % ('index.html', kb(os.path.join(OUT, 'index.html'))))
print('  main  %-16s %6.0f KB' % ('main.js', kb(os.path.join(OUT, 'src', 'main.js'))))
print('%d self-test checks moved to their own file' % test_count)
print('art moved out of the initial download: %.1f MB' % (sum(s for _, s in extracted) / 1024 / 1024))
