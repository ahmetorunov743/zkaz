/* =====================================================================
   NXT MUSEUM — 3D gallery corridor (Three.js r128, classic scripts)
   Works from file:// : no modules, no fetch, all demo textures are drawn
   on <canvas> at runtime.
   ===================================================================== */
(function () {
  "use strict";

  var SITE = window.NXT_SITE || {};
  var I18N = window.NXT_I18N || {};
  var PROJECTS = window.NXT_PROJECTS || [];
  var LANGS = ["en", "ru", "ar"];
  var lang = SITE.defaultLang || "en";

  /* ------------------------------------------------------------------
     i18n
     ------------------------------------------------------------------ */
  function t(key, vars) {
    var dict = I18N[lang] || {};
    var s = dict[key] != null ? dict[key] : (I18N.en && I18N.en[key]) || key;
    s = String(s).replace("{year}", SITE.foundedYear).replace("{version}", SITE.version);
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace("{" + k + "}", vars[k]); });
    return s;
  }
  function loc(v) {
    if (v == null) return "";
    if (typeof v === "object") return v[lang] || v.en || "";
    return String(v);
  }
  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    root.querySelectorAll("[data-i18n-html]").forEach(function (el) { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    root.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        if (p.length === 2) el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
  }
  function setLang(next, silent) {
    if (LANGS.indexOf(next) < 0) next = "en";
    lang = next;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("nxt-lang", lang); } catch (e) {}
    document.querySelectorAll(".lang__btn").forEach(function (b) {
      var on = b.getAttribute("data-lang") === lang;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on);
    });
    applyI18n(document);
    if (!silent) document.dispatchEvent(new CustomEvent("nxt:lang"));
  }
  try { var saved = localStorage.getItem("nxt-lang"); if (saved) lang = saved; } catch (e) {}
  document.querySelectorAll(".lang__btn").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.getAttribute("data-lang")); });
  });
  document.querySelectorAll(".js-year").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  document.querySelectorAll(".js-version").forEach(function (el) { el.textContent = SITE.version || ""; });
  setLang(lang, true);

  var canvas = document.getElementById("scene");
  if (!canvas) return;                       // legal pages stop here

  /* ------------------------------------------------------------------
     helpers
     ------------------------------------------------------------------ */
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, k) { return a + (b - a) * k; };
  var ease = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var smooth = function (a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  function rng(seed) {                          // deterministic random (mulberry32)
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var r = Math.imul(seed ^ seed >>> 15, 1 | seed);
      r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }
  var loaderBar = document.getElementById("loader-bar");
  function setLoad(p) { if (loaderBar) loaderBar.style.width = Math.round(p * 100) + "%"; }
  function finishLoading() { document.body.classList.remove("is-loading"); }

  function webglOK() {
    try { var c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
    catch (e) { return false; }
  }
  if (!window.THREE || !webglOK()) {
    var msg = document.createElement("p");
    msg.className = "nowebgl"; msg.textContent = t("nowebgl");
    document.body.appendChild(msg);
    finishLoading();
    return;
  }
  setLoad(0.15);

  /* ------------------------------------------------------------------
     quality: weaker devices start without reflections and at lower res;
     a short FPS check later can lower it further.
     ------------------------------------------------------------------ */
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var lowEnd = coarse || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  var Q = { reflect: !lowEnd && !!THREE.Reflector, dpr: Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2) };
  var mqCompact = window.matchMedia("(max-width: 760px), (orientation: portrait) and (max-width: 1100px)");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     dimensions (metres)
     ------------------------------------------------------------------ */
  var W = 6, H = 3.9, EYE = 1.62;
  var SPACING = 3.4;                // distance between pictures along the corridor (they alternate sides)
  var PW = 1.5, PH = 1.06, PY = 1.72;
  var PORTAL_Z = -1.6, FIRST_Z = -5.4, END_PAD = 6.5;
  var N = PROJECTS.length;
  var LAST_Z = FIRST_Z - Math.max(0, N - 1) * SPACING;
  var END_Z = LAST_Z - END_PAD;     // end wall
  var CAM_END_Z = END_Z + 4.4;
  var BACK_Z = 16;                  // wall behind the start position
  var LEN = BACK_Z - END_Z;
  var MID_Z = (BACK_Z + END_Z) / 2;
  var START_Z = 3.4, S_MAX = 1;
  var S_FOOT = 2.6;                 // extra scroll at the end that brings the footer up

  /* ------------------------------------------------------------------
     renderer / scene / camera
     ------------------------------------------------------------------ */
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !lowEnd, powerPreference: "high-performance" });
  renderer.setPixelRatio(Q.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;     // colours are baked into textures, keep them as drawn

  var FOG = 0xece6dc;
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 9, 40);

  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 140);
  var maxAniso = renderer.capabilities.getMaxAnisotropy();

  function canvasTex(w, h, draw, repeat) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = Math.min(8, maxAniso);
    if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
    tex._canvas = c;
    return tex;
  }
  function redraw(tex, draw) {
    var c = tex._canvas, ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    draw(ctx, c.width, c.height);
    tex.needsUpdate = true;
  }

  /* ---------- procedural textures ---------- */
  var floorTex = canvasTex(512, 512, function (ctx, w, h) {
    ctx.fillStyle = "#cfc9c0"; ctx.fillRect(0, 0, w, h);
    var r = rng(3);
    for (var i = 0; i < 9000; i++) {                       // fine resin speckle
      ctx.fillStyle = "rgba(" + (r() > 0.5 ? "255,255,255" : "90,84,76") + "," + (0.03 + r() * 0.05) + ")";
      ctx.fillRect(r() * w, r() * h, 1.2, 1.2);
    }
  }, [3, LEN / 3]);

  var wallTex = canvasTex(16, 512, function (ctx, w, h) {   // baked light: brighter at picture height
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, "#e9e2d6");
    g.addColorStop(0.30, "#f1ebe1");
    g.addColorStop(0.62, "#ece5da");
    g.addColorStop(1.00, "#d9d0c2");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });

  var poolTex = canvasTex(256, 512, function (ctx, w, h) {   // gallery spot wash on the wall
    var g = ctx.createRadialGradient(w / 2, h * 0.48, 4, w / 2, h * 0.5, w * 0.62);
    g.addColorStop(0, "rgba(255,236,205,0.95)");
    g.addColorStop(0.45, "rgba(255,232,198,0.45)");
    g.addColorStop(1, "rgba(255,232,198,0)");
    ctx.save(); ctx.translate(0, 0); ctx.scale(1, 1.7);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    var top = ctx.createLinearGradient(0, 0, 0, h * 0.5);  // brighter near the fixture
    top.addColorStop(0, "rgba(255,240,215,0.55)"); top.addColorStop(1, "rgba(255,240,215,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath(); ctx.moveTo(w * 0.42, 0); ctx.lineTo(w * 0.58, 0); ctx.lineTo(w, h * 0.55); ctx.lineTo(0, h * 0.55); ctx.closePath();
    ctx.fillStyle = top; ctx.fill();
  });

  var shadowTex = canvasTex(256, 256, function (ctx, w, h) {  // soft contact shadow behind frames
    ctx.shadowColor = "rgba(40,28,15,0.55)"; ctx.shadowBlur = 34; ctx.shadowOffsetY = 10;
    ctx.fillStyle = "rgba(40,28,15,0.55)";
    ctx.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
    ctx.globalCompositeOperation = "destination-out";
    ctx.shadowColor = "transparent"; ctx.fillRect(w * 0.2 + 6, h * 0.2 + 6, w * 0.6 - 12, h * 0.6 - 12);
  });

  var glowTex = canvasTex(128, 16, function (ctx, w, h) {    // halo around ceiling light lines
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,248,235,0)"); g.addColorStop(0.5, "rgba(255,248,235,1)"); g.addColorStop(1, "rgba(255,248,235,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });

  /* ---------- placeholder "photo" painting (demo only) ---------- */
  var PALETTES = [
    ["#ece6dc", "#d9cfbf", "#c4b6a1", "#f7f3ec"], ["#e4e4e1", "#cfd0cc", "#b3b5b1", "#f4f4f2"],
    ["#d8d6d2", "#bdb9b2", "#8f8b84", "#ecebe8"], ["#e3e6de", "#cbd1c4", "#aab3a1", "#f3f5f0"],
    ["#eadfd6", "#d8c4b5", "#b89c88", "#f6efe9"], ["#efece6", "#e0dbd1", "#cbc3b4", "#faf8f4"]
  ];
  function paintPlaceholder(ctx, w, h, seed) {
    var r = rng(seed * 9973 + 17), p = PALETTES[Math.floor(r() * PALETTES.length)];
    var vx = w * (0.38 + r() * 0.24), vy = h * (0.42 + r() * 0.1);
    var bw = w * (0.3 + r() * 0.14), bh = h * (0.32 + r() * 0.1);
    var x0 = vx - bw / 2, y0 = vy - bh / 2, x1 = x0 + bw, y1 = y0 + bh;
    function poly(pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    ctx.fillStyle = p[1]; ctx.fillRect(0, 0, w, h);
    poly([0, 0, w, 0, x1, y0, x0, y0], p[3]);
    var fg = ctx.createLinearGradient(0, y1, 0, h); fg.addColorStop(0, p[2]); fg.addColorStop(1, p[1]);
    poly([0, h, w, h, x1, y1, x0, y1], fg);
    poly([w, 0, x1, y0, x1, y1, w, h], p[0]);
    var wg = ctx.createLinearGradient(0, y0, 0, y1); wg.addColorStop(0, p[3]); wg.addColorStop(1, p[0]);
    ctx.fillStyle = wg; ctx.fillRect(x0, y0, bw, bh);
    var ww = bw * (0.22 + r() * 0.2), wx = x0 + bw * 0.1 + r() * (bw * 0.8 - ww);
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(wx, y0 + bh * 0.1, ww, bh * 0.8);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = Math.max(1, w / 500);
    for (var k = 0; k < 5; k++) {                         // marble-ish veins on the floor
      ctx.beginPath();
      var sx = r() * w, sy = y1 + r() * (h - y1);
      ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + w * 0.15, sy + (r() - 0.5) * 40, sx + w * (0.3 + r() * 0.3), sy + (r() - 0.5) * 30);
      ctx.stroke();
    }
    var lg = ctx.createRadialGradient(wx + ww / 2, h * 0.45, 0, wx + ww / 2, h * 0.45, w * 0.6);
    lg.addColorStop(0, "rgba(255,255,255,0.45)"); lg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h);
  }

  /* ---------- canvas text helpers (wall texts follow the language) ---------- */
  function fontFamily() { return lang === "ar" ? '"IBM Plex Sans Arabic", Manrope, sans-serif' : 'Manrope, "IBM Plex Sans Arabic", sans-serif'; }
  function wrap(ctx, text, x, y, maxW, lh) {
    var words = String(text).split(/\s+/), line = "", lines = [];
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    lines.forEach(function (l, i) { ctx.fillText(l, x, y + i * lh); });
    return y + lines.length * lh;
  }
  function textSetup(ctx, w) {
    var rtl = lang === "ar";
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    return rtl ? w : 0;
  }
  function drawLogo(ctx, x, y, s, color) {     // NXT mark, same geometry as the SVG logo
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(12, 70); ctx.lineTo(12, 12); ctx.lineTo(58, 70); ctx.lineTo(58, 12);
    ctx.moveTo(88, 12); ctx.lineTo(134, 70); ctx.moveTo(134, 12); ctx.lineTo(88, 70);
    ctx.moveTo(160, 12); ctx.lineTo(214, 12); ctx.moveTo(187, 12); ctx.lineTo(187, 70);
    ctx.stroke(); ctx.restore();
  }

  /* ------------------------------------------------------------------
     corridor geometry
     ------------------------------------------------------------------ */
  var basic = function (opts) { return new THREE.MeshBasicMaterial(opts); };
  var WALL_COLOR = 0xf3eee6;

  // floor: real-time reflection + semi-transparent resin layer on top
  var reflector = null;
  var floorMat = basic({ map: floorTex, transparent: true, opacity: Q.reflect ? 0.72 : 1, depthWrite: !Q.reflect });
  if (Q.reflect) {
    reflector = new THREE.Reflector(new THREE.PlaneGeometry(W, LEN), {
      textureWidth: window.innerWidth * Q.dpr * 0.5, textureHeight: window.innerHeight * Q.dpr * 0.5,
      color: 0x8f8a83, clipBias: 0.003
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, 0, MID_Z);
    scene.add(reflector);
  }
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(W, LEN), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.002, MID_Z);
  scene.add(floor);

  // walls
  wallTex.wrapS = THREE.RepeatWrapping;
  var wallGeo = new THREE.PlaneGeometry(LEN, H);
  var wallMat = basic({ map: wallTex });
  [-1, 1].forEach(function (side) {
    var m = new THREE.Mesh(wallGeo, wallMat);
    m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    m.position.set(side * W / 2, H / 2, MID_Z);
    scene.add(m);
    // baseboard with a shadow gap
    var base = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, LEN), basic({ color: 0xdcd4c8 }));
    base.position.set(side * (W / 2 - 0.01), 0.045, MID_Z); scene.add(base);
    var gap = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, LEN), basic({ color: 0x8c8479 }));
    gap.position.set(side * (W / 2 - 0.003), 0.096, MID_Z); scene.add(gap);
  });

  // ceiling + linear lights
  var ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, LEN), basic({ color: 0xf2eee8 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, MID_Z); scene.add(ceil);
  [-1.25, 1.25].forEach(function (x) {
    var strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.014, LEN - 2), basic({ color: 0xfffaf0 }));
    strip.position.set(x, H - 0.007, MID_Z); scene.add(strip);
    var halo = new THREE.Mesh(new THREE.PlaneGeometry(0.42, LEN - 2),
      basic({ map: glowTex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = Math.PI / 2; halo.position.set(x, H - 0.003, MID_Z); scene.add(halo);
  });

  // back wall and end wall
  var back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), basic({ color: WALL_COLOR }));
  back.rotation.y = Math.PI; back.position.set(0, H / 2, BACK_Z); scene.add(back);

  var endTex = canvasTex(1500, 975, drawEnd);
  var endWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), basic({ map: endTex }));
  endWall.position.set(0, H / 2, END_Z); scene.add(endWall);
  function drawEnd(ctx, w, h) {
    ctx.fillStyle = "#f4efe7"; ctx.fillRect(0, 0, w, h);
    var g = ctx.createRadialGradient(w / 2, h * 0.38, 10, w / 2, h * 0.45, w * 0.5);
    g.addColorStop(0, "rgba(255,240,215,0.9)"); g.addColorStop(1, "rgba(255,240,215,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    var f = fontFamily();
    ctx.direction = lang === "ar" ? "rtl" : "ltr"; ctx.textAlign = "center"; ctx.fillStyle = "#141414";
    drawLogo(ctx, w / 2 - 56, h * 0.27, 0.5, "#141414");
    ctx.font = "500 66px " + f; wrap(ctx, t("end.title"), w / 2, h * 0.46, w * 0.8, 80);
    ctx.fillStyle = "#5c5e62"; ctx.font = "400 30px " + f; wrap(ctx, t("end.text"), w / 2, h * 0.55, w * 0.62, 42);
    ctx.fillStyle = "#a88b5c"; ctx.font = "600 22px " + f; ctx.fillText(t("end.call").toUpperCase(), w / 2, h * 0.66);
    ctx.fillStyle = "#141414"; ctx.direction = "ltr"; ctx.font = "500 50px Manrope, sans-serif"; ctx.fillText(SITE.phone || "", w / 2, h * 0.73);
  }

  // entrance portal with the company texts
  var OW = 2.5, OH = 2.75, DEPTH = 0.36, PIER = (W - OW) / 2;
  var sideMat = basic({ color: 0xebe4d9 });
  var leftTex = canvasTex(Math.round(PIER * 400), Math.round(H * 400), drawPierLeft);
  var rightTex = canvasTex(Math.round(PIER * 400), Math.round(H * 400), drawPierRight);
  var lintelTex = canvasTex(Math.round(OW * 400), Math.round((H - OH) * 400), drawLintel);
  function boxWithFront(w, h, d, frontMat) {
    // box face order: +x, -x, +y, -y, +z (front, towards the visitor), -z
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideMat, sideMat, sideMat, sideMat, frontMat, basic({ color: WALL_COLOR })]);
  }
  var pierL = boxWithFront(PIER, H, DEPTH, basic({ map: leftTex }));
  pierL.position.set(-(OW / 2 + PIER / 2), H / 2, PORTAL_Z); scene.add(pierL);
  var pierR = boxWithFront(PIER, H, DEPTH, basic({ map: rightTex }));
  pierR.position.set(OW / 2 + PIER / 2, H / 2, PORTAL_Z); scene.add(pierR);
  var lintel = boxWithFront(OW, H - OH, DEPTH, basic({ map: lintelTex }));
  lintel.position.set(0, OH + (H - OH) / 2, PORTAL_Z); scene.add(lintel);

  function wallBg(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#e9e2d6"); g.addColorStop(0.3, "#f1ebe1"); g.addColorStop(0.62, "#ece5da"); g.addColorStop(1, "#d9d0c2");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function drawPierLeft(ctx, w, h) {
    wallBg(ctx, w, h);
    var f = fontFamily(), m = 70, x = textSetup(ctx, w); x = x ? w - m : m;
    var y = h * 0.36;
    ctx.fillStyle = "#a88b5c"; ctx.fillRect(lang === "ar" ? w - m - 60 : m, y - 70, 60, 3);
    ctx.fillStyle = "#141414"; ctx.font = "500 46px " + f; ctx.fillText(t("intro.founded"), x, y);
    ctx.fillStyle = "#55585c"; ctx.font = "400 31px " + f;
    wrap(ctx, t("intro.text"), x, y + 70, w - m * 2, 46);
  }
  function drawPierRight(ctx, w, h) {
    wallBg(ctx, w, h);
    var f = fontFamily(), m = 70, x = textSetup(ctx, w); x = x ? w - m : m;
    var y = h * 0.36;
    ctx.fillStyle = "#8d9095"; ctx.font = "600 24px " + f; ctx.fillText(t("intro.collection").toUpperCase(), x, y - 40);
    ctx.fillStyle = "#141414"; ctx.font = "500 46px " + f; wrap(ctx, t("intro.count", { count: N }), x, y + 20, w - m * 2, 58);
    ctx.fillStyle = "#a88b5c"; ctx.font = "600 26px " + f; ctx.fillText(t("intro.enter") + (lang === "ar" ? "  ←" : "  →"), x, y + 190);
  }
  function drawLintel(ctx, w, h) {
    wallBg(ctx, w, h);
    drawLogo(ctx, w / 2 - 205, h * 0.18, 1.9, "#141414");
    ctx.fillStyle = "#141414"; ctx.textAlign = "center"; ctx.direction = "ltr";
    ctx.font = "500 40px Manrope, sans-serif";
    ctx.save(); ctx.translate(w / 2, h * 0.82);
    var s = t("intro.subtitle"), spaced = s.split("").join(String.fromCharCode(8202, 8202));
    ctx.fillText(spaced, 0, 0); ctx.restore();
  }

  /* ------------------------------------------------------------------
     lights (only for the bronze frames; walls use baked textures)
     ------------------------------------------------------------------ */
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6b6156, 1.0));
  var sun = new THREE.DirectionalLight(0xfff1dc, 0.7); sun.position.set(0, 6, 3); scene.add(sun);
  var camLight = new THREE.PointLight(0xfff0dc, 0.7, 7); scene.add(camLight);

  /* ------------------------------------------------------------------
     pictures
     ------------------------------------------------------------------ */
  var frameMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, metalness: 0.55, roughness: 0.38 });
  var fixtureMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.4, roughness: 0.5 });
  var frameGeo = new THREE.BoxGeometry(PW + 0.07, PH + 0.07, 0.045);
  var photoGeo = new THREE.PlaneGeometry(PW, PH);
  var poolGeo = new THREE.PlaneGeometry(2.3, 3.0);
  var shadowGeo = new THREE.PlaneGeometry(PW + 0.6, PH + 0.6);
  var plaqueGeo = new THREE.PlaneGeometry(0.5, 0.15);
  var fixtureGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.18, 16);
  var greyPhoto = 0xd9d3ca;

  var pictures = [];
  var pickables = [];
  PROJECTS.forEach(function (p, i) {
    var side = i % 2 === 0 ? -1 : 1;                   // chessboard: left, right, left…
    var z = FIRST_Z - i * SPACING;
    var g = new THREE.Group();
    g.position.set(side * (W / 2 - 0.004), 0, z);
    g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;

    var pool = new THREE.Mesh(poolGeo, basic({ map: poolTex, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.position.set(0, PY + 0.45, 0.003); g.add(pool);
    var shadow = new THREE.Mesh(shadowGeo, basic({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.position.set(0, PY - 0.05, 0.005); g.add(shadow);
    var art = new THREE.Group(); art.position.set(0, PY, 0); g.add(art);
    var frame = new THREE.Mesh(frameGeo, frameMat); frame.position.z = 0.03; art.add(frame);
    var photo = new THREE.Mesh(photoGeo, basic({ color: greyPhoto })); photo.position.z = 0.0535; art.add(photo);
    var plaque = new THREE.Mesh(plaqueGeo, basic({ color: 0xf7f3ec, transparent: true }));
    plaque.position.set(0, PY - PH / 2 - 0.24, 0.006); g.add(plaque);
    var fix = new THREE.Mesh(fixtureGeo, fixtureMat);
    fix.position.set(0, H - 0.14, 0.55); fix.rotation.x = -0.55; g.add(fix);

    photo.userData.index = i; frame.userData.index = i;
    pickables.push(photo, frame);
    scene.add(g);
    pictures.push({ i: i, p: p, side: side, z: z, group: g, art: art, photo: photo, plaque: plaque, pool: pool,
      photoTex: null, plaqueTex: null, loading: false, h: 0 });
  });

  function buildPhoto(pic) {
    pic.loading = true;
    var src = pic.p.images && pic.p.images[0];
    function usePlaceholder() {
      var tex = canvasTex(768, 543, function (ctx, w, h) { paintPlaceholder(ctx, w, h, pic.p.id || pic.i); });
      applyPhoto(pic, tex);
    }
    if (src) {
      new THREE.TextureLoader().load(src, function (tex) {
        tex.encoding = THREE.sRGBEncoding; tex.anisotropy = Math.min(8, maxAniso);
        applyPhoto(pic, tex);
      }, undefined, usePlaceholder);   // file:// blocks WebGL photos -> placeholder
    } else usePlaceholder();
  }
  function applyPhoto(pic, tex) {
    if (!pic.loading) { tex.dispose(); return; }        // was unloaded meanwhile
    pic.photoTex = tex; pic.loading = false;
    pic.photo.material.map = tex; pic.photo.material.color.set(0xffffff); pic.photo.material.needsUpdate = true;
    pic.plaqueTex = canvasTex(500, 150, function (ctx, w, h) { drawPlaque(ctx, w, h, pic); });
    pic.plaque.material.map = pic.plaqueTex; pic.plaque.material.color.set(0xffffff); pic.plaque.material.needsUpdate = true;
    dirty = true;
  }
  function unloadPhoto(pic) {
    pic.loading = false;
    if (pic.photoTex) { pic.photoTex.dispose(); pic.photoTex = null; }
    if (pic.plaqueTex) { pic.plaqueTex.dispose(); pic.plaqueTex = null; }
    pic.photo.material.map = null; pic.photo.material.color.set(greyPhoto); pic.photo.material.needsUpdate = true;
    pic.plaque.material.map = null; pic.plaque.material.color.set(0xf7f3ec); pic.plaque.material.needsUpdate = true;
  }
  function drawPlaque(ctx, w, h, pic) {
    ctx.fillStyle = "#f7f3ec"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
    var f = fontFamily(), m = 26, x = textSetup(ctx, w); x = x ? w - m : m;
    ctx.fillStyle = "#141414"; ctx.font = "600 34px " + f; ctx.fillText(loc(pic.p.title), x, 60);
    ctx.fillStyle = "#6f7276"; ctx.font = "400 25px " + f;
    ctx.fillText(loc(pic.p.location) + "  ·  " + (pic.p.year || ""), x, 104);
  }
  // lazy loading by distance to the camera; a couple per frame to avoid hitches
  function streamPictures(camZ) {
    var built = 0;
    for (var k = 0; k < pictures.length; k++) {
      var pic = pictures[k], d = Math.abs(pic.z - camZ);
      if (d < 26 && !pic.photoTex && !pic.loading && built < 2) { buildPhoto(pic); built++; }
      else if (d > 44 && (pic.photoTex || pic.loading)) unloadPhoto(pic);
    }
  }

  /* ------------------------------------------------------------------
     camera control
     ------------------------------------------------------------------ */
  var s = 0, sTarget = 0;                          // walked distance (+ footer zone)
  var mode = "walk";                               // walk | focus
  var focusT = 0, focusTarget = 0, focusIndex = -1;
  var focusFrom = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  var mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  var yaw = 0;
  var hovered = -1;
  var dirty = true;
  var offset = { x: 0, y: 0 };                     // view offset in px (to keep room for the panel)

  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    var compact = mqCompact.matches;
    camera.aspect = w / h;
    camera.fov = compact ? 68 : (w / h > 2 ? 50 : 55);
    // stand far enough back that the entrance (≈ 5.4 m wide) fits the screen
    var tanH = Math.tan(camera.fov * Math.PI / 360);
    START_Z = PORTAL_Z + clamp(Math.max(6.3 / (2 * tanH * camera.aspect), 5.3 / (2 * tanH)), 4.2, BACK_Z - PORTAL_Z - 1.5);
    S_MAX = START_Z - CAM_END_Z;
    sTarget = clamp(sTarget, 0, S_MAX + S_FOOT); s = clamp(s, 0, S_MAX + S_FOOT);
    renderer.setPixelRatio(Q.dpr);
    renderer.setSize(w, h, false);
    if (reflector) reflector.getRenderTarget().setSize(w * Q.dpr * 0.5, h * Q.dpr * 0.5);
    camera.updateProjectionMatrix();
    dirty = true;
  }

  var tmpObj = new THREE.Object3D();
  var tmpCam = new THREE.PerspectiveCamera();
  function walkPose(out) {
    var walked = Math.min(s, S_MAX);
    var z = START_Z - walked;
    // glance at the picture coming up, smoothly
    var want = 0;
    for (var k = 0; k < pictures.length; k++) {
      var dz = z - pictures[k].z;
      if (dz > 0.8 && dz < 9) { want += -pictures[k].side * 0.11 * smooth(0.8, 3.2, dz) * (1 - smooth(5, 9, dz)); }
    }
    want *= smooth(0, 2.5, walked);
    yaw = lerp(yaw, want, 0.08);
    var yy = yaw - mouse.sx * 0.06;
    var pitch = (mqCompact.matches ? 0.015 : 0.07) * (1 - smooth(0, 3, walked)) - 0.02 * smooth(0, 3, walked) - mouse.sy * 0.035;  // look up at the entrance first
    out.pos.set(Math.sin(walked * 0.35) * 0.04, EYE + Math.sin(walked * 1.6) * 0.008, z);
    tmpObj.rotation.set(pitch, yy, 0, "YXZ");
    out.quat.copy(tmpObj.quaternion);
    return out;
  }

  function panelRect() {
    var w = window.innerWidth, h = window.innerHeight;
    var headerH = document.querySelector(".site-header").offsetHeight;
    if (mqCompact.matches) {
      var sheet = Math.min(h * 0.56, panel.offsetHeight || h * 0.5) + 10;
      return { availW: w - 24, availH: h - headerH - sheet - 24, ox: 0, oy: (sheet - headerH) / 2 };
    }
    var pw = panel.offsetWidth + 16;
    return { availW: w - pw - 48, availH: h - headerH - 48, ox: pw / 2, oy: -headerH / 2 + 8 };
  }
  function focusPose(i, out) {
    var pic = pictures[i], r = panelRect();
    var w = window.innerWidth, h = window.innerHeight;
    var tanH = Math.tan(camera.fov * Math.PI / 360);
    var needH = PH + 0.62, needW = PW + 0.25;     // picture + plaque with a margin
    var dH = (needH * h / (r.availH * 0.92)) / (2 * tanH);
    var dW = (needW * w / (r.availW * 0.92)) / (2 * tanH * camera.aspect);
    var d = clamp(Math.max(dH, dW), 1.4, W - 0.6);
    var cx = pic.side * (W / 2 - 0.06);
    out.pos.set(cx - pic.side * d, PY - 0.2, pic.z);
    tmpCam.position.copy(out.pos);
    tmpCam.lookAt(cx, PY - 0.2, pic.z);           // a camera looks down -z (a plain Object3D would face away)
    out.quat.copy(tmpCam.quaternion);
    out.ox = r.ox; out.oy = r.oy;
    return out;
  }

  var poseA = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  var poseB = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), ox: 0, oy: 0 };
  var lastPos = new THREE.Vector3(1e9, 0, 0), lastQuat = new THREE.Quaternion();

  function updateCamera(dt) {
    var k = reduceMotion ? 1 : 1 - Math.exp(-dt / 260);
    s += (sTarget - s) * k;
    if (Math.abs(sTarget - s) < 0.0005) s = sTarget;
    mouse.sx = lerp(mouse.sx, mouse.x, 1 - Math.exp(-dt / 300));
    mouse.sy = lerp(mouse.sy, mouse.y, 1 - Math.exp(-dt / 300));

    walkPose(poseA);
    var ft = 0;
    if (focusIndex >= 0) {
      var kk = reduceMotion ? 1 : dt / 1150;
      focusT = focusTarget > focusT ? Math.min(focusTarget, focusT + kk) : Math.max(focusTarget, focusT - kk);
      ft = ease(focusT);
      focusPose(focusIndex, poseB);
      // fly from where the camera was when the click happened
      camera.position.copy(focusFrom.pos).lerp(poseB.pos, ft);
      camera.quaternion.copy(focusFrom.quat).slerp(poseB.quat, ft);
      if (focusTarget === 0) {                       // flying back: blend into the live corridor pose
        camera.position.copy(poseA.pos).lerp(poseB.pos, ft);
        camera.quaternion.copy(poseA.quat).slerp(poseB.quat, ft);
      }
      offset.x = poseB.ox * ft; offset.y = poseB.oy * ft;
      if (focusTarget === 0 && focusT === 0) { focusIndex = -1; mode = "walk"; }
    } else {
      camera.position.copy(poseA.pos);
      camera.quaternion.copy(poseA.quat);
      offset.x = offset.y = 0;
    }
    if (Math.abs(offset.x) > 0.5 || Math.abs(offset.y) > 0.5) {
      camera.setViewOffset(window.innerWidth, window.innerHeight, offset.x, offset.y, window.innerWidth, window.innerHeight);
    } else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camLight.position.copy(camera.position).add(new THREE.Vector3(0, 0.6, 0));

    // UI that follows the walk
    var walked = Math.min(s, S_MAX);
    progressEl.style.width = (S_MAX > 0 ? walked / S_MAX * 100 : 0).toFixed(2) + "%";
    var fOut = clamp((s - S_MAX) / S_FOOT, 0, 1);
    footer.style.transform = "translateY(" + ((1 - ease(fOut)) * 105).toFixed(2) + "%)";
    if (s > 0.6 && !hintStage) { hintStage = 1; setHint("open"); setTimeout(function () { hideHint(); }, 4200); }

    var moved = camera.position.distanceToSquared(lastPos) > 1e-9 || 1 - Math.abs(camera.quaternion.dot(lastQuat)) > 1e-9;
    lastPos.copy(camera.position); lastQuat.copy(camera.quaternion);
    return moved;
  }

  /* ------------------------------------------------------------------
     focus on a picture / back to the corridor
     ------------------------------------------------------------------ */
  var panel = document.getElementById("panel");
  var footer = document.getElementById("footer");
  var progressEl = document.getElementById("progress");

  function openProject(i) {
    if (i === focusIndex && focusTarget === 1) return;
    focusFrom.pos.copy(camera.position); focusFrom.quat.copy(camera.quaternion);
    if (focusIndex >= 0 && focusIndex !== i) { focusT = 0; }
    focusIndex = i; focusTarget = 1; focusT = Math.min(focusT, 0.0001); mode = "focus";
    fillPanel(pictures[i]);
    panel.classList.add("is-open"); panel.setAttribute("aria-hidden", "false");
    hideHint(true);
    sTarget = s;                                   // "back" returns to the same spot in the corridor
    dirty = true;
  }
  function closeProject() {
    if (focusIndex < 0 || focusTarget === 0) return;
    focusTarget = 0;
    panel.classList.remove("is-open"); panel.setAttribute("aria-hidden", "true");
    dirty = true;
  }
  document.getElementById("panel-back").addEventListener("click", closeProject);
  window.addEventListener("keydown", function (e) { if (e.key === "Escape") closeProject(); });

  /* ---------- panel contents ---------- */
  var galleryCache = {};
  function galleryImages(pic) {
    var p = pic.p;
    if (p.images && p.images.length) return p.images.slice(0, 4);
    if (galleryCache[p.id]) return galleryCache[p.id];
    var list = [];
    for (var k = 0; k < 4; k++) {
      var c = document.createElement("canvas"); c.width = 880; c.height = 605;
      paintPlaceholder(c.getContext("2d"), c.width, c.height, (p.id || pic.i) + k * 101);
      list.push(c.toDataURL("image/jpeg", 0.86));
    }
    return (galleryCache[p.id] = list);
  }
  function fillPanel(pic) {
    var p = pic.p, imgs = galleryImages(pic);
    var main = document.getElementById("panel-main"), thumbs = document.getElementById("panel-thumbs");
    main.src = imgs[0]; main.alt = loc(p.title);
    thumbs.innerHTML = "";
    imgs.forEach(function (src, k) {
      var b = document.createElement("button"); b.type = "button";
      if (k === 0) b.className = "is-active";
      var im = document.createElement("img"); im.alt = ""; im.src = src; b.appendChild(im);
      b.addEventListener("click", function () {
        thumbs.querySelectorAll("button").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        main.style.opacity = 0;
        setTimeout(function () { main.src = src; main.style.opacity = 1; }, 160);
      });
      thumbs.appendChild(b);
    });
    thumbs.style.display = imgs.length > 1 ? "" : "none";
    document.getElementById("panel-work").textContent = t("work." + p.workType);
    document.getElementById("panel-count").textContent = String(pic.i + 1).padStart(2, "0") + " / " + String(N).padStart(2, "0");
    document.getElementById("panel-title").textContent = loc(p.title);
    document.getElementById("panel-location").textContent = loc(p.location);
    document.getElementById("panel-year").textContent = p.year || "—";
    document.getElementById("panel-area").textContent = p.area ? p.area.toLocaleString(lang === "ar" ? "ar-AE" : lang) + " " + t("panel.areaUnit") : "—";
    document.getElementById("panel-desc").textContent = loc(p.description);
    document.getElementById("panel-wa").href = "https://wa.me/" + (SITE.whatsapp || "") + "?text=" + encodeURIComponent(t("panel.waText", { title: loc(p.title) }));
    panel.querySelector(".panel__scroll").scrollTop = 0;
  }

  /* ------------------------------------------------------------------
     hint
     ------------------------------------------------------------------ */
  var hintEl = document.getElementById("hint"), hintText = hintEl.querySelector(".js-hint");
  var hintStage = 0, hintKind = "scroll";
  function setHint(kind) {
    hintKind = kind;
    hintText.textContent = kind === "scroll" ? t(coarse ? "hint.swipe" : "hint.scroll") : t(coarse ? "hint.openTouch" : "hint.open");
  }
  function hideHint() { hintEl.classList.add("is-hidden"); }
  setHint("scroll");

  /* ------------------------------------------------------------------
     input: wheel, touch, pointer, hover
     ------------------------------------------------------------------ */
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    ndc.set(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length || hits[0].distance > 16) return -1;
    return hits[0].object.userData.index;
  }
  function overUI(target) { return target.closest && target.closest(".panel, .site-header, .site-footer"); }

  var wheelBack = 0;
  window.addEventListener("wheel", function (e) {
    if (overUI(e.target) && !e.target.closest(".site-footer")) return;   // let the panel scroll its own content
    e.preventDefault();
    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 33; else if (e.deltaMode === 2) d *= 400;
    if (focusIndex >= 0 && focusTarget === 1) {      // scrolling while looking at a picture = back
      wheelBack += Math.abs(d);
      if (wheelBack > 60) { wheelBack = 0; closeProject(); }
      return;
    }
    wheelBack = 0;
    sTarget = clamp(sTarget + clamp(d, -240, 240) * 0.011, 0, S_MAX + S_FOOT);   // ≈ 1 m per wheel notch
    dirty = true;
  }, { passive: false });

  // touch: swipe up = walk forward, with a little momentum
  var touch = null;
  canvas.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    var tt = e.touches[0];
    touch = { x: tt.clientX, y: tt.clientY, lastY: tt.clientY, t: performance.now(), v: 0, moved: 0 };
  }, { passive: true });
  canvas.addEventListener("touchmove", function (e) {
    if (!touch) return;
    e.preventDefault();
    var tt = e.touches[0], now = performance.now();
    var dy = touch.lastY - tt.clientY;
    touch.moved = Math.max(touch.moved, Math.abs(tt.clientY - touch.y), Math.abs(tt.clientX - touch.x));
    touch.v = dy / Math.max(1, now - touch.t); touch.t = now; touch.lastY = tt.clientY;
    if (focusIndex >= 0 && focusTarget === 1) { if (touch.moved > 40) { closeProject(); touch = null; } return; }
    sTarget = clamp(sTarget + dy * 0.022, 0, S_MAX + S_FOOT);
    dirty = true;
  }, { passive: false });
  canvas.addEventListener("touchend", function () {
    if (!touch) return;
    if (touch.moved > 10) sTarget = clamp(sTarget + clamp(touch.v, -3, 3) * 4, 0, S_MAX + S_FOOT);
    touch = null;
  });
  // the footer also responds to swipes
  footer.addEventListener("touchstart", function (e) { var tt = e.touches[0]; touch = { x: tt.clientX, y: tt.clientY, lastY: tt.clientY, t: performance.now(), v: 0, moved: 0 }; }, { passive: true });
  footer.addEventListener("touchmove", function (e) {
    if (!touch) return;
    var tt = e.touches[0], dy = touch.lastY - tt.clientY; touch.lastY = tt.clientY;
    if (dy < 0) { sTarget = clamp(sTarget + dy * 0.012, 0, S_MAX + S_FOOT); dirty = true; }
  }, { passive: true });

  // click / tap on a picture
  var down = null;
  canvas.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener("pointerup", function (e) {
    if (!down) return;
    var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
    var quick = performance.now() - down.t < 500;
    down = null;
    if (moved > 10 || !quick) return;
    var i = pick(e.clientX, e.clientY);
    if (i >= 0) openProject(i);
    else if (focusIndex >= 0 && focusTarget === 1) closeProject();
  });

  // hover + parallax (mouse only)
  var pendingHover = null;
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    mouse.x = e.clientX / window.innerWidth * 2 - 1;
    mouse.y = e.clientY / window.innerHeight * 2 - 1;
    pendingHover = overUI(e.target) ? null : { x: e.clientX, y: e.clientY };
    if (overUI(e.target)) setHover(-1);
    dirty = true;
  });
  function setHover(i) {
    if (i === hovered) return;
    hovered = i;
    document.body.classList.toggle("is-hover", i >= 0);
    dirty = true;
  }

  /* ------------------------------------------------------------------
     language change: repaint wall texts and plaques
     ------------------------------------------------------------------ */
  function repaintTexts() {
    redraw(leftTex, drawPierLeft); redraw(rightTex, drawPierRight); redraw(lintelTex, drawLintel); redraw(endTex, drawEnd);
    pictures.forEach(function (pic) { if (pic.plaqueTex) redraw(pic.plaqueTex, function (ctx, w, h) { drawPlaque(ctx, w, h, pic); }); });
    setHint(hintKind);
    if (focusIndex >= 0) fillPanel(pictures[focusIndex]);
    dirty = true;
  }
  document.addEventListener("nxt:lang", repaintTexts);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(repaintTexts);

  /* ------------------------------------------------------------------
     adaptive quality: if the first seconds run slow, drop reflections
     and resolution
     ------------------------------------------------------------------ */
  var perf = { frames: 0, time: 0, step: 0 };
  function adapt(dt) {
    if (perf.step >= 2) return;
    perf.frames++; perf.time += dt;
    if (perf.time < 2500) return;
    var fps = perf.frames / (perf.time / 1000);
    perf.frames = 0; perf.time = 0;
    if (fps >= 48) { perf.step = 2; return; }
    perf.step++;
    if (reflector && reflector.visible) {
      reflector.visible = false; floorMat.opacity = 1; floorMat.depthWrite = true; floorMat.needsUpdate = true;
    } else {
      Q.dpr = Math.max(0.75, Q.dpr * 0.7); layout();
    }
    dirty = true;
  }

  /* ------------------------------------------------------------------
     main loop: renders only when something changed (saves battery)
     ------------------------------------------------------------------ */
  var last = performance.now(), hoverAnim = false;
  function frame(now) {
    var dt = Math.min(64, now - last); last = now;
    var moved = updateCamera(dt);
    streamPictures(camera.position.z);

    if (pendingHover && focusTarget === 0) { setHover(pick(pendingHover.x, pendingHover.y)); pendingHover = null; }
    else if (focusTarget === 1 && hovered >= 0) setHover(-1);

    hoverAnim = false;
    for (var k = 0; k < pictures.length; k++) {      // hover: picture lifts slightly and its light warms up
      var pic = pictures[k], tgt = k === hovered ? 1 : 0;
      if (pic.h !== tgt) {
        pic.h += (tgt - pic.h) * (1 - Math.exp(-dt / 90));
        if (Math.abs(tgt - pic.h) < 0.002) pic.h = tgt; else hoverAnim = true;
        var sc = 1 + pic.h * 0.025;
        pic.art.scale.set(sc, sc, 1); pic.art.position.z = pic.h * 0.02;
        pic.pool.material.opacity = 0.32 + pic.h * 0.35;
        moved = true;
      }
    }

    if (moved || dirty || hoverAnim) {
      renderer.render(scene, camera);
      dirty = false;
      adapt(dt);
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------
     start
     ------------------------------------------------------------------ */
  window.addEventListener("resize", function () { layout(); });
  if (mqCompact.addEventListener) mqCompact.addEventListener("change", layout);
  layout();
  setLoad(0.6);
  // prebuild the first pictures so the corridor is never empty on arrival
  for (var b = 0; b < Math.min(6, pictures.length); b++) buildPhoto(pictures[b]);
  setLoad(0.9);
  requestAnimationFrame(function (now) {
    last = now;
    updateCamera(16);
    renderer.render(scene, camera);
    setLoad(1);
    setTimeout(finishLoading, 350);
    requestAnimationFrame(frame);
  });
})();
