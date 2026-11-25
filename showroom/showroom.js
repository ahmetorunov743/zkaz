/* =====================================================================
   VENEZIA SHOWROOM — guided 3D walkthrough (three.js r128, no build)
   ---------------------------------------------------------------------
   World units are metres. Building footprint: x 0..26 (left → right on
   the plan), z 0..9 (back wall → glass facade). Ground floor y = 0,
   first floor y = 3.9. Movement happens only along NODES (bottom of file
   section "TOUR"), like Street View: drag to look, tap an arrow / the
   floor / the minimap to walk.
   ===================================================================== */
(function () {
  'use strict';

  if (!window.THREE) { document.getElementById('nowebgl').hidden = false; return; }
  var T = THREE;

  // ------------------------------------------------------------------
  // Constants
  // ------------------------------------------------------------------
  var W = 26, D = 9;
  var G_CEIL = 3.6;          // ground floor ceiling (slats)
  var F1 = 3.9;              // first floor level
  var F1_CEIL = F1 + 3.3;    // first floor ceiling
  var EYE = 1.6;
  var STAIR_X0 = 24.45, STAIR_X1 = 25.95, STAIR_Z_BOTTOM = 8.0, STAIR_Z_TOP = 1.3;

  // ------------------------------------------------------------------
  // Renderer
  // ------------------------------------------------------------------
  var canvas = document.getElementById('scene');
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('nowebgl').hidden = false; return;
  }
  var isMobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.6 : 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  var MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

  var scene = new T.Scene();
  scene.background = new T.Color(0xcfd8de);
  var camera = new T.PerspectiveCamera(72, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';

  // ------------------------------------------------------------------
  // Random + texture helpers
  // ------------------------------------------------------------------
  var seed = 12345;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function R(a, b) { return a + (b - a) * rnd(); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

  var texCache = {};
  function canvasTex(key, w, h, draw) {
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.encoding = T.sRGBEncoding;
    t.anisotropy = MAX_ANISO;
    texCache[key] = t;
    return t;
  }
  function rep(tex, rx, ry) {
    var t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t;
  }

  function drawMarble(g, w, h, o) {
    g.fillStyle = o.base; g.fillRect(0, 0, w, h);
    var i, n;
    // soft clouds
    for (i = 0; i < (o.clouds || 40); i++) {
      var x = R(0, w), y = R(0, h), r = R(w * 0.05, w * 0.3);
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      var col = pick(o.cloud);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = R(0.12, 0.4); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    // patches (breccia style)
    if (o.patches) {
      for (i = 0; i < o.patches; i++) {
        g.fillStyle = pick(o.patchCol); g.globalAlpha = R(0.55, 0.95);
        g.beginPath();
        var cx = R(0, w), cy = R(0, h), rr = R(w * 0.03, w * 0.14), k = 9;
        for (n = 0; n <= k; n++) {
          var a = n / k * Math.PI * 2, q = rr * R(0.55, 1.25);
          g[n ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * q * 1.4, cy + Math.sin(a) * q);
        }
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    }
    // veins
    for (i = 0; i < (o.veins || 14); i++) {
      g.strokeStyle = pick(o.vein); g.globalAlpha = R(0.35, 0.95);
      g.lineWidth = R(0.6, o.veinW || 2.6);
      g.beginPath();
      var px = R(-w * 0.1, w * 1.1), py = R(-h * 0.1, h * 1.1), ang = R(0, Math.PI * 2);
      g.moveTo(px, py);
      for (n = 0; n < 60; n++) {
        ang += R(-0.5, 0.5); px += Math.cos(ang) * w / 40; py += Math.sin(ang) * h / 40;
        g.lineTo(px, py);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawWood(g, w, h, o) {
    g.fillStyle = o.base; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 220; i++) {
      var x = R(0, w);
      g.strokeStyle = rnd() < 0.5 ? o.dark : o.light;
      g.globalAlpha = R(0.08, 0.35); g.lineWidth = R(0.5, 3);
      g.beginPath(); g.moveTo(x, 0);
      for (var y = 0; y <= h; y += h / 16) g.lineTo(x + Math.sin(y * 0.02 + i) * R(0.5, 3), y);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawNoise(g, w, h, base, cols, count, size) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (var i = 0; i < count; i++) {
      g.fillStyle = pick(cols); g.globalAlpha = R(0.25, 0.8);
      var s = R(size * 0.4, size);
      g.beginPath(); g.arc(R(0, w), R(0, h), s, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }

  // Textures --------------------------------------------------------------
  var TX = {};
  function buildTextures() {
    TX.travertine = canvasTex('trav', 512, 512, function (g, w, h) {
      g.fillStyle = '#d8ccba'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 260; i++) {
        g.fillStyle = pick(['#cbbda7', '#e4dacb', '#c4b49c', '#ded3c2', '#bfae95']);
        g.globalAlpha = R(0.2, 0.6);
        g.fillRect(R(-50, w), R(0, h), R(30, 260), R(1, 5));
      }
      for (i = 0; i < 160; i++) {
        g.fillStyle = '#a8977e'; g.globalAlpha = R(0.2, 0.5);
        g.fillRect(R(0, w), R(0, h), R(2, 9), R(1, 2));
      }
      g.globalAlpha = 1; g.strokeStyle = 'rgba(120,100,80,.55)'; g.lineWidth = 2;
      g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    });
    TX.oak = canvasTex('oak', 256, 512, function (g, w, h) { drawWood(g, w, h, { base: '#8a5a36', dark: '#5d3a20', light: '#a87650' }); });
    TX.oakLight = canvasTex('oakL', 256, 512, function (g, w, h) { drawWood(g, w, h, { base: '#a97b52', dark: '#7a5233', light: '#c49a6e' }); });
    TX.walnut = canvasTex('wal', 256, 512, function (g, w, h) { drawWood(g, w, h, { base: '#4e3322', dark: '#2f1d12', light: '#6b4a33' }); });
    TX.marbleBlue = canvasTex('mBlue', 512, 512, function (g, w, h) {
      drawMarble(g, w, h, { base: '#b9c6d0', cloud: ['#5e7a93', '#e9eef2', '#38506a', '#9fb3c4'], clouds: 70,
        vein: ['#2b3c50', '#a0764a', '#ffffff', '#1d2a38'], veins: 22, veinW: 2.2 });
    });
    TX.marbleWarm = canvasTex('mWarm', 512, 512, function (g, w, h) {
      drawMarble(g, w, h, { base: '#e1cfb5', cloud: ['#c8a47a', '#f3e9db', '#b48a5e', '#d9c3a3'], clouds: 60,
        vein: ['#8a5a32', '#6b4223', '#c79563', '#fff4e4'], veins: 20, veinW: 2.4 });
    });
    TX.marbleRed = canvasTex('mRed', 512, 512, function (g, w, h) {
      drawMarble(g, w, h, { base: '#efe3d6', cloud: ['#c9a790', '#ffffff'], clouds: 30,
        patches: 70, patchCol: ['#7a2e24', '#94473a', '#5a1f19', '#a8604c', '#6e3b30'],
        vein: ['#5a1f19', '#ffffff', '#3c1410'], veins: 18, veinW: 3 });
    });
    TX.marbleDark = canvasTex('mDark', 512, 512, function (g, w, h) {
      drawMarble(g, w, h, { base: '#4b4642', cloud: ['#2c2926', '#6d665f', '#7d6a55'], clouds: 60,
        vein: ['#d8cfc4', '#b39a7c', '#1b1917'], veins: 24, veinW: 1.8 });
    });
    TX.marbleGrey = canvasTex('mGrey', 512, 512, function (g, w, h) {
      drawMarble(g, w, h, { base: '#8f8a83', cloud: ['#5f5a54', '#b7b1a8', '#74695c'], clouds: 60,
        vein: ['#ece6dc', '#c19c6e', '#3d3934'], veins: 22, veinW: 2 });
    });
    TX.weave = canvasTex('weave', 512, 512, function (g, w, h) {
      g.fillStyle = '#6b4a35'; g.fillRect(0, 0, w, h);
      var n = 4, s = w / n;
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        var hor = (i + j) % 2 === 0, x = i * s, y = j * s;
        for (var k = 0; k < 3; k++) {
          var gr = hor ? g.createLinearGradient(x, y + k * s / 3, x, y + (k + 1) * s / 3)
                       : g.createLinearGradient(x + k * s / 3, y, x + (k + 1) * s / 3, y);
          gr.addColorStop(0, '#9c7154'); gr.addColorStop(0.5, '#b88a69'); gr.addColorStop(1, '#6e4a33');
          g.fillStyle = gr;
          if (hor) g.fillRect(x + 2, y + k * s / 3 + 2, s - 4, s / 3 - 4);
          else g.fillRect(x + k * s / 3 + 2, y + 2, s / 3 - 4, s - 4);
        }
      }
    });
    TX.boucle = canvasTex('boucle', 256, 256, function (g, w, h) {
      drawNoise(g, w, h, '#b7afa4', ['#d8d1c6', '#8f877c', '#c9c1b6', '#a39b90', '#efe9df'], 3200, 2.6);
    });
    TX.olive = canvasTex('oliveFab', 256, 256, function (g, w, h) {
      drawNoise(g, w, h, '#8e8f45', ['#a3a455', '#74753a', '#9a9b4e', '#b0b062'], 2500, 2.2);
    });
    TX.plaster = canvasTex('plaster', 256, 256, function (g, w, h) {
      drawNoise(g, w, h, '#e3d9cb', ['#d8cdbd', '#ece4d8', '#d1c5b3'], 1800, 3);
    });
    TX.fluted = canvasTex('fluted', 256, 256, function (g, w, h) {
      g.fillStyle = '#d9d1c4'; g.fillRect(0, 0, w, h);
      for (var x = 0; x < w; x += 16) {
        var gr = g.createLinearGradient(x, 0, x + 16, 0);
        gr.addColorStop(0, '#b8ad9c'); gr.addColorStop(0.45, '#efe8dd'); gr.addColorStop(1, '#a99d8b');
        g.fillStyle = gr; g.fillRect(x, 0, 16, h);
      }
      g.globalAlpha = 0.25; drawNoise(g, w, h, 'rgba(0,0,0,0)', ['#8f8474', '#fff'], 600, 2); g.globalAlpha = 1;
    });
    TX.rug = canvasTex('rug', 512, 512, function (g, w, h) {
      drawNoise(g, w, h, '#dccdb6', ['#e9dcc8', '#cdbb9f', '#d3c3aa'], 4000, 2);
      g.strokeStyle = '#7a4f30'; g.lineWidth = 10;
      g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 14, 0, 7); g.stroke();
    });
    TX.rugGrey = canvasTex('rugG', 256, 256, function (g, w, h) {
      drawNoise(g, w, h, '#a9a49d', ['#bcb7af', '#97928b', '#c7c2ba'], 2600, 2);
    });
    TX.sky = canvasTex('sky', 16, 256, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#7fa6c9'); gr.addColorStop(0.45, '#c7d9e6'); gr.addColorStop(0.55, '#e8e4da'); gr.addColorStop(1, '#d9c9ab');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    TX.sand = canvasTex('sand', 256, 256, function (g, w, h) {
      drawNoise(g, w, h, '#d6c6a5', ['#cbb994', '#e2d4b7', '#bfae8a'], 2400, 2);
    });
    TX.hedge = canvasTex('hedge', 256, 256, function (g, w, h) {
      drawNoise(g, w, h, '#3f5a2a', ['#567a36', '#2f4720', '#6b8f43', '#4a6b2f'], 3000, 4);
    });
    TX.desk = canvasTex('deskText', 1024, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.font = '500 64px "Bodoni Moda", Didot, serif';
      g.fillStyle = 'rgba(95,60,30,.8)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('C O L O R S   O F   L I V I N G', w / 2, h / 2 + 4);
    });
    TX.desk.wrapS = TX.desk.wrapT = T.ClampToEdgeWrapping;
  }

  // ------------------------------------------------------------------
  // Materials
  // ------------------------------------------------------------------
  var MT = {};
  function std(o) { return new T.MeshStandardMaterial(o); }
  function buildMaterials() {
    MT.trav = std({ map: rep(TX.travertine, W / 1.2, D / 1.2), roughness: 0.55 });
    MT.travBlock = std({ map: TX.travertine, roughness: 0.6 });
    MT.oak = std({ map: TX.oak, roughness: 0.6 });
    MT.oakLight = std({ map: TX.oakLight, roughness: 0.6 });
    MT.walnut = std({ map: TX.walnut, roughness: 0.5 });
    MT.slat = std({ color: 0x8b5a35, map: TX.oak, roughness: 0.65 });
    MT.ceilDark = std({ color: 0x2a1c13, roughness: 0.9 });
    MT.marbleBlue = std({ map: TX.marbleBlue, roughness: 0.22 });
    MT.marbleWarm = std({ map: TX.marbleWarm, roughness: 0.25 });
    MT.marbleRed = std({ map: TX.marbleRed, roughness: 0.22 });
    MT.marbleDark = std({ map: TX.marbleDark, roughness: 0.2 });
    MT.marbleGrey = std({ map: TX.marbleGrey, roughness: 0.25 });
    MT.weave = std({ map: rep(TX.weave, 1, 1), roughness: 0.7 });
    MT.boucle = std({ map: TX.boucle, roughness: 0.95 });
    MT.oliveFab = std({ map: TX.olive, roughness: 0.9 });
    MT.leather = std({ color: 0x6b3b22, roughness: 0.5 });
    MT.leatherDark = std({ color: 0x4a2d1d, roughness: 0.5 });
    MT.bronze = std({ color: 0x9a6a3e, metalness: 0.85, roughness: 0.32 });
    MT.brass = std({ color: 0xc4975a, metalness: 0.9, roughness: 0.28 });
    MT.blueLacquer = std({ color: 0x2f4a66, roughness: 0.18, metalness: 0.1 });
    MT.greyLacquer = std({ color: 0x6f747a, roughness: 0.3, metalness: 0.1 });
    MT.beigeLacquer = std({ color: 0xcdbfa9, roughness: 0.28 });
    MT.taupe = std({ color: 0xb3a28b, roughness: 0.25, metalness: 0.05 });
    MT.plaster = std({ map: TX.plaster, roughness: 0.95 });
    MT.fluted = std({ map: TX.fluted, roughness: 0.6 });
    MT.white = std({ color: 0xf2eee8, roughness: 0.25 });
    MT.black = std({ color: 0x15171c, roughness: 0.12, metalness: 0.3 });
    MT.charcoal = std({ color: 0x3b3a3a, roughness: 0.92 });
    MT.cream = std({ color: 0xe8dcc8, roughness: 0.9 });
    MT.sand = std({ color: 0xc8a982, roughness: 0.85 });
    MT.slateBlue = std({ color: 0x4d6a86, roughness: 0.85 });
    MT.glass = std({ color: 0xb9c7cf, transparent: true, opacity: 0.16, metalness: 0.9, roughness: 0.05, depthWrite: false });
    MT.glassTint = std({ color: 0x7a5a3a, transparent: true, opacity: 0.35, metalness: 0.6, roughness: 0.1, depthWrite: false });
    MT.amberGlass = std({ color: 0xc98a4a, emissive: 0x5a3010, emissiveIntensity: 0.6, transparent: true, opacity: 0.62, roughness: 0.15, metalness: 0.3, side: T.DoubleSide, depthWrite: false });
    MT.mirror = std({ color: 0xb8bcc0, metalness: 1, roughness: 0.04 });
    MT.led = new T.MeshBasicMaterial({ color: 0xffd9a0 });
    MT.ledSoft = new T.MeshBasicMaterial({ color: 0xffe7c4, transparent: true, opacity: 0.85 });
    MT.pearl = std({ color: 0xfff3dc, emissive: 0xffc77a, emissiveIntensity: 0.85, roughness: 0.35 });
    MT.bark = std({ color: 0x6a5a48, roughness: 0.95 });
    MT.leaf = std({ color: 0xffffff, roughness: 0.8, side: T.DoubleSide });
    MT.rug = std({ map: TX.rug, roughness: 1 });
    MT.rugGrey = std({ map: rep(TX.rugGrey, 3, 3), roughness: 1 });
    MT.rugDark = std({ color: 0x55524e, roughness: 1 });
    MT.sky = new T.MeshBasicMaterial({ map: TX.sky, side: T.BackSide, fog: false });
    MT.ground = std({ map: rep(TX.sand, 30, 30), roughness: 1 });
    MT.hedge = std({ map: rep(TX.hedge, 6, 1), roughness: 1 });
    MT.palmLeaf = std({ color: 0x6f8f3a, roughness: 0.8, side: T.DoubleSide });
    MT.palmTrunk = std({ color: 0x8a7353, roughness: 1 });
    MT.deskText = new T.MeshBasicMaterial({ map: TX.desk, transparent: true, depthWrite: false });
    MT.globe = std({ color: 0x9fb4c4, transparent: true, opacity: 0.35, metalness: 0.5, roughness: 0.05, depthWrite: false });
    MT.globeAmber = std({ color: 0xc8a070, transparent: true, opacity: 0.4, metalness: 0.5, roughness: 0.05, depthWrite: false });
    MT.art1 = std({ color: 0x8c6a4a, roughness: 0.8 });
    MT.art2 = std({ color: 0x3d5168, roughness: 0.8 });
    MT.art3 = std({ color: 0xc9b79c, roughness: 0.8 });
    MT.books = [0xd9cbb5, 0x2d2a27, 0x8b6a4c, 0x4f6274, 0xe9e2d6, 0x6e3b2c, 0xb89b74].map(function (c) {
      return std({ color: c, roughness: 0.8 });
    });
  }

  // ------------------------------------------------------------------
  // Geometry helpers
  // ------------------------------------------------------------------
  var root = new T.Group(); scene.add(root);
  var floors = [new T.Group(), new T.Group()];   // furniture per floor (hidden when far)
  var shell = new T.Group();
  root.add(floors[0], floors[1], shell);
  var target = shell;   // current parent for helpers

  function add(mesh, parent) { (parent || target).add(mesh); return mesh; }
  /** box by centre */
  function box(w, h, d, mat, x, y, z, ry) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); if (ry) m.rotation.y = ry;
    return add(m);
  }
  /** box sitting on y0 */
  function boxB(w, h, d, mat, x, y0, z, ry) { return box(w, h, d, mat, x, y0 + h / 2, z, ry); }
  function cyl(rt, rb, h, mat, x, y0, z, seg) {
    var m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 32), mat);
    m.position.set(x, y0 + h / 2, z); return add(m);
  }
  var rbCache = {};
  function roundBoxGeo(w, h, d, r) {
    var key = [w, h, d, r].map(function (v) { return v.toFixed(3); }).join('_');
    if (rbCache[key]) return rbCache[key];
    r = Math.min(r, w / 2 - 0.005, h / 2 - 0.005, d / 2 - 0.005);
    var sw = w - 2 * r, sh = h - 2 * r, s = new T.Shape();
    s.moveTo(-sw / 2, -sh / 2); s.lineTo(sw / 2, -sh / 2); s.lineTo(sw / 2, sh / 2); s.lineTo(-sw / 2, sh / 2); s.closePath();
    var g = new T.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 4 });
    g.center(); g.computeVertexNormals();
    rbCache[key] = g; return g;
  }
  function rbox(w, h, d, r, mat, x, y0, z, ry) {
    var m = new T.Mesh(roundBoxGeo(w, h, d, r), mat);
    m.position.set(x, y0 + h / 2, z); if (ry) m.rotation.y = ry;
    return add(m);
  }
  /** annular sector in XZ (angles: x = cos a, z = sin a), extruded up from y0 */
  function sector(cx, cz, rIn, rOut, a0, a1, y0, h, mat, bevel) {
    var s = new T.Shape();
    s.absarc(0, 0, rOut, a0, a1, false);
    s.lineTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
    s.absarc(0, 0, rIn, a1, a0, true);
    s.closePath();
    var b = bevel || 0;
    var g = new T.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 40 });
    g.rotateX(Math.PI / 2); g.translate(0, h - b, 0);
    var m = new T.Mesh(g, mat); m.position.set(cx, y0, cz);
    return add(m);
  }
  function group(x, y, z, ry, parent) {
    var g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0;
    (parent || target).add(g); return g;
  }
  function within(g, fn) { var prev = target; target = g; fn(); target = prev; return g; }
  function lathe(points, mat, x, y0, z, seg) {
    var pts = points.map(function (p) { return new T.Vector2(p[0], p[1]); });
    var m = new T.Mesh(new T.LatheGeometry(pts, seg || 28), mat);
    m.position.set(x, y0, z); return add(m);
  }
  function plane(w, h, mat, x, y, z, rx, ry) {
    var m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0, 'YXZ');
    return add(m);
  }

  // minimap footprints ------------------------------------------------
  var FP = [[], []];
  function fpRect(f, x0, z0, x1, z1, kind) { FP[f].push({ t: 'r', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), k: kind || 'f' }); }
  function fpCirc(f, x, z, r, kind) { FP[f].push({ t: 'c', x: x, z: z, r: r, k: kind || 'f' }); }
  function fpArc(f, x, z, r0, r1, a0, a1, kind) { FP[f].push({ t: 'a', x: x, z: z, r0: r0, r1: r1, a0: a0, a1: a1, k: kind || 'f' }); }

  // ------------------------------------------------------------------
  // Furniture
  // ------------------------------------------------------------------
  function vase(x, y0, z, h, mat) {
    var r = h * R(0.25, 0.42);
    return lathe([[0, 0], [r * 0.6, 0], [r, h * 0.35], [r * 0.85, h * 0.7], [r * 0.35, h * 0.92], [r * 0.4, h], [0.001, h]], mat, x, y0, z, 20);
  }
  function bookStack(x, y0, z, w, ry) {
    var g = group(x, y0, z, ry || 0);
    within(g, function () {
      var y = 0, n = 2 + Math.floor(R(0, 3));
      for (var i = 0; i < n; i++) {
        var t = R(0.03, 0.05);
        boxB(w * R(0.8, 1), t, R(0.18, 0.26), pick(MT.books), R(-0.01, 0.01), y, 0, R(-0.1, 0.1));
        y += t;
      }
    });
    return g;
  }
  function decor(x, y0, z, maxH) {
    var r = rnd();
    if (r < 0.32) bookStack(x, y0, z, R(0.25, 0.35), R(-0.2, 0.2));
    else if (r < 0.62) vase(x, y0, z, Math.min(maxH, R(0.2, 0.42)), pick([MT.bronze, MT.white, MT.charcoal, MT.sand, MT.brass]));
    else if (r < 0.8) {
      var b = lathe([[0, 0], [0.06, 0], [0.16, 0.08], [0.17, 0.1], [0.001, 0.1]], pick([MT.bronze, MT.white, MT.travBlock]), x, y0, z, 24);
      b.scale.setScalar(R(0.8, 1.3));
    } else {
      // vertical books
      var g = group(x, y0, z, 0);
      within(g, function () {
        var px = -0.15;
        for (var i = 0; i < 6; i++) { var t = R(0.025, 0.05), h = Math.min(maxH, R(0.22, 0.32)); boxB(t, h, 0.2, pick(MT.books), px, 0, 0); px += t + 0.004; }
      });
    }
  }

  /** wall shelving along x (front face towards +z unless flip) */
  function shelving(x0, x1, zBack, y0, h, depth, backMat, opts) {
    opts = opts || {};
    var g = group(0, y0, 0, 0);
    within(g, function () {
      var len = x1 - x0, cols = Math.max(1, Math.round(len / (opts.col || 1.0))), cw = len / cols;
      var rows = opts.rows || 5, rh = h / rows, zc = zBack + depth / 2;
      box(len, h, 0.03, backMat, (x0 + x1) / 2, h / 2, zBack + 0.015);
      for (var c = 0; c <= cols; c++) {
        var x = x0 + c * cw;
        boxB(c % 2 ? 0.03 : 0.05, h, depth, c % 2 ? MT.bronze : MT.blueLacquer, x, 0, zc);
      }
      for (var r = 0; r <= rows; r++) {
        var y = r * rh;
        boxB(len, 0.035, depth, opts.shelfMat || MT.oak, (x0 + x1) / 2, y, zc);
        if (r > 0 && r < rows) box(len - 0.1, 0.01, 0.02, MT.led, (x0 + x1) / 2, y - 0.01, zBack + depth - 0.04);
        if (r < rows && r > 0) {
          for (c = 0; c < cols; c++) {
            if (rnd() < 0.18) continue;
            if (rnd() < 0.2) { // slatted panel
              var sx = x0 + c * cw + cw / 2;
              for (var k = -5; k <= 5; k++) boxB(0.025, rh - 0.06, 0.02, MT.oak, sx + k * cw / 12, y + 0.04, zBack + 0.08);
              continue;
            }
            decor(x0 + c * cw + cw * R(0.3, 0.7), y + 0.035, zc + R(-0.05, 0.05), rh - 0.1);
          }
        }
      }
    });
    return g;
  }

  function loungeChair(x, z, ry) {
    var g = group(x, 0, z, ry, target);
    within(g, function () {
      rbox(0.9, 0.38, 0.85, 0.14, MT.boucle, 0, 0.04, 0);
      rbox(0.9, 0.42, 0.34, 0.15, MT.boucle, 0, 0.36, -0.28);
      rbox(0.92, 0.05, 0.9, 0.02, MT.leather, 0, 0.02, 0);
      [-0.25, 0.25].forEach(function (x) {
        boxB(0.07, 0.03, 0.9, MT.leather, x, 0.42, 0.0);
        boxB(0.07, 0.42, 0.03, MT.leather, x, 0.4, -0.45);
      });
    });
    return g;
  }
  function chunkyChair(x, z, ry) {
    var g = group(x, 0, z, ry);
    within(g, function () {
      rbox(0.95, 0.3, 0.9, 0.14, MT.boucle, 0, 0.05, 0);
      rbox(0.95, 0.3, 0.9, 0.14, MT.boucle, 0, 0.34, 0.06);
      rbox(0.95, 0.34, 0.32, 0.15, MT.boucle, 0, 0.62, -0.3);
      [-0.48, 0.48].forEach(function (x) {
        boxB(0.03, 0.08, 0.9, MT.leather, x, 0.3, 0.05);
        boxB(0.03, 0.08, 0.9, MT.leather, x, 0.6, 0.05);
      });
      boxB(0.97, 0.06, 0.06, MT.leather, 0, 0.05, 0.47);
    });
    return g;
  }
  function pillow(x, y0, z, mat, ry, tilt) {
    var m = rbox(0.45, 0.42, 0.14, 0.07, mat, x, y0, z, ry || 0);
    m.rotation.x = tilt || -0.25; return m;
  }
  function roundTable(x, z, r, h, topMat, baseMat, f) {
    cyl(r * 0.85, r * 0.85, h - 0.05, baseMat, x, 0, z, 40);
    cyl(r, r, 0.05, topMat, x, h - 0.05, z, 40);
    if (f !== undefined) fpCirc(f, x, z, r);
  }
  function sideTable(x, z, y0) {
    y0 = y0 || 0;
    cyl(0.17, 0.2, 0.42, MT.walnut, x, y0, z, 24);
    cyl(0.3, 0.3, 0.03, MT.bronze, x, y0 + 0.42, z, 32);
    cyl(0.31, 0.31, 0.02, MT.mirror, x, y0 + 0.45, z, 32);
  }
  function diningChair(x, z, ry, fab, h) {
    var g = group(x, 0, z, ry + Math.PI);   // ry = 0 → chair faces −z
    var seatY = h || 0.46;
    within(g, function () {
      var legH = seatY - 0.06;
      [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(function (p) {
        var l = boxB(0.035, legH, 0.035, MT.walnut, p[0], 0, p[1]); l.rotation.z = p[0] * 0.15;
      });
      if (seatY > 0.6) boxB(0.44, 0.02, 0.02, MT.walnut, 0, 0.3, 0.2);
      rbox(0.5, 0.09, 0.48, 0.04, fab, 0, legH, 0);
      var back = new T.Mesh(new T.CylinderGeometry(0.3, 0.27, 0.42, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), fab);
      back.material = fab; back.position.set(0, legH + 0.26, 0.06); back.rotation.y = Math.PI;
      back.material.side = T.DoubleSide;
      add(back);
    });
    return g;
  }

  // Pearl garlands ------------------------------------------------------
  var pearlPts = [];
  function garland(a, b, sag) {
    var len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    var steps = Math.max(10, Math.round((len + sag * 1.6) / 0.13));
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      pearlPts.push(new T.Vector3(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
        a[2] + (b[2] - a[2]) * t));
    }
    // ceiling cups
    cyl(0.05, 0.05, 0.06, MT.bronze, a[0], a[1] + 0.02, a[2], 12);
    cyl(0.05, 0.05, 0.06, MT.bronze, b[0], b[1] + 0.02, b[2], 12);
  }
  function flushPearls() {
    var geo = new T.SphereGeometry(0.05, 14, 10);
    var im = new T.InstancedMesh(geo, MT.pearl, pearlPts.length);
    var m = new T.Matrix4();
    pearlPts.forEach(function (p, i) { m.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m); });
    shell.add(im);
    // rings between pearls (bronze)
    var rg = new T.TorusGeometry(0.026, 0.006, 6, 12);
    var rm = new T.InstancedMesh(rg, MT.bronze, pearlPts.length);
    var q = new T.Object3D();
    pearlPts.forEach(function (p, i) { q.position.copy(p); q.position.y += 0.052; q.rotation.set(Math.PI / 2, 0, 0); q.updateMatrix(); rm.setMatrixAt(i, q.matrix); });
    shell.add(rm);
  }

  // Olive tree ---------------------------------------------------------
  function oliveTree(x, z, y0, scale) {
    var s = scale || 1;
    var g = group(x, y0, z, R(0, 6));
    var tips = [];
    within(g, function () {
      cyl(0.48 * s, 0.42 * s, 0.6 * s, MT.blueLacquer, 0, 0, 0, 36);
      cyl(0.49 * s, 0.49 * s, 0.03, MT.brass, 0, 0.6 * s, 0, 36);
      cyl(0.45 * s, 0.45 * s, 0.02, MT.charcoal, 0, 0.58 * s, 0, 24);
      for (var b = 0; b < 5; b++) {
        var a = b / 5 * Math.PI * 2 + R(-0.3, 0.3);
        var pts = [new T.Vector3(R(-0.05, 0.05), 0.55 * s, R(-0.05, 0.05))];
        var px = 0, pz = 0, py = 0.55 * s;
        for (var k = 0; k < 4; k++) {
          px += Math.cos(a) * R(0.08, 0.28) * s; pz += Math.sin(a) * R(0.08, 0.28) * s; py += R(0.38, 0.6) * s;
          a += R(-0.6, 0.6);
          pts.push(new T.Vector3(px, py, pz));
        }
        var tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 16, 0.07 * s * (b === 0 ? 1.4 : 1), 6, false), MT.bark);
        add(tube);
        tips.push(pts[pts.length - 1], pts[pts.length - 2]);
      }
      var count = 900, leafGeo = new T.IcosahedronGeometry(0.1 * s, 0);
      var im = new T.InstancedMesh(leafGeo, MT.leaf, count);
      var q = new T.Object3D(), col = new T.Color();
      for (var i = 0; i < count; i++) {
        var tp = tips[i % tips.length];
        q.position.set(tp.x + R(-0.55, 0.55) * s, tp.y + R(-0.35, 0.4) * s, tp.z + R(-0.55, 0.55) * s);
        q.rotation.set(R(0, 3), R(0, 3), R(0, 3));
        var sc = R(0.6, 1.3); q.scale.set(sc, sc * 0.6, sc);
        q.updateMatrix(); im.setMatrixAt(i, q.matrix);
        col.setHSL(R(0.19, 0.24), R(0.3, 0.45), R(0.16, 0.27)); im.setColorAt(i, col);
      }
      add(im);
    });
    return g;
  }

  function palm(x, z, h) {
    var g = group(x, -0.05, z, R(0, 6), shell);
    within(g, function () {
      var lean = R(-0.15, 0.15);
      var pts = [new T.Vector3(0, 0, 0), new T.Vector3(lean * h * 0.3, h * 0.5, 0), new T.Vector3(lean * h, h, 0)];
      add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 8, 0.2, 8, false), MT.palmTrunk));
      var top = pts[2];
      for (var i = 0; i < 11; i++) {
        var a = i / 11 * Math.PI * 2;
        var fg = new T.PlaneGeometry(0.5, 2.6, 1, 6);
        var pos = fg.attributes.position;
        for (var v = 0; v < pos.count; v++) {
          var yy = pos.getY(v) + 1.3;                    // 0..2.6
          pos.setZ(v, -yy * yy * 0.12);
          pos.setX(v, pos.getX(v) * (1 - yy / 3));
          pos.setY(v, yy);
        }
        fg.computeVertexNormals();
        var f = new T.Mesh(fg, MT.palmLeaf);
        f.position.copy(top); f.rotation.set(-0.7, a, 0, 'YXZ');
        add(f);
      }
    });
  }

  // ------------------------------------------------------------------
  // BUILDING SHELL
  // ------------------------------------------------------------------
  function buildShell() {
    target = shell;
    // ground floor + plinth
    plane(W, D, MT.trav, W / 2, 0, D / 2, -Math.PI / 2);
    // first floor slab (with stair void x>STAIR_X0, z>STAIR_Z_TOP)
    var trav1 = std({ map: rep(TX.travertine, STAIR_X0 / 1.2, D / 1.2), roughness: 0.55 });
    plane(STAIR_X0, D, trav1, STAIR_X0 / 2, F1, D / 2, -Math.PI / 2);
    var trav2 = std({ map: rep(TX.travertine, 1.3, 1.1), roughness: 0.55 });
    plane(W - STAIR_X0, STAIR_Z_TOP, trav2, (W + STAIR_X0) / 2, F1, STAIR_Z_TOP / 2, -Math.PI / 2);
    // slab body and edge in the void
    box(0.06, F1 - G_CEIL, D - STAIR_Z_TOP, MT.oak, STAIR_X0, (F1 + G_CEIL) / 2, (D + STAIR_Z_TOP) / 2);
    box(W - STAIR_X0, F1 - G_CEIL, 0.06, MT.oak, (W + STAIR_X0) / 2, (F1 + G_CEIL) / 2, STAIR_Z_TOP);

    // slat ceilings
    slatCeiling(0, STAIR_X0, 0, D, G_CEIL, 'x');
    slatCeiling(STAIR_X0, W, 0, STAIR_Z_TOP, G_CEIL, 'x');
    plane(STAIR_X0, D, MT.ceilDark, STAIR_X0 / 2, G_CEIL + 0.12, D / 2, Math.PI / 2);
    plane(W - STAIR_X0, STAIR_Z_TOP, MT.ceilDark, (W + STAIR_X0) / 2, G_CEIL + 0.12, STAIR_Z_TOP / 2, Math.PI / 2);
    slatCeiling(5.7, 17, 0, D, F1_CEIL, 'z');
    // flat oak ceilings upstairs (meeting/office & bedroom)
    var oakC = std({ map: rep(TX.oakLight, 6, 2), roughness: 0.7 });
    plane(5.7, D, oakC, 2.85, F1_CEIL, D / 2, Math.PI / 2);
    plane(W - 17, D, oakC, (W + 17) / 2, F1_CEIL, D / 2, Math.PI / 2);
    plane(W, D, MT.ceilDark, W / 2, F1_CEIL + 0.12, D / 2, Math.PI / 2);
    // track lights
    [[1.6], [7.4]].forEach(function () {});
    for (var tx = 2; tx < 24; tx += 4.2) {
      box(0.05, 0.04, 6, MT.black, tx, G_CEIL - 0.03, 4.5);
      box(0.05, 0.04, 6, MT.black, tx, F1_CEIL - 0.03, 4.5);
    }

    // walls ---------------------------------------------------------
    var wallTotal = F1_CEIL + 0.2;
    box(W, wallTotal, 0.2, MT.plaster, W / 2, wallTotal / 2, -0.1);       // back
    box(0.2, wallTotal, D, MT.plaster, -0.1, wallTotal / 2, D / 2);       // left
    box(0.2, wallTotal, D, MT.plaster, W + 0.1, wallTotal / 2, D / 2);    // right
    // facade strip between floors
    box(W, F1 - G_CEIL + 0.3, 0.25, MT.oak, W / 2, (F1 + G_CEIL) / 2, D + 0.05);
    box(W, 0.3, 0.25, MT.oak, W / 2, F1_CEIL + 0.05, D + 0.05);

    facade(0, G_CEIL, [[0.3, 5.9], [6.3, 11.9], [12.3, 17.7], [18.1, 23.6]], MT.oak);
    facade(F1, F1_CEIL - F1, [[0.6, 4.9], [6.4, 8.4], [9.0, 11.4], [13.1, 16.2], [17.6, 21.4], [22.6, 23.9]], MT.travBlock);

    // stair
    buildStair();

    // outside
    var sky = new T.Mesh(new T.SphereGeometry(90, 24, 16), MT.sky);
    sky.position.set(13, 0, 4.5); shell.add(sky);
    plane(160, 160, MT.ground, 13, -0.06, 20, -Math.PI / 2);
    boxB(30, 1.5, 1.2, MT.hedge, 13, -0.05, 11.2);
    boxB(30, 0.05, 2, MT.travBlock, 13, -0.05, 9.9);
    palm(3, 15, 8.5); palm(9.5, 17, 9.5); palm(16, 14.5, 8); palm(22, 16.5, 10); palm(-4, 12, 9); palm(29, 12, 8.5);
    // distant low buildings
    [[-12, 32, 14, 6], [6, 38, 18, 9], [26, 34, 12, 7], [42, 28, 10, 5]].forEach(function (b) {
      boxB(b[2], b[3], 8, MT.cream, b[0], -0.05, b[1]);
    });
  }

  function facade(y0, h, wins, solidMat) {
    var edges = [0];
    wins.forEach(function (w) { edges.push(w[0], w[1]); });
    edges.push(W);
    for (var i = 0; i < edges.length; i += 2) {
      var a = edges[i], b = edges[i + 1];
      if (b - a > 0.01) box(b - a, h, 0.3, solidMat, (a + b) / 2, y0 + h / 2, D + 0.1);
    }
    wins.forEach(function (w) {
      var x0 = w[0], x1 = w[1], len = x1 - x0;
      box(len, h, 0.02, MT.glass, (x0 + x1) / 2, y0 + h / 2, D + 0.05);
      var n = Math.max(1, Math.round(len / 1.6));
      for (var k = 0; k <= n; k++) boxB(0.05, h, 0.08, MT.bronze, x0 + k * len / n, y0, D + 0.05);
      boxB(len, 0.05, 0.1, MT.bronze, (x0 + x1) / 2, y0, D + 0.05);
      boxB(len, 0.05, 0.1, MT.bronze, (x0 + x1) / 2, y0 + h - 0.05, D + 0.05);
      // curtains at the sides of big windows
      if (h > 3) {
        boxB(0.3, h - 0.1, 0.12, MT.sand, x0 + 0.2, y0, D - 0.1);
      }
    });
  }

  function slatCeiling(x0, x1, z0, z1, y, along) {
    var gap = 0.1, w = 0.04, d = 0.09;
    var span = along === 'x' ? (x1 - x0) : (z1 - z0);
    var len = along === 'x' ? (z1 - z0) : (x1 - x0);
    var count = Math.floor(span / gap);
    var geo = new T.BoxGeometry(1, 1, 1);
    var im = new T.InstancedMesh(geo, MT.slat, count);
    var q = new T.Object3D();
    for (var i = 0; i < count; i++) {
      var s = (i + 0.5) * gap;
      if (along === 'x') { q.position.set(x0 + s, y + d / 2, (z0 + z1) / 2); q.scale.set(w, d, len); }
      else { q.position.set((x0 + x1) / 2, y + d / 2, z0 + s); q.scale.set(len, d, w); }
      q.updateMatrix(); im.setMatrixAt(i, q.matrix);
    }
    shell.add(im);
  }

  function buildStair() {
    var steps = 22, rise = F1 / steps, run = (STAIR_Z_BOTTOM - STAIR_Z_TOP) / steps;
    var w = STAIR_X1 - STAIR_X0, cx = (STAIR_X0 + STAIR_X1) / 2;
    for (var i = 0; i < steps; i++) {
      var y = (i + 1) * rise, z = STAIR_Z_BOTTOM - (i + 0.5) * run;
      box(w, 0.05, run + 0.02, MT.travBlock, cx, y - 0.025, z);
      box(w, rise, 0.02, MT.travBlock, cx, y - rise / 2, z + run / 2);
      box(w - 0.1, 0.012, 0.02, MT.led, cx, y - rise + 0.03, z + run / 2 + 0.012);
    }
    // stringer / underside
    var len = Math.hypot(F1, STAIR_Z_BOTTOM - STAIR_Z_TOP);
    var under = box(w, 0.08, len, MT.plaster, cx, F1 / 2 - 0.15, (STAIR_Z_BOTTOM + STAIR_Z_TOP) / 2);
    under.rotation.x = Math.atan2(F1, STAIR_Z_BOTTOM - STAIR_Z_TOP);
    // curved wall between kitchen and stair (with blue niche)
    box(0.25, G_CEIL, STAIR_Z_BOTTOM - 0.4, MT.beigeLacquer, STAIR_X0 - 0.12, G_CEIL / 2, (STAIR_Z_BOTTOM - 0.4) / 2);
    var curve = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, G_CEIL, 24, 1, false, 0, Math.PI), MT.beigeLacquer);
    curve.position.set(STAIR_X0 - 0.12 - 0.27, G_CEIL / 2, STAIR_Z_BOTTOM - 0.4); shell.add(curve);
    // blue arch niche on stair side + wall lights (sculptural)
    rbox(0.04, 1.6, 0.9, 0.02, MT.blueLacquer, STAIR_X0 + 0.02, 0, 7.2);
    rbox(0.08, 1.2, 0.7, 0.03, MT.oak, STAIR_X0 + 0.04, 0, 7.3);
    [[2.2, 6.4], [3.0, 4.6], [5.6, 2.6]].forEach(function (p) {
      var m = new T.Mesh(new T.TorusGeometry(0.12, 0.025, 8, 24), MT.bronze);
      m.position.set(W - 0.04, p[0], p[1]); m.rotation.y = Math.PI / 2; shell.add(m);
      var l = new T.Mesh(new T.CircleGeometry(0.1, 20), MT.ledSoft);
      l.position.set(W - 0.03, p[0], p[1]); l.rotation.y = -Math.PI / 2; shell.add(l);
    });
    // glass balustrade upstairs along the void
    box(0.02, 1.0, D - STAIR_Z_TOP, MT.glass, STAIR_X0 - 0.02, F1 + 0.5, (D + STAIR_Z_TOP) / 2);
    box(0.05, 0.05, D - STAIR_Z_TOP, MT.bronze, STAIR_X0 - 0.02, F1 + 1.0, (D + STAIR_Z_TOP) / 2);
    fpRect(0, STAIR_X0, STAIR_Z_TOP, STAIR_X1, STAIR_Z_BOTTOM, 's');
    fpRect(1, STAIR_X0, STAIR_Z_TOP, STAIR_X1, D, 's');
  }

  // ------------------------------------------------------------------
  // GROUND FLOOR
  // ------------------------------------------------------------------
  function buildGround() {
    target = floors[0];
    var f = 0;

    // --- Reception (x 0..3.3) -------------------------------------
    // left wall: woven leather + coffee bar with portraits replaced by art
    box(0.04, G_CEIL, 4.6, MT.weave, 0.02, G_CEIL / 2, 6.5).material = std({ map: rep(TX.weave, 6, 4), roughness: 0.7 });
    box(0.05, 2.2, 2.4, MT.beigeLacquer, 0.05, 1.1 + 0.6, 6.4);
    // coffee bar
    rbox(0.6, 0.9, 2.2, 0.04, MT.blueLacquer, 0.35, 0, 6.4);
    boxB(0.66, 0.05, 2.26, MT.marbleWarm, 0.36, 0.9, 6.4);
    boxB(0.25, 0.02, 1.8, MT.oak, 0.16, 1.55, 6.4);
    [[5.9, MT.art1], [6.4, MT.art2], [6.9, MT.art3]].forEach(function (a) {
      boxB(0.03, 0.55, 0.42, a[1], 0.08, 1.9, a[0]);
      boxB(0.02, 0.6, 0.47, MT.white, 0.065, 1.875, a[0]);
    });
    vase(0.35, 0.95, 5.7, 0.25, MT.glassTint); vase(0.35, 0.95, 5.95, 0.25, MT.glassTint);
    boxB(0.3, 0.32, 0.25, MT.mirror, 0.33, 0.95, 7.1);
    fpRect(f, 0, 5.3, 0.66, 7.5);
    // curved reception desk "COLORS OF LIVING"
    sector(1.25, 8.0, 0.95, 1.3, Math.PI * 1.0, Math.PI * 1.75, 0, 1.08, MT.marbleWarm, 0.02);
    sector(1.25, 8.0, 0.95, 1.36, Math.PI * 1.75, Math.PI * 2.15, 0, 1.08, MT.marbleBlue, 0.02);
    sector(1.25, 8.0, 0.9, 1.25, Math.PI * 1.0, Math.PI * 2.15, 0, 0.04, MT.led, 0);
    var tx = new T.Mesh(new T.CylinderGeometry(1.315, 1.315, 0.3, 48, 1, true, Math.PI * 0.62, Math.PI * 0.5), MT.deskText);
    tx.position.set(1.25, 0.62, 8.0); tx.rotation.y = 0; add(tx);
    fpArc(f, 1.25, 8.0, 0.95, 1.36, Math.PI, Math.PI * 2.15);
    // olive tree lounge (back-left)
    oliveTree(1.0, 1.2, 0, 1.1);
    fpCirc(f, 1.0, 1.2, 0.55);
    cyl(1.0, 1.0, 0.02, MT.rugDark, 2.1, 0, 2.0, 48);
    var rc = group(2.1, 0, 2.0, -0.6);
    within(rc, function () {
      cyl(0.62, 0.62, 0.4, MT.oliveFab, 0, 0.06, 0, 40);
      cyl(0.58, 0.58, 0.06, MT.leatherDark, 0, 0, 0, 32);
      var back = new T.Mesh(new T.CylinderGeometry(0.66, 0.66, 0.75, 32, 1, false, Math.PI * 0.75, Math.PI * 1.1), MT.leather);
      back.position.set(0, 0.42, 0); back.scale.set(1, 1, 1); add(back);
      pillow(-0.2, 0.46, -0.38, MT.leather, 0.3); pillow(0.22, 0.46, -0.36, MT.oliveFab, -0.3); pillow(0, 0.5, -0.45, MT.charcoal, 0);
    });
    fpCirc(f, 2.1, 2.0, 0.66);
    sideTable(3.0, 1.2);

    // --- Living zone 1 (x 3.3..11.6) ------------------------------
    var cx = 7.6, cz = 4.3;
    cyl(3.0, 3.0, 0.015, MT.rug, cx, 0, cz, 64);
    cyl(3.08, 3.08, 0.01, MT.leatherDark, cx, 0, cz, 64);
    fpCirc(f, cx, cz, 3.0, 'rug');
    // curved sectional (back arc)
    var a0 = Math.PI * 1.08, a1 = Math.PI * 1.92;
    sector(cx, cz, 1.85, 2.75, a0, a1, 0.08, 0.36, MT.boucle, 0.08);
    sector(cx, cz, 2.5, 2.85, a0, a1, 0.08, 0.86, MT.boucle, 0.1);
    sector(cx, cz, 1.83, 2.87, a0, a1, 0, 0.09, MT.leather, 0.02);
    sector(cx, cz, 2.84, 2.9, a0, a1, 0.1, 0.72, MT.leather, 0.01);
    fpArc(f, cx, cz, 1.85, 2.9, a0, a1);
    // leather straps + cushions along the arc
    for (var k = 0; k < 9; k++) {
      var a = a0 + (a1 - a0) * (k + 0.5) / 9;
      var px = cx + Math.cos(a) * 2.45, pz = cz + Math.sin(a) * 2.45;
      var p = pillow(px, 0.42, pz, k % 3 === 1 ? MT.slateBlue : (k % 3 === 2 ? MT.leather : MT.boucle), -a - Math.PI / 2 + Math.PI, -0.3);
      p.rotation.y = Math.PI / 2 - a;
      if (k % 2 === 0) {
        var st = boxB(0.06, 0.82, 0.04, MT.leather, cx + Math.cos(a + 0.09) * 2.88, 0.08, cz + Math.sin(a + 0.09) * 2.88);
        st.rotation.y = Math.PI / 2 - (a + 0.09);
      }
    }
    // chunky lounge chairs facing centre
    [[Math.PI * 0.82, 2.15], [Math.PI * 0.2, 2.15], [Math.PI * 0.5, 2.5]].forEach(function (c, i) {
      var px = cx + Math.cos(c[0]) * c[1], pz = cz + Math.sin(c[0]) * c[1];
      var ch = (i === 2 ? loungeChair : chunkyChair)(px, pz, -Math.PI / 2 - c[0] + Math.PI);
      ch.rotation.y = Math.atan2(cx - px, cz - pz);
      fpCirc(f, px, pz, 0.5);
    });
    // coffee tables
    roundTable(cx + 0.3, cz - 0.1, 0.72, 0.38, MT.marbleWarm, MT.leatherDark, f);
    roundTable(cx - 0.75, cz - 0.55, 0.42, 0.44, MT.marbleWarm, MT.blueLacquer, f);
    sideTable(cx + 1.2, cz - 1.0);
    cyl(0.35, 0.38, 0.32, MT.bronze, cx - 0.4, 0, cz + 0.75, 32);
    bookStack(cx + 0.2, 0.38, cz - 0.15, 0.3, 0.3);
    vase(cx + 0.55, 0.38, cz + 0.15, 0.24, MT.glassTint);
    // back wall shelving with blue marble
    shelving(3.2, 11.4, 0, 0, 3.5, 0.42, MT.marbleBlue, { rows: 6, col: 1.05 });
    fpRect(f, 3.2, 0, 11.4, 0.42);
    // curved/straight double shelving partition at x = 11.8 + amber glass screen
    var part = group(0, 0, 0, 0);
    within(part, function () {
      var g2 = shelving(0, 3.6, 0, 0, 3.5, 0.36, MT.marbleBlue, { rows: 6, col: 0.9 });
      g2.rotation.y = -Math.PI / 2; g2.position.set(11.8, 0, 0.5);
      for (var i = 0; i < 4; i++) {
        var px = 11.98, pz = 4.25 + i * 0.36;
        boxB(0.03, 3.5, 0.03, MT.bronze, px, 0, pz - 0.17);
      }
      [[0.6, 4.5, 0.32, 0.9], [1.5, 4.95, 0.36, 0.7], [2.4, 4.42, 0.3, 0.8], [2.1, 5.1, 0.25, 0.6], [1.0, 5.15, 0.26, 0.5], [3.0, 4.9, 0.3, 0.7]].forEach(function (p) {
        var s = new T.Shape(); var rx = p[2], ry = p[3] / 2;
        s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
        var m = new T.Mesh(new T.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 18 }), MT.amberGlass);
        m.position.set(11.98, p[0] + 0.3, p[1]); m.rotation.y = Math.PI / 2; add(m);
      });
    });
    fpRect(f, 11.6, 0.5, 12.0, 5.4);
    // pearl garlands over living zone 1
    var y = G_CEIL - 0.02;
    garland([4.6, y, 2.0], [10.6, y, 3.4], 0.85);
    garland([5.0, y, 6.6], [10.2, y, 1.6], 1.0);
    garland([6.0, y, 1.4], [9.4, y, 7.0], 0.95);
    garland([4.4, y, 4.4], [10.9, y, 5.6], 0.75);
    garland([7.6, y, 1.0], [11.2, y, 7.0], 0.6);
    garland([3.8, y, 6.8], [7.6, y, 1.0], 0.65);
    garland([5.6, y, 3.0], [9.6, y, 3.0], 0.55);

    // --- Living zone 2 (x 12..16) L-sofa --------------------------
    var sx = 12.4;
    rbox(2.8, 0.42, 0.95, 0.12, MT.boucle, sx + 1.4 + 0.15, 0.06, 1.0);
    rbox(2.8, 0.45, 0.28, 0.12, MT.boucle, sx + 1.4 + 0.15, 0.45, 0.62);
    rbox(0.95, 0.42, 1.7, 0.12, MT.boucle, sx + 0.5 + 0.15, 0.06, 2.3);
    rbox(0.28, 0.45, 1.7, 0.12, MT.boucle, sx + 0.17 + 0.15, 0.45, 2.3);
    rbox(2.9, 0.07, 1.0, 0.02, MT.leather, sx + 1.45 + 0.15, 0, 1.0);
    rbox(1.0, 0.07, 1.8, 0.02, MT.leather, sx + 0.5 + 0.15, 0, 2.3);
    boxB(0.1, 0.8, 0.98, MT.leather, sx + 2.85 + 0.15, 0.05, 1.0);
    boxB(0.98, 0.8, 0.1, MT.leather, sx + 0.5 + 0.15, 0.05, 3.15);
    pillow(sx + 1.2, 0.5, 0.85, MT.leather, 0); pillow(sx + 1.8, 0.5, 0.85, MT.boucle, 0); pillow(sx + 2.4, 0.5, 0.85, MT.oliveFab, 0);
    pillow(sx + 0.55, 0.5, 1.9, MT.leather, Math.PI / 2);
    fpRect(f, sx + 0.15, 0.5, sx + 3.0, 1.5); fpRect(f, sx + 0.15, 0.5, sx + 1.15, 3.2);
    cyl(2.0, 2.0, 0.012, MT.rugGrey, sx + 1.9, 0, 2.4, 48);
    // bronze nesting tables
    rbox(1.0, 0.36, 0.7, 0.08, MT.bronze, sx + 2.0, 0, 2.3);
    rbox(0.7, 0.28, 0.55, 0.08, MT.bronze, sx + 2.6, 0, 2.7);
    vase(sx + 2.0, 0.36, 2.25, 0.3, MT.white);

    // --- Work / dining table zone (x 15.2..19) ---------------------
    // woven leather wall with beige panel inset and grey cabinets
    var wv = std({ map: rep(TX.weave, 8, 7), roughness: 0.7 });
    box(4.4, G_CEIL, 0.04, wv, 17.0, G_CEIL / 2, 0.02);
    box(3.4, 2.6, 0.06, MT.beigeLacquer, 17.0, 1.3, 0.05);
    [15.9, 18.1].forEach(function (x) {
      boxB(0.95, 1.05, 0.5, MT.greyLacquer, x, 0.75, 0.32);
      boxB(0.9, 0.75, 0.4, MT.bronze, x, 0, 0.32).material = MT.bronze;
      boxB(0.02, 0.3, 0.03, MT.brass, x - 0.05, 1.2, 0.58); boxB(0.02, 0.3, 0.03, MT.brass, x + 0.05, 1.2, 0.58);
    });
    boxB(0.4, 1.6, 0.05, MT.walnut, 16.75, 0.2, 0.12); boxB(0.4, 1.6, 0.05, MT.walnut, 17.25, 0.2, 0.12);
    box(0.03, 1.4, 0.02, MT.led, 16.97, 1.0, 0.16); box(0.03, 1.4, 0.02, MT.led, 17.03, 1.0, 0.16);
    boxB(3.0, 0.05, 0.3, MT.bronze, 17.0, 0.72, 0.5);
    fpRect(f, 15.4, 0, 18.6, 0.6);
    // table
    var tbl = group(17.0, 0, 3.0, 0);
    within(tbl, function () {
      boxB(2.6, 0.05, 1.05, MT.marbleWarm, 0, 0.72, 0);
      boxB(0.1, 0.72, 0.7, MT.bronze, -0.7, 0, 0); boxB(0.1, 0.72, 0.7, MT.bronze, 0.7, 0, 0);
      bookStack(0.4, 0.77, 0, 0.35, 0.2); vase(-0.3, 0.77, 0.1, 0.22, MT.glassTint);
    });
    fpRect(f, 15.7, 2.45, 18.3, 3.55);
    cyl(0, 0, 0, MT.rugGrey, 0, 0, 0);
    boxB(4.0, 0.012, 2.8, MT.rugGrey, 17.0, 0, 3.0);
    [[16.3, 3.85, Math.PI], [17.0, 3.85, Math.PI], [17.7, 3.85, Math.PI], [16.3, 2.15, 0], [17.7, 2.15, 0], [15.4, 3.0, Math.PI / 2], [18.6, 3.0, -Math.PI / 2]].forEach(function (c) {
      diningChair(c[0], c[1], c[2], MT.oliveFab);
    });

    // --- Kitchen (x 19.2..24.2) ------------------------------------
    // tall cabinets on the back wall with lit glass niche
    boxB(4.9, G_CEIL, 0.62, MT.beigeLacquer, 21.75, 0, 0.31);
    for (var cxk = 19.6; cxk < 24.2; cxk += 0.6) box(0.008, G_CEIL - 0.1, 0.01, MT.bronze, cxk, G_CEIL / 2, 0.625);
    boxB(2.0, 1.1, 0.4, MT.walnut, 21.3, 1.0, 0.45);
    boxB(1.9, 1.0, 0.36, MT.ledSoft, 21.3, 1.05, 0.44);
    for (var sh = 0; sh < 3; sh++) boxB(1.9, 0.02, 0.38, MT.walnut, 21.3, 1.05 + sh * 0.33, 0.47);
    for (var gl = 0; gl < 7; gl++) vase(20.5 + gl * 0.26, 1.07 + (gl % 3) * 0.33, 0.5, 0.16, MT.glassTint);
    boxB(2.1, 0.9, 0.7, MT.marbleWarm, 21.3, 0, 0.62);
    boxB(2.1, 0.05, 0.75, MT.marbleWarm, 21.3, 0.9, 0.62);
    fpRect(f, 19.3, 0, 24.2, 0.98);
    // island
    var isl = group(21.4, 0, 3.6, 0);
    within(isl, function () {
      rbox(3.4, 0.92, 1.1, 0.03, MT.marbleWarm, 0, 0.02, 0);
      boxB(3.3, 0.04, 1.0, MT.bronze, 0, 0, 0);
      boxB(3.6, 0.05, 0.45, MT.walnut, -0.1, 1.02, 0.65);
      boxB(0.06, 0.12, 0.4, MT.bronze, -1.2, 0.92, 0.65); boxB(0.06, 0.12, 0.4, MT.bronze, 1.0, 0.92, 0.65);
      boxB(0.6, 0.01, 0.4, MT.black, 0.6, 0.94, -0.15);
      vase(-0.6, 0.94, -0.2, 0.25, MT.glassTint);
      boxB(0.8, 0.08, 0.3, MT.bronze, -1.1, 0.94, -0.25);
    });
    fpRect(f, 19.7, 3.05, 23.1, 4.15);
    [20.4, 21.2, 22.0].forEach(function (x) { diningChair(x, 4.55, Math.PI, MT.oliveFab, 0.72); });
    // branch chandelier
    branchLamp(21.4, G_CEIL, 3.6, 2.4);
    // sofa near kitchen window
    rbox(2.2, 0.42, 0.9, 0.12, MT.boucle, 22.9, 0.05, 8.2);
    rbox(2.2, 0.4, 0.26, 0.11, MT.boucle, 22.9, 0.45, 8.55);
    pillow(22.4, 0.5, 8.35, MT.oliveFab, 0); pillow(23.2, 0.5, 8.35, MT.boucle, 0);
    fpRect(f, 21.8, 7.75, 24.0, 8.7);
    // vertical alabaster light panels on the column between windows
    box(0.18, 1.6, 0.04, MT.ledSoft, 17.9, 1.8, 8.85); box(0.18, 1.6, 0.04, MT.ledSoft, 18.3, 1.8, 8.85);

    // small olive tree near the front glass of living zone
    oliveTree(12.9, 8.3, 0, 0.8);
  }

  function branchLamp(x, ceil, z, span) {
    var g = group(x, ceil - 1.1, z, 0.3);
    within(g, function () {
      box(0.012, 1.1, 0.012, MT.black, 0, 0.55, 0);
      box(span, 0.03, 0.03, MT.bronze, 0, 0, 0);
      for (var i = 0; i < 14; i++) {
        var t = (i / 13 - 0.5) * span;
        var a = R(-1.2, 1.2), l = R(0.18, 0.4);
        var b = box(l, 0.02, 0.02, MT.bronze, t + Math.cos(a) * l / 2, Math.sin(a) * l / 4, Math.sin(a) * l / 2);
        b.rotation.y = -a;
        var tube = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.24, 12), MT.ledSoft);
        tube.position.set(t + Math.cos(a) * l, Math.sin(a) * l / 2, Math.sin(a) * l);
        tube.rotation.set(R(-1, 1), 0, R(-1.4, 1.4)); add(tube);
      }
    });
  }

  // ------------------------------------------------------------------
  // FIRST FLOOR
  // ------------------------------------------------------------------
  function buildFirst() {
    target = floors[1];
    var f = 1, y0 = F1, H = F1_CEIL - F1;

    // --- Office (x 0..5.7, z 0..4.6) & Meeting (z 4.6..9) ------------
    // glass partitions with bronze frames, door gaps where the path passes
    glassWall(0, 4.6, 4.25, 4.6, y0, H);          // between office and meeting (gap 4.25..5.5)
    glassWall(5.7, 0, 5.7, 6.1, y0, H);           // office/meeting → presentation (gap 6.1..7.5)
    glassWall(5.7, 7.5, 5.7, D, y0, H);
    fpRect(f, 0, 4.55, 4.25, 4.65, 'w'); fpRect(f, 5.65, 0, 5.75, 6.1, 'w'); fpRect(f, 5.65, 7.5, 5.75, D, 'w');
    // meeting room: stone-sample shelving on the left wall, table, chairs, globe pendants
    var shl = shelving(0, 3.6, 0, y0, 2.6, 0.36, MT.marbleGrey, { rows: 4, col: 0.9 });
    shl.rotation.y = Math.PI / 2; shl.position.set(0, y0, 8.6);
    stoneSamples(0.2, y0 + 0.04, 5.2, 8.4, 'z');
    fpRect(f, 0, 5.0, 0.4, 8.6);
    var tb = group(2.8, y0, 6.8, 0);
    within(tb, function () {
      rbox(3.2, 0.05, 1.15, 0.02, MT.marbleGrey, 0, 0.72, 0);
      [[-1.0, 0], [1.0, 0]].forEach(function (p) {
        boxB(0.7, 0.04, 0.7, MT.bronze, p[0], 0.02, p[1]); boxB(0.7, 0.04, 0.7, MT.bronze, p[0], 0.68, p[1]);
        [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]].forEach(function (q) { boxB(0.03, 0.66, 0.03, MT.bronze, p[0] + q[0], 0.04, p[1] + q[1]); });
      });
      cyl(0.32, 0.32, 0.03, MT.leatherDark, 0, 0.77, 0, 32);
      vase(-0.1, 0.8, 0, 0.24, MT.glassTint);
    });
    fpRect(f, 1.2, 6.22, 4.4, 7.38);
    [[1.8, 6.0, 0], [2.8, 6.0, 0], [3.8, 6.0, 0], [1.8, 7.6, Math.PI], [2.8, 7.6, Math.PI], [3.8, 7.6, Math.PI]].forEach(function (c) {
      var ch = diningChair(c[0], c[1], c[2], MT.leather); ch.position.y = y0;
    });
    [[2.0, 6.7, 0.24], [2.6, 6.95, 0.3], [3.3, 6.6, 0.22], [3.7, 7.0, 0.26]].forEach(function (p) {
      var yy = F1_CEIL - 0.75 - p[2];
      box(0.008, F1_CEIL - yy, 0.008, MT.brass, p[0], (F1_CEIL + yy) / 2, p[1]);
      var gm = new T.Mesh(new T.SphereGeometry(p[2], 24, 16), MT.globe); gm.position.set(p[0], yy, p[1]); add(gm);
      box(0.03, p[2] * 1.4, 0.03, MT.led, p[0], yy, p[1]);
    });
    // office: two pairs of desks
    [[1.6, 1.7], [3.6, 1.7]].forEach(function (p) {
      boxB(1.5, 0.04, 0.75, MT.walnut, p[0], y0 + 0.72, p[1]);
      boxB(0.04, 0.72, 0.7, MT.bronze, p[0] - 0.7, y0, p[1]); boxB(0.04, 0.72, 0.7, MT.bronze, p[0] + 0.7, y0, p[1]);
      boxB(0.5, 0.32, 0.03, MT.black, p[0], y0 + 0.78, p[1] - 0.2);
      var c = diningChair(p[0], p[1] + 0.7, Math.PI, MT.boucle); c.position.y = y0;
      fpRect(f, p[0] - 0.75, p[1] - 0.38, p[0] + 0.75, p[1] + 0.38);
    });
    shelving(0.4, 5.2, 0, y0, 2.4, 0.36, MT.marbleRed, { rows: 4, col: 1.2 });
    fpRect(f, 0.4, 0, 5.2, 0.36);
    var offRug = boxB(4.2, 0.012, 2.4, MT.rugGrey, 2.6, y0, 2.2);

    // --- Presentation area (x 5.7..12.6) ---------------------------
    // back wall: dark grey marble with fluted glass and red marble vanity
    box(6.8, H, 0.06, MT.marbleGrey, 9.2, y0 + H / 2, 0.03);
    box(5.0, 1.6, 0.05, MT.fluted, 9.4, y0 + 1.8, 0.08);
    boxB(4.6, 0.55, 0.55, MT.black, 9.4, y0 + 0.35, 0.3);
    boxB(4.8, 0.35, 0.58, MT.marbleRed, 9.4, y0, 0.3);
    boxB(4.6, 0.04, 0.58, MT.marbleRed, 9.4, y0 + 0.9, 0.3);
    [8.4, 10.4].forEach(function (x) {
      rbox(0.55, 0.14, 0.42, 0.03, MT.marbleWarm, x, y0 + 0.94, 0.3);
      box(1.3, 0.9, 0.02, MT.mirror, x, y0 + 1.95, 0.1);
      boxB(0.02, 0.25, 0.02, MT.bronze, x, y0 + 1.0, 0.1);
    });
    for (var sx = 6.6; sx < 12.2; sx += 1.1) boxB(0.3, 0.05, 0.12, MT.marbleRed, sx, y0 + 2.9, 0.12);
    fpRect(f, 7.0, 0, 11.8, 0.6);
    // red marble presentation island
    var isl = group(9.2, y0, 3.9, 0);
    within(isl, function () {
      rbox(1.5, 0.82, 1.3, 0.04, MT.marbleRed, -0.7, 0.08, 0);
      rbox(1.4, 0.82, 1.25, 0.03, MT.glassTint, 0.75, 0.08, 0);
      for (var d = 0; d < 3; d++) boxB(1.3, 0.015, 1.22, MT.bronze, 0.75, 0.12 + d * 0.27, 0);
      rbox(3.0, 0.07, 1.4, 0.02, MT.travBlock, 0, 0.9, 0);
      boxB(0.9, 0.01, 0.5, MT.black, -0.6, 0.97, 0.2); boxB(0.9, 0.01, 0.5, MT.black, 0.6, 0.97, -0.2);
      boxB(2.8, 0.08, 1.2, MT.bronze, 0, 0, 0);
    });
    fpRect(f, 7.7, 3.2, 10.7, 4.6);
    // linear pendant tubes
    [[8.6, 3.7], [9.8, 4.1]].forEach(function (p) {
      var tube = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1.4, 20), MT.ledSoft);
      tube.rotation.z = Math.PI / 2; tube.position.set(p[0], F1_CEIL - 1.25, p[1]); add(tube);
      [-0.45, 0, 0.45].forEach(function (o) { var r = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.04, 20), MT.brass); r.rotation.z = Math.PI / 2; r.position.set(p[0] + o, F1_CEIL - 1.25, p[1]); add(r); });
      box(0.006, 1.2, 0.006, MT.black, p[0] - 0.5, F1_CEIL - 0.6, p[1]); box(0.006, 1.2, 0.006, MT.black, p[0] + 0.5, F1_CEIL - 0.6, p[1]);
    });
    // stone sample library on the right partition
    boxB(0.5, 2.6, 2.6, MT.walnut, 12.3, y0, 2.0);
    stoneSamples(12.04, y0 + 0.3, 1.0, 3.0, 'z');
    fpRect(f, 12.05, 0.7, 12.55, 3.3);
    // pedestal sinks near the window
    [[7.0, 8.0, MT.marbleRed], [7.9, 8.0, MT.glassTint]].forEach(function (s) {
      lathe([[0, 0], [0.22, 0], [0.18, 0.4], [0.12, 0.8], [0.001, 0.8]], MT.ledSoft, s[0], y0, s[1], 24);
      lathe([[0.001, 0], [0.18, 0.02], [0.24, 0.18], [0.22, 0.2], [0.16, 0.06], [0.001, 0.06]], s[2], s[0], y0 + 0.8, s[1], 24);
      fpCirc(f, s[0], s[1], 0.25);
    });
    // rain shower glass cube with mesh
    var shower = group(10.4, y0, 7.6, 0);
    within(shower, function () {
      boxB(1.8, H - 0.6, 0.02, MT.glassTint, 0, 0, -0.65);
      boxB(0.02, H - 0.6, 1.3, MT.glass, -0.9, 0, 0); boxB(0.02, H - 0.6, 1.3, MT.glass, 0.9, 0, 0);
      boxB(1.84, 0.04, 1.34, MT.bronze, 0, H - 0.6, 0);
      boxB(1.8, 0.08, 1.3, MT.marbleDark, 0, 0, 0);
      boxB(1.6, 0.45, 0.4, MT.marbleDark, 0, 0.08, 0.35);
      box(0.6, 0.01, 0.4, MT.led, 0, H - 0.62, 0);
    });
    fpRect(f, 9.5, 6.95, 11.3, 8.25);

    // --- Bathroom (x 12.6..16.9) ------------------------------------
    box(4.2, H, 0.05, MT.fluted, 14.75, y0 + H / 2, 0.03);
    [12.85, 16.65].forEach(function (x) { box(0.45, H, 0.08, MT.marbleBlue, x, y0 + H / 2, 0.06); });
    box(3.6, 0.04, 0.06, MT.led, 14.75, y0 + 2.75, 0.12);
    var van = group(14.75, y0, 0.45, 0);
    within(van, function () {
      boxB(2.6, 0.72, 0.6, MT.taupe, 0, 0.12, 0);
      boxB(0.3, 0.84, 0.62, MT.walnut, -1.45, 0, 0); boxB(0.3, 0.84, 0.62, MT.walnut, 1.45, 0, 0);
      boxB(3.2, 0.06, 0.64, MT.marbleDark, 0, 0.84, 0);
      [-0.55, 0.55].forEach(function (x) {
        box(0.6, 1.3, 0.03, MT.mirror, x, 1.85, -0.27);
        boxB(0.02, 0.3, 0.02, MT.bronze, x, 0.9, -0.2);
        boxB(0.06, 0.15, 0.06, MT.black, x + 0.15, 0.9, 0.05);
      });
    });
    [13.1, 16.4].forEach(function (x) {
      boxB(0.04, 1.4, 0.04, MT.ledSoft, x, y0 + 0.4, 0.95);
      box(0.01, H - 1.8, 0.01, MT.bronze, x, F1_CEIL - (H - 1.8) / 2, 0.95);
    });
    fpRect(f, 13.15, 0.1, 16.35, 0.8);
    // freestanding black tub on a stone plinth by the window
    boxB(2.6, 0.12, 1.5, MT.marbleBlue, 14.6, y0, 7.9);
    var tub = lathe([[0.001, 0], [0.62, 0], [0.7, 0.2], [0.72, 0.55], [0.67, 0.57], [0.62, 0.15], [0.001, 0.12]], MT.black, 14.6, y0 + 0.12, 7.9, 40);
    tub.scale.set(1.35, 1, 0.75);
    boxB(0.03, 1.0, 0.03, MT.bronze, 15.7, y0 + 0.12, 7.6);
    fpRect(f, 13.3, 7.15, 15.9, 8.65);
    var bp = group(14.6, F1_CEIL, 7.6, 0);
    within(bp, function () {
      box(0.01, 0.9, 0.01, MT.bronze, 0, -0.45, 0);
      box(1.2, 0.015, 0.015, MT.bronze, 0, -0.9, 0); box(0.015, 0.9, 0.015, MT.bronze, 0.3, -1.3, 0);
      [[-0.6, -0.9], [0.6, -0.9], [0.3, -1.75]].forEach(function (p) {
        var s = new T.Mesh(new T.SphereGeometry(0.06, 16, 12), MT.ledSoft); s.position.set(p[0], p[1], 0); add(s);
      });
    });
    // grey rug and stool
    boxB(1.6, 0.01, 0.9, MT.rugGrey, 14.6, y0, 6.6);
    // glass wardrobe partition between bath and bedroom
    var wd = group(16.95, y0, 0, 0);
    within(wd, function () {
      boxB(0.6, H - 0.3, 3.8, MT.walnut, 0, 0, 1.9);
      boxB(0.5, H - 0.6, 3.6, MT.ledSoft, 0, 0.15, 1.9).material = std({ color: 0xf0c890, emissive: 0x8a5020, emissiveIntensity: 0.5, roughness: 0.6 });
      boxB(0.62, H - 0.3, 3.8, MT.glassTint, 0, 0, 1.9);
      for (var i = 0; i < 6; i++) boxB(0.08, 1.0, 0.35, pick([MT.sand, MT.cream, MT.charcoal]), R(-0.1, 0.1), 1.0, 0.4 + i * 0.55);
      for (i = 0; i <= 6; i++) boxB(0.64, H - 0.3, 0.025, MT.bronze, 0, 0, i * 3.8 / 6);
    });
    fpRect(f, 16.65, 0, 17.25, 3.8);

    // --- Bedroom (x 17.3..22) ---------------------------------------
    var bx = 19.6;
    box(4.4, H, 0.06, MT.walnut, bx, y0 + H / 2, 0.03);
    box(2.6, 2.7, 0.04, MT.charcoal, bx, y0 + 1.35 + 0.2, 0.08);
    for (var gx = -1.2; gx <= 1.21; gx += 0.6) boxB(0.03, 2.7, 0.04, MT.bronze, bx + gx, y0 + 0.2, 0.11);
    [0.9, 1.7, 2.5].forEach(function (gy) { boxB(2.6, 0.03, 0.04, MT.bronze, bx, y0 + gy, 0.11); });
    box(2.6, 0.03, 0.05, MT.led, bx, y0 + 2.92, 0.12);
    [bx - 1.75, bx + 1.75].forEach(function (x) {
      box(0.9, 2.9, 0.04, MT.weave, x, y0 + 1.45 + 0.1, 0.08).material = std({ map: rep(TX.weave, 1.5, 5), roughness: 0.7, color: 0xb8b0a8 });
    });
    var bed = group(bx, y0, 1.45, 0);
    within(bed, function () {
      rbox(2.3, 0.32, 2.3, 0.12, MT.charcoal, 0, 0.02, 0.15);
      rbox(2.05, 0.28, 2.05, 0.08, MT.cream, 0, 0.3, 0.2);
      rbox(2.08, 0.06, 1.1, 0.03, MT.sand, 0, 0.57, 0.65);
      rbox(2.08, 0.04, 0.5, 0.02, MT.slateBlue, 0, 0.62, 0.9);
      rbox(2.4, 0.75, 0.35, 0.15, MT.sand, 0, 0.3, -0.95);
      [-0.7, -0.25, 0.25, 0.7].forEach(function (x, i) { pillow(x, 0.62, -0.62, i % 3 ? MT.cream : MT.sand, 0, -0.3); });
      [-0.45, 0.45].forEach(function (x) { pillow(x, 0.62, -0.45, MT.charcoal, 0, -0.2); });
    });
    fpRect(f, bx - 1.2, 0.3, bx + 1.2, 2.6);
    [bx - 1.6, bx + 1.6].forEach(function (x) {
      cyl(0.26, 0.26, 0.5, MT.black, x, y0, 0.45, 32);
      cyl(0.27, 0.27, 0.03, MT.marbleWarm, x, y0 + 0.5, 0.45, 32);
      fpCirc(f, x, 0.45, 0.27);
    });
    boxB(3.4, 0.012, 2.6, MT.rugGrey, bx, y0, 2.4);
    // armchair & side table
    var ac = group(21.4, y0, 4.3, -2.3);
    within(ac, function () {
      cyl(0.42, 0.38, 0.4, MT.leather, 0, 0, 0, 32);
      cyl(0.4, 0.4, 0.1, MT.boucle, 0, 0.4, 0, 32);
      var back = new T.Mesh(new T.CylinderGeometry(0.45, 0.42, 0.4, 32, 1, true, Math.PI * 0.6, Math.PI * 0.8), MT.boucle);
      back.material = std({ map: TX.boucle, color: 0x9a9088, roughness: 0.95, side: T.DoubleSide });
      back.position.set(0, 0.6, 0); add(back);
    });
    fpCirc(f, 21.4, 4.3, 0.45);
    sideTable(21.1, 5.2, y0);
    // wall sconces (amber discs) on the right wall of the bedroom zone
    [[2.2, 4.0], [2.9, 4.6], [2.3, 5.2]].forEach(function (p) {
      var m = new T.Mesh(new T.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), MT.globeAmber);
      m.rotation.z = Math.PI / 2; m.position.set(21.95, y0 + p[0], p[1]); add(m);
    });
    box(0.04, H, 2.6, MT.plaster, 22.0, y0 + H / 2, 4.5);
    fpRect(f, 21.95, 3.2, 22.05, 5.8, 'w');

    // landing: oak panelling with alabaster strip lights
    box(3.9, H, 0.05, MT.oak, 24.05, y0 + H / 2, 0.03);
    [23.0, 25.1].forEach(function (x) { box(0.16, 1.5, 0.04, MT.ledSoft, x, y0 + 1.8, 0.08); });

    // --- WC (x 22..24.4, z 6..9) ---------------------------------------
    box(2.4, H, 0.08, MT.walnut, 23.2, y0 + H / 2, 6.0);
    box(0.08, H, 3.0, MT.walnut, 22.0, y0 + H / 2, 7.5);
    boxB(0.9, 2.2, 0.02, MT.oakLight, 23.0, y0, 5.95);
    fpRect(f, 22.0, 6.0, 24.4, D, 'w');
  }

  function glassWall(x0, z0, x1, z1, y0, h) {
    var len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    var g = group(cx, y0, cz, ang);
    within(g, function () {
      boxB(0.02, h, len, MT.glassTint, 0, 0, 0);
      var n = Math.max(1, Math.round(len / 1.2));
      for (var i = 0; i <= n; i++) boxB(0.04, h, 0.04, MT.bronze, 0, 0, -len / 2 + i * len / n);
      boxB(0.05, 0.04, len, MT.bronze, 0, 0, 0); boxB(0.05, 0.04, len, MT.bronze, 0, h - 0.04, 0);
      boxB(0.05, 0.04, len, MT.bronze, 0, 1.0, 0);
    });
  }

  function stoneSamples(x, y0, z0, z1, axis) {
    var mats = [MT.marbleRed, MT.marbleBlue, MT.marbleWarm, MT.marbleDark, MT.marbleGrey, MT.travBlock];
    var rows = 3;
    for (var r = 0; r < rows; r++) {
      for (var z = z0 + 0.1; z < z1 - 0.1; z += R(0.06, 0.12)) {
        var h = R(0.35, 0.55);
        boxB(0.3, h, 0.03, pick(mats), x + 0.05, y0 + r * 0.68 + 0.05, z, R(-0.05, 0.05));
      }
    }
  }

  // ------------------------------------------------------------------
  // LIGHTING + environment
  // ------------------------------------------------------------------
  function buildLights() {
    scene.add(new T.HemisphereLight(0xfff1de, 0x5a4030, 0.32));
    scene.add(new T.AmbientLight(0xffe8cc, 0.06));
    var sun = new T.DirectionalLight(0xfff0d8, 0.7);
    sun.position.set(-6, 14, 22); scene.add(sun);
    var back = new T.DirectionalLight(0xffe2bd, 0.25);
    back.position.set(20, 8, -10); scene.add(back);
    [[7.6, 2.6, 4.3, 1.0], [21.4, 2.6, 3.6, 0.7], [16.5, 2.6, 3.0, 0.55], [2.0, 2.6, 4.5, 0.55],
     [3.0, F1 + 2.6, 4.5, 0.6], [9.5, F1 + 2.6, 4.0, 0.7], [15.0, F1 + 2.6, 4.0, 0.6], [19.6, F1 + 2.6, 4.0, 0.6]
    ].forEach(function (p) {
      var l = new T.PointLight(0xffc98c, p[3], 9, 1.6); l.position.set(p[0], p[1], p[2]); scene.add(l);
    });

    // environment map for metal / lacquer reflections
    var envScene = new T.Scene();
    var room = new T.Mesh(new T.BoxGeometry(20, 8, 20), new T.MeshBasicMaterial({ color: 0x2e2016, side: T.BackSide }));
    envScene.add(room);
    var win = new T.Mesh(new T.PlaneGeometry(14, 5), new T.MeshBasicMaterial({ color: 0xbfb4a4 }));
    win.position.set(0, 0.5, 9.9); win.rotation.y = Math.PI; envScene.add(win);
    var ceil = new T.Mesh(new T.PlaneGeometry(14, 14), new T.MeshBasicMaterial({ color: 0x6e4528 }));
    ceil.position.set(0, 3.9, 0); ceil.rotation.x = Math.PI / 2; envScene.add(ceil);
    var floorE = new T.Mesh(new T.PlaneGeometry(18, 18), new T.MeshBasicMaterial({ color: 0x7a6e60 }));
    floorE.position.set(0, -3.9, 0); floorE.rotation.x = -Math.PI / 2; envScene.add(floorE);
    var pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.04).texture;
    pm.dispose();
  }

  // ------------------------------------------------------------------
  // TOUR — nodes (x, z, floor, look yaw in degrees, name)
  // yaw 0 = looking at the back wall (−z), 90 = looking right (+x)
  // ------------------------------------------------------------------
  var NODES = [
    { x: 5.6, z: 7.9, f: 0, yaw: -40, name: 'Entrance' },
    { x: 3.4, z: 5.4, f: 0, yaw: -128, name: 'Reception' },
    { x: 3.7, z: 3.2, f: 0, yaw: -72, name: 'Olive Lounge' },
    { x: 7.6, z: 8.1, f: 0, yaw: 0, name: 'Living Zone 1' },
    { x: 11.0, z: 7.6, f: 0, yaw: -62, name: 'Pearl Garlands' },
    { x: 13.9, z: 6.3, f: 0, yaw: -18, name: 'Living Zone 2' },
    { x: 17.0, z: 6.6, f: 0, yaw: 0, name: 'Work Table' },
    { x: 21.2, z: 6.8, f: 0, yaw: -6, name: 'Kitchen Zone' },
    { x: 23.6, z: 6.6, f: 0, yaw: -95, name: 'Kitchen · View West' },
    { x: 25.2, z: 8.55, f: 0, yaw: 0, name: 'Stairs' },
    { x: 25.2, z: 4.65, f: 0, y: F1 / 2 + EYE, yaw: 0, name: 'Stairs' },
    { x: 25.2, z: 0.75, f: 1, yaw: -108, name: 'Upper Landing' },
    { x: 23.1, z: 1.4, f: 1, yaw: -118, name: 'Upper Hall' },
    { x: 19.6, z: 6.8, f: 1, yaw: 0, name: 'Bedroom' },
    { x: 14.75, z: 3.3, f: 1, yaw: 0, name: 'Bathroom' },
    { x: 14.6, z: 5.4, f: 1, yaw: 175, name: 'Black Bathtub' },
    { x: 10.4, z: 5.9, f: 1, yaw: -28, name: 'Presentation Island' },
    { x: 5.0, z: 6.8, f: 1, yaw: -90, name: 'Meeting Room' },
    { x: 4.9, z: 2.9, f: 1, yaw: -58, name: 'Office' }
  ];
  NODES.forEach(function (n, i) {
    n.i = i;
    if (n.y === undefined) n.y = (n.f ? F1 : 0) + EYE;
    n.groundY = n.y - EYE;
  });

  // ------------------------------------------------------------------
  // View state
  // ------------------------------------------------------------------
  var PITCH0 = -0.14;
  var view = { yaw: NODES[0].yaw * Math.PI / 180, pitch: PITCH0, fov: 72 };
  var pos = new T.Vector3(NODES[0].x, NODES[0].y, NODES[0].z);
  var current = 0;
  var moving = null;       // {from,to,t,dur,yaw0,yaw1}
  var queue = [];          // pending node indices
  var dirty = true;
  var autoTour = false, autoTimer = 0;

  function applyCamera() {
    camera.position.copy(pos);
    camera.rotation.set(view.pitch, -view.yaw, 0, 'YXZ');
    if (camera.fov !== view.fov) { camera.fov = view.fov; camera.updateProjectionMatrix(); }
    // show only the floor(s) we can see
    floors[0].visible = pos.y < F1 + 1.2;
    floors[1].visible = pos.y > F1 - 0.2;
  }
  function yawDir(y) { return new T.Vector3(Math.sin(y), 0, -Math.cos(y)); }
  function angleTo(fromX, fromZ, toX, toZ) { return Math.atan2(toX - fromX, -(toZ - fromZ)); }
  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function neighbours(i) {
    var r = [];
    if (i > 0) r.push(i - 1);
    if (i < NODES.length - 1) r.push(i + 1);
    return r;
  }

  function goTo(i) {
    if (i === current && !moving) return;
    queue = [];
    var from = moving ? moving.to : current;
    var step = i > from ? 1 : -1;
    for (var k = from + step; step > 0 ? k <= i : k >= i; k += step) queue.push(k);
    if (!moving) startNext();
  }
  function startNext() {
    if (!queue.length) return;
    var to = queue.shift(), from = NODES[current], n = NODES[to];
    var dist = Math.hypot(n.x - from.x, n.z - from.z, n.y - from.y);
    var last = queue.length === 0;
    var travelYaw = angleTo(from.x, from.z, n.x, n.z);
    if (dist < 0.05) travelYaw = view.yaw;
    moving = {
      fromPos: pos.clone(), to: to, t: 0,
      dur: Math.min(2.2, Math.max(0.7, dist * (last ? 0.34 : 0.26))),
      yaw0: view.yaw, yawTravel: travelYaw,
      yaw1: last ? n.yaw * Math.PI / 180 : travelYaw,
      pitch0: view.pitch, last: last
    };
    hideArrows();
  }

  function update(dt) {
    if (moving) {
      var m = moving, n = NODES[m.to];
      m.t = Math.min(1, m.t + dt / m.dur);
      var e = ease(m.t);
      pos.set(m.fromPos.x + (n.x - m.fromPos.x) * e, m.fromPos.y + (n.y - m.fromPos.y) * e, m.fromPos.z + (n.z - m.fromPos.z) * e);
      // turn toward the travel direction first, then settle on the node's best view
      var yawTarget = m.t < 0.55 ? m.yawTravel : m.yaw1;
      var k = 1 - Math.pow(0.0015, dt);
      view.yaw += wrap(yawTarget - view.yaw) * k;
      view.pitch += (PITCH0 - view.pitch) * k;
      if (m.t >= 1) {
        current = m.to; moving = null;
        if (queue.length) startNext();
        else { m.settle = true; settleYaw = m.yaw1; onArrive(); }
      }
      dirty = true;
    } else if (settleYaw !== null) {
      var d = wrap(settleYaw - view.yaw);
      view.yaw += d * (1 - Math.pow(0.003, dt));
      if (Math.abs(d) < 0.002) settleYaw = null;
      dirty = true;
    }
    if (autoTour && !moving && !dragging) {
      autoTimer += dt;
      view.yaw += dt * 0.08; dirty = true;
      if (autoTimer > 3.6) {
        autoTimer = 0;
        if (current < NODES.length - 1) goTo(current + 1); else setAuto(false);
      }
    }
  }
  var settleYaw = null;

  // ------------------------------------------------------------------
  // Arrows / hotspots
  // ------------------------------------------------------------------
  var arrowGroup = new T.Group(); scene.add(arrowGroup);
  var arrowMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
  var arrowShadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthTest: false });
  var discMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
  var discRingMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
  var arrowGeo = (function () {
    var s = new T.Shape();
    s.moveTo(0, 0.34); s.lineTo(0.34, -0.02); s.lineTo(0.22, -0.12); s.lineTo(0, 0.1); s.lineTo(-0.22, -0.12); s.lineTo(-0.34, -0.02); s.closePath();
    var g = new T.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g;
  })();
  var hotspots = [];
  var discs = [];

  function buildDiscs() {
    var dg = new T.CircleGeometry(0.22, 32); dg.rotateX(-Math.PI / 2);
    var rg = new T.RingGeometry(0.22, 0.26, 32); rg.rotateX(-Math.PI / 2);
    NODES.forEach(function (n, i) {
      var g = new T.Group();
      var d = new T.Mesh(dg, discMat); d.userData.node = i;
      var r = new T.Mesh(rg, discRingMat); r.userData.node = i;
      g.add(d, r); g.position.set(n.x, n.groundY + 0.02, n.z);
      g.renderOrder = 5;
      scene.add(g); discs.push(g);
    });
  }
  function hideArrows() { arrowGroup.visible = false; }
  function showArrows() {
    arrowGroup.clear ? arrowGroup.clear() : arrowGroup.children.slice().forEach(function (c) { arrowGroup.remove(c); });
    hotspots = [];
    var n = NODES[current];
    neighbours(current).forEach(function (j) {
      var m = NODES[j], a = angleTo(n.x, n.z, m.x, m.z);
      var slope = (m.y - n.y) / Math.max(0.5, Math.hypot(m.x - n.x, m.z - n.z));
      var g = new T.Group();
      var sh = new T.Mesh(arrowGeo, arrowShadowMat); sh.position.set(0.02, -0.005, 0.02); sh.renderOrder = 9;
      var ar = new T.Mesh(arrowGeo, arrowMat); ar.renderOrder = 10;
      ar.userData.node = j; sh.userData.node = j;
      g.add(sh, ar);
      g.scale.setScalar(1.5);
      var ad = 2.2;
      g.position.set(n.x + Math.sin(a) * ad, n.groundY + 0.03 + Math.max(0, slope) * ad, n.z - Math.cos(a) * ad);
      g.rotation.set(0, -a, 0, 'YXZ');
      if (Math.abs(slope) > 0.1) g.rotateX(Math.atan(slope));
      arrowGroup.add(g);
      hotspots.push(ar);
    });
    arrowGroup.visible = true;
    discs.forEach(function (d, i) { d.visible = i !== current && NODES[i].f === n.f && Math.hypot(NODES[i].x - n.x, NODES[i].z - n.z) < 9; });
    dirty = true;
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
  var elName = document.getElementById('place-name');
  var elFloor = document.getElementById('place-floor');
  var elSteps = document.getElementById('steps');
  var btnPrev = document.getElementById('btn-prev');
  var btnNext = document.getElementById('btn-next');
  var btnPlay = document.getElementById('btn-play');
  var stepEls = NODES.map(function (n, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'step' + (n.f ? ' is-upper' : '');
    b.setAttribute('aria-label', n.name);
    b.addEventListener('click', function () { setAuto(false); goTo(i); });
    elSteps.appendChild(b); return b;
  });
  var shownName = '';
  function onArrive() {
    var n = NODES[current];
    if (n.name !== shownName) {
      shownName = n.name;
      elName.classList.add('is-fading');
      setTimeout(function () { elName.textContent = n.name; elName.classList.remove('is-fading'); }, 180);
    }
    elFloor.textContent = n.f ? 'First floor' : 'Ground floor';
    stepEls.forEach(function (b, i) { b.classList.toggle('is-active', i === current); });
    btnPrev.disabled = current === 0;
    btnNext.disabled = current === NODES.length - 1;
    mapFloor = n.f; updateTabs();
    showArrows();
  }
  btnPrev.addEventListener('click', function () { setAuto(false); if (current > 0) goTo((moving ? moving.to : current) - 1); });
  btnNext.addEventListener('click', function () { setAuto(false); if (current < NODES.length - 1) goTo((moving ? moving.to : current) + 1); });
  function setAuto(on) {
    autoTour = on; autoTimer = on ? 2.4 : 0;
    btnPlay.classList.toggle('is-on', on);
  }
  btnPlay.addEventListener('click', function () {
    if (!autoTour && current === NODES.length - 1) goTo(0);
    setAuto(!autoTour);
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') { view.yaw -= 0.12; dirty = true; }
    else if (e.key === 'ArrowRight' || e.key === 'd') { view.yaw += 0.12; dirty = true; }
    else if (e.key === 'ArrowUp' || e.key === 'w') { setAuto(false); stepToward(view.yaw); }
    else if (e.key === 'ArrowDown' || e.key === 's') { setAuto(false); stepToward(view.yaw + Math.PI); }
    else if (e.key === 'PageDown' || e.key === ']') btnNext.click();
    else if (e.key === 'PageUp' || e.key === '[') btnPrev.click();
  });
  function stepToward(yaw) {
    if (moving) return;
    var n = NODES[current], best = -1, bestA = 1.2;
    neighbours(current).forEach(function (j) {
      var a = Math.abs(wrap(angleTo(n.x, n.z, NODES[j].x, NODES[j].z) - yaw));
      if (a < bestA) { bestA = a; best = j; }
    });
    if (best >= 0) goTo(best);
  }

  // Minimap -----------------------------------------------------------
  var mapEl = document.getElementById('map');
  var mapCanvas = document.getElementById('map-canvas');
  var mctx = mapCanvas.getContext('2d');
  var mapFloor = 0, mapPad = 0.3;
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.map__tab'));
  function updateTabs() { tabs.forEach(function (t) { t.classList.toggle('is-active', +t.dataset.floor === mapFloor); }); }
  tabs.forEach(function (t) { t.addEventListener('click', function () { mapFloor = +t.dataset.floor; updateTabs(); drawMap(); }); });
  document.getElementById('map-toggle').addEventListener('click', function (e) {
    var c = mapEl.classList.toggle('is-collapsed');
    e.currentTarget.textContent = c ? '+' : '–';
    if (!c) resizeMap();
  });
  try { if (window.innerWidth < 640) { mapEl.classList.add('is-collapsed'); document.getElementById('map-toggle').textContent = '+'; } } catch (e) {}
  var mapScale = 10;
  function resizeMap() {
    var w = mapCanvas.clientWidth; if (!w) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    mapCanvas.width = w * dpr; mapCanvas.height = w * (9.6 / 26) * dpr;
    mapScale = mapCanvas.width / (W + mapPad * 2);
    drawMap();
  }
  function mx(x) { return (x + mapPad) * mapScale; }
  function mz(z) { return (z + mapPad) * mapScale; }
  function drawMap() {
    var c = mctx, s = mapScale, w = mapCanvas.width, h = mapCanvas.height;
    if (!w) return;
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#efe7da'; c.fillRect(mx(0), mz(0), W * s, D * s);
    // windows on the facade
    c.fillStyle = '#9fc0d4'; c.fillRect(mx(0), mz(D) - 1, W * s, 2.5);
    c.strokeStyle = '#2a211a'; c.lineWidth = Math.max(2, s * 0.18);
    c.strokeRect(mx(0), mz(0), W * s, D * s);
    FP[mapFloor].forEach(function (p) {
      c.fillStyle = p.k === 'rug' ? 'rgba(160,130,95,.18)' : p.k === 's' ? 'rgba(42,33,26,.12)' : p.k === 'w' ? '#5a4a3c' : 'rgba(90,70,52,.42)';
      c.beginPath();
      if (p.t === 'r') c.rect(mx(p.x0), mz(p.z0), (p.x1 - p.x0) * s, (p.z1 - p.z0) * s);
      else if (p.t === 'c') c.arc(mx(p.x), mz(p.z), p.r * s, 0, Math.PI * 2);
      else { c.arc(mx(p.x), mz(p.z), p.r1 * s, p.a0, p.a1, false); c.arc(mx(p.x), mz(p.z), p.r0 * s, p.a1, p.a0, true); c.closePath(); }
      c.fill();
    });
    if (mapFloor === 0 || mapFloor === 1) {
      // stair treads
      c.strokeStyle = 'rgba(42,33,26,.45)'; c.lineWidth = 1;
      for (var i = 0; i <= 22; i++) { var zz = STAIR_Z_TOP + i * (STAIR_Z_BOTTOM - STAIR_Z_TOP) / 22; c.beginPath(); c.moveTo(mx(STAIR_X0), mz(zz)); c.lineTo(mx(STAIR_X1), mz(zz)); c.stroke(); }
    }
    // path
    c.setLineDash([s * 0.25, s * 0.2]); c.strokeStyle = 'rgba(160,110,60,.9)'; c.lineWidth = Math.max(1.5, s * 0.08);
    c.beginPath();
    var started = false;
    NODES.forEach(function (n, i) {
      if (n.f === mapFloor || i === 10) { if (!started) { c.moveTo(mx(n.x), mz(n.z)); started = true; } else c.lineTo(mx(n.x), mz(n.z)); }
    });
    c.stroke(); c.setLineDash([]);
    NODES.forEach(function (n, i) {
      if (n.f !== mapFloor) return;
      c.beginPath(); c.arc(mx(n.x), mz(n.z), s * 0.22, 0, Math.PI * 2);
      c.fillStyle = i === current ? '#b0773f' : '#fff'; c.fill();
      c.lineWidth = Math.max(1.2, s * 0.06); c.strokeStyle = '#b0773f'; c.stroke();
    });
    // me
    var me = { x: pos.x, z: pos.z };
    var onFloor = (pos.y > F1 + 0.8 ? 1 : 0) === mapFloor || (pos.y > 2 && pos.y < F1 + 0.8);
    if (onFloor) {
      var fovH = 2 * Math.atan(Math.tan(view.fov * Math.PI / 360) * camera.aspect);
      var r = s * 2.4;
      var g = c.createRadialGradient(mx(me.x), mz(me.z), 0, mx(me.x), mz(me.z), r);
      g.addColorStop(0, 'rgba(176,119,63,.55)'); g.addColorStop(1, 'rgba(176,119,63,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(mx(me.x), mz(me.z));
      // canvas angle: x right, y down (= +z). Direction of yaw is (sin, -cos)
      var ca = Math.atan2(-Math.cos(view.yaw), Math.sin(view.yaw));
      c.arc(mx(me.x), mz(me.z), r, ca - fovH / 2, ca + fovH / 2); c.closePath(); c.fill();
      c.beginPath(); c.arc(mx(me.x), mz(me.z), s * 0.3, 0, Math.PI * 2);
      c.fillStyle = '#2a211a'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
    }
  }
  mapCanvas.addEventListener('click', function (e) {
    var r = mapCanvas.getBoundingClientRect();
    var k = mapCanvas.width / r.width;
    var x = (e.clientX - r.left) * k / mapScale - mapPad, z = (e.clientY - r.top) * k / mapScale - mapPad;
    var best = -1, bd = 2.2;
    NODES.forEach(function (n, i) { if (n.f !== mapFloor) return; var d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { setAuto(false); goTo(best); }
  });

  // ------------------------------------------------------------------
  // Pointer: drag to look, tap to walk, pinch / wheel to zoom
  // ------------------------------------------------------------------
  var pointers = {}, dragging = false, downInfo = null, pinch0 = null;
  var raycaster = new T.Raycaster(), ndc = new T.Vector2();
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 1) { downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; dragging = true; canvas.classList.add('is-dragging'); }
    else if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: view.fov }; downInfo = null; }
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId]; if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    var ids = Object.keys(pointers);
    if (ids.length === 2 && pinch0) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      view.fov = Math.max(35, Math.min(85, pinch0.fov * pinch0.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))));
      dirty = true; return;
    }
    if (!dragging) return;
    if (downInfo) downInfo.moved += Math.abs(dx) + Math.abs(dy);
    var k = (view.fov / 72) * (Math.PI / canvas.clientHeight) * 0.9;
    view.yaw -= dx * k; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + dy * k));
    settleYaw = null;
    if (downInfo && downInfo.moved > 6) setAuto(false);
    dirty = true;
  });
  function endPointer(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length === 0) {
      dragging = false; canvas.classList.remove('is-dragging'); pinch0 = null;
      if (downInfo && downInfo.moved < 8 && performance.now() - downInfo.t < 500) onTap(e.clientX, e.clientY);
      downInfo = null;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    view.fov = Math.max(35, Math.min(85, view.fov + e.deltaY * 0.03)); dirty = true;
  }, { passive: false });

  function onTap(cx, cy) {
    var r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(hotspots, false);
    if (hits.length) { setAuto(false); goTo(hits[0].object.userData.node); return; }
    var dm = []; discs.forEach(function (d) { if (d.visible) dm.push.apply(dm, d.children); });
    hits = raycaster.intersectObjects(dm, false);
    if (hits.length) { setAuto(false); goTo(hits[0].object.userData.node); return; }
    // otherwise walk towards the tapped direction (Street View style)
    var dir = raycaster.ray.direction;
    if (dir.y < 0.25) { setAuto(false); stepToward(Math.atan2(dir.x, -dir.z)); }
  }

  // ------------------------------------------------------------------
  // Resize + loop
  // ------------------------------------------------------------------
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    view.fov = w < h ? Math.max(view.fov, 82) : view.fov;
    camera.updateProjectionMatrix();
    resizeMap();
    dirty = true;
  }
  window.addEventListener('resize', resize);

  var last = performance.now(), mapTick = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt);
    if (dirty) {
      applyCamera();
      renderer.render(scene, camera);
      mapTick += dt;
      if (mapTick > 0.05 || !moving) { drawMap(); mapTick = 0; }
      dirty = false;
    }
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  var bar = document.getElementById('intro-bar');
  var introBtn = document.getElementById('intro-btn');
  var steps = [buildTextures, buildMaterials, buildShell, buildGround, function () { flushPearls(); }, buildFirst, buildLights, buildDiscs];
  var si = 0;
  function bootStep() {
    steps[si++]();
    bar.style.width = (si / steps.length * 100) + '%';
    if (si < steps.length) { setTimeout(bootStep, 16); return; }
    resize();
    applyCamera();
    renderer.compile(scene, camera);
    onArrive();
    requestAnimationFrame(loop);
    introBtn.disabled = false; introBtn.textContent = 'Enter the showroom';
    window.__showroom = { goTo: goTo, jump: function (i) { queue = []; moving = null; current = i; var n = NODES[i]; pos.set(n.x, n.y, n.z); view.yaw = n.yaw * Math.PI / 180; settleYaw = null; onArrive(); dirty = true; }, NODES: NODES, view: view, state: function () { return { current: current, moving: !!moving }; }, render: function () { dirty = true; }, info: function () { return renderer.info.render; } };
  }
  introBtn.addEventListener('click', function () {
    document.getElementById('intro').classList.add('is-hidden');
    dirty = true;
  });
  // fonts first so the desk lettering uses Bodoni
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([ready, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () { setTimeout(bootStep, 30); });
})();
