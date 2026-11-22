/* =====================================================================
   NXT — main script (no build, no modules: works from file://)
   ===================================================================== */
(function () {
  "use strict";

  var SITE = window.NXT_SITE || {};
  var I18N = window.NXT_I18N || {};
  var PROJECTS = window.NXT_PROJECTS || [];
  var LANGS = ["en", "ru", "ar"];
  var lang = SITE.defaultLang || "en";

  /* ---------------- i18n ---------------- */
  function t(key) {
    var dict = I18N[lang] || {};
    var s = dict[key] != null ? dict[key] : (I18N.en && I18N.en[key]) || key;
    return String(s).replace("{year}", SITE.foundedYear).replace("{version}", SITE.version);
  }
  // project fields may be a plain string or { en, ru, ar }
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
      b.classList.toggle("is-active", b.getAttribute("data-lang") === lang);
      b.setAttribute("aria-pressed", b.getAttribute("data-lang") === lang);
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

  var hero = document.getElementById("hero");
  if (!hero) return; // legal pages stop here

  /* ---------------- helpers ---------------- */
  var mod = function (a, n) { return ((a % n) + n) % n; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mqMobile = window.matchMedia("(max-width: 820px)");

  /* =====================================================================
     Drum — virtualised 3D wheel (CSS transforms only)
     Only ~10–14 card nodes exist per drum, whatever the project count.
     ===================================================================== */
  function Drum(el, items, onInteract) {
    this.el = el;
    this.win = el.querySelector(".drum__window");
    this.track = el.querySelector(".drum__track");
    this.items = items;
    this.n = items.length;
    this.onInteract = onInteract;
    this.offset = 0;       // current position, in items
    this.target = 0;       // where it is heading
    this.active = false;   // the drum the visitor is using now
    this.selected = null;  // absolute index on the pointer line, or null
    this.pool = [];
    this.running = false;
    this.wheelTimer = 0;
    this.measure();
    this.bind();
    this.render();
  }

  Drum.prototype.measure = function () {
    var r = this.win.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    this.horizontal = mqMobile.matches;
    this.el.classList.toggle("drum--h", this.horizontal);
    var len = this.horizontal ? this.W : this.H;   // length along the rotation
    var gap;
    if (this.horizontal) {
      this.ch = this.H * 0.68;
      this.cw = Math.min(this.W * 0.36, this.ch * 1.25);
      gap = this.W * 0.03;
    } else {
      this.cw = (this.W / 2) * 0.80;   // the window is 2× wider than its visible half
      this.ch = Math.min(this.H * 0.2, this.cw * 0.6);
      gap = this.H * 0.03;
    }
    this.P = len * 1.5;        // perspective (smaller = stronger 3D)
    this.R = len * 0.75;       // radius: front card at z = 0, edges reach the oval
    var half = ((this.horizontal ? this.cw : this.ch) + gap) / 2;
    this.step = 2 * Math.asin(clamp(half / this.R, 0, 0.99)) * 180 / Math.PI;
    this.pxPerItem = this.R * Math.sin(this.step * Math.PI / 180);
    var slots = Math.min(this.n, Math.floor(96 / this.step) * 2 + 3);
    this.buildPool(slots);
  };

  Drum.prototype.buildPool = function (size) {
    this.track.innerHTML = "";
    this.pool = [];
    for (var s = 0; s < size; s++) {
      var c = document.createElement("div");
      c.className = "card";
      c.innerHTML = '<img alt="" decoding="async" draggable="false"><div class="card__shade"></div><div class="card__label"></div>';
      c.style.width = this.cw + "px";
      c.style.height = this.ch + "px";
      c.style.marginLeft = (-this.cw / 2) + "px";
      c.style.marginTop = (-this.ch / 2) + "px";
      c._abs = null;
      this.track.appendChild(c);
      this.pool.push({ el: c, img: c.firstChild, shade: c.children[1], label: c.children[2] });
    }
  };

  Drum.prototype.fill = function (slot, abs) {
    var p = this.items[mod(abs, this.n)];
    slot.el._abs = abs;
    slot.el.setAttribute("data-abs", abs);
    if (slot.img.getAttribute("src") !== p.images[0]) slot.img.setAttribute("src", p.images[0]);
    slot.label.textContent = loc(p.title);
  };

  Drum.prototype.relabel = function () {
    var self = this;
    this.pool.forEach(function (s) { if (s.el._abs != null) self.fill(s, s.el._abs); });
  };

  Drum.prototype.render = function () {
    var size = this.pool.length;
    var base = Math.round(this.offset);
    var half = Math.floor(size / 2);
    var used = {};
    for (var k = -half; k <= half && k - (-half) < size; k++) {
      var abs = base + k;
      var slotIdx = mod(abs, size);
      if (used[slotIdx]) continue;
      used[slotIdx] = 1;
      var slot = this.pool[slotIdx];
      var rel = abs - this.offset;
      var a = rel * this.step;
      var el = slot.el;
      if (Math.abs(a) > 94) { el.style.visibility = "hidden"; continue; }
      if (el._abs !== abs) this.fill(slot, abs);
      var cos = Math.cos(a * Math.PI / 180);
      var near = clamp(1 - Math.abs(rel) * 1.6, 0, 1);       // 1 exactly on the line
      var scale = 1 + near * 0.07;
      var rot = this.horizontal ? "rotateY(" + a.toFixed(3) + "deg)" : "rotateX(" + (-a).toFixed(3) + "deg)";
      el.style.visibility = "visible";
      el.style.transform =
        "perspective(" + this.P + "px) translateZ(" + (-this.R) + "px) " + rot +
        " translateZ(" + this.R + "px) scale(" + scale.toFixed(4) + ")";
      el.style.opacity = clamp((cos - 0.02) / 0.6, 0, 1).toFixed(3);
      slot.shade.style.opacity = ((1 - cos) * 0.55).toFixed(3);
      el.style.zIndex = Math.round(cos * 100) + 100;
      el.classList.toggle("is-selected", this.active && this.selected === abs);
    }
    // hide slots that were not used this frame
    for (var s = 0; s < size; s++) if (!used[s]) this.pool[s].el.style.visibility = "hidden";
  };

  Drum.prototype.kick = function () {
    if (this.running) return;
    this.running = true;
    var self = this, last = performance.now();
    function frame(now) {
      var dt = Math.min(64, now - last); last = now;
      if (!self.dragging) {
        var k = reduceMotion ? 1 : 1 - Math.exp(-dt / 90);
        self.offset += (self.target - self.offset) * k;
        if (Math.abs(self.target - self.offset) < 0.0008) self.offset = self.target;
      }
      self.render();
      if (self.dragging || self.offset !== self.target) requestAnimationFrame(frame);
      else self.running = false;
    }
    requestAnimationFrame(frame);
  };

  // dir: +1 = content moves down/right-to-left… expressed in screen terms:
  // for vertical drums +1 = "down", -1 = "up"; horizontal +1 = "right", -1 = "left"
  Drum.prototype.goTo = function (target, dir) {
    this.target = target;
    this.selected = Math.round(target);
    this.onInteract(this, dir);
    this.kick();
  };

  Drum.prototype.currentProject = function () {
    return this.items[mod(Math.round(this.target), this.n)];
  };
  Drum.prototype.currentIndex = function () { return mod(Math.round(this.target), this.n); };

  Drum.prototype.setActive = function (on) {
    if (this.active === on) return;
    this.active = on;
    this.el.classList.toggle("is-active", on);
    this.render();
  };

  Drum.prototype.bind = function () {
    var self = this;

    // Mouse wheel / trackpad: rotate, then snap after the gesture ends
    this.el.addEventListener("wheel", function (e) {
      e.preventDefault();
      var d = e.deltaY;
      if (self.horizontal && Math.abs(e.deltaX) > Math.abs(d)) d = e.deltaX;
      if (e.deltaMode === 1) d *= 33; else if (e.deltaMode === 2) d *= 400;
      var items = clamp(d / 110, -1.6, 1.6);
      if (Math.abs(items) < 0.0001) return;
      // scroll down -> drum turns down (cards move down)
      self.target -= items;
      var dir = d > 0 ? 1 : -1;
      self.selected = Math.round(self.target);
      clearTimeout(self.wheelTimer);
      self.wheelTimer = setTimeout(function () { self.goTo(Math.round(self.target), dir); }, 130);
      self.onInteract(self, dir);
      self.kick();
    }, { passive: false });

    // Pointer drag / swipe (mouse + touch) with fling
    var startPos = 0, startOff = 0, moved = 0, samples = [], pid = null, axisLocked = false;
    function pos(e) { return self.horizontal ? e.clientX : e.clientY; }
    function cross(e) { return self.horizontal ? e.clientY : e.clientX; }
    var startCross = 0;

    this.el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      pid = e.pointerId;
      startPos = pos(e); startCross = cross(e); startOff = self.offset; moved = 0;
      samples = [{ t: performance.now(), p: startPos }];
      axisLocked = e.pointerType === "mouse";
      self.pending = true;
    });
    this.el.addEventListener("pointermove", function (e) {
      if (!self.pending || e.pointerId !== pid) return;
      var d = pos(e) - startPos;
      if (!axisLocked) {
        var c = Math.abs(cross(e) - startCross);
        if (Math.abs(d) < 6 && c < 6) return;
        if (c > Math.abs(d)) { self.pending = false; return; } // let the page scroll
        axisLocked = true;
      }
      moved = Math.max(moved, Math.abs(d));
      if (!self.dragging && moved > 4) {
        self.dragging = true;
        self.el.classList.add("is-dragging");
        try { self.el.setPointerCapture(pid); } catch (err) {}
        self.kick();
      }
      if (self.dragging) {
        // drag down/right -> cards follow the finger
        self.offset = self.target = startOff - d / self.pxPerItem;
        samples.push({ t: performance.now(), p: pos(e) });
        if (samples.length > 6) samples.shift();
        self.selected = Math.round(self.offset);
      }
    });
    function end(e) {
      if (e.pointerId !== pid) return;
      var wasDragging = self.dragging;
      self.dragging = false; self.pending = false;
      self.el.classList.remove("is-dragging");
      if (wasDragging) {
        var a = samples[0], b = samples[samples.length - 1];
        var v = (b.t - a.t) > 0 ? (b.p - a.p) / (b.t - a.t) : 0;  // px per ms
        var fling = clamp(-v * 260 / self.pxPerItem, -14, 14);
        var dir = (b.p - samples[0].p) >= 0 ? 1 : -1;
        self.goTo(Math.round(self.offset + fling), dir);
      } else if (moved < 6 && e.type === "pointerup") {
        var card = e.target.closest && e.target.closest(".card");
        if (card && card.getAttribute("data-abs") != null) {
          var abs = parseInt(card.getAttribute("data-abs"), 10);
          var dir2 = abs > self.target ? -1 : abs < self.target ? 1 : -1;
          self.goTo(abs, dir2);
        }
      }
    }
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", end);

    // Keyboard
    this.el.addEventListener("keydown", function (e) {
      var prev = self.horizontal ? "ArrowLeft" : "ArrowUp";
      var next = self.horizontal ? "ArrowRight" : "ArrowDown";
      if (e.key === prev || e.key === next) {
        e.preventDefault();
        var step = e.key === next ? 1 : -1;
        self.goTo(Math.round(self.target) + step, -step);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        self.goTo(Math.round(self.target), -1);
      }
    });
  };

  /* =====================================================================
     Center stage — welcome block / project panel with directional slides
     ===================================================================== */
  var stage = document.getElementById("stage");
  var tplWelcome = document.getElementById("tpl-welcome");
  var tplProject = document.getElementById("tpl-project");
  var current = null;      // { type: "welcome" } | { type: "project", drum, project }
  var currentEl = null;
  var isTouch = window.matchMedia("(hover: none)").matches;

  function buildWelcome() {
    var el = tplWelcome.content.firstElementChild.cloneNode(true);
    applyI18n(el);
    el.querySelector(".js-hint").textContent = t(isTouch || mqMobile.matches ? "welcome.hintTouch" : "welcome.hint");
    return el;
  }

  function buildProject(p, drum) {
    var el = tplProject.content.firstElementChild.cloneNode(true);
    applyI18n(el);
    var main = el.querySelector(".js-main");
    main.src = p.images[0];
    main.alt = loc(p.title);
    var thumbs = el.querySelector(".js-thumbs");
    (p.images || []).slice(0, 4).forEach(function (src, i) {
      var b = document.createElement("button");
      b.type = "button";
      if (i === 0) b.className = "is-active";
      b.innerHTML = '<img alt="" src="' + src + '">';
      b.addEventListener("click", function () {
        thumbs.querySelectorAll("button").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        main.style.opacity = 0;
        setTimeout(function () { main.src = src; main.style.opacity = 1; }, 180);
      });
      thumbs.appendChild(b);
    });
    if ((p.images || []).length < 2) thumbs.remove();
    el.querySelector(".js-work").textContent = t("work." + p.workType);
    el.querySelector(".js-count").textContent = (drum.currentIndex() + 1) + " / " + drum.n;
    el.querySelector(".js-title").textContent = loc(p.title);
    el.querySelector(".js-location").textContent = loc(p.location);
    el.querySelector(".js-year-p").textContent = p.year || "—";
    el.querySelector(".js-area").textContent = p.area ? p.area.toLocaleString(lang === "ar" ? "ar-AE" : lang) + " " + t("project.areaUnit") : "—";
    el.querySelector(".js-desc").textContent = loc(p.description);
    el.querySelector(".js-back").addEventListener("click", function () { showWelcome(-1); });
    return el;
  }

  function swap(nextEl, dir) {
    // dir: +1 down/right, -1 up/left (screen direction of the motion)
    var horizontal = mqMobile.matches;
    var dist = horizontal ? 40 : 56;
    var tr = function (v) { return horizontal ? "translateX(" + v + "px)" : "translateY(" + v + "px)"; };
    if (document.documentElement.dir === "rtl" && horizontal) dir = -dir;

    stage.querySelectorAll(".panel.is-leaving").forEach(function (p) { p.remove(); });
    var old = currentEl;
    stage.appendChild(nextEl);
    currentEl = nextEl;
    if (reduceMotion || !nextEl.animate) { if (old) old.remove(); return; }

    nextEl.animate(
      [{ transform: tr(-dir * dist), opacity: 0 }, { transform: tr(0), opacity: 1 }],
      { duration: 560, easing: "cubic-bezier(.22,.61,.36,1)", delay: old ? 90 : 0, fill: "backwards" }
    );
    if (old) {
      old.classList.add("is-leaving");
      old.style.pointerEvents = "none";
      var anim = old.animate(
        [{ transform: tr(0), opacity: 1 }, { transform: tr(dir * dist), opacity: 0 }],
        { duration: 420, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" }
      );
      anim.onfinish = function () { old.remove(); };
    }
  }

  function showWelcome(dir) {
    current = { type: "welcome" };
    drums.forEach(function (d) { d.setActive(false); });
    swap(buildWelcome(), dir || -1);
  }

  function showProject(drum, dir) {
    var p = drum.currentProject();
    if (current && current.type === "project" && current.project === p) return;
    current = { type: "project", drum: drum, project: p };
    swap(buildProject(p, drum), dir);
  }

  /* ---------------- wire drums ---------------- */
  var showTimer = 0, lastDir = 1;
  function onInteract(drum, dir) {
    lastDir = dir;
    drums.forEach(function (d) { d.setActive(d === drum); });
    clearTimeout(showTimer);
    // first touch of a drum reacts instantly, then follow the rotation calmly
    var delay = current && current.type === "project" && current.drum === drum ? 140 : 0;
    showTimer = setTimeout(function () { showProject(drum, lastDir); }, delay);
  }

  var leftItems = PROJECTS.filter(function (p) { return p.side !== "right"; });
  var rightItems = PROJECTS.filter(function (p) { return p.side === "right"; });
  if (!leftItems.length) leftItems = PROJECTS;
  if (!rightItems.length) rightItems = PROJECTS;

  var drums = [
    new Drum(document.getElementById("drum-left"), leftItems, onInteract),
    new Drum(document.getElementById("drum-right"), rightItems, onInteract)
  ];

  current = { type: "welcome" };
  currentEl = buildWelcome();
  stage.appendChild(currentEl);

  /* ---------------- center wheel: welcome first, then normal page scroll ---------------- */
  var centerLock = 0;
  document.getElementById("center").addEventListener("wheel", function (e) {
    if (Date.now() < centerLock) { e.preventDefault(); return; }
    if (current && current.type === "project" && window.scrollY < 10) {
      e.preventDefault();
      centerLock = Date.now() + 650;
      showWelcome(e.deltaY > 0 ? 1 : -1);
    }
  }, { passive: false });

  /* ---------------- language & resize ---------------- */
  document.addEventListener("nxt:lang", function () {
    drums.forEach(function (d) { d.relabel(); });
    var el = current.type === "project" ? buildProject(current.project, current.drum) : buildWelcome();
    if (currentEl) currentEl.replaceWith(el);
    currentEl = el;
  });

  var rt = 0;
  function remeasure() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      drums.forEach(function (d) { d.measure(); d.render(); });
    }, 120);
  }
  window.addEventListener("resize", remeasure);
  if (mqMobile.addEventListener) mqMobile.addEventListener("change", remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
})();
