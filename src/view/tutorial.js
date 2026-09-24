/* What a lesson looks like. Small boards drawn from the real geometry, so what
   the player studies here is literally the board they are about to play on.
   When one opens is decided by the engine; this only draws it. */

import { rules as C } from '../game/index.js';
import { bestFrontlineLane, dismissTutorial, lessonApplies, tutorial } from '../game/index.js';
import { els } from './dom.js';

var CARDS = C.CARDS;

/* ---------------- tutorial diagrams ----------------
   Small boards drawn from the real geometry, so what the player studies here
   is literally the board they are about to play on. Numbered pointers sit on
   the tiles being described and match the captions underneath. */
function tutorialBoard(spec) {
  var geo = C.GEO.filter(function (tile) { return !spec.half || tile.side === spec.half; });
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  geo.forEach(function (tile) {
    tile.points.forEach(function (point) {
      minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
    });
  });
  var padX = 130, padTop = (spec.lanes || spec.flows) ? 156 : 56, padBot = 66;
  var vb = { x: minX - padX, y: minY - padTop, w: (maxX - minX) + padX * 2, h: (maxY - minY) + padTop + padBot };
  var headerY = minY - 104;        // LANE n label
  var amountY = minY - 46;         // the share that lane receives, above Row 1
  var arrowY = minY - 18;          // arrowheads stop just short of the board

  var tiles = '', tokens = '', marks = '', bands = '', laneText = '', flows = '';

  if (spec.lanes) {
    [0, 1, 2, 3].forEach(function (laneIndex) {
      var cx = (laneIndex + 0.5) * 200;
      bands += '<rect class="tut-lane" x="' + (cx - 94) + '" y="' + (minY + 6) +
        '" width="188" height="' + ((maxY - minY) - 12) + '" rx="14"/>';
      laneText += '<rect class="tut-lanepill" x="' + (cx - 84) + '" y="' + (headerY - 34) +
        '" width="168" height="58" rx="16"/>' +
        '<text class="tut-laneno" x="' + cx + '" y="' + headerY + '" text-anchor="middle" ' +
        'dominant-baseline="central">LANE ' + (laneIndex + 1) + '</text>';
    });
  }

  geo.forEach(function (tile) {
    tiles += '<polygon class="tut-tile ' + tile.row + ' side-' + tile.side + '" points="' +
      tile.points.map(function (point) { return point[0].toFixed(1) + ',' + point[1].toFixed(1); }).join(' ') + '"/>';
  });

  function centre(unitSpec) {
    var match = C.GEO.filter(function (tile) {
      return tile.side === unitSpec.side && tile.row === unitSpec.row && tile.index === unitSpec.index;
    })[0];
    return match ? { x: match.cx, y: match.cy } : { x: 0, y: 0 };
  }

  /* Arrows showing where a unit's strength actually goes. They are drawn over the
     tokens rather than under them, and the share each lane receives sits in its own
     chip beneath the lane label, clear of the board. */
  var amounts = '';
  var perLane = {};
  (spec.flows || []).forEach(function (flow) {
    var pos = centre(flow.from), lx = (flow.lane + 0.5) * 200;
    var hex = C.COLORS[flow.color].hex;
    var my = (pos.y + arrowY) / 2;
    flows += '<path class="tut-flow" stroke="' + hex + '" d="M' + pos.x + ',' + pos.y +
      ' C' + pos.x + ',' + my + ' ' + lx + ',' + my + ' ' + lx + ',' + (arrowY + 20) + '"/>';
    flows += '<path class="tut-arrow" fill="' + hex + '" d="M' + lx + ',' + arrowY +
      ' l-13,22 l26,0 Z"/>';
    perLane[flow.lane] = { amount: (perLane[flow.lane] ? perLane[flow.lane].amount + flow.amount : flow.amount), hex: hex };
  });
  Object.keys(perLane).forEach(function (laneKey) {
    var lx = (+laneKey + 0.5) * 200, laneAmount = perLane[laneKey];
    amounts += '<rect class="tut-amtbox" x="' + (lx - 30) + '" y="' + (amountY - 26) +
      '" width="60" height="52" rx="15" stroke="' + laneAmount.hex + '"/>' +
      '<text class="tut-amt" x="' + lx + '" y="' + amountY + '" text-anchor="middle" ' +
      'dominant-baseline="central" fill="' + laneAmount.hex + '">' + laneAmount.amount + '</text>';
  });

  (spec.units || []).forEach(function (unitSpec) {
    var pos = centre(unitSpec), colorDef = C.colorInfo(unitSpec.color);
    tokens += '<circle class="tut-owner ' + (unitSpec.side === 'bottom' ? 'you' : 'foe') +
      (unitSpec.faded ? ' faded' : '') + (unitSpec.front ? ' front' : '') + '" cx="' + pos.x + '" cy="' + pos.y + '" r="52"/>' +
      '<circle class="tut-token' + (unitSpec.faded ? ' faded' : '') + '" cx="' + pos.x + '" cy="' + pos.y +
      '" r="44" fill="' + colorDef.hex + '"/>' +
      '<text class="tut-str' + (unitSpec.faded ? ' faded' : '') + '" x="' + pos.x + '" y="' + pos.y +
      '" text-anchor="middle" dominant-baseline="central" fill="' + colorDef.ink + '">' + unitSpec.strength + '</text>';
    if (unitSpec.fx) {
      // drawn exactly as the live board draws its multiplier badge
      tokens += '<text class="tut-fx" x="' + pos.x + '" y="' + (pos.y + (unitSpec.side === 'bottom' ? 70 : -70)) +
        '" text-anchor="middle" dominant-baseline="central">' + unitSpec.fx + '</text>';
    }
  });

  /* On a live board we cannot know what is where, so pointers pick the nearest
     offset that keeps clear of every token and of the pointers already placed. */
  var unitPts = (spec.units || []).map(function (unitSpec) { return centre(unitSpec); });
  var placed = [];
  var CANDIDATES = [[-116, -8], [116, -8], [-116, 64], [116, 64], [0, -122], [0, 122],
                    [-146, 34], [146, 34], [-96, -96], [96, -96], [-96, 96], [96, 96]];
  function autoOffset(pos) {
    var best = null;
    CANDIDATES.forEach(function (candidate) {
      var bx = pos.x + candidate[0], by = pos.y + candidate[1], worst = Infinity;
      unitPts.concat(placed).forEach(function (otherPos) {
        var dist = Math.sqrt((bx - otherPos.x) * (bx - otherPos.x) + (by - otherPos.y) * (by - otherPos.y));
        if (dist < worst) worst = dist;
      });
      if (!best || worst > best.worst) best = { worst: worst, dx: candidate[0], dy: candidate[1] };
    });
    return best || { dx: -116, dy: -8 };
  }

  (spec.marks || []).forEach(function (mark) {
    var pos = mark.at ? centre(mark.at) : { x: mark.x, y: mark.y };
    var off = (mark.dx === undefined && mark.dy === undefined) ? autoOffset(pos) : { dx: mark.dx || 0, dy: mark.dy || 0 };
    var bx = pos.x + off.dx, by = pos.y + off.dy;
    placed.push({ x: bx, y: by });
    marks += '<line class="tut-lead" x1="' + pos.x + '" y1="' + pos.y + '" x2="' + bx + '" y2="' + by + '"/>';
    marks += '<circle class="tut-badge" cx="' + bx + '" cy="' + by + '" r="30"/>' +
      '<text class="tut-badgeno" x="' + bx + '" y="' + by + '" text-anchor="middle" dominant-baseline="central">' +
      mark.n + '</text>';
  });

  return '<svg class="tut-svg" viewBox="' + vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h +
    '" xmlns="http://www.w3.org/2000/svg">' + bands + tiles + tokens + flows + amounts +
    laneText + marks + '</svg>';
}

/* Turn a real board plus its evaluation into diagram units, carrying the same
   frontline rings and multiplier badges the live board draws. */
export function liveUnits(board, evaluation, fadedKeys) {
  var fronts = {}, mult = {};
  evaluation.lanes.forEach(function (lane) {
    ['bottom', 'top'].forEach(function (side) {
      if (!lane[side]) return;
      var key = side + '-' + lane[side].champion.row + '-' + lane[side].champion.index;
      fronts[key] = true;
      mult[key] = Math.max(mult[key] || 1, lane[side].multiplier);
    });
  });
  var units = [];
  ['bottom', 'top'].forEach(function (side) {
    C.eachUnit(board, side, function (unit, row, index) {
      var key = side + '-' + row + '-' + index, tileView = evaluation.get(side, row, index);
      units.push({ side: side, row: row, index: index, color: tileView.color, strength: evaluation.strengthOf(tileView),
                 front: !!fronts[key], fx: (mult[key] > 1 ? '\u00d7' + mult[key] : null),
                 faded: !!(fadedKeys && fadedKeys.indexOf(key) !== -1) });
    });
  });
  return units;
}

function unitName(board, evaluation, side, row, index) {
  var tileView = evaluation.get(side, row, index);
  return C.colorInfo(tileView.color).name + ' ' + evaluation.strengthOf(tileView);
}

function rowLabel(row) { return C.ROW_INFO[row].label; }

/* Step 2 points at the interface itself, so it mirrors the real hand and
   buttons rather than the board. */
function tutorialControls() {
  function card(id, pinNumber) {
    var cardDef = CARDS[id], colorDef = C.colorInfo(cardDef.color);
    return '<div class="tut-card" style="--card:' + colorDef.hex + ';--card-ink:' + colorDef.ink + '">' +
      (pinNumber ? '<span class="tut-pin">' + pinNumber + '</span>' : '') +
      '<span class="card-top">' + (cardDef.type === 'unit' ? cardDef.strength : cardDef.type === 'hazard' ? 'HAZ' : 'SPL') + '</span>' +
      '<span class="card-name">' + cardDef.name + '</span>' +
      '<span class="card-text">' + cardDef.text + '</span></div>';
  }
  return '<div class="tut-ui">' +
    '<span class="lbl">Your hand</span>' +
    '<div class="tut-rack">' + card('red_brute', 1) + card('green_gardener') + card('blue_scout') + '</div>' +
    '<div class="tut-actions-mock">' +
    '<div class="tut-fakebtn"><span class="tut-pin">2</span>Pass</div>' +
    '</div></div>';
}

/* A small mock of the two flank buttons, Rewind pinned so the legend can
   point straight at it — the icon is the same path data as the live
   button, just without the ID-scoped styling that only #rewindBtn gets. */
function tutorialRewind() {
  var rewindIcon = '<svg class="rw" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path class="rw-loop" d="M20 11a8 8 0 1 0-2.3 5.6"/>' +
    '<path class="rw-arrow" d="M20 4.6v6.1h-6.1z"/></svg>';
  return '<div class="tut-ui"><div class="tut-actions-mock">' +
    '<div class="tut-fakebtn">Pass</div>' +
    '<div class="tut-fakebtn tut-fakebtn-icon"><span class="tut-pin">1</span>' + rewindIcon + '</div>' +
    '</div></div>';
}

function tutorialLegend(items) {
  return '<ol class="tut-legend">' + items.map(function (item) { return '<li>' + item + '</li>'; }).join('') + '</ol>';
}

/* Opening set: only what you need before the very first move. Everything else
   now waits until the board itself demonstrates it. */
export var TUTORIAL_STEPS = [
  { title: 'A battle is best of three',
    body: 'Win two rounds and the battle is yours. Cards you spend are gone for the rest of the ' +
          'battle, so throwing everything into round one can cost you the next two.' }
];

/* One lesson per row, fired the first time the player commits a unit there.
   Drawn on the player's own half with the lane headers above, so the arrows
   read as "this is where that unit's strength actually went". */
function lanesLesson(ctx, row) {
  var board = ctx.board, evaluation = ctx.ev, tile = ctx.tile;
  var key = 'bottom-' + row + '-' + tile.index;
  var lanes = C.lanesOf(row, tile.index);
  var color = evaluation.get('bottom', row, tile.index).color || 'red';
  var flows = lanes.map(function (laneIndex, position) {
    return { from: { side: 'bottom', row: row, index: tile.index }, lane: laneIndex,
             amount: evaluation.shares[key][laneIndex], color: color, nudge: (position - (lanes.length - 1) / 2) * 44 };
  });
  var shares = lanes.map(function (laneIndex) { return evaluation.shares[key][laneIndex]; });
  var name = unitName(board, evaluation, 'bottom', row, tile.index);
  var titles = { row1: 'Row 1 commits everything to one lane',
                 row2: 'Row 2 spreads across two lanes',
                 row3: 'Row 3 reaches three lanes at once' };
  var closing = { row1: 'A Row 1 unit is a spike: all of it lands in one place.',
                  row2: 'Half the weight in each. Wider reach, softer hit.',
                  row3: 'A third in each. It touches most of the board, but thinly — Row 3 wants big units.' };
  // Row 1 reaches a single lane, so nothing is divided — say so plainly.
  var middle = lanes.length === 1
    ? 'All <b>' + shares[0] + '</b> of it goes there. Nothing is split off.'
    : 'Its strength splits into <b>' + shares.join(' + ') + '</b>, one share per lane, never differing by more than one.';
  return [{ title: titles[row],
    art: function () {
      return tutorialBoard({ half: 'bottom', lanes: true,
        units: liveUnits(board, evaluation).filter(function (unit) { return unit.side === 'bottom'; }),
        flows: flows,
        marks: [{ n: 1, at: { side: 'bottom', row: row, index: tile.index } }] });
    },
    legend: ['Your <b>' + name + '</b> on ' + rowLabel(row) + ' feeds lane' +
               (lanes.length > 1 ? 's ' : ' ') + lanes.map(function (laneIndex) { return laneIndex + 1; }).join(', ') + '.',
             middle,
             closing[row]] }];
}

var LESSON_BUILDERS = {

  /* The very first turn: what a turn even consists of. */
  play: function () {
    return [{ title: 'Your turn — play a card',
      artHtml: function () { return tutorialControls(); },
      legend: ['Tap a card in your hand. Every tile it can legally take lights up — then tap one to commit it.',
               '<b>Pass</b> is the other thing a turn can be. It will explain itself when it matters.'] }];
  },

  /* Offered the moment it first becomes real: right after your move and the
     enemy's reply to it, once it is your turn again. The third line is a
     deliberate tease, not an explanation — it should read as a rumor, not
     a rule, and it must not describe what actually happens mechanically.
     That stays for the board to teach on its own. */
  rewind: function () {
    return [{ title: 'Rewind — take it back',
      artHtml: function () { return tutorialRewind(); },
      legend: ['<b>Rewind</b> takes back your last move and the enemy\u2019s answer to it, as if neither happened.',
               'It\u2019s once per round, and only while it\u2019s still your turn — pass or let the round end and the chance is gone.',
               '<i>Some say the board never quite forgets what you undo \u2014 a faint dimensional drift, they call it, though no one\u2019s ever proven it.</i>'] }];
  },


  /* Placing into a row for the first time: show exactly where that unit's
     strength goes, with an arrow per lane and the share it carries. */
  lanes_row1: function (ctx) { return lanesLesson(ctx, 'row1'); },
  lanes_row2: function (ctx) { return lanesLesson(ctx, 'row2'); },
  lanes_row3: function (ctx) { return lanesLesson(ctx, 'row3'); },

  /* Mixing waits until a mix would actually buy you an effective matchup —
     which is also the natural moment to explain effectiveness at all. */
  mixing: function (ctx) {
    var board = ctx.board, evaluation = ctx.ev, opt = ctx.opt;
    var unitA = C.unitAt(board, 'bottom', opt.base.row, opt.base.index);
    var unitB = C.unitAt(board, 'bottom', opt.other.row, opt.other.index);
    var resColor = C.mixResultColor(unitA.color, unitB.color);
    var marks = [
      { n: 1, at: { side: 'bottom', row: opt.base.row, index: opt.base.index } },
      { n: 2, at: { side: 'bottom', row: opt.other.row, index: opt.other.index } },
      { n: 3, at: { side: 'top', row: opt.foe.row, index: opt.foe.index } }
    ];
    return [{ title: 'Mix for the colour you need',
      art: function () { return tutorialBoard({ units: liveUnits(board, evaluation), marks: marks }); },
      legend: [
        'Your <b>' + unitName(board, evaluation, 'bottom', opt.base.row, opt.base.index) +
          '</b> can absorb a touching friendly unit. Spend your Mix token and the result lands here.',
        'It swallows your <b>' + unitName(board, evaluation, 'bottom', opt.other.row, opt.other.index) +
          '</b>. Colours combine like paint and the strengths add together, plus one.',
        'That makes <b>' + C.colorInfo(resColor).name + ' ' + opt.strength + '</b> — and ' +
          C.colorInfo(resColor).name + ' beats the <b>' + C.colorInfo(opt.foeColor).name +
          '</b> facing it, so that lane would <b>double</b>. Being effective is worth more than being big.'
      ] }];
  },

  /* Passing explained the moment it is genuinely the right move. */
  passing: function (ctx) {
    var reason = ctx.reason, evaluation = ctx.ev;
    var lead = evaluation.totals.bottom - evaluation.totals.top;
    return [{ title: reason === 'stuck' ? 'Nothing left to play' : 'Bank the round',
      art: function () { return tutorialBoard({ units: liveUnits(ctx.board, evaluation) }); },
      legend: reason === 'stuck'
        ? ['You have no legal card and no mix available, so <b>Pass</b> is your only move.',
           'Passing gives the enemy exactly one more action, then the round ends and the totals are compared.',
           'Cards you never spend stay in hand for the next round — running dry is not always bad.']
        : ['You are ahead by <b>' + lead + '</b> and the enemy cannot close that this round.',
           'Passing now ends your commitment: they get one final action, then scores are compared.',
           'Everything you hold back stays in hand for the next round. Winning a round cheaply is how you win the battle.'] }];
  },

  frontline: function (ctx) {
    var evaluation = ctx.ev, board = ctx.board, best = bestFrontlineLane(evaluation);

    var lane = best.lane, mine = lane.bottom, theirs = lane.top, laneNumber = lane.index + 1;
    var champion = mine.champion, marks = [], legend = [], markNumber = 1;

    marks.push({ n: markNumber, at: { side: 'bottom', row: champion.row, index: champion.index } });
    legend.push('Your <b>' + unitName(board, evaluation, 'bottom', champion.row, champion.index) + '</b> on ' +
      rowLabel(champion.row) + ' is the frontline of lane ' + laneNumber + ' — your frontmost unit there. ' +
      (champion.row === 'row1' ? 'Row 1 always leads when it is occupied.'
                         : 'Row 1 is empty in this lane, so this deeper unit leads instead.') +
      ' Only a frontline\u2019s colour fights.');
    markNumber++;

    var support = null;
    mine.members.forEach(function (member) {
      if (support) return;
      if (member.row === champion.row && member.index === champion.index) return;
      support = member;
    });
    if (support) {
      marks.push({ n: markNumber, at: { side: 'bottom', row: support.row, index: support.index } });
      legend.push('Your <b>' + unitName(board, evaluation, 'bottom', support.row, support.index) + '</b> is support here: it adds ' +
        evaluation.shares['bottom-' + support.row + '-' + support.index][lane.index] +
        ' strength to the lane, but its colour is ignored.');
      markNumber++;
    }

    var theirChampion = theirs.champion;
    marks.push({ n: markNumber, at: { side: 'top', row: theirChampion.row, index: theirChampion.index } });
    legend.push('They front <b>' + unitName(board, evaluation, 'top', theirChampion.row, theirChampion.index) + '</b>. ' +
      (mine.effective ? C.colorInfo(mine.color).name + ' beats ' + C.colorInfo(theirs.color).name +
          ', so your whole lane doubles — that is the <b>\u00d7' + mine.multiplier + '</b> under your unit.'
       : theirs.effective ? C.colorInfo(theirs.color).name + ' beats ' + C.colorInfo(mine.color).name +
          ', so <b>their</b> lane doubles instead. Answer it with a colour that beats theirs.'
       : 'Neither colour beats the other, so both sides count flat here.'));

    return [{ title: 'Only the frontline fights',
      art: function () { return tutorialBoard({ units: liveUnits(board, evaluation), marks: marks }); },
      legend: legend }];
  },

  roundbreak: function (ctx) {
    var evaluation = ctx.ev, board = ctx.board, after = ctx.after, fallen = ctx.fallen;
    var faded = [];
    ['bottom', 'top'].forEach(function (side) {
      fallen[side].forEach(function (key) { faded.push(side + '-' + key.split('|')[0] + '-' + key.split('|')[1]); });
    });

    var marks = [], legend = [], markNumber = 1, mineFell = fallen.bottom[0], used = [];
    var total = fallen.bottom.length + fallen.top.length;
    if (mineFell) {
      var parts = mineFell.split('|'), row = parts[0], idx = +parts[1];
      marks.push({ n: markNumber, at: { side: 'bottom', row: row, index: idx } });
      used.push(row + '-' + idx);
      legend.push('Every frontline in a <b>contested</b> lane is removed — both sides, all of them. ' +
        'That took ' + total + ' unit' + (total === 1 ? '' : 's') + ' here, including your <b>' +
        unitName(board, evaluation, 'bottom', row, idx) + '</b>, shown faded. Whatever stood behind them steps up.');
      markNumber++;
    }

    /* Point at a unit that came through untouched, and never the same one twice. */
    var survivor = null;
    evaluation.lanes.forEach(function (lane) {
      if (survivor || !lane.bottom || lane.top) return;
      var champion = lane.bottom.champion;
      if (used.indexOf(champion.row + '-' + champion.index) !== -1) return;
      survivor = champion;
    });
    if (survivor) {
      marks.push({ n: markNumber, at: { side: 'bottom', row: survivor.row, index: survivor.index } });
      legend.push('Your <b>' + unitName(board, evaluation, 'bottom', survivor.row, survivor.index) +
        '</b> was never contested — nothing fought there, so it <b>stays</b> for the next round.');
    } else {
      legend.push('A lane the enemy never contests costs you nothing: units there survive the break.');
    }

    return [{ title: 'The line breaks between rounds',
      art: function () { return tutorialBoard({ units: liveUnits(board, evaluation, faded), marks: marks }); },
      legend: legend }];
  }
};

/* A lesson that does not apply yet has no cards: the same answer the engine's
   lessonApplies() gives, so asking the view directly and asking the engine
   first cannot disagree. */
export var TUTORIAL_LESSONS = {};
Object.keys(LESSON_BUILDERS).forEach(function (key) {
  TUTORIAL_LESSONS[key] = function (ctx) { return lessonApplies(key, ctx || {}) ? LESSON_BUILDERS[key](ctx || {}) : null; };
});

export var tutorialView = { open: null, list: null, step: 0 };

function tutorialCards(open) {
  return open.key === 'intro' ? TUTORIAL_STEPS : TUTORIAL_LESSONS[open.key](open.ctx);
}

export function renderTutorial() {
  if (!tutorial.open) { els.tutorialOverlay.hidden = true; tutorialView.open = null; return; }
  if (tutorialView.open !== tutorial.open) {
    tutorialView.open = tutorial.open; tutorialView.list = tutorialCards(tutorial.open); tutorialView.step = 0;
  }
  var list = tutorialView.list, step = list[tutorialView.step];
  var single = list.length === 1;
  els.tutorialBody.innerHTML =
    (single ? '<span class="tut-count">Good to know</span>'
            : '<span class="tut-count">Step ' + (tutorialView.step + 1) + ' of ' + list.length + '</span>') +
    '<h2>' + step.title + '</h2>' +
    (step.art ? '<div class="tut-art">' + step.art() + '</div>' : '') +
    (step.artHtml ? '<div class="tut-art plain">' + step.artHtml() + '</div>' : '') +
    (step.body ? '<p class="tut-text">' + step.body + '</p>' : '') +
    (step.legend ? tutorialLegend(step.legend) : '') +
    (single ? '' : '<div class="tut-dots">' + list.map(function (_, index) {
      return '<span class="tut-dot' + (index === tutorialView.step ? ' on' : '') + '"></span>';
    }).join('') + '</div>');
  els.tutorialBack.hidden = single;
  els.tutorialSkip.hidden = single;
  els.tutorialBack.disabled = tutorialView.step === 0;
  els.tutorialNext.textContent = single ? 'Got it'
    : (tutorialView.step === list.length - 1 ? 'Start the battle' : 'Next');
  els.tutorialOverlay.hidden = false;
}

export function tutorialStep(delta) {
  if (!tutorialView.list) return;
  tutorialView.step += delta;
  if (tutorialView.step < 0) tutorialView.step = 0;
  if (tutorialView.step >= tutorialView.list.length) { dismissTutorial(); return; }
  renderTutorial();
}
