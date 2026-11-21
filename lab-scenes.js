/*!
 * FALab — animated first-aid avatar scenes (SVG + GSAP 3)
 * First Aid Centre of Sweden, Bangladesh
 *
 * Plain script (no modules). Requires window.gsap (3.12+) loaded first.
 *
 *   window.FALab.ids                      -> ['cpr','aed','recovery','choking','bleeding','burns']
 *   window.FALab.mount(el, id, {onStep, onCount}) -> { play, pause, restart, destroy }
 *
 * Characters are driven by a tiny 2-bone IK rig: every limb segment is a
 * <g> whose transform (translate/rotate/scale) is recomputed per frame from a
 * plain state object that GSAP tweens. Only transform / opacity /
 * stroke-dashoffset are animated.
 */
(function () {
  'use strict';

  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var FONT = "'Familjen Grotesk', system-ui, sans-serif";

  function f(n) { return Math.round(n * 100) / 100; }
  function assign(t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) t[k] = s[k]; } return t; }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function c(v) { v = amt < 0 ? v * (1 + amt) : v + (255 - v) * amt; return Math.max(0, Math.min(255, Math.round(v))); }
    return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
  }
  function readVar(names, test, fb) {
    try {
      var cs = getComputedStyle(document.documentElement);
      for (var i = 0; i < names.length; i++) {
        var v = (cs.getPropertyValue(names[i]) || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(v)) {
          var n = parseInt(v.slice(1), 16);
          if (test(n >> 16, (n >> 8) & 255, n & 255)) return v;
        }
      }
    } catch (e) { /* ignore */ }
    return fb;
  }
  function palette() {
    return {
      amber: readVar(['--amber', '--accent', '--brand-amber', '--color-amber', '--color-accent', '--accent-amber'],
        function (r, g, b) { return r > 200 && g > 120 && b < 140; }, '#F8B040'),
      red: readVar(['--red', '--emergency', '--brand-red', '--color-red', '--danger', '--alert'],
        function (r, g, b) { return r > 170 && g < 110 && b < 120; }, '#E63946'),
      ice: readVar(['--ice', '--brand-ice', '--color-ice', '--white-ice'],
        function (r, g, b) { return r > 215 && g > 215 && b > 215; }, '#EEF1FF'),
      uni: '#5866E8', pants: '#343D8F', sneaker: '#E3E7F7',
      slate: '#8A93B8', slateL: '#C9CEE6', shoeP: '#5A6290',
      skin1: '#B9784E', skin2: '#8D5A3B', skin3: '#D9A27A',
      hair: '#1B1B2F', glove: '#A9B4FF', gloveD: '#8794F0'
    };
  }

  /* ---------- geometry helpers ---------- */
  // 2-bone IK. returns [jointX, jointY, endX, endY]. s (+1/-1, or fractional) picks the bend side.
  function ik(ax, ay, bx, by, L1, L2, s) {
    var dx = bx - ax, dy = by - ay, D = Math.sqrt(dx * dx + dy * dy) || 1e-3;
    var ux = dx / D, uy = dy / D;
    var d = Math.min(L1 + L2 - 0.01, Math.max(Math.abs(L1 - L2) + 0.01, D));
    var a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    var h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    return [ax + ux * a - uy * h * s, ay + uy * a + ux * h * s, ax + ux * d, ay + uy * d];
  }
  function segT(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return 'translate(' + f(x1) + ',' + f(y1) + ') rotate(' + f(Math.atan2(dy, dx) * R2D) + ') scale(' + f(Math.sqrt(dx * dx + dy * dy) / 100) + ',1)';
  }
  function ptT(x, y) { return 'translate(' + f(x) + ',' + f(y) + ')'; }
  function setT(el, v) { if (el) el.setAttribute('transform', v); }
  function setO(el, v) { if (el) el.setAttribute('opacity', f(v)); }

  /* ---------- shared decorative markup ---------- */
  function defs(p, C) {
    return '<defs>' +
      '<radialGradient id="' + p + 'glow"><stop offset="0" stop-color="#6A78FF" stop-opacity=".40"/><stop offset=".55" stop-color="#5866E8" stop-opacity=".12"/><stop offset="1" stop-color="#5866E8" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'warm"><stop offset="0" stop-color="' + C.amber + '" stop-opacity=".55"/><stop offset="1" stop-color="' + C.amber + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'cool"><stop offset="0" stop-color="' + C.ice + '" stop-opacity=".7"/><stop offset="1" stop-color="' + C.ice + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'redg"><stop offset="0" stop-color="' + C.red + '" stop-opacity=".75"/><stop offset="1" stop-color="' + C.red + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'shadow"><stop offset="0" stop-color="#02040F" stop-opacity=".62"/><stop offset="1" stop-color="#02040F" stop-opacity="0"/></radialGradient>' +
      '</defs>';
  }
  function zoomG(cx, cy, s, inner) { return '<g transform="translate(' + cx + ',' + cy + ') scale(' + s + ') translate(' + (-cx) + ',' + (-cy) + ')">' + inner + '</g>'; }
  function glow(p, cx, cy, rx, ry) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="url(#' + p + 'glow)"/>'; }
  function shadow(p, cx, cy, rx, ry, k) { return '<ellipse ' + (k ? 'data-k="' + k + '" ' : '') + 'cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="url(#' + p + 'shadow)"/>'; }
  function floorLine(y, x1, x2, C) {
    return '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + C.ice + '" stroke-opacity=".09" stroke-width="2" stroke-linecap="round"/>';
  }
  function sparkles(C, pts) {
    // faint static "+" marks for a motion-graphics texture
    var s = '';
    pts.forEach(function (q) {
      s += '<path d="M' + (q[0] - 4) + ',' + q[1] + ' h8 M' + q[0] + ',' + (q[1] - 4) + ' v8" stroke="' + C.ice + '" stroke-opacity=".16" stroke-width="1.6" stroke-linecap="round"/>';
    });
    return s;
  }
  function ring(k, cx, cy, r, col, w, extra) {
    return '<circle data-k="' + k + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + (w || 2.5) + '" opacity="0" ' + (extra || '') + '/>';
  }
  function star(k, cx, cy, r, col) {
    // 4-point sparkle centred on (cx,cy)
    var a = r, b = r * 0.28;
    return '<path data-k="' + k + '" opacity="0" fill="' + col + '" d="M' + cx + ',' + (cy - a) + ' Q' + (cx + b) + ',' + (cy - b) + ' ' + (cx + a) + ',' + cy +
      ' Q' + (cx + b) + ',' + (cy + b) + ' ' + cx + ',' + (cy + a) + ' Q' + (cx - b) + ',' + (cy + b) + ' ' + (cx - a) + ',' + cy +
      ' Q' + (cx - b) + ',' + (cy - b) + ' ' + cx + ',' + (cy - a) + 'Z"/>';
  }
  function checkBadge(k, cx, cy, C) {
    return '<g data-k="' + k + '" opacity="0">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="24" fill="' + C.amber + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="31" fill="none" stroke="' + C.amber + '" stroke-opacity=".35" stroke-width="2"/>' +
      '<path data-k="' + k + 'p" d="M' + (cx - 10) + ',' + (cy + 1) + ' L' + (cx - 3) + ',' + (cy + 8) + ' L' + (cx + 11) + ',' + (cy - 7) + '" fill="none" stroke="#0A0F2C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="40" stroke-dashoffset="40"/>' +
      '</g>';
  }
  function phoneBadge(k, cx, cy, C, label) {
    return '<g data-k="' + k + '" opacity="0">' +
      ring(k + 'r1', cx, cy, 26, C.red, 2.5) + ring(k + 'r2', cx, cy, 26, C.red, 2.5) +
      '<circle cx="' + cx + '" cy="' + cy + '" r="24" fill="' + C.red + '"/>' +
      '<path transform="translate(' + (cx - 10) + ',' + (cy - 10) + ')" d="M4.5,1.5 C3,1.5 1.5,3 1.8,5 C3,12 8,17 15,18.2 C17,18.5 18.5,17 18.5,15.5 L18.5,13.4 C18.5,12.6 18,12 17.2,11.8 L14,11 C13.3,10.8 12.6,11.1 12.2,11.7 L11.3,13 C8.9,11.8 8.2,11.1 7,8.7 L8.3,7.8 C8.9,7.4 9.2,6.7 9,6 L8.2,2.8 C8,2 7.4,1.5 6.6,1.5 Z" fill="' + C.ice + '"/>' +
      '<text x="' + cx + '" y="' + (cy + 46) + '" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="17" letter-spacing="1" fill="' + C.ice + '">' + (label || '999') + '</text>' +
      '</g>';
  }

  /* =====================================================================
   * Side-view rig
   * State: x,y = pelvis; a = torso angle (deg, 0 = upright, + = clockwise);
   * n = head nod (local, + = chin down / forward); c = chest thickness scale;
   * hfx,hfy / hbx,hby = near/far hand targets; ffx,ffy / fbx,fby = ankle targets;
   * tf/tb = foot angle; ef/eb = elbow bend side; kf/kb = knee bend side.
   * ===================================================================== */
  var T = 70, SHO = 60, UA = 36, FA = 34, HND = 5, TH = 44, SN = 44;
  var TORSO_D = 'M-15,2 C-17,-22 -18,-46 -15,-60 C-13,-69 -6,-72 1,-72 C9,-72 16,-68 17,-58 C19,-42 18,-20 15,2 Z';

  function hairMarkup(style, col) {
    var hl = '<path d="M-7,-40.5 C-1,-43 6,-42.8 11,-39.5" stroke="#fff" stroke-opacity=".16" stroke-width="2" fill="none" stroke-linecap="round"/>';
    var cap = '<path d="M-17.8,-21 C-20,-37 -9,-45.6 2,-45.2 C12.6,-44.8 19.6,-37.4 18.6,-29.6 C12,-33.4 5,-33.2 0,-30.6 C-4,-28 -6.6,-23 -7.6,-17 C-11.6,-14 -15.8,-15.4 -17.8,-21 Z" fill="' + col + '"/>';
    if (style === 'bun') return '<circle cx="-15.5" cy="-38.5" r="8" fill="' + col + '"/>' + cap + hl;
    if (style === 'long') return '<path d="M-16,-32 C-25,-16 -22,0 -12,5 C-9,-5 -8,-12 -7.6,-17 Z" fill="' + col + '"/>' + cap + hl;
    return cap + hl;
  }

  function sideRig(k, o) {
    var dir = o.dir || 1;
    var sk = o.skin, skB = shade(sk, -0.2), sh = o.shirt, shB = shade(sh, -0.2),
      pa = o.pants, paB = shade(pa, -0.22), so = o.shoe || '#E3E7F7', soB = shade(so, -0.22);
    var pv = o.pivot || [1, -14];

    function seg(id, c, w, x) { return '<g data-k="' + k + id + '"><rect x="0" y="' + (-w / 2) + '" width="100" height="' + w + '" fill="' + c + '"/>' + (x || '') + '</g>'; }
    function dot(id, c, r) { return '<circle data-k="' + k + id + '" r="' + r + '" fill="' + c + '"/>'; }
    function arm(X, s, shirt) {
      var long = o.sleeve === 'long', short = o.sleeve === 'short';
      var ac = long ? shirt : s;
      var sl = short ? '<rect x="-4" y="-10" width="50" height="20" fill="' + shirt + '"/>' : '';
      return '<g>' + seg('ua' + X, ac, 14, sl) + dot('el' + X, ac, 7) + seg('fa' + X, ac, 13) + dot('hd' + X, s, 8.5) + '</g>';
    }
    function leg(X, p, s) {
      return '<g>' + seg('th' + X, p, 19) + seg('sn' + X, p, 16) + dot('kn' + X, p, 9.5) + dot('an' + X, p, 8) +
        '<g data-k="' + k + 'ft' + X + '"><rect x="-9" y="-7" width="31" height="14" rx="7" fill="' + s + '"/>' +
        '<rect x="-7" y="3.5" width="27" height="3.5" rx="1.75" fill="#000" opacity=".2"/></g></g>';
    }
    var badge = o.badge ? '<path d="M5.4,-55 h3.4 v3.4 h3.4 v3.4 h-3.4 v3.4 h-3.4 v-3.4 h-3.4 v-3.4 h3.4z" fill="' + o.amber + '"/>' : '';
    var collar = o.collar ? '<path d="M-7,-71.5 L6,-71.5 L1.5,-63 Z" fill="' + shB + '"/>' : '';
    var extra = o.torsoExtra || '';
    var torso = '<g data-k="' + k + 'torso"><path d="M-15.5,-10 H15.5 V3 A15.5,11 0 0 1 -15.5,3 Z" fill="' + pa + '"/>' +
      '<g data-k="' + k + 'chest"><path d="' + TORSO_D + '" fill="' + sh + '"/>' +
      '<path d="M12.5,-57 C14.5,-42 14.5,-22 12,-6" stroke="#fff" stroke-opacity=".18" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      extra + badge + collar + '</g></g>';
    var head = '<g data-k="' + k + 'head"><g data-k="' + k + 'hrot">' +
      '<rect x="-5.5" y="-17" width="11" height="19" rx="4" fill="' + skB + '"/>' +
      '<circle cx="1" cy="-26" r="17" fill="' + sk + '"/>' +
      '<path d="M16.6,-30.5 q5.2,4 0.4,7.6 z" fill="' + sk + '"/>' +
      hairMarkup(o.hair, o.hairCol || '#1B1B2F') +
      '<circle cx="-3.5" cy="-24.5" r="3.6" fill="' + skB + '"/>' +
      '</g></g>';

    function bind(svg) {
      var E = {};
      'torso chest head hrot uaF elF faF hdF uaB elB faB hdB thF snF knF anF ftF thB snB knB anB ftB'.split(' ').forEach(function (n) {
        E[n] = svg.querySelector('[data-k="' + k + n + '"]');
      });
      function limb(a, b, c, ax, ay, tx, ty, L1, L2, s) {
        var r = ik(ax, ay, tx, ty, L1, L2, s);
        setT(a, segT(ax, ay, r[0], r[1])); setT(b, ptT(r[0], r[1])); setT(c, segT(r[0], r[1], r[2], r[3]));
        return r;
      }
      return function (s) {
        var a = s.a * D2R, ux = Math.sin(a), uy = -Math.cos(a);
        setT(E.torso, 'translate(' + f(s.x) + ',' + f(s.y) + ') rotate(' + f(s.a) + ') scale(' + dir + ',1)');
        setT(E.chest, 'translate(-15,0) scale(' + f(s.c == null ? 1 : s.c) + ',1) translate(15,0)');
        var nx = s.x + ux * T, ny = s.y + uy * T;
        setT(E.head, 'translate(' + f(nx) + ',' + f(ny) + ') rotate(' + f(s.a) + ') scale(' + dir + ',1)');
        setT(E.hrot, 'rotate(' + f(s.n || 0) + ',' + pv[0] + ',' + pv[1] + ')');
        var sx = s.x + ux * SHO, sy = s.y + uy * SHO, r;
        r = limb(E.uaF, E.elF, E.faF, sx, sy, s.hfx, s.hfy, UA, FA + HND, (s.ef == null ? 1 : s.ef) * dir); setT(E.hdF, ptT(r[2], r[3]));
        r = limb(E.uaB, E.elB, E.faB, sx, sy, s.hbx, s.hby, UA, FA + HND, (s.eb == null ? 1 : s.eb) * dir); setT(E.hdB, ptT(r[2], r[3]));
        r = limb(E.thF, E.knF, E.snF, s.x, s.y, s.ffx, s.ffy, TH, SN, (s.kf == null ? -1 : s.kf) * dir);
        setT(E.anF, ptT(r[2], r[3])); setT(E.ftF, 'translate(' + f(r[2]) + ',' + f(r[3]) + ') rotate(' + f(s.tf || 0) + ') scale(' + dir + ',1)');
        r = limb(E.thB, E.knB, E.snB, s.x, s.y, s.fbx, s.fby, TH, SN, (s.kb == null ? -1 : s.kb) * dir);
        setT(E.anB, ptT(r[2], r[3])); setT(E.ftB, 'translate(' + f(r[2]) + ',' + f(r[3]) + ') rotate(' + f(s.tb || 0) + ') scale(' + dir + ',1)');
      };
    }
    // world position of a point given in head-local coords (ignores nod)
    function headPt(s, lx, ly) {
      var a = s.a * D2R, c = Math.cos(a), si = Math.sin(a);
      var nx = s.x + Math.sin(a) * T, ny = s.y - Math.cos(a) * T, X = lx * dir;
      return [nx + X * c - ly * si, ny + X * si + ly * c];
    }
    return {
      legB: leg('B', paB, soB), armB: arm('B', skB, shB), torso: torso, head: head,
      legF: leg('F', pa, so), armF: arm('F', sk, sh), bind: bind, headPt: headPt
    };
  }

  /* ---------- small timeline helpers ---------- */
  function pulse(tl, el, t, o) {
    o = o || {};
    tl.fromTo(el, { scale: o.from || 0.35, opacity: o.op || 0.95 },
      { scale: o.to || 1.7, opacity: 0, duration: o.dur || 0.8, ease: 'power2.out', transformOrigin: '50% 50%', immediateRender: false }, t);
  }
  function pop(tl, el, t, d) {
    tl.fromTo(el, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: d || 0.45, ease: 'back.out(2.2)', transformOrigin: '50% 50%', immediateRender: false }, t);
  }
  function sparkleBurst(tl, els, t) {
    els.forEach(function (el, i) {
      tl.fromTo(el, { scale: 0, opacity: 1, rotation: 0 }, { scale: 1, opacity: 0, rotation: 90, duration: 0.7, ease: 'power2.out', transformOrigin: '50% 50%', immediateRender: false }, t + i * 0.08);
    });
  }

  /* =====================================================================
   * SCENE: CPR
   * ===================================================================== */
  function sceneCPR(p, C) {
    var R = sideRig(p + 'r', { dir: -1, skin: C.skin1, shirt: C.uni, pants: C.pants, shoe: C.sneaker, hair: 'short', sleeve: 'short', badge: true, collar: true, amber: C.amber });
    var P = sideRig(p + 'p', { dir: 1, skin: C.skin2, shirt: C.slateL, pants: C.slate, shoe: C.shoeP, hair: 'short', sleeve: 'short', pivot: [1, -26] });
    var CIRC = f(2 * Math.PI * 40);

    var markup =
      glow(p, 290, 250, 280, 170) +
      sparkles(C, [[58, 250], [540, 70], [470, 150], [560, 300], [210, 40]]) +
      // compression counter (HUD, not zoomed)
      '<g data-k="' + p + 'ctr" opacity="0">' +
      '<circle cx="96" cy="96" r="54" fill="#070B22" fill-opacity=".45"/>' +
      '<circle cx="96" cy="96" r="40" fill="none" stroke="' + C.ice + '" stroke-opacity=".12" stroke-width="7"/>' +
      '<circle data-k="' + p + 'ctrRing" cx="96" cy="96" r="40" fill="none" stroke="' + C.amber + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + CIRC + '" stroke-dashoffset="' + CIRC + '" transform="rotate(-90 96 96)"/>' +
      '<text data-k="' + p + 'ctrNum" x="96" y="110" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="40" fill="' + C.amber + '">0</text>' +
      '<text x="96" y="170" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="11" letter-spacing="2.2" fill="' + C.ice + '" fill-opacity=".78">COMPRESSIONS</text>' +
      '<text x="96" y="186" text-anchor="middle" font-family="' + FONT + '" font-weight="500" font-size="11" letter-spacing="1" fill="' + C.ice + '" fill-opacity=".5">100–120 / MIN</text>' +
      '</g>' +
      zoomG(300, 330, 1.25,
        shadow(p, 330, 342, 160, 12) + shadow(p, 340, 328, 70, 8) +
        floorLine(341, 150, 500, C) +
        // rescuer lower body + torso (behind patient)
        R.legB + R.legF + R.torso + R.head +
        // patient
        P.legB + P.armB + P.torso + P.head + P.legF + P.armF +
        '<ellipse data-k="' + p + 'breath" cx="304" cy="306" rx="46" ry="16" fill="url(#' + p + 'cool)" opacity="0"/>' +
        // rescuer arms on top
        R.armB + R.armF +
        // fx
        ring(p + 'cr', 289, 306, 16, C.amber, 2.5) +
        ring(p + 'tap1', 270, 304, 12, C.ice, 2) + ring(p + 'tap2', 270, 304, 12, C.ice, 2) +
        '<g data-k="' + p + 'q1" opacity="0"><circle cx="230" cy="172" r="14" fill="' + C.ice + '" fill-opacity=".14"/><text x="230" y="179.5" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="20" fill="' + C.amber + '">?</text></g>' +
        '<g data-k="' + p + 'q2" opacity="0"><circle cx="208" cy="148" r="11" fill="' + C.ice + '" fill-opacity=".14"/><text x="208" y="154" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="16" fill="' + C.amber + '">?</text></g>' +
        '<g data-k="' + p + 'q3" opacity="0"><circle cx="246" cy="146" r="9" fill="' + C.ice + '" fill-opacity=".14"/><text x="246" y="151" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="13" fill="' + C.amber + '">?</text></g>' +
        // phone in hand
        ring(p + 'ph1', 300, 182, 16, C.amber, 2.2) + ring(p + 'ph2', 300, 182, 16, C.amber, 2.2) + ring(p + 'ph3', 300, 182, 16, C.amber, 2.2) +
        '<g data-k="' + p + 'phone" opacity="0"><g transform="translate(299,182) rotate(-12)"><rect x="-6.5" y="-13" width="13" height="24" rx="3.5" fill="' + C.ice + '"/><rect x="-4.5" y="-9.5" width="9" height="15" rx="1.5" fill="#283090"/></g></g>' +
        '<g data-k="' + p + 'call" opacity="0"><rect x="320" y="134" width="88" height="27" rx="13.5" fill="' + C.red + '"/>' +
        '<text x="364" y="152.5" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="13" letter-spacing="1" fill="' + C.ice + '">CALL 999</text>' +
        '<path d="M324,156 L314,170 L336,158 Z" fill="' + C.red + '"/></g>' +
        '<g data-k="' + p + 'aedtag" opacity="0"><rect x="414" y="134" width="60" height="27" rx="13.5" fill="none" stroke="' + C.amber + '" stroke-width="2"/>' +
        '<text x="444" y="152" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="12" letter-spacing="1.2" fill="' + C.amber + '">+ AED</text></g>'
      );

    function build(svg, emit) {
      var q = function (n) { return svg.querySelector('[data-k="' + p + n + '"]'); };
      var rR = R.bind(svg), rP = P.bind(svg);
      var PB = { x: 330, y: 322, a: -90, n: 0, c: 1, hfx: 350, hfy: 330, hbx: 346, hby: 332, ffx: 416, ffy: 324, fbx: 412, fby: 326, tf: -90, tb: -90 };
      var RA = { x: 305, y: 278, a: -28, n: 8, hfx: 273, hfy: 299, hbx: 265, hby: 300, ffx: 352, ffy: 316, fbx: 358, fby: 316, tf: 180, tb: 180, ef: 1, eb: 1 };
      var RB = { x: 308, y: 276, a: -6, n: -4, hfx: 303, hfy: 188, hbx: 296, hby: 292, ffx: 352, ffy: 316, fbx: 358, fby: 316, tf: 180, tb: 180, ef: 1, eb: 1 };
      var RC = { x: 325, y: 276, a: -35, n: 12, hfx: 288, hfy: 301, hbx: 290, hby: 300, ffx: 368, ffy: 316, fbx: 374, fby: 316, tf: 180, tb: 180, ef: 1, eb: 1 };
      var RD = { x: 328, y: 298, a: -72, n: 6, hfx: 222, hfy: 308, hbx: 250, hby: 311, ffx: 334, ffy: 316, fbx: 340, fby: 316, tf: 180, tb: 180, ef: -1, eb: -1 };
      var RS = assign({}, RA), PS = assign({}, PB), S = { comp: 0, breath: 0, count: 0 };
      var num = q('ctrNum'), br = q('breath'), lastCount = -1;
      function render() {
        var r = assign({}, RS), d = 6 * S.comp;
        r.y += d; r.hfy += d; r.hby += d;
        rR(r);
        var pp = assign({}, PS); pp.c = PS.c - 0.18 * S.comp + 0.13 * S.breath;
        rP(pp);
        setO(br, S.breath * 0.9);
        var c = Math.round(S.count);
        if (c !== lastCount) { lastCount = c; num.textContent = String(c); }
      }
      var tl = gsap.timeline({ repeat: -1, paused: true, onUpdate: render });
      var E = 'power2.inOut';

      // STEP 0 — danger & response
      tl.call(emit.step, [0], 0.01);
      tl.to(RS, { n: 16, duration: 0.6, ease: E }, 0.3);
      for (var i = 0; i < 3; i++) {
        var tt = 0.8 + i * 0.5;
        tl.to(RS, { hfy: RA.hfy + 5, hby: RA.hby + 5, duration: 0.12, ease: 'power2.in' }, tt)
          .to(RS, { hfy: RA.hfy, hby: RA.hby, duration: 0.2, ease: 'power2.out' }, tt + 0.12)
          .to(PS, { y: PB.y + 1.5, duration: 0.12, ease: 'power2.in' }, tt)
          .to(PS, { y: PB.y, duration: 0.2, ease: 'power2.out' }, tt + 0.12);
        pulse(tl, q(i % 2 ? 'tap2' : 'tap1'), tt + 0.1, { to: 2.2, dur: 0.6 });
      }
      ['q1', 'q2', 'q3'].forEach(function (n, j) {
        tl.fromTo(q(n), { opacity: 0, y: 10, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(2)', transformOrigin: '50% 50%', immediateRender: false }, 0.9 + j * 0.35);
        tl.to(q(n), { opacity: 0, y: -12, duration: 0.4, ease: 'sine.in' }, 2.7 + j * 0.06);
      });
      tl.to(RS, { n: 8, duration: 0.4, ease: E }, 2.6);

      // STEP 1 — call 999 & get AED
      var t1 = 3.3;
      tl.call(emit.step, [1], t1);
      tl.to(RS, assign({ duration: 0.75, ease: E }, RB), t1);
      tl.to(q('phone'), { opacity: 1, duration: 0.25 }, t1 + 0.55);
      [0, 1, 2].forEach(function (j) {
        pulse(tl, q('ph' + (j + 1)), t1 + 0.9 + j * 0.3, { from: 0.6, to: 2.6, dur: 1 });
        pulse(tl, q('ph' + (j + 1)), t1 + 1.9 + j * 0.3, { from: 0.6, to: 2.6, dur: 1 });
      });
      pop(tl, q('call'), t1 + 0.7);
      pop(tl, q('aedtag'), t1 + 1.3);
      tl.to([q('phone'), q('call'), q('aedtag')], { opacity: 0, duration: 0.3 }, t1 + 3.3);

      // STEP 2 — 30 compressions @ 110/min
      var t2 = t1 + 3.5, tc = t2 + 1.0, CY = 60 / 110;
      tl.call(emit.step, [2], t2);
      tl.to(RS, assign({ duration: 0.8, ease: E }, RC), t2);
      tl.set(S, { count: 0 }, t2);
      tl.to(q('ctr'), { opacity: 1, duration: 0.4 }, t2 + 0.3);
      tl.fromTo(q('ctrRing'), { strokeDashoffset: CIRC }, { strokeDashoffset: 0, duration: 30 * CY, ease: 'none', immediateRender: false }, tc);
      for (var c = 0; c < 30; c++) {
        var tk = tc + c * CY;
        tl.to(S, { comp: 1, duration: CY * 0.44, ease: 'power2.in' }, tk)
          .to(S, { comp: 0, duration: CY * 0.52, ease: 'power2.out' }, tk + CY * 0.46);
        tl.set(S, { count: c + 1 }, tk + CY * 0.4);
        tl.call(emit.count, [c + 1], tk + CY * 0.4);
        tl.fromTo(num, { scale: 1.22 }, { scale: 1, duration: 0.3, ease: 'power2.out', transformOrigin: '50% 60%', immediateRender: false }, tk + CY * 0.4);
        if (c % 2 === 0) pulse(tl, q('cr'), tk + CY * 0.42, { from: 0.6, to: 2.4, dur: 0.5, op: 0.8 });
      }
      var tEnd2 = tc + 30 * CY;
      tl.to(q('ctr'), { opacity: 0, duration: 0.4 }, tEnd2 + 0.2);

      // STEP 3 — 2 rescue breaths
      var t3 = tEnd2 + 0.3;
      tl.call(emit.step, [3], t3);
      tl.to(RS, assign({ duration: 0.9, ease: E }, RD), t3);
      tl.to(PS, { n: -22, duration: 0.6, ease: E }, t3 + 0.5);
      [0, 1].forEach(function (j) {
        var tb = t3 + 1.3 + j * 1.9;
        tl.to(RS, { n: 10, duration: 0.3, ease: E }, tb - 0.25);
        tl.to(S, { breath: 1, duration: 1.0, ease: 'sine.inOut' }, tb)
          .to(S, { breath: 0, duration: 0.7, ease: 'sine.inOut' }, tb + 1.05);
        tl.to(RS, { n: -10, a: RD.a + 8, duration: 0.4, ease: E }, tb + 1.05)
          .to(RS, { a: RD.a, duration: 0.3, ease: E }, tb + 1.6);
      });
      var tR = t3 + 5.2;
      tl.to(PS, { n: 0, duration: 0.6, ease: E }, tR);
      tl.to(RS, assign({ duration: 1.0, ease: E }, RA), tR);
      tl.to({}, { duration: 0.2 }, tR + 1.0);

      render();
      return { tl: tl, render: render, keys: [1.25, t1 + 1.4, tc + 14 * CY + CY * 0.42, t3 + 1.3 + 0.95] };
    }
    return { label: 'CPR: a rescuer checks for response, calls 999, gives 30 chest compressions then 2 rescue breaths', markup: markup, build: build };
  }

  /* =====================================================================
   * SCENE: AED
   * ===================================================================== */
  function sceneAED(p, C) {
    var R = sideRig(p + 'r', { dir: -1, skin: C.skin2, shirt: C.uni, pants: C.pants, shoe: C.sneaker, hair: 'short', sleeve: 'short', badge: true, collar: true, amber: C.amber });
    var P = sideRig(p + 'p', { dir: 1, skin: C.skin3, shirt: C.skin3, pants: C.slate, shoe: C.shoeP, hair: 'long', sleeve: 'none', pivot: [1, -26],
      torsoExtra: '<path d="M8,-48 C11,-40 11,-34 8,-28" stroke="#000" stroke-opacity=".12" stroke-width="2" fill="none" stroke-linecap="round"/>' });
    var ax = 66, ay = 284; // AED body origin

    var screenClip = p + 'scr';
    var scene =
      shadow(p, 345, 342, 170, 12) + shadow(p, 113, 343, 60, 7) +
      floorLine(341, 50, 520, C) +
      // AED device
      '<g>' +
      '<rect x="' + ax + '" y="' + ay + '" width="94" height="58" rx="12" fill="' + C.ice + '"/>' +
      '<rect x="' + ax + '" y="' + (ay + 46) + '" width="94" height="12" rx="6" fill="#C9CEE6"/>' +
      '<rect x="' + (ax + 8) + '" y="' + (ay + 12) + '" width="52" height="34" rx="7" fill="#0B1238"/>' +
      '<rect data-k="' + p + 'scrOn" x="' + (ax + 11) + '" y="' + (ay + 15) + '" width="46" height="28" rx="5" fill="#1A2C7A" opacity="0"/>' +
      '<g clip-path="url(#' + screenClip + ')">' +
      '<path data-k="' + p + 'flat" d="M' + (ax + 11) + ',' + (ay + 30) + ' H' + (ax + 57) + '" stroke="#7CF3C4" stroke-width="1.6" fill="none" opacity="0"/>' +
      '<path data-k="' + p + 'ecg" d="M' + (ax + 11) + ',' + (ay + 30) + ' l4,-6 l3,10 l3,-12 l3,9 l3,-5 l3,8 l3,-11 l3,7 l3,-4 l3,9 l3,-10 l3,6 l3,-3 l3,5" stroke="#7CF3C4" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-dasharray="160" stroke-dashoffset="160"/>' +
      '<rect data-k="' + p + 'scan" x="' + (ax + 9) + '" y="' + (ay + 15) + '" width="5" height="28" fill="#9FB4FF" opacity="0"/>' +
      '</g>' +
      '<circle data-k="' + p + 'led" cx="' + (ax + 70) + '" cy="' + (ay + 15) + '" r="3" fill="#7CF3C4" opacity=".25"/>' +
      '<circle cx="' + (ax + 77) + '" cy="' + (ay + 31) + '" r="10.5" fill="#F3D2D5"/>' +
      '<circle data-k="' + p + 'btn" cx="' + (ax + 77) + '" cy="' + (ay + 31) + '" r="8.5" fill="' + C.red + '" opacity=".55"/>' +
      '<path d="M' + (ax + 78) + ',' + (ay + 25) + ' l-4,7 h3.6 l-1.6,5.4 l5,-7.4 h-3.6 z" fill="#fff"/>' +
      '<rect x="' + (ax + 92) + '" y="' + (ay + 28) + '" width="6" height="12" rx="2" fill="#9AA3D8"/>' +
      '</g>' +
      // lid (hinged on the left)
      '<g data-k="' + p + 'lid"><rect x="' + (ax - 2) + '" y="' + (ay - 10) + '" width="98" height="15" rx="7" fill="' + C.amber + '"/>' +
      '<rect x="' + (ax + 32) + '" y="' + (ay - 16) + '" width="30" height="8" rx="4" fill="none" stroke="' + C.amber + '" stroke-width="3"/>' +
      '<path d="M' + (ax + 44) + ',' + (ay - 6) + ' h6 M' + (ax + 47) + ',' + (ay - 9) + ' v6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>' +
      // speaker waves
      '<path data-k="' + p + 'sw1" d="M' + (ax + 104) + ',' + (ay - 2) + ' a10,10 0 0 1 0,16" stroke="' + C.amber + '" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0"/>' +
      '<path data-k="' + p + 'sw2" d="M' + (ax + 110) + ',' + (ay - 7) + ' a16,16 0 0 1 0,26" stroke="' + C.amber + '" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0"/>' +
      '<path data-k="' + p + 'sw3" d="M' + (ax + 116) + ',' + (ay - 12) + ' a22,22 0 0 1 0,36" stroke="' + C.amber + '" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0"/>' +
      // people (wires run on the floor behind the patient)
      R.legB + R.legF + R.torso + R.head +
      '<path data-k="' + p + 'w1" d="M' + (ax + 98) + ',' + (ay + 33) + ' C196,336 236,332 262,324 C286,316 298,312 304,301" stroke="#9AA3D8" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<path data-k="' + p + 'w2" d="M' + (ax + 98) + ',' + (ay + 37) + ' C210,346 266,338 300,328 C318,322 326,314 330,301" stroke="#9AA3D8" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      P.legB + P.armB + P.torso + P.head + P.legF + P.armF +
      '<g data-k="' + p + 'pad1" opacity="0"><rect x="-14" y="-4.5" width="28" height="9" rx="3.5" fill="' + C.ice + '"/><rect x="-9" y="-1.6" width="18" height="3" rx="1.5" fill="' + C.amber + '"/></g>' +
      '<g data-k="' + p + 'pad2" opacity="0"><rect x="-14" y="-4.5" width="28" height="9" rx="3.5" fill="' + C.ice + '"/><rect x="-9" y="-1.6" width="18" height="3" rx="1.5" fill="' + C.amber + '"/></g>' +
      R.armB + R.armF +
      // alerts
      ring(p + 'al1', 318, 280, 30, C.amber, 2.5) + ring(p + 'al2', 318, 280, 30, C.amber, 2.5) +
      '<g data-k="' + p + 'bolt" opacity="0"><path d="M318,196 L292,246 L312,246 L298,290 L340,232 L318,232 L332,196 Z" fill="' + C.amber + '" stroke="' + C.ice + '" stroke-width="3" stroke-linejoin="round"/></g>' +
      ring(p + 'sh1', 318, 300, 24, C.red, 3) + ring(p + 'sh2', 318, 300, 24, C.amber, 3);

    var markup =
      '<defs><clipPath id="' + screenClip + '"><rect x="' + (ax + 11) + '" y="' + (ay + 15) + '" width="46" height="28" rx="5"/></clipPath></defs>' +
      glow(p, 300, 250, 290, 175) +
      sparkles(C, [[44, 120], [250, 100], [410, 210], [565, 250], [140, 190]]) +
      // inset: pad placement diagram
      '<g data-k="' + p + 'inset" opacity=".9">' +
      '<circle cx="508" cy="96" r="64" fill="#0C1238" stroke="' + C.ice + '" stroke-opacity=".14" stroke-width="1.5"/>' +
      '<circle cx="508" cy="96" r="70" fill="none" stroke="' + C.amber + '" stroke-opacity=".25" stroke-width="1.5" stroke-dasharray="3 6"/>' +
      '<circle cx="508" cy="52" r="12" fill="' + C.skin3 + '" fill-opacity=".85"/>' +
      '<path d="M480,74 Q508,64 536,74 Q544,78 545,96 L540,152 L476,152 L471,96 Q472,78 480,74 Z" fill="' + C.skin3 + '" fill-opacity=".85"/>' +
      '<path d="M512,95 c0,-4 5,-5.5 7,-2 c2,-3.5 7,-2 7,2 c0,4.5 -7,8.5 -7,8.5 c0,0 -7,-4 -7,-8.5 Z" fill="' + C.red + '" opacity=".85"/>' +
      '<g data-k="' + p + 'ip1" opacity="0"><rect x="482" y="78" width="21" height="14" rx="3" fill="' + C.ice + '" transform="rotate(-12 492 85)"/><rect x="485" y="82" width="14" height="2.5" rx="1" fill="' + C.amber + '" transform="rotate(-12 492 85)"/></g>' +
      '<g data-k="' + p + 'ip2" opacity="0"><rect x="527" y="102" width="14" height="22" rx="3" fill="' + C.ice + '" transform="rotate(-14 534 113)"/><rect x="530" y="106" width="2.5" height="14" rx="1" fill="' + C.amber + '" transform="rotate(-14 534 113)"/></g>' +
      '<text x="508" y="180" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="10" letter-spacing="2" fill="' + C.ice + '" fill-opacity=".6">PAD PLACEMENT</text>' +
      '</g>' +
      zoomG(280, 340, 1.12, scene) +
      '<g data-k="' + p + 'pillA" opacity="0"><rect x="150" y="30" width="232" height="34" rx="17" fill="' + C.amber + '"/>' +
      '<text x="266" y="53" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="14" letter-spacing="1.4" fill="#0A0F2C">ANALYSING · STAND CLEAR</text></g>' +
      '<g data-k="' + p + 'pillB" opacity="0"><rect x="176" y="30" width="180" height="34" rx="17" fill="' + C.red + '"/>' +
      '<text x="266" y="53" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="14" letter-spacing="1.4" fill="#fff">SHOCK ADVISED</text></g>' +
      '<g data-k="' + p + 'pillC" opacity="0"><rect x="186" y="30" width="160" height="34" rx="17" fill="none" stroke="' + C.amber + '" stroke-width="2"/>' +
      '<text x="266" y="53" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="14" letter-spacing="1.4" fill="' + C.amber + '">RESUME CPR</text></g>' +
      '<rect data-k="' + p + 'flash" x="-20" y="-20" width="640" height="440" fill="#fff" opacity="0"/>';

    function build(svg, emit) {
      var q = function (n) { return svg.querySelector('[data-k="' + p + n + '"]'); };
      var rR = R.bind(svg), rP = P.bind(svg);
      var w1 = q('w1'), w2 = q('w2'), L1 = w1.getTotalLength(), L2 = w2.getTotalLength();
      gsap.set(w1, { strokeDasharray: L1, strokeDashoffset: L1 });
      gsap.set(w2, { strokeDasharray: L2, strokeDashoffset: L2 });
      var PAD0 = { x: ax + 46, y: ay + 22 };
      var PB = { x: 360, y: 322, a: -90, n: 0, c: 1, hfx: 380, hfy: 330, hbx: 376, hby: 332, ffx: 446, ffy: 324, fbx: 442, fby: 326, tf: -90, tb: -90 };
      var Q0 = { x: 352, y: 278, a: -12, n: 6, hfx: 330, hfy: 292, hbx: 335, hby: 294, ffx: 398, ffy: 316, fbx: 404, fby: 316, tf: 180, tb: 180, ef: 1, eb: 1 };
      var Q1 = { x: 340, y: 278, a: -30, n: 14, hfx: 304, hfy: 297, hbx: 329, hby: 297, ffx: 386, ffy: 316, fbx: 392, fby: 316, tf: 180, tb: 180, ef: 1, eb: 1 };
      var Q2 = { x: 366, y: 274, a: 12, n: -6, hfx: 344, hfy: 150, hbx: 366, hby: 142, ffx: 400, ffy: 316, fbx: 406, fby: 316, tf: 180, tb: 180, ef: 1, eb: 1 };
      var Q3 = { x: 355, y: 276, a: -35, n: 12, hfx: 318, hfy: 301, hbx: 320, hby: 300, ffx: 398, ffy: 316, fbx: 404, fby: 316, tf: 180, tb: 180, ef: 1, eb: 1 };
      var RS = assign({}, Q0), PS = assign({}, PB), S = { comp: 0, jolt: 0 };
      function render() {
        var r = assign({}, RS), d = 6 * S.comp;
        r.y += d; r.hfy += d; r.hby += d;
        rR(r);
        var pp = assign({}, PS); pp.c = 1 - 0.18 * S.comp; pp.y -= S.jolt * 4; pp.a -= S.jolt * 1.5;
        rP(pp);
      }
      var tl = gsap.timeline({ repeat: -1, paused: true, onUpdate: render });
      var E = 'power2.inOut';
      var lid = q('lid'), pad1 = q('pad1'), pad2 = q('pad2');
      gsap.set([pad1, pad2], { x: PAD0.x, y: PAD0.y, rotation: 0, opacity: 0 });
      tl.set([pad1, pad2], { x: PAD0.x, y: PAD0.y, rotation: 0, opacity: 0 }, 0);

      // STEP 0 — open & power on
      tl.call(emit.step, [0], 0.01);
      tl.to(lid, { rotation: -96, duration: 0.7, ease: 'back.out(1.4)', transformOrigin: '0% 100%' }, 0.4);
      tl.to(q('scrOn'), { opacity: 1, duration: 0.4 }, 0.9);
      tl.to(q('flat'), { opacity: 1, duration: 0.3 }, 1.0);
      tl.to(q('led'), { opacity: 1, duration: 0.2, yoyo: true, repeat: 5 }, 1.0);
      [0, 1, 2].forEach(function (j) {
        ['sw1', 'sw2', 'sw3'].forEach(function (s, i) {
          tl.fromTo(q(s), { opacity: 0 }, { opacity: 1, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.inOut', immediateRender: false }, 1.2 + j * 0.65 + i * 0.12);
        });
      });
      tl.to(RS, { n: 2, a: -8, duration: 0.6, ease: E }, 0.6);

      // STEP 1 — pads on
      var t1 = 3.3;
      tl.call(emit.step, [1], t1);
      tl.to(RS, assign({ duration: 0.8, ease: E }, Q1, { hfx: 300, hfy: 280, hbx: 326, hby: 282 }), t1);
      // pad 1 flies to upper right chest
      tl.to(pad1, { opacity: 1, duration: 0.15 }, t1 + 0.3);
      tl.to(pad1, { x: 304, duration: 0.9, ease: 'power1.inOut' }, t1 + 0.3);
      tl.to(pad1, { y: 214, duration: 0.45, ease: 'power2.out' }, t1 + 0.3).to(pad1, { y: 302, duration: 0.45, ease: 'power2.in' }, t1 + 0.75);
      tl.to(pad1, { rotation: 360, duration: 0.9, ease: 'power1.inOut' }, t1 + 0.3);
      tl.to(RS, { hfx: Q1.hfx, hfy: Q1.hfy, duration: 0.35, ease: E }, t1 + 0.95);
      tl.to(w1, { strokeDashoffset: 0, duration: 0.6, ease: 'power1.inOut' }, t1 + 0.7);
      pop(tl, q('ip1'), t1 + 1.2);
      // pad 2 to lower left side
      tl.to(pad2, { opacity: 1, duration: 0.15 }, t1 + 1.3);
      tl.to(pad2, { x: 330, duration: 0.9, ease: 'power1.inOut' }, t1 + 1.3);
      tl.to(pad2, { y: 200, duration: 0.45, ease: 'power2.out' }, t1 + 1.3).to(pad2, { y: 302, duration: 0.45, ease: 'power2.in' }, t1 + 1.75);
      tl.to(pad2, { rotation: 360, duration: 0.9, ease: 'power1.inOut' }, t1 + 1.3);
      tl.to(RS, { hbx: Q1.hbx, hby: Q1.hby, duration: 0.35, ease: E }, t1 + 1.95);
      tl.to(w2, { strokeDashoffset: 0, duration: 0.6, ease: 'power1.inOut' }, t1 + 1.7);
      pop(tl, q('ip2'), t1 + 2.2);

      // STEP 2 — analysing, stand clear
      var t2 = t1 + 3.4;
      tl.call(emit.step, [2], t2);
      tl.to(RS, assign({ duration: 0.7, ease: 'back.out(1.3)' }, Q2), t2);
      pop(tl, q('pillA'), t2 + 0.2);
      tl.to(q('flat'), { opacity: 0, duration: 0.2 }, t2 + 0.4);
      tl.to(q('ecg'), { strokeDashoffset: 0, duration: 2.4, ease: 'none' }, t2 + 0.4);
      [0, 1, 2].forEach(function (j) {
        tl.fromTo(q('scan'), { x: 0, opacity: 0.9 }, { x: 46, opacity: 0.9, duration: 0.8, ease: 'none', immediateRender: false }, t2 + 0.4 + j * 0.8);
        pulse(tl, q(j % 2 ? 'al2' : 'al1'), t2 + 0.5 + j * 0.8, { from: 0.6, to: 2.6, dur: 1.0, op: 0.8 });
      });
      tl.to(q('scan'), { opacity: 0, duration: 0.15 }, t2 + 2.8);

      // STEP 3 — shock, then resume CPR
      var t3 = t2 + 3.2;
      tl.call(emit.step, [3], t3);
      tl.to(q('pillA'), { opacity: 0, duration: 0.2 }, t3);
      pop(tl, q('pillB'), t3 + 0.1);
      tl.to(q('btn'), { opacity: 1, scale: 1.15, duration: 0.16, yoyo: true, repeat: 5, ease: 'sine.inOut', transformOrigin: '50% 50%' }, t3 + 0.2);
      var ts = t3 + 1.3;
      tl.fromTo(q('flash'), { opacity: 0 }, { opacity: 0.85, duration: 0.06, yoyo: true, repeat: 1, ease: 'power1.out', immediateRender: false }, ts);
      tl.fromTo(q('bolt'), { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.18, ease: 'back.out(3)', transformOrigin: '50% 100%', immediateRender: false }, ts);
      tl.to(q('bolt'), { opacity: 0, duration: 0.4 }, ts + 0.45);
      pulse(tl, q('sh1'), ts + 0.02, { from: 0.5, to: 3.4, dur: 0.7 });
      pulse(tl, q('sh2'), ts + 0.15, { from: 0.5, to: 3.0, dur: 0.7 });
      tl.to(S, { jolt: 1, duration: 0.07, yoyo: true, repeat: 3, ease: 'sine.inOut' }, ts);
      tl.to(q('pillB'), { opacity: 0, duration: 0.2 }, ts + 0.6);
      pop(tl, q('pillC'), ts + 0.7);
      tl.to(RS, assign({ duration: 0.6, ease: E }, Q3), ts + 0.6);
      var CY = 60 / 110, tc = ts + 1.3;
      for (var c = 0; c < 6; c++) {
        tl.to(S, { comp: 1, duration: CY * 0.44, ease: 'power2.in' }, tc + c * CY)
          .to(S, { comp: 0, duration: CY * 0.52, ease: 'power2.out' }, tc + c * CY + CY * 0.46);
      }
      // reset
      var tr = tc + 6 * CY + 0.2;
      tl.to([q('pillC'), pad1, pad2, q('ip1'), q('ip2'), q('scrOn'), q('led')], { opacity: 0, duration: 0.45 }, tr);
      tl.to(q('ecg'), { strokeDashoffset: 160, duration: 0.4 }, tr);
      tl.to(w1, { strokeDashoffset: L1, duration: 0.5 }, tr);
      tl.to(w2, { strokeDashoffset: L2, duration: 0.5 }, tr);
      tl.to(lid, { rotation: 0, duration: 0.5, ease: 'power2.in' }, tr + 0.3);
      tl.to(RS, assign({ duration: 0.8, ease: E }, Q0), tr);
      tl.to({}, { duration: 0.2 }, tr + 0.8);

      render();
      return { tl: tl, render: render, keys: [1.6, t1 + 2.9, t2 + 1.6, ts + 0.05] };
    }
    return { label: 'AED: the defibrillator powers on, pads go on the bare chest, everyone stands clear for analysis, a shock is delivered and CPR resumes', markup: markup, build: build };
  }

  /* =====================================================================
   * SCENE: RECOVERY POSITION (top-down)
   * ===================================================================== */
  function sceneRecovery(p, C) {
    var sk = C.skin1, skB = shade(sk, -0.18), sh = C.slateL, shB = shade(sh, -0.16), pa = C.slate, paB = shade(pa, -0.18), so = C.shoeP;
    var CX = 268, CY0 = 194;
    function seg(id, c, w, x) { return '<g data-k="' + p + id + '"><rect x="0" y="' + (-w / 2) + '" width="100" height="' + w + '" fill="' + c + '"/>' + (x || '') + '</g>'; }
    function dot(id, c, r, x) { return '<circle data-k="' + p + id + '" r="' + r + '" fill="' + c + '"' + (x || '') + '/>'; }
    function arm(X, s, shirt) {
      return seg('ua' + X, s, 15, '<rect x="-6" y="-10.5" width="46" height="21" fill="' + shirt + '"/>') + dot('el' + X, s, 7.5) + seg('fa' + X, s, 14) +
        '<g data-k="' + p + 'hd' + X + '"><circle r="10" fill="' + s + '"/>' + (X === 'N' ? '<ellipse data-k="' + p + 'palm" cx="1" cy="0" rx="5.5" ry="6.5" fill="' + shade(sk, 0.28) + '" opacity="0"/>' : '') + '</g>';
    }
    function leg(X, pc, s) {
      return seg('th' + X, pc, 23) + seg('sn' + X, pc, 20) + dot('kn' + X, pc, 11.5) +
        '<g data-k="' + p + 'ft' + X + '"><ellipse cx="9" cy="0" rx="14" ry="9.5" fill="' + s + '"/></g>';
    }
    var markup =
      glow(p, 300, 210, 300, 180) +
      sparkles(C, [[40, 60], [560, 50], [570, 360], [30, 350], [300, 30]]) +
      // mat
      '<rect x="64" y="86" width="472" height="252" rx="30" fill="#18205A" stroke="' + C.ice + '" stroke-opacity=".1" stroke-width="2"/>' +
      '<rect x="78" y="100" width="444" height="224" rx="22" fill="none" stroke="' + C.ice + '" stroke-opacity=".06" stroke-width="2" stroke-dasharray="2 8"/>' +
      '<text x="512" y="324" text-anchor="end" font-family="' + FONT + '" font-weight="700" font-size="10" letter-spacing="2" fill="' + C.ice + '" fill-opacity=".35">RESCUER SIDE ↓</text>' +
      // motion guides
      '<path data-k="' + p + 'g0" d="M314,248 Q300,306 176,284" stroke="' + C.amber + '" stroke-width="2" fill="none" stroke-dasharray="3 7" stroke-linecap="round" opacity="0"/>' +
      '<path data-k="' + p + 'g1" d="M312,142 Q270,170 192,212" stroke="' + C.amber + '" stroke-width="2" fill="none" stroke-dasharray="3 7" stroke-linecap="round" opacity="0"/>' +
      '<path data-k="' + p + 'g3" d="M380,120 C420,150 420,230 382,262" stroke="' + C.amber + '" stroke-width="3" fill="none" stroke-linecap="round" opacity="0"/>' +
      '<path data-k="' + p + 'g3h" d="M372,256 L384,265 L388,250" stroke="' + C.amber + '" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>' +
      '<g data-k="' + p + 'body">' +
      shadow(p, 290, 214, 230, 70) +
      '<g>' + leg('N', pa, so) + '</g>' +
      '<ellipse data-k="' + p + 'kneeSh" rx="20" ry="11" fill="#02040F" opacity="0"/>' +
      '<g>' + leg('F', paB, shade(so, -0.15)) + '</g>' +
      '<g data-k="' + p + 'kneeHi" opacity="0"><circle r="14" fill="' + shade(pa, 0.18) + '"/><circle cx="-3" cy="-3" r="6" fill="#fff" opacity=".35"/></g>' +
      '<g>' + arm('N', sk, sh) + '</g>' +
      '<g data-k="' + p + 'torso">' +
      '<path d="M38,-31 L74,-28 Q84,-26 84,-14 L84,14 Q84,26 74,28 L38,31 Z" fill="' + pa + '"/>' +
      '<path d="M-58,-30 Q-60,-43 -46,-44 L28,-35 Q50,-33 52,-24 L52,24 Q50,33 28,35 L-46,44 Q-60,43 -58,30 Z" fill="' + sh + '"/>' +
      '<path d="M-40,-36 L40,-28" stroke="#fff" stroke-opacity=".16" stroke-width="3" stroke-linecap="round"/>' +
      '<path data-k="' + p + 'back" d="M-58,-30 Q-60,-43 -46,-44 L28,-35 Q50,-33 52,-24 L52,-4 L-58,-6 Z" fill="' + shB + '" opacity="0"/>' +
      '</g>' +
      '<g data-k="' + p + 'head">' +
      '<rect x="10" y="-9" width="26" height="18" rx="6" fill="' + skB + '"/>' +
      '<circle r="22" fill="' + sk + '"/>' +
      '<g data-k="' + p + 'hair"><path d="M4,-23.6 A23.6,23.6 0 0 0 4,23.6 C-6,16 -10,8 -10,0 C-10,-8 -6,-16 4,-23.6 Z" fill="' + C.hair + '"/>' +
      '<path d="M-14,-12 A17,17 0 0 0 -14,12" stroke="#fff" stroke-opacity=".14" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="3" cy="-21.5" r="4.2" fill="' + skB + '"/><circle cx="3" cy="21.5" r="4.2" fill="' + skB + '"/>' +
      '<ellipse cx="13" cy="0" rx="4.2" ry="3.6" fill="' + shade(sk, -0.1) + '"/></g>' +
      '</g>' +
      '<g>' + arm('F', skB, shB) + '</g>' +
      '</g>' +
      // highlights
      ring(p + 'h0', 176, 284, 18, C.amber, 2.5) + ring(p + 'h1', 190, 214, 18, C.amber, 2.5) +
      ring(p + 'h2', 344, 176, 20, C.amber, 2.5) + ring(p + 'h3', 176, 214, 22, C.amber, 2.5) +
      '<g data-k="' + p + 'air" opacity="0"><path d="M140,232 C122,226 116,210 124,196" stroke="' + C.ice + '" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M118,202 L124,194 L131,201" stroke="' + C.ice + '" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<text x="104" y="186" font-family="' + FONT + '" font-weight="700" font-size="10" letter-spacing="1.6" fill="' + C.ice + '" fill-opacity=".8">AIRWAY OPEN</text></g>' +
      star(p + 'sp1', 150, 250, 9, C.amber) + star(p + 'sp2', 420, 290, 7, C.amber) + star(p + 'sp3', 230, 300, 6, C.ice);

    var REST = { sy: 1, dy: 0, roll: 0, hr: 0, ht: 0, palm: 0, knee: 0,
      nu: 6, nf: 2, fu: -6, ff: -2, lnu: 3, lnf: 0, lfu: -3, lff: 0, k1: 1, k2: 1 };
    var P1 = { fu: 77, ff: 84 };
    var P2 = { lfu: -2, lff: 0, k1: 0.6, k2: 0.66, knee: 1 };
    var P3 = { sy: 0.5, dy: 22, roll: 1, hr: 78, ht: -8, fu: 74, ff: 111, lfu: 88, lff: -88, k1: 1, k2: 1, knee: 0, lnu: 2, lnf: 6, palm: 0 };

    function build(svg, emit) {
      var q = function (n) { return svg.querySelector('[data-k="' + p + n + '"]'); };
      var E = {};
      'torso back head hair uaN elN faN hdN uaF elF faF hdF thN snN knN ftN thF snF knF ftF kneeHi kneeSh palm'.split(' ').forEach(function (n) { E[n] = q(n); });
      var S = assign({}, REST);
      var L1 = 44, L2 = 46, G1 = 64, G2 = 62;
      function armR(X, sx, sy, u, fr) {
        var a = u * D2R, b = (u + fr) * D2R;
        var ex = sx + L1 * Math.cos(a), ey = sy + L1 * Math.sin(a), hx = ex + L2 * Math.cos(b), hy = ey + L2 * Math.sin(b);
        setT(E['ua' + X], segT(sx, sy, ex, ey)); setT(E['el' + X], ptT(ex, ey)); setT(E['fa' + X], segT(ex, ey, hx, hy));
        setT(E['hd' + X], 'translate(' + f(hx) + ',' + f(hy) + ') rotate(' + f(u + fr) + ')');
      }
      function legR(X, hx, hy, u, fr, k1, k2) {
        var a = u * D2R, b = (u + fr) * D2R;
        var kx = hx + G1 * k1 * Math.cos(a), ky = hy + G1 * k1 * Math.sin(a), ax2 = kx + G2 * k2 * Math.cos(b), ay2 = ky + G2 * k2 * Math.sin(b);
        setT(E['th' + X], segT(hx, hy, kx, ky)); setT(E['kn' + X], ptT(kx, ky)); setT(E['sn' + X], segT(kx, ky, ax2, ay2));
        setT(E['ft' + X], 'translate(' + f(ax2) + ',' + f(ay2) + ') rotate(' + f(u + fr) + ')');
        return [kx, ky];
      }
      function render() {
        var ty = CY0 + S.dy;
        setT(E.torso, 'translate(' + CX + ',' + f(ty) + ') scale(1,' + f(S.sy) + ')');
        setO(E.back, S.roll * 0.9);
        setT(E.head, 'translate(' + (CX - 88) + ',' + f(ty + S.roll * 2) + ') rotate(' + f(S.ht) + ')');
        setT(E.hair, 'rotate(' + f(S.hr) + ')');
        armR('N', CX - 46, ty + 40 * S.sy, S.nu, S.nf);
        armR('F', CX - 46, ty - 40 * S.sy, S.fu, S.ff);
        legR('N', CX + 62, ty + 15 * S.sy, S.lnu, S.lnf, 1, 1);
        var kn = legR('F', CX + 62, ty - 15 * S.sy, S.lfu, S.lff, S.k1, S.k2);
        setT(E.kneeHi, ptT(kn[0], kn[1])); setO(E.kneeHi, S.knee);
        setT(E.kneeSh, ptT(kn[0] + 12, kn[1] + 8)); setO(E.kneeSh, S.knee * 0.45);
        setO(E.palm, S.palm);
      }
      var tl = gsap.timeline({ repeat: -1, paused: true, onUpdate: render });
      var EZ = 'power2.inOut';
      // STEP 0
      tl.call(emit.step, [0], 0.01);
      tl.to(q('g0'), { opacity: 0.9, duration: 0.3 }, 0.3);
      tl.to(S, { nu: 90, nf: 0, duration: 0.9, ease: EZ }, 0.5);
      tl.to(S, { nf: 90, palm: 1, duration: 0.7, ease: EZ }, 1.35);
      pulse(tl, q('h0'), 2.1, { from: 0.5, to: 1.9, dur: 0.9 });
      tl.to(q('g0'), { opacity: 0, duration: 0.3 }, 2.3);
      // STEP 1
      var t1 = 3.0;
      tl.call(emit.step, [1], t1);
      tl.to(q('g1'), { opacity: 0.9, duration: 0.3 }, t1 + 0.1);
      tl.to(S, { fu: 40, ff: 60, duration: 0.7, ease: EZ }, t1 + 0.3);
      tl.to(S, assign({ duration: 0.8, ease: EZ }, P1), t1 + 1.0);
      pulse(tl, q('h1'), t1 + 1.8, { from: 0.5, to: 1.9, dur: 0.9 });
      tl.to(q('g1'), { opacity: 0, duration: 0.3 }, t1 + 2.0);
      // STEP 2
      var t2 = t1 + 3.0;
      tl.call(emit.step, [2], t2);
      tl.to(S, assign({ duration: 1.1, ease: EZ }, P2), t2 + 0.3);
      pulse(tl, q('h2'), t2 + 1.4, { from: 0.5, to: 1.9, dur: 0.9 });
      // STEP 3
      var t3 = t2 + 2.8;
      tl.call(emit.step, [3], t3);
      tl.fromTo(q('g3'), { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: false }, t3 + 0.05);
      tl.fromTo(q('g3h'), { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: false }, t3 + 0.05);
      tl.to(S, assign({ duration: 1.5, ease: 'power3.inOut' }, P3), t3 + 0.3);
      tl.to([q('g3'), q('g3h')], { opacity: 0, duration: 0.3 }, t3 + 1.6);
      tl.to(q('air'), { opacity: 1, duration: 0.4 }, t3 + 1.8);
      pulse(tl, q('h3'), t3 + 1.8, { from: 0.5, to: 2.0, dur: 1 });
      sparkleBurst(tl, [q('sp1'), q('sp2'), q('sp3')], t3 + 2.0);
      // graceful reset
      var tr = t3 + 3.6;
      tl.to([q('body'), q('air')], { opacity: 0, duration: 0.5, ease: 'sine.in' }, tr);
      tl.to(S, assign({ duration: 0.01 }, REST), tr + 0.55);
      tl.to(q('body'), { opacity: 1, duration: 0.5, ease: 'sine.out' }, tr + 0.6);
      render();
      return { tl: tl, render: render, keys: [2.4, t1 + 2.2, t2 + 1.8, t3 + 2.6] };
    }
    return { label: 'Recovery position seen from above: near arm out at a right angle, far hand to cheek, far knee bent, then the person is rolled onto their side with the airway open', markup: markup, build: build };
  }

  /* =====================================================================
   * SCENE: CHOKING (side view, standing)
   * ===================================================================== */
  function sceneChoking(p, C) {
    var V = sideRig(p + 'v', { dir: 1, skin: C.skin3, shirt: C.slateL, pants: C.slate, shoe: C.shoeP, hair: 'bun', sleeve: 'short', collar: false });
    var R = sideRig(p + 'r', { dir: 1, skin: C.skin2, shirt: C.uni, pants: C.pants, shoe: C.sneaker, hair: 'short', sleeve: 'short', badge: true, collar: true, amber: C.amber });
    var markup =
      glow(p, 320, 230, 260, 190) +
      sparkles(C, [[70, 110], [520, 60], [560, 260], [110, 300], [440, 360]]) +
      zoomG(300, 352, 1.2,
        shadow(p, 320, 352, 190, 12) +
        floorLine(351, 110, 510, C) +
        '<g data-k="' + p + 'figs">' +
        R.legB + R.torso + R.legF + R.head +
        V.legB + V.armB + V.torso + V.legF + V.head + V.armF +
        R.armB + R.armF +
        '</g>' +
        // cough puffs
        '<g data-k="' + p + 'cg" opacity="0"><circle cx="0" cy="0" r="6" fill="' + C.ice + '" fill-opacity=".55"/><circle cx="12" cy="-6" r="4.5" fill="' + C.ice + '" fill-opacity=".45"/><circle cx="20" cy="3" r="3.5" fill="' + C.ice + '" fill-opacity=".35"/></g>' +
        '<g data-k="' + p + 'cough" opacity="0"><text x="0" y="0" font-family="' + FONT + '" font-weight="700" font-size="13" letter-spacing="1" fill="' + C.ice + '" fill-opacity=".85">cough!</text></g>' +
        '<g data-k="' + p + 'alert" opacity="0"><path d="M0,-12 l4,0 M-12,-2 l-4,-3 M12,-2 l4,-3" stroke="' + C.red + '" stroke-width="3" stroke-linecap="round"/></g>' +
        ring(p + 'bb1', 0, 0, 12, C.amber, 3) + ring(p + 'bb2', 0, 0, 12, C.amber, 3) +
        ring(p + 'at1', 0, 0, 12, C.ice, 3) + ring(p + 'at2', 0, 0, 12, C.ice, 3) +
        '<g data-k="' + p + 'obj" opacity="0"><circle r="5.5" fill="' + C.amber + '"/><circle cx="-1.6" cy="-1.6" r="1.8" fill="#fff" fill-opacity=".7"/></g>' +
        star(p + 's1', 0, 0, 10, C.amber) + star(p + 's2', 0, 0, 7, C.ice) + star(p + 's3', 0, 0, 6, C.amber) +
        '<g data-k="' + p + 'ok" opacity="0"><path d="M0,0 c0,-5 6,-7 8.5,-2.5 c2.5,-4.5 8.5,-2.5 8.5,2.5 c0,5.5 -8.5,10.5 -8.5,10.5 c0,0 -8.5,-5 -8.5,-10.5 Z" fill="' + C.amber + '"/></g>'
      ) +
      '<g data-k="' + p + 'cnt" opacity="0"><rect x="32" y="30" width="226" height="36" rx="18" fill="#070B22" fill-opacity=".5" stroke="' + C.amber + '" stroke-opacity=".5"/>' +
      '<text data-k="' + p + 'cntL" x="52" y="53" font-family="' + FONT + '" font-weight="700" font-size="12" letter-spacing="1.6" fill="' + C.ice + '" fill-opacity=".85">BACK BLOWS</text>' +
      '<text data-k="' + p + 'cntN" x="240" y="54" text-anchor="end" font-family="' + FONT + '" font-weight="700" font-size="17" fill="' + C.amber + '">0/5</text></g>';

    function build(svg, emit) {
      var q = function (n) { return svg.querySelector('[data-k="' + p + n + '"]'); };
      var rV = V.bind(svg), rR = R.bind(svg);
      var V0 = { x: 360, y: 258, a: 6, n: 10, hfx: 377, hfy: 186, hbx: 372, hby: 190, ffx: 376, ffy: 343, fbx: 350, fby: 343, ef: 1, eb: 1 };
      var V1 = { x: 345, y: 260, a: 48, n: 14, hfx: 404, hfy: 288, hbx: 396, hby: 290, ffx: 376, ffy: 343, fbx: 350, fby: 343, ef: 1, eb: 1 };
      var V2 = { x: 352, y: 258, a: 22, n: 14, hfx: 386, hfy: 268, hbx: 380, hby: 272, ffx: 376, ffy: 343, fbx: 350, fby: 343, ef: 1, eb: 1 };
      var V3 = { x: 360, y: 257, a: -2, n: -8, hfx: 372, hfy: 226, hbx: 366, hby: 270, ffx: 376, ffy: 343, fbx: 350, fby: 343, ef: 1, eb: 1 };
      var R0 = { x: 170, y: 258, a: 0, n: 0, hfx: 178, hfy: 270, hbx: 166, hby: 270, ffx: 182, ffy: 343, fbx: 158, fby: 343, ef: 1, eb: 1 };
      var R1 = { x: 310, y: 258, a: 22, n: 10, hfx: 386, hfy: 254, hbx: 384, hby: 166, ffx: 326, ffy: 343, fbx: 300, fby: 343, ef: 1, eb: 1 };
      var R2 = { x: 318, y: 260, a: 10, n: 6, hfx: 376, hfy: 246, hbx: 374, hby: 248, ffx: 334, ffy: 343, fbx: 306, fby: 343, ef: 1, eb: 1 };
      var R3 = { x: 302, y: 258, a: 4, n: 0, hfx: 346, hfy: 214, hbx: 306, hby: 270, ffx: 316, ffy: 343, fbx: 290, fby: 343, ef: 1, eb: 1 };
      var VS = assign({}, V0), RS = assign({}, R0);
      var cntN = q('cntN'), cntL = q('cntL'), S = { n: 0, mode: 0 }, last = '', lastL = '';
      function render() {
        rR(RS); rV(VS);
        var txt = Math.round(S.n) + '/5';
        if (txt !== last) { last = txt; cntN.textContent = txt; }
        var lab = S.mode > 0.5 ? 'ABDOMINAL THRUSTS' : 'BACK BLOWS';
        if (lab !== lastL) { lastL = lab; cntL.textContent = lab; }
      }
      function place(el, xy) { gsap.set(el, { x: xy[0], y: xy[1] }); }
      var mouth0 = V.headPt(V0, 20, -24);
      place(q('cg'), [mouth0[0] + 8, mouth0[1] + 2]);
      place(q('cough'), [mouth0[0] + 22, mouth0[1] - 22]);
      place(q('alert'), V.headPt(V0, 2, -50));
      var blow = [372, 214];
      [q('bb1'), q('bb2')].forEach(function (e) { place(e, blow); });
      [q('at1'), q('at2')].forEach(function (e) { place(e, [370, 242]); });

      var tl = gsap.timeline({ repeat: -1, paused: true, onUpdate: render });
      var EZ = 'power2.inOut';
      // STEP 0 — choking
      tl.call(emit.step, [0], 0.01);
      tl.to(q('alert'), { opacity: 1, duration: 0.2, yoyo: true, repeat: 5 }, 0.2);
      for (var i = 0; i < 3; i++) {
        var tc = 0.5 + i * 0.85;
        tl.to(VS, { a: 16, n: 18, duration: 0.14, ease: 'power2.out' }, tc).to(VS, { a: 6, n: 10, duration: 0.4, ease: 'sine.inOut' }, tc + 0.14);
        tl.fromTo(q('cg'), { opacity: 0.95, scale: 0.4, x: mouth0[0] + 8 }, { opacity: 0, scale: 1.6, x: mouth0[0] + 40, duration: 0.7, ease: 'power2.out', transformOrigin: '0% 50%', immediateRender: false }, tc + 0.05);
      }
      tl.fromTo(q('cough'), { opacity: 0, y: mouth0[1] - 16 }, { opacity: 1, y: mouth0[1] - 24, duration: 0.3, immediateRender: false }, 0.55);
      tl.to(q('cough'), { opacity: 0, duration: 0.3 }, 2.4);
      tl.to(RS, { n: -4, duration: 0.4, ease: EZ }, 1.0);

      // STEP 1 — 5 back blows
      var t1 = 3.0;
      tl.call(emit.step, [1], t1);
      tl.set(S, { n: 0, mode: 0 }, t1);
      tl.to(RS, { x: R1.x, n: 0, duration: 1.2, ease: 'sine.inOut' }, t1);
      tl.to(RS, { ffx: 262, ffy: 336, duration: 0.3, ease: 'sine.inOut' }, t1).to(RS, { ffy: 343, duration: 0.25 }, t1 + 0.3);
      tl.to(RS, { fbx: 266, fby: 336, duration: 0.3, ease: 'sine.inOut' }, t1 + 0.45).to(RS, { fby: 343, duration: 0.25 }, t1 + 0.75);
      tl.to(RS, { ffx: R1.ffx, ffy: 336, duration: 0.3, ease: 'sine.inOut' }, t1 + 0.6).to(RS, { ffy: 343, duration: 0.25 }, t1 + 0.9);
      tl.to(RS, { fbx: R1.fbx, duration: 0.3, ease: 'sine.inOut' }, t1 + 0.95);
      tl.to(RS, { hfx: R1.x + 10, hfy: 270, hbx: R1.x - 4, hby: 271, duration: 1.2, ease: 'sine.inOut' }, t1);
      tl.to(VS, assign({ duration: 0.8, ease: EZ }, V1), t1 + 1.0);
      tl.to(RS, assign({ duration: 0.8, ease: EZ }, R1), t1 + 1.0);
      tl.to(q('cnt'), { opacity: 1, duration: 0.3 }, t1 + 1.2);
      for (var b = 0; b < 5; b++) {
        var tb = t1 + 1.9 + b * 0.66;
        tl.to(RS, { hbx: R1.hbx, hby: R1.hby, duration: 0.3, ease: 'power2.out' }, tb);
        tl.to(RS, { hbx: blow[0], hby: blow[1], duration: 0.14, ease: 'power3.in' }, tb + 0.3);
        tl.to(VS, { a: V1.a + 5, x: V1.x + 2, duration: 0.07, ease: 'power2.out' }, tb + 0.44).to(VS, { a: V1.a, x: V1.x, duration: 0.18, ease: 'sine.out' }, tb + 0.51);
        pulse(tl, q(b % 2 ? 'bb2' : 'bb1'), tb + 0.44, { from: 0.4, to: 2.4, dur: 0.55 });
        tl.set(S, { n: b + 1 }, tb + 0.44);
      }
      // STEP 2 — 5 abdominal thrusts
      var t2 = t1 + 1.9 + 5 * 0.66 + 0.2;
      tl.call(emit.step, [2], t2);
      tl.set(S, { n: 0, mode: 1 }, t2);
      tl.to(VS, assign({ duration: 0.7, ease: EZ }, V2), t2);
      tl.to(RS, assign({ duration: 0.7, ease: EZ }, R2), t2);
      for (var k = 0; k < 5; k++) {
        var tt = t2 + 1.0 + k * 0.72;
        tl.to(RS, { hfx: 366, hfy: 233, hbx: 364, hby: 235, a: R2.a + 3, duration: 0.13, ease: 'power3.in' }, tt);
        tl.to(RS, { hfx: R2.hfx, hfy: R2.hfy, hbx: R2.hbx, hby: R2.hby, a: R2.a, duration: 0.34, ease: 'sine.out' }, tt + 0.13);
        tl.to(VS, { y: V2.y - 4, a: V2.a - 6, duration: 0.12, ease: 'power2.out' }, tt + 0.05).to(VS, { y: V2.y, a: V2.a, duration: 0.3, ease: 'sine.out' }, tt + 0.17);
        pulse(tl, q(k % 2 ? 'at2' : 'at1'), tt + 0.1, { from: 0.4, to: 2.2, dur: 0.5 });
        tl.set(S, { n: k + 1 }, tt + 0.12);
      }
      // STEP 3 — object out, relief
      var t3 = t2 + 1.0 + 5 * 0.72;
      tl.call(emit.step, [3], t3);
      var mouth2 = V.headPt(assign({}, V2, { a: V2.a - 6, y: V2.y - 4 }), 20, -24);
      var land = [462, 344];
      tl.to(q('cnt'), { opacity: 0, duration: 0.3 }, t3);
      tl.set(q('obj'), { x: mouth2[0], y: mouth2[1], opacity: 1, scale: 0.6 }, t3 + 0.05);
      tl.to(q('obj'), { x: land[0], duration: 0.9, ease: 'power1.out' }, t3 + 0.05);
      tl.to(q('obj'), { y: mouth2[1] - 46, scale: 1.1, duration: 0.35, ease: 'power2.out' }, t3 + 0.05).to(q('obj'), { y: land[1], duration: 0.55, ease: 'bounce.out' }, t3 + 0.4);
      [q('s1'), q('s2'), q('s3')].forEach(function (e, i) { tl.set(e, { x: mouth2[0] + 14 + i * 10, y: mouth2[1] - 8 - i * 9 }, t3); });
      sparkleBurst(tl, [q('s1'), q('s2'), q('s3')], t3 + 0.08);
      tl.to(VS, assign({ duration: 1.0, ease: EZ }, V3), t3 + 0.5);
      tl.to(RS, assign({ duration: 1.0, ease: EZ }, R3), t3 + 0.5);
      var okp = V.headPt(V3, 24, -56);
      tl.set(q('ok'), { x: okp[0], y: okp[1] }, t3);
      tl.fromTo(q('ok'), { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2.5)', transformOrigin: '50% 50%', immediateRender: false }, t3 + 1.2);
      tl.to(q('ok'), { y: okp[1] - 16, opacity: 0, duration: 0.8, ease: 'sine.in' }, t3 + 2.3);
      tl.to(VS, { n: -12, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: 1 }, t3 + 1.6);
      // reset
      var tr = t3 + 3.4;
      tl.to([q('figs'), q('obj')], { opacity: 0, duration: 0.35, ease: 'sine.in' }, tr);
      tl.to(VS, assign({ duration: 0.01 }, V0), tr + 0.4);
      tl.to(RS, assign({ duration: 0.01 }, R0), tr + 0.4);
      tl.to(q('figs'), { opacity: 1, duration: 0.4, ease: 'sine.out' }, tr + 0.45);
      render();
      return { tl: tl, render: render, keys: [0.6, t1 + 1.9 + 2 * 0.66 + 0.46, t2 + 1.0 + 2 * 0.72 + 0.13, t3 + 1.6] };
    }
    return { label: 'Choking: the person coughs and clutches their throat, the rescuer gives 5 back blows then 5 abdominal thrusts until the object comes out', markup: markup, build: build };
  }

  /* =====================================================================
   * SCENE: SEVERE BLEEDING (close-up forearm)
   * ===================================================================== */
  function sceneBleeding(p, C) {
    var sk = C.skin1, skD = shade(sk, -0.2);
    var armD = 'M58,190 C170,184 300,194 412,204 L414,262 C300,270 170,282 58,286 Z';
    var clip = p + 'armclip';
    function glove(k, rot) {
      return '<g data-k="' + p + k + '"><g transform="rotate(' + rot + ')">' +
        '<rect x="-21" y="-280" width="42" height="236" rx="12" fill="' + C.uni + '"/>' +
        '<rect x="-21" y="-280" width="10" height="236" fill="#fff" fill-opacity=".08"/>' +
        '<rect data-k="' + p + k + 'cuff" x="-25" y="-56" width="50" height="26" rx="9" fill="' + C.gloveD + '"/>' +
        '<g stroke="' + C.glove + '" stroke-width="12" stroke-linecap="round"><line x1="-17" y1="12" x2="-18" y2="38"/><line x1="-6" y1="16" x2="-6" y2="46"/><line x1="6" y1="16" x2="6.5" y2="45"/><line x1="17" y1="12" x2="17.5" y2="36"/><line x1="-22" y1="-8" x2="-37" y2="12"/></g>' +
        '<path d="M-27,-34 H27 V8 C27,20 19,26 0,26 C-19,26 -27,20 -27,8 Z" fill="' + C.glove + '"/>' +
        '<path d="M-12,18 v12 M0,20 v14 M12,18 v12" stroke="' + C.gloveD + '" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M-20,-28 C-20,-12 -20,0 -16,10" stroke="#fff" stroke-opacity=".3" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<g data-k="' + p + k + 'snap" opacity="0"><path d="M-36,-50 l-12,-8 M-38,-38 l-14,0 M36,-50 l12,-8 M38,-38 l14,0" stroke="' + C.amber + '" stroke-width="3" stroke-linecap="round"/></g>' +
        '</g></g>';
    }
    var strips = '';
    [150, 178, 206, 234, 262, 290].forEach(function (x, i) {
      strips += '<path data-k="' + p + 'bd' + i + '" d="M' + x + ',176 L' + (x + 34) + ',296" stroke="' + C.ice + '" stroke-width="28" fill="none" stroke-dasharray="130" stroke-dashoffset="130"/>' +
        '<path data-k="' + p + 'be' + i + '" d="M' + (x + 14) + ',176 L' + (x + 48) + ',296" stroke="#B9C0E0" stroke-width="2" fill="none" stroke-dasharray="130" stroke-dashoffset="130"/>';
    });
    var markup =
      '<defs><clipPath id="' + clip + '"><path d="M58,186 C170,180 300,190 414,200 L416,266 C300,274 170,286 58,290 Z"/></clipPath></defs>' +
      glow(p, 290, 230, 300, 180) +
      sparkles(C, [[60, 80], [300, 40], [560, 330], [80, 350], [380, 340]]) +
      shadow(p, 290, 320, 250, 16) +
      // sleeve + forearm + hand
      '<path d="' + armD + '" fill="' + sk + '"/>' +
      '<path d="M58,262 C170,262 300,250 414,246 L414,262 C300,270 170,282 58,286 Z" fill="' + skD + '" opacity=".55"/>' +
      '<path d="M70,196 C170,190 300,199 400,208" stroke="#fff" stroke-opacity=".14" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<g stroke="' + sk + '" stroke-linecap="round"><line x1="476" y1="213" x2="538" y2="210" stroke-width="15"/><line x1="480" y1="227" x2="550" y2="226" stroke-width="15"/><line x1="480" y1="241" x2="546" y2="243" stroke-width="15"/><line x1="474" y1="254" x2="528" y2="259" stroke-width="13"/><line x1="440" y1="210" x2="474" y2="188" stroke-width="15"/></g>' +
      '<path d="M404,204 C430,200 470,202 486,210 C496,222 496,246 486,258 C470,266 430,268 406,262 Z" fill="' + sk + '"/>' +
      '<path d="M500,214 v4 M508,228 v4 M506,242 v4" stroke="' + skD + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M8,182 L72,184 Q84,236 72,292 L8,296 Z" fill="' + C.slate + '"/>' +
      '<path d="M60,184 Q74,236 62,292" stroke="' + C.slateL + '" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      // wound
      '<ellipse data-k="' + p + 'wg" cx="226" cy="236" rx="60" ry="34" fill="url(#' + p + 'redg)" opacity=".8"/>' +
      '<ellipse cx="226" cy="236" rx="25" ry="10" fill="' + C.red + '" transform="rotate(-6 226 236)"/>' +
      '<ellipse cx="226" cy="236" rx="15" ry="4" fill="#9E1B2A" transform="rotate(-6 226 236)"/>' +
      '<path d="M214,244 C214,254 210,262 212,270" stroke="' + C.red + '" stroke-width="5" stroke-linecap="round" fill="none"/>' +
      '<path data-k="' + p + 'drop" d="M0,-7 C3,-2 5,1 5,4 A5,5 0 0 1 -5,4 C-5,1 -3,-2 0,-7 Z" fill="' + C.red + '" opacity="0"/>' +
      ring(p + 'wr1', 226, 236, 30, C.red, 2.5) + ring(p + 'wr2', 226, 236, 30, C.red, 2.5) +
      // dressing pad
      '<g data-k="' + p + 'pad" opacity="0"><rect x="188" y="214" width="76" height="44" rx="7" fill="' + C.ice + '"/>' +
      '<path d="M196,226 h60 M196,236 h60 M196,246 h60" stroke="#C9CEE6" stroke-width="1.5" stroke-dasharray="3 4"/>' +
      '<ellipse data-k="' + p + 'stain" cx="228" cy="237" rx="10" ry="6" fill="' + C.red + '" opacity="0"/></g>' +
      // bandage strips clipped to arm
      '<g clip-path="url(#' + clip + ')">' + strips + '</g>' +
      ring(p + 'pr1', 226, 236, 40, C.amber, 2.5) + ring(p + 'pr2', 226, 236, 40, C.amber, 2.5) + ring(p + 'pr3', 226, 236, 40, C.ice, 2) +
      // gloved hands
      glove('g1', -14) + glove('g2', 10) +
      phoneBadge(p + 'call', 430, 98, C, 'CALL 999') + checkBadge(p + 'ok', 530, 98, C) +
      star(p + 'sp1', 330, 170, 8, C.amber) + star(p + 'sp2', 120, 170, 6, C.ice);

    function build(svg, emit) {
      var q = function (n) { return svg.querySelector('[data-k="' + p + n + '"]'); };
      var g1 = q('g1'), g2 = q('g2');
      var H1 = { x: 196, y: 108 }, H2 = { x: 262, y: 100 }, PR1 = { x: 222, y: 226 }, PR2 = { x: 232, y: 216 };
      var tl = gsap.timeline({ repeat: -1, paused: true });
      gsap.set(g1, { x: H1.x, y: -140 }); gsap.set(g2, { x: H2.x, y: -150 });
      tl.set(g1, { x: H1.x, y: -140, opacity: 1 }, 0).set(g2, { x: H2.x, y: -150, opacity: 1 }, 0);
      // wound pulsing / dripping during steps 0–1
      for (var i = 0; i < 6; i++) {
        pulse(tl, q(i % 2 ? 'wr2' : 'wr1'), 0.1 + i * 0.75, { from: 0.8, to: i < 4 ? 2.0 : 1.4, dur: 0.75, op: i < 4 ? 0.8 : 0.35 });
        tl.to(q('wg'), { scale: 1.12, duration: 0.3, yoyo: true, repeat: 1, ease: 'sine.inOut', transformOrigin: '50% 50%' }, 0.1 + i * 0.75);
      }
      [0, 1].forEach(function (j) {
        tl.fromTo(q('drop'), { x: 212, y: 268, opacity: 1, scale: 0.6 }, { y: 330, opacity: 0, scale: 1, duration: 0.7, ease: 'power2.in', immediateRender: false }, 0.6 + j * 1.2);
      });
      // STEP 0 — gloves on
      tl.call(emit.step, [0], 0.01);
      tl.to(g1, { y: H1.y, duration: 0.7, ease: 'power3.out' }, 0.4);
      tl.to(g2, { y: H2.y, duration: 0.7, ease: 'power3.out' }, 0.55);
      [['g1', 1.25], ['g2', 1.55]].forEach(function (g) {
        tl.fromTo(q(g[0] + 'cuff'), { scaleY: 1 }, { scaleY: 0.75, duration: 0.08, yoyo: true, repeat: 1, ease: 'power2.out', transformOrigin: '50% 100%', immediateRender: false }, g[1]);
        tl.fromTo(q(g[0] + 'snap'), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1.1, duration: 0.12, ease: 'power2.out', transformOrigin: '50% 50%', immediateRender: false }, g[1]);
        tl.to(q(g[0] + 'snap'), { opacity: 0, duration: 0.3 }, g[1] + 0.25);
        tl.to(q(g[0]), { rotation: 6, duration: 0.08, yoyo: true, repeat: 1 }, g[1]);
      });
      // STEP 1 — firm pressure with a pad
      var t1 = 2.6;
      tl.call(emit.step, [1], t1);
      tl.to(q('pad'), { opacity: 1, duration: 0.3 }, t1 + 0.4);
      tl.fromTo(q('pad'), { y: -60 }, { y: 0, duration: 0.6, ease: 'power3.out', immediateRender: false }, t1 + 0.4);
      tl.to(g1, { x: PR1.x, y: PR1.y, duration: 0.6, ease: 'power3.out' }, t1 + 0.4);
      tl.to(g2, { x: PR2.x, y: PR2.y, duration: 0.6, ease: 'power3.out' }, t1 + 0.55);
      for (var k = 0; k < 3; k++) {
        var tp = t1 + 1.2 + k * 0.75;
        tl.to([g1, g2], { scaleY: 0.94, duration: 0.15, yoyo: true, repeat: 1, ease: 'sine.inOut', transformOrigin: '50% 100%' }, tp);
        pulse(tl, q(['pr1', 'pr2', 'pr3'][k]), tp + 0.05, { from: 0.7, to: 2.2, dur: 0.8 });
      }
      tl.to(q('wg'), { opacity: 0.15, duration: 1.4 }, t1 + 1.2);
      tl.to(q('stain'), { opacity: 0.55, duration: 1.5 }, t1 + 1.2);
      // STEP 2 — bandage
      var t2 = t1 + 3.6;
      tl.call(emit.step, [2], t2);
      tl.to(g1, { y: -170, duration: 0.6, ease: 'power2.in' }, t2 + 0.1);
      tl.to(g2, { y: -180, duration: 0.6, ease: 'power2.in' }, t2 + 0.2);
      for (var s = 0; s < 6; s++) {
        tl.to([q('bd' + s), q('be' + s)], { strokeDashoffset: 0, duration: 0.42, ease: 'power1.inOut' }, t2 + 0.5 + s * 0.42);
      }
      // STEP 3 — call 999 + check
      var t3 = t2 + 3.6;
      tl.call(emit.step, [3], t3);
      pop(tl, q('call'), t3 + 0.1);
      [0, 1, 2].forEach(function (j) { pulse(tl, q('callr' + (j % 2 + 1)), t3 + 0.5 + j * 0.5, { from: 0.9, to: 1.8, dur: 0.8 }); });
      pop(tl, q('ok'), t3 + 1.1);
      tl.to(q('okp'), { strokeDashoffset: 0, duration: 0.4, ease: 'power2.out' }, t3 + 1.3);
      sparkleBurst(tl, [q('sp1'), q('sp2')], t3 + 1.4);
      // reset
      var tr = t3 + 3.0;
      var stripEls = [];
      for (var z = 0; z < 6; z++) { stripEls.push(q('bd' + z), q('be' + z)); }
      tl.to([q('call'), q('ok'), q('pad')].concat(stripEls), { opacity: 0, duration: 0.5 }, tr);
      tl.set(stripEls, { strokeDashoffset: 130, opacity: 1 }, tr + 0.55);
      tl.set(q('okp'), { strokeDashoffset: 40 }, tr + 0.55);
      tl.set(q('stain'), { opacity: 0 }, tr + 0.55);
      tl.to(q('wg'), { opacity: 0.8, duration: 0.4 }, tr + 0.3);
      tl.to({}, { duration: 0.1 }, tr + 0.7);
      return { tl: tl, render: function () {}, keys: [1.9, t1 + 1.6, t2 + 3.2, t3 + 2.0] };
    }
    return { label: 'Severe bleeding: put on gloves, press firmly on the wound with a pad, bandage it, then call 999', markup: markup, build: build };
  }

  /* =====================================================================
   * SCENE: BURNS
   * ===================================================================== */
  function sceneBurns(p, C) {
    var sk = C.skin3, skD = shade(sk, -0.18);
    var TCIRC = f(2 * Math.PI * 38);
    var hand =
      '<g data-k="' + p + 'hand">' +
      '<rect x="-270" y="-24" width="250" height="48" rx="20" fill="' + sk + '"/>' +
      '<rect x="-270" y="8" width="250" height="16" rx="8" fill="' + skD + '" opacity=".45"/>' +
      '<rect x="-300" y="-31" width="168" height="62" rx="14" fill="' + C.slateL + '"/>' +
      '<rect x="-146" y="-31" width="14" height="62" rx="6" fill="' + shade(C.slateL, -0.12) + '"/>' +
      '<g stroke="' + sk + '" stroke-linecap="round"><line x1="28" y1="-20" x2="74" y2="-23" stroke-width="14"/><line x1="32" y1="-6.5" x2="84" y2="-6.5" stroke-width="14"/><line x1="32" y1="7" x2="80" y2="9" stroke-width="14"/><line x1="28" y1="20" x2="66" y2="25" stroke-width="12.5"/><line x1="-8" y1="-24" x2="22" y2="-46" stroke-width="15"/></g>' +
      '<path d="M-36,-29 C-10,-35 22,-33 34,-27 C43,-20 43,20 34,27 C22,33 -10,35 -36,29 C-46,14 -46,-14 -36,-29 Z" fill="' + sk + '"/>' +
      '<path d="M40,-20 v3 M44,-7 v3 M44,6 v3 M40,19 v3" stroke="' + skD + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M-26,-24 C-4,-29 18,-27 28,-23" stroke="#fff" stroke-opacity=".2" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<ellipse data-k="' + p + 'burn" cx="72" cy="0" rx="26" ry="34" fill="url(#' + p + 'redg)" opacity="0"/>' +
      '<g data-k="' + p + 'ring"><rect x="48" y="-1" width="8" height="17" rx="3" fill="' + C.amber + '"/><rect x="50" y="1" width="2.5" height="13" rx="1.2" fill="#fff" fill-opacity=".6"/></g>' +
      '</g>';
    var markup =
      glow(p, 300, 220, 300, 180) +
      sparkles(C, [[540, 210], [60, 330], [320, 40], [560, 360]]) +
      // pan + flame
      '<g data-k="' + p + 'pan">' +
      shadow(p, 452, 342, 90, 8) +
      '<rect x="398" y="330" width="110" height="8" rx="4" fill="#4A53A0"/>' +
      '<g data-k="' + p + 'flame"><path d="M452,330 C432,326 430,306 442,294 C442,306 448,308 452,300 C454,312 460,310 462,300 C474,310 472,326 452,330 Z" fill="' + C.red + '"/>' +
      '<path d="M452,330 C442,328 440,316 448,308 C449,316 453,318 455,312 C462,318 462,328 452,330 Z" fill="' + C.amber + '"/>' +
      '<path d="M424,330 C414,326 416,314 422,310 C423,318 428,318 430,316 C434,322 432,330 424,330 Z" fill="' + C.red + '"/>' +
      '<path d="M482,330 C474,328 474,316 480,310 C481,318 486,318 488,315 C492,322 490,330 482,330 Z" fill="' + C.red + '"/></g>' +
      '<path d="M380,268 L524,268 L514,294 Q452,304 390,294 Z" fill="#4A53A0"/>' +
      '<path d="M392,282 Q452,290 512,282" stroke="#fff" stroke-opacity=".12" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<rect x="376" y="262" width="152" height="9" rx="4.5" fill="#7A84CC"/>' +
      '<rect x="300" y="266" width="82" height="11" rx="5.5" fill="#5B64A8"/>' +
      '<path data-k="' + p + 'hw1" d="M424,252 c-6,-8 6,-14 0,-22 c-6,-8 6,-14 0,-22" stroke="' + C.amber + '" stroke-width="3" fill="none" stroke-linecap="round" opacity="0"/>' +
      '<path data-k="' + p + 'hw2" d="M452,252 c-6,-8 6,-14 0,-22 c-6,-8 6,-14 0,-22" stroke="' + C.red + '" stroke-width="3" fill="none" stroke-linecap="round" opacity="0"/>' +
      '<path data-k="' + p + 'hw3" d="M480,252 c-6,-8 6,-14 0,-22 c-6,-8 6,-14 0,-22" stroke="' + C.amber + '" stroke-width="3" fill="none" stroke-linecap="round" opacity="0"/>' +
      '</g>' +
      // tap + water
      '<g data-k="' + p + 'tap" opacity="0">' +
      '<path d="M-10,64 H176 Q206,64 206,94 V104" stroke="#9AA3D8" stroke-width="20" fill="none" stroke-linecap="round"/>' +
      '<path d="M-10,58 H176" stroke="#fff" stroke-opacity=".25" stroke-width="4" fill="none"/>' +
      '<rect x="190" y="102" width="32" height="14" rx="5" fill="#C9CEE6"/>' +
      '<rect x="140" y="40" width="10" height="16" rx="3" fill="#9AA3D8"/><rect x="124" y="32" width="42" height="11" rx="5.5" fill="#C9CEE6"/>' +
      '</g>' +
      '<g data-k="' + p + 'water" opacity="0">' +
      '<rect x="198" y="116" width="16" height="250" rx="8" fill="' + C.ice + '" fill-opacity=".28"/>' +
      '<path data-k="' + p + 'wd1" d="M203,118 V366" stroke="' + C.ice + '" stroke-width="3" stroke-dasharray="16 14" stroke-linecap="round" opacity=".9"/>' +
      '<path data-k="' + p + 'wd2" d="M210,124 V366" stroke="#BFD0FF" stroke-width="2.5" stroke-dasharray="10 18" stroke-linecap="round" opacity=".8"/>' +
      '</g>' +
      '<g data-k="' + p + 'drops" opacity="0">' +
      '<circle data-k="' + p + 'd1" cx="196" cy="222" r="3.5" fill="' + C.ice + '"/><circle data-k="' + p + 'd2" cx="216" cy="222" r="3" fill="' + C.ice + '"/><circle data-k="' + p + 'd3" cx="206" cy="222" r="2.5" fill="' + C.ice + '"/>' +
      '</g>' +
      // timer
      '<g data-k="' + p + 'timer" opacity="0">' +
      '<circle cx="478" cy="118" r="50" fill="#070B22" fill-opacity=".45"/>' +
      '<circle cx="478" cy="118" r="38" fill="none" stroke="' + C.ice + '" stroke-opacity=".12" stroke-width="7"/>' +
      '<circle data-k="' + p + 'tring" cx="478" cy="118" r="38" fill="none" stroke="#7FB8FF" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + TCIRC + '" stroke-dashoffset="' + TCIRC + '" transform="rotate(-90 478 118)"/>' +
      '<text x="478" y="125" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="26" fill="' + C.ice + '">20</text>' +
      '<text x="478" y="142" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="9" letter-spacing="2" fill="' + C.ice + '" fill-opacity=".6">MIN</text>' +
      '<text x="478" y="190" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="10" letter-spacing="2" fill="#9FC6FF">COOL WATER</text>' +
      '</g>' +
      shadow(p, 300, 334, 200, 12, p + 'hshadow') +
      hand +
      '<g data-k="' + p + 'flyring" opacity="0"><rect x="-4" y="-8.5" width="8" height="17" rx="3" fill="' + C.amber + '"/></g>' +
      star(p + 'rs1', 0, 0, 8, C.amber) + star(p + 'rs2', 0, 0, 6, C.ice) +
      '<g data-k="' + p + 'cross" opacity="0"><path d="M0,-10 v20 M-10,0 h20" stroke="' + C.red + '" stroke-width="4" stroke-linecap="round"/></g>' +
      // cling film
      '<g data-k="' + p + 'film" opacity="0">' +
      '<path d="M178,176 C250,166 350,170 428,182 C436,222 438,264 426,300 C340,312 256,310 180,300 C170,262 170,216 178,176 Z" fill="' + C.ice + '" fill-opacity=".2" stroke="' + C.ice + '" stroke-opacity=".7" stroke-width="1.6"/>' +
      '<path d="M200,190 L250,186 M210,206 L300,196 M330,286 L410,276 M380,192 L418,198" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M240,300 C250,292 262,306 272,298 M330,300 C340,292 350,306 360,298" stroke="' + C.ice + '" stroke-opacity=".5" stroke-width="1.5" fill="none"/>' +
      '</g>' +
      checkBadge(p + 'ok', 478, 118, C);

    function build(svg, emit) {
      var q = function (n) { return svg.querySelector('[data-k="' + p + n + '"]'); };
      var hand = q('hand'), ringEl = q('ring');
      var A0 = { x: 150, y: 236 }, A1 = { x: 300, y: 252 }, AT = { x: 190, y: 246 }, AC = { x: 300, y: 238 };
      var tl = gsap.timeline({ repeat: -1, paused: true });
      gsap.set(hand, { x: A0.x, y: A0.y });
      gsap.set(q('hshadow'), { x: A0.x - 300 });
      tl.set(hand, { x: A0.x, y: A0.y }, 0);
      tl.set(q('hshadow'), { x: A0.x - 300, opacity: 0.8 }, 0);
      // flame flicker + heat waves (step 0)
      tl.to(q('flame'), { scaleY: 1.14, scaleX: 0.96, duration: 0.16, yoyo: true, repeat: 19, ease: 'sine.inOut', transformOrigin: '50% 100%' }, 0);
      for (var i = 0; i < 3; i++) {
        ['hw1', 'hw2', 'hw3'].forEach(function (h, j) {
          tl.fromTo(q(h), { y: 6, opacity: 0 }, { y: -26, opacity: 0.9, duration: 0.55, ease: 'sine.out', immediateRender: false }, 0.1 + i * 1.05 + j * 0.18);
          tl.to(q(h), { opacity: 0, duration: 0.4, ease: 'sine.in' }, 0.65 + i * 1.05 + j * 0.18);
        });
      }
      // STEP 0 — near the heat
      tl.call(emit.step, [0], 0.01);
      tl.to(hand, { x: A1.x, y: A1.y, duration: 1.1, ease: 'power2.inOut' }, 0.3);
      tl.to(q('hshadow'), { x: 0, duration: 1.1, ease: 'power2.inOut' }, 0.3);
      tl.to(q('burn'), { opacity: 1, duration: 0.25 }, 1.4);
      tl.set(q('cross'), { x: A1.x + 96, y: A1.y - 32 }, 1.4);
      tl.fromTo(q('cross'), { opacity: 0, scale: 0.4, rotation: 0 }, { opacity: 1, scale: 1.2, rotation: 45, duration: 0.3, ease: 'back.out(3)', transformOrigin: '50% 50%', immediateRender: false }, 1.45);
      tl.to(q('cross'), { opacity: 0, duration: 0.3 }, 2.1);
      tl.to(hand, { x: A1.x - 80, y: A1.y - 12, duration: 0.35, ease: 'power3.out' }, 1.55);
      tl.to(q('hshadow'), { x: -80, duration: 0.35, ease: 'power3.out' }, 1.55);
      // STEP 1 — cool under running water 20 min
      var t1 = 3.4;
      tl.call(emit.step, [1], t1);
      tl.to(q('pan'), { opacity: 0, duration: 0.5 }, t1);
      tl.fromTo(q('tap'), { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, t1 + 0.1);
      tl.to(hand, { x: AT.x, y: AT.y, duration: 0.9, ease: 'power2.inOut' }, t1 + 0.2);
      tl.to(q('hshadow'), { x: AT.x - 300, duration: 0.9, ease: 'power2.inOut' }, t1 + 0.2);
      tl.fromTo(q('water'), { opacity: 0, scaleY: 0 }, { opacity: 1, scaleY: 1, duration: 0.45, ease: 'power2.in', transformOrigin: '50% 0%', immediateRender: false }, t1 + 0.9);
      tl.to(q('wd1'), { strokeDashoffset: -30 * 24, duration: 7.6, ease: 'none' }, t1 + 0.9);
      tl.to(q('wd2'), { strokeDashoffset: -28 * 24, duration: 7.6, ease: 'none' }, t1 + 0.9);
      tl.to(q('drops'), { opacity: 1, duration: 0.2 }, t1 + 1.3);
      for (var d = 0; d < 7; d++) {
        var td = t1 + 1.3 + d * 0.85;
        tl.fromTo(q('d1'), { x: 0, y: 0, opacity: 1 }, { x: -22, y: -16, opacity: 0, duration: 0.55, ease: 'power2.out', immediateRender: false }, td);
        tl.fromTo(q('d2'), { x: 0, y: 0, opacity: 1 }, { x: 24, y: -12, opacity: 0, duration: 0.55, ease: 'power2.out', immediateRender: false }, td + 0.2);
        tl.fromTo(q('d3'), { x: 0, y: 0, opacity: 1 }, { x: -6, y: -22, opacity: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, td + 0.42);
      }
      tl.to(q('burn'), { opacity: 0.25, duration: 2.5 }, t1 + 1.2);
      pop(tl, q('timer'), t1 + 1.0);
      tl.fromTo(q('tring'), { strokeDashoffset: TCIRC }, { strokeDashoffset: 0, duration: 3.2, ease: 'power1.inOut', immediateRender: false }, t1 + 1.3);
      // STEP 2 — remove ring
      var t2 = t1 + 4.8;
      tl.call(emit.step, [2], t2);
      tl.to(ringEl, { x: 26, duration: 0.8, ease: 'power2.inOut' }, t2 + 0.3);
      tl.to(ringEl, { opacity: 0, duration: 0.05 }, t2 + 1.1);
      var rp = { x: AT.x + 26 + 52, y: AT.y + 7.5 };
      tl.set(q('flyring'), { x: rp.x, y: rp.y, rotation: 0, opacity: 1 }, t2 + 1.1);
      tl.to(q('flyring'), { x: rp.x + 70, duration: 0.8, ease: 'power1.out' }, t2 + 1.1);
      tl.to(q('flyring'), { y: rp.y - 70, rotation: 200, duration: 0.8, ease: 'power2.out' }, t2 + 1.1);
      tl.to(q('flyring'), { opacity: 0, duration: 0.3 }, t2 + 1.7);
      tl.set(q('rs1'), { x: rp.x + 8, y: rp.y - 6 }, t2);
      tl.set(q('rs2'), { x: rp.x + 70, y: rp.y - 72 }, t2);
      sparkleBurst(tl, [q('rs1')], t2 + 1.1);
      sparkleBurst(tl, [q('rs2')], t2 + 1.75);
      // STEP 3 — cover loosely with cling film
      var t3 = t2 + 2.6;
      tl.call(emit.step, [3], t3);
      tl.to(q('water'), { opacity: 0, duration: 0.4 }, t3);
      tl.to(q('drops'), { opacity: 0, duration: 0.3 }, t3);
      tl.to([q('tap'), q('timer')], { opacity: 0, duration: 0.5 }, t3 + 0.1);
      tl.to(hand, { x: AC.x, y: AC.y, duration: 0.8, ease: 'power2.inOut' }, t3 + 0.2);
      tl.to(q('hshadow'), { x: 0, duration: 0.8, ease: 'power2.inOut' }, t3 + 0.2);
      tl.fromTo(q('film'), { opacity: 0, y: -90, rotation: -5 }, { opacity: 1, y: 0, rotation: 0, duration: 0.9, ease: 'power3.out', transformOrigin: '50% 50%', immediateRender: false }, t3 + 1.0);
      tl.to(q('film'), { scaleY: 1.03, duration: 0.35, yoyo: true, repeat: 1, ease: 'sine.inOut', transformOrigin: '50% 100%' }, t3 + 1.9);
      pop(tl, q('ok'), t3 + 2.0);
      tl.to(q('okp'), { strokeDashoffset: 0, duration: 0.4, ease: 'power2.out' }, t3 + 2.2);
      // reset
      var tr = t3 + 3.8;
      tl.to([q('film'), q('ok')], { opacity: 0, duration: 0.45 }, tr);
      tl.to(hand, { x: A0.x, y: A0.y, duration: 0.8, ease: 'power2.inOut' }, tr + 0.1);
      tl.to(q('hshadow'), { x: A0.x - 300, duration: 0.8, ease: 'power2.inOut' }, tr + 0.1);
      tl.set(ringEl, { x: 0 }, tr + 0.1);
      tl.to(ringEl, { opacity: 1, duration: 0.3 }, tr + 0.3);
      tl.to(q('burn'), { opacity: 0, duration: 0.3 }, tr);
      tl.to(q('pan'), { opacity: 1, duration: 0.5 }, tr + 0.3);
      tl.set(q('okp'), { strokeDashoffset: 40 }, tr + 0.5);
      tl.set(q('tring'), { strokeDashoffset: TCIRC }, tr + 0.5);
      tl.to({}, { duration: 0.1 }, tr + 0.9);
      return { tl: tl, render: function () {}, keys: [1.7, t1 + 3.2, t2 + 0.9, t3 + 2.8] };
    }
    return { label: 'Burns: hand near a hot pan, cooled under cool running water for 20 minutes, ring removed, then loosely covered with cling film', markup: markup, build: build };
  }

  var SCENES = { cpr: sceneCPR, aed: sceneAED, recovery: sceneRecovery, choking: sceneChoking, bleeding: sceneBleeding, burns: sceneBurns };
  var IDS = ['cpr', 'aed', 'recovery', 'choking', 'bleeding', 'burns'];

  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function safe(fn) {
    return function (v) { if (typeof fn === 'function') { try { fn(v); } catch (e) { if (window.console) console.error(e); } } };
  }

  function mount(el, id, cbs) {
    cbs = cbs || {};
    if (!el) throw new Error('FALab.mount: missing element');
    if (!SCENES[id]) id = 'cpr';
    var C = palette();
    var p = 'fa' + Math.random().toString(36).slice(2, 8) + '-';
    var sc = SCENES[id](p, C);
    el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + sc.label + '" ' +
      'style="width:100%;height:auto;display:block;overflow:hidden" focusable="false">' + defs(p, C) + sc.markup + '</svg>';
    var svg = el.querySelector('svg');
    // mini:true (e.g. a modal view) renders the same scene; every mount is fully independent
    if (cbs.mini) svg.setAttribute('data-mini', '');
    var emit = { step: safe(cbs.onStep), count: safe(cbs.onCount) };
    var dead = false, timer = null, rIdx = 0, playing = true;

    if (!window.gsap) {
      emit.step(0);
      return { play: function () {}, pause: function () {}, restart: function () {}, destroy: function () { dead = true; el.innerHTML = ''; } };
    }
    var reduced = reducedMotion();
    // in reduced mode callbacks inside the timeline are silenced; we drive steps ourselves
    var api = sc.build(svg, reduced ? { step: function () {}, count: function () {} } : emit);
    var tl = api.tl;

    function showKey(i) {
      tl.pause();
      tl.seek(api.keys[i], true);
      api.render();
      emit.step(i);
    }
    function cycle() {
      if (dead || !playing) return;
      gsap.to(svg, { opacity: 0, duration: 0.3, ease: 'sine.in', onComplete: function () {
        if (dead) return;
        rIdx = (rIdx + 1) % 4; showKey(rIdx);
        gsap.to(svg, { opacity: 1, duration: 0.35, ease: 'sine.out' });
      } });
      timer = setTimeout(cycle, 3000);
    }
    if (reduced) {
      showKey(0);
      timer = setTimeout(cycle, 3000);
    } else {
      tl.play(0);
    }
    return {
      // QA helper (undocumented): jump to time t (seconds) and hold; returns loop duration
      _seek: function (t) { if (dead) return; playing = false; clearTimeout(timer); tl.pause(); tl.seek(t, true); api.render(); return tl.duration(); },
      play: function () {
        if (dead || playing) return;
        playing = true;
        if (reduced) { clearTimeout(timer); timer = setTimeout(cycle, 3000); } else tl.play();
      },
      pause: function () {
        if (dead) return;
        playing = false;
        if (reduced) { clearTimeout(timer); gsap.killTweensOf(svg); gsap.set(svg, { opacity: 1 }); } else tl.pause();
      },
      restart: function () {
        if (dead) return;
        playing = true;
        if (reduced) { clearTimeout(timer); rIdx = 0; showKey(0); timer = setTimeout(cycle, 3000); } else tl.restart();
      },
      destroy: function () {
        if (dead) return;
        dead = true; clearTimeout(timer);
        tl.kill(); gsap.killTweensOf(svg);
        el.innerHTML = '';
      }
    };
  }

  window.FALab = { ids: IDS.slice(), mount: mount };
})();
