/* =====================================================================
   VENEZIA SHOWROOM — guided 3D walkthrough (three.js r160, ES modules)
   ---------------------------------------------------------------------
   World units are metres. Building: x 0..26 (left → right on the plan),
   z 0..9 (back wall → glass facade, entrance in the middle of it).
   Ground floor y = 0, first floor y = 3.9. Movement only along NODES
   (section "TOUR"), Street View style.

   Rendering: while you move, a light pass (no AO) runs at the display's
   refresh rate with adaptive resolution; when the view stops, one
   high-quality frame is drawn (GTAO ambient occlusion + bloom).
   Materials use photos cropped from the project's inspiration boards
   (assets/tex) mapped in world space, plus generated wood / travertine.
   ===================================================================== */
import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------
const W = 20.82, D = 7.3;          // clear inner size from the drawings
const G_CEIL = 3.6;                 // ground floor ceiling (slats)
const F1 = 3.9;                     // first floor level
const F1_CEIL = F1 + 3.2;           // first floor ceiling (h 3200)
const EYE = 1.6;
// windows: five on the facade (both floors), one in the meeting room, two beside the entrance
const WIN = [[1.33, 3.29], [5.58, 7.54], [9.73, 11.69], [13.82, 15.78], [17.83, 19.79]];
const BACK_WIN = [1.37, 3.26];
const LWIN = [[0.6, 1.9], [5.4, 6.7]];
const DOOR_Z0 = 2.95, DOOR_Z1 = 4.65;          // entrance: middle of the left end wall
// L-shaped stair: flight 1 along the right wall, corner landing, flight 2 along the back wall
const S1X0 = 19.3, S1Z0 = 2.15, S1Z1 = 6.25, S2X0 = 16.4, H1 = 1.95;
const VB_X0 = 19.65, VB_Z0 = 3.3;               // open shaft above flight 1
const KW_X0 = 18.2, KW_X1 = 19.22, KW_Z0 = 1.32, KW_Z1 = 6.16;   // kitchen cabinet wall

// ------------------------------------------------------------------
// Renderer
// ------------------------------------------------------------------
const canvas = $('scene');
let renderer;
const isMobile = Math.min(window.innerWidth, window.innerHeight) < 700 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
// Quality tier. LOW = phones, tablets and weak laptops: one direct render pass with
// MSAA, no post-processing, no point lights, standard materials. ?q=low / ?q=high override.
const QPARAM = new URLSearchParams(location.search).get('q');
const LOW = QPARAM === 'low' || (QPARAM !== 'high' && (isMobile || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4));
try {
  renderer = new T.WebGLRenderer({ canvas, antialias: LOW, powerPreference: 'high-performance', stencil: false });
} catch (e) { $('nowebgl').hidden = false; throw e; }
const DPR_MAX = Math.min(window.devicePixelRatio || 1, LOW ? 1.5 : 2);
let dprScale = 1;           // adapted between walks
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LOW ? T.PCFShadowMap : T.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new T.Scene();
scene.background = new T.Color(0xcfd8de);
const camera = new T.PerspectiveCamera(72, 1, 0.05, 220);
camera.rotation.order = 'YXZ';

// ------------------------------------------------------------------
// Random + noise
// ------------------------------------------------------------------
let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

/** periodic 2D Perlin noise: noise(x, y, px, py) tiles every px / py */
const perm = (() => {
  const p = [...Array(256).keys()];
  let s = 7;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  return Uint8Array.from([...p, ...p]);
})();
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y) {
  switch (h & 7) {
    case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
    case 4: return x; case 5: return -x; case 6: return y; default: return -y;
  }
}
function noise(x, y, px, py) {
  const X = Math.floor(x), Y = Math.floor(y);
  const fx = x - X, fy = y - Y;
  const x0 = ((X % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((Y % py) + py) % py, y1 = (y0 + 1) % py;
  const u = fade(fx), v = fade(fy);
  const n00 = grad(perm[perm[x0 & 255] + (y0 & 255)], fx, fy);
  const n10 = grad(perm[perm[x1 & 255] + (y0 & 255)], fx - 1, fy);
  const n01 = grad(perm[perm[x0 & 255] + (y1 & 255)], fx, fy - 1);
  const n11 = grad(perm[perm[x1 & 255] + (y1 & 255)], fx - 1, fy - 1);
  const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}
function fbm(u, v, fx, fy, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { s += a * noise(u * fx * f, v * fy * f, fx * f, fy * f); a *= 0.5; f *= 2; }
  return s;
}

// ------------------------------------------------------------------
// Texture helpers
// ------------------------------------------------------------------
function dataTex(data, w, h, srgb) {
  const t = new T.DataTexture(data, w, h, T.RGBAFormat);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = MAX_ANISO;
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
/** height (Float32Array 0..1) → tangent-space normal map */
function normalFromHeight(hgt, w, h, strength) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = hgt[y * w + ((x - 1 + w) % w)], r = hgt[y * w + ((x + 1) % w)];
    const u = hgt[((y - 1 + h) % h) * w + x], d = hgt[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return dataTex(out, w, h, false);
}
function hex(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
function genTex(w, h, fn, normalStrength) {
  const col = new Uint8Array(w * h * 4), hgt = new Float32Array(w * h);
  const o = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    fn(x / w, y / h, o, x, y);
    const i = (y * w + x) * 4;
    col[i] = o[0]; col[i + 1] = o[1]; col[i + 2] = o[2]; col[i + 3] = 255;
    hgt[y * w + x] = o[3];
  }
  return { map: dataTex(col, w, h, true), normal: normalStrength ? normalFromHeight(hgt, w, h, normalStrength) : null };
}
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = MAX_ANISO;
  return t;
}

// photo textures cropped from the inspiration boards
const PHOTO = ['marble-blue', 'marble-grey', 'marble-red', 'marble-warm', 'leather-weave', 'bronze-grid',
  'travertine-fluted', 'travertine-slab', 'olive-leather'];
const TX = {};
function loadPhotos(onProgress) {
  const loader = new T.TextureLoader();
  let done = 0;
  return Promise.all(PHOTO.map((k) => new Promise((res) => {
    loader.load('assets/tex/' + k + '.jpg', (t) => {
      t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.MirroredRepeatWrapping; t.anisotropy = MAX_ANISO;
      TX[k] = t; onProgress(++done / PHOTO.length); res();
    }, undefined, () => { TX[k] = null; onProgress(++done / PHOTO.length); res(); });
  })));
}
function normalFromImage(tex, strength, size) {
  if (!tex) return null;
  const img = tex.image, w = size || Math.min(512, img.width), h = Math.round(w * img.height / img.width);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, hgt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hgt[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const n = normalFromHeight(hgt, w, h, strength);
  n.wrapS = n.wrapT = T.MirroredRepeatWrapping;
  return n;
}

function buildGeneratedTextures() {
  // travertine floor tile 1.2 × 0.6 m
  const c1 = hex(0xdccfbc), c2 = hex(0xc4b39a), c3 = hex(0xe9e0d2);
  const trav = genTex(isMobile ? 768 : 1024, isMobile ? 384 : 512, (u, v, o, x, y) => {
    const band = fbm(u, v, 3, 22, 5);
    const cloud = fbm(u, v, 6, 3, 3);
    const pit = noise(u * 70, v * 150, 70, 150);
    const t = clamp01(0.5 + band * 1.6 + cloud * 0.6);
    let r = mix(c2[0], c1[0], t), g = mix(c2[1], c1[1], t), b = mix(c2[2], c1[2], t);
    const hi = clamp01(fbm(u, v, 10, 40, 2) * 3);
    r = mix(r, c3[0], hi * 0.5); g = mix(g, c3[1], hi * 0.5); b = mix(b, c3[2], hi * 0.5);
    let h = 0.6 + band * 0.2;
    if (pit > 0.36) { const k = Math.min(1, (pit - 0.36) * 8); r -= 45 * k; g -= 45 * k; b -= 42 * k; h -= 0.5 * k; }
    if (Math.min(x, y) < 2) { r = 150; g = 135; b = 115; h = 0; }
    o[0] = r; o[1] = g; o[2] = b; o[3] = h;
  }, 2.2);
  TX.trav = trav.map; TX.travN = trav.normal;

  // vertical boards, 5 boards across 1 m, 2 m tall
  const wood = (dark, light) => {
    const dk = hex(dark), lt = hex(light);
    return genTex(512, 1024, (u, v, o) => {
      const bu = u * 5, board = Math.floor(bu), fu = bu - board;
      const off = board * 17.31;
      const grain = fbm(u + off * 0.01, v, 60, 3, 4);
      const ring = Math.sin((fu * 9 + fbm(u, v + off * 0.03, 10, 2, 3) * 6 + off) * Math.PI * 2) * 0.5 + 0.5;
      const t = clamp01(0.48 + grain * 1.6 + (ring - 0.5) * 0.28 + Math.sin(off) * 0.08);
      let r = mix(dk[0], lt[0], t), g = mix(dk[1], lt[1], t), b = mix(dk[2], lt[2], t);
      let h = 0.6 + grain * 0.4;
      if (fu < 0.012 || fu > 0.988) { r *= 0.45; g *= 0.45; b *= 0.45; h = 0; }
      o[0] = r; o[1] = g; o[2] = b; o[3] = h;
    }, 1.6);
  };
  const oak = wood(0x6e4426, 0xb07d52); TX.oak = oak.map; TX.oakN = oak.normal;
  const wal = wood(0x2e1c11, 0x6d4a31); TX.walnut = wal.map; TX.walnutN = wal.normal;

  // bouclé
  const bc = genTex(256, 256, (u, v, o) => {
    const a = Math.abs(noise(u * 48, v * 48, 48, 48)), b = Math.abs(noise(u * 96 + 3, v * 96, 96, 96));
    const h = 1 - Math.min(1, a * 1.6 + b * 0.8);
    const t = 0.65 + h * 0.35 + noise(u * 8, v * 8, 8, 8) * 0.1;
    o[0] = 200 * t; o[1] = 192 * t; o[2] = 181 * t; o[3] = h;
  }, 3.5);
  TX.boucle = bc.map; TX.boucleN = bc.normal;
  TX.fabricN = genTex(256, 256, (u, v, o) => { o[0] = o[1] = o[2] = 255; o[3] = 0.5 + 0.12 * Math.sin(u * 256 * Math.PI) + noise(u * 64, v * 64, 64, 64) * 0.4; }, 1.2).normal;
  TX.leatherN = genTex(256, 256, (u, v, o) => { o[0] = o[1] = o[2] = 255; o[3] = 1 - Math.abs(noise(u * 40, v * 40, 40, 40)) * 2 - Math.abs(noise(u * 90, v * 90, 90, 90)) * 0.6; }, 1.4).normal;

  TX.rug = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d9cbb4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { g.fillStyle = pick(['#e6d9c4', '#cbb99e', '#d2c2a8', '#bfae93']); g.globalAlpha = R(0.2, 0.6); g.fillRect(R(0, w), R(0, h), R(1, 3), R(1, 3)); }
    g.globalAlpha = 1; g.strokeStyle = '#6e4528'; g.lineWidth = 9; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 12, 0, 7); g.stroke();
  });
  TX.rugGrey = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#a7a199'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { g.fillStyle = pick(['#bab4ab', '#958f87', '#c6c0b8', '#8a847c']); g.globalAlpha = R(0.2, 0.7); g.fillRect(R(0, w), R(0, h), R(1, 3), R(1, 2)); }
  });
  TX.sky = canvasTex(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#6f9cc6'); gr.addColorStop(0.42, '#bcd3e4'); gr.addColorStop(0.5, '#eae5db'); gr.addColorStop(0.56, '#dccfb4'); gr.addColorStop(1, '#cbb995');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  TX.hedge = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#34501f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { g.fillStyle = pick(['#4d7330', '#2a421a', '#62893b', '#3f6227', '#77a04a']); g.globalAlpha = R(0.4, 0.9); g.beginPath(); g.ellipse(R(0, w), R(0, h), R(1.5, 4), R(1, 2.5), R(0, 3), 0, 7); g.fill(); }
  });
  TX.sand = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d3c3a2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { g.fillStyle = pick(['#c8b791', '#e0d2b5', '#bcab86']); g.globalAlpha = R(0.3, 0.8); g.fillRect(R(0, w), R(0, h), 2, 2); }
  });
  TX.desk = canvasTex(1024, 128, (g, w, h) => {
    g.font = '500 62px "Bodoni Moda", Didot, serif';
    g.fillStyle = 'rgba(110,70,35,.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('C O L O R S   O F   L I V I N G', w / 2, h / 2 + 4);
  });
  TX.desk.wrapS = TX.desk.wrapT = T.ClampToEdgeWrapping;

  TX.weaveN = normalFromImage(TX['leather-weave'], 6);
  TX.flutedN = normalFromImage(TX['travertine-fluted'], 5);
  TX.gridN = normalFromImage(TX['bronze-grid'], 4);
  const pl = genTex(512, 512, (u, v, o) => {
    const n1 = fbm(u, v, 4, 4, 4), n2 = noise(u * 64, v * 64, 64, 64);
    const t = 0.94 + n1 * 0.12 + n2 * 0.025;
    o[0] = 236 * t; o[1] = 228 * t; o[2] = 216 * t; o[3] = 0.5 + n1 * 0.4 + n2 * 0.25;
  }, 1.4);
  TX.plasterGen = pl.map; TX.plasterN = pl.normal;
}

// ------------------------------------------------------------------
// Materials
// ------------------------------------------------------------------
const MT = {};
const std = (o) => new T.MeshStandardMaterial(o);
const PHYS_ONLY = ['sheen', 'sheenRoughness', 'sheenColor', 'clearcoat', 'clearcoatRoughness', 'transmission', 'thickness', 'ior', 'specularIntensity', 'specularColor'];
const phys = (o) => {
  if (!LOW) return new T.MeshPhysicalMaterial(o);
  const q = { ...o }; PHYS_ONLY.forEach((k) => delete q[k]);
  if (o.clearcoat) q.roughness = Math.min(q.roughness ?? 1, 0.3);
  return new T.MeshStandardMaterial(q);
};
/** mark a material for world-space UVs: one texture tile = sx × sy metres */
const wuv = (m, sx, sy) => { m.userData.uv = [sx, sy || sx]; return m; };
const photo = (k) => TX[k] || null;

function buildMaterials() {
  MT.trav = wuv(std({ map: TX.trav, normalMap: TX.travN, normalScale: new T.Vector2(0.5, 0.5), roughness: 0.3 }), 1.2, 0.6);
  MT.travBlock = wuv(std({ map: TX.trav, normalMap: TX.travN, roughness: 0.45 }), 1.2, 0.6);
  MT.travSlab = wuv(std({ map: photo('travertine-slab'), color: TX['travertine-slab'] ? 0xffffff : 0xd8ccba, roughness: 0.5 }), 0.7, 0.33);
  MT.oak = wuv(std({ map: TX.oak, normalMap: TX.oakN, normalScale: new T.Vector2(0.6, 0.6), roughness: 0.55 }), 1, 2);
  MT.oakPanel = wuv(std({ map: TX.oak, normalMap: TX.oakN, roughness: 0.5, color: 0xf2e6da }), 1.2, 2.4);
  MT.walnut = wuv(std({ map: TX.walnut, normalMap: TX.walnutN, roughness: 0.42 }), 1, 2);
  MT.slat = std({ map: TX.oak, roughness: 0.6, color: 0xe8d2bc });
  MT.ceilDark = std({ color: 0x1d130c, roughness: 1 });
  MT.marbleBlue = wuv(std({ map: photo('marble-blue'), color: TX['marble-blue'] ? 0xffffff : 0x9fb3c4, roughness: 0.14 }), 0.9, 1.56);
  MT.marbleGrey = wuv(std({ map: photo('marble-grey'), color: TX['marble-grey'] ? 0xffffff : 0x8f8a83, roughness: 0.16 }), 0.6, 1.18);
  MT.marbleDark = wuv(std({ map: photo('marble-grey'), color: 0x6a645e, roughness: 0.12 }), 0.5, 1.0);
  MT.marbleRed = wuv(std({ map: photo('marble-red'), color: TX['marble-red'] ? 0xffffff : 0x8a4a3a, roughness: 0.14 }), 1.0, 0.73);
  MT.marbleWarm = wuv(std({ map: photo('marble-warm'), color: TX['marble-warm'] ? 0xffffff : 0xe1cfb5, roughness: 0.16 }), 0.7, 0.74);
  MT.weave = wuv(std({ map: photo('leather-weave'), normalMap: TX.weaveN, roughness: 0.62, color: TX['leather-weave'] ? 0xffffff : 0x8b6a52 }), 0.8, 0.76);
  MT.bronzeGrid = wuv(std({ map: photo('bronze-grid'), normalMap: TX.gridN, metalness: 0.6, roughness: 0.4 }), 0.45, 0.95);
  MT.fluted = wuv(std({ map: photo('travertine-fluted'), normalMap: TX.flutedN, roughness: 0.5, color: TX['travertine-fluted'] ? 0xffffff : 0xd9d1c4 }), 0.9, 0.87);
  MT.plaster = wuv(std({ map: TX.plasterGen, normalMap: TX.plasterN, roughness: 0.9 }), 1.6, 1.6);
  MT.suede = wuv(phys({ map: photo('olive-leather'), color: TX['olive-leather'] ? 0xffffff : 0x8a8a3e, roughness: 0.9, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new T.Color(0x8c8a52) }), 0.4, 0.53);

  MT.boucle = wuv(phys({ map: TX.boucle, normalMap: TX.boucleN, normalScale: new T.Vector2(0.9, 0.9), roughness: 0.95, sheen: 1, sheenRoughness: 0.7, sheenColor: new T.Color(0xe9e2d6) }), 0.28);
  MT.oliveFab = wuv(phys({ color: 0x8a8a3e, normalMap: TX.fabricN, roughness: 0.85, sheen: 1, sheenRoughness: 0.45, sheenColor: new T.Color(0xc8c47a) }), 0.2);
  MT.greyFab = wuv(phys({ color: 0x5a5856, normalMap: TX.fabricN, roughness: 0.9, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new T.Color(0x9a9896) }), 0.2);
  MT.creamFab = wuv(phys({ color: 0xe6dccb, normalMap: TX.fabricN, roughness: 0.92, sheen: 0.7, sheenColor: new T.Color(0xffffff) }), 0.2);
  MT.sandFab = wuv(phys({ color: 0xc4a47e, normalMap: TX.fabricN, roughness: 0.9, sheen: 0.7, sheenColor: new T.Color(0xf0d6b0) }), 0.2);
  MT.slateFab = wuv(phys({ color: 0x46627e, normalMap: TX.fabricN, roughness: 0.85, sheen: 0.8, sheenColor: new T.Color(0x8fb0d0) }), 0.2);
  MT.leather = wuv(phys({ color: 0x7a4426, normalMap: TX.leatherN, normalScale: new T.Vector2(0.4, 0.4), roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4 }), 0.3);
  MT.leatherDark = wuv(phys({ color: 0x3e2416, normalMap: TX.leatherN, normalScale: new T.Vector2(0.4, 0.4), roughness: 0.4, clearcoat: 0.25 }), 0.3);

  MT.bronze = std({ color: 0x8c5e36, metalness: 1, roughness: 0.3 });
  MT.brass = std({ color: 0xc29a5f, metalness: 1, roughness: 0.22 });
  MT.blackMetal = std({ color: 0x1a1a1c, metalness: 0.8, roughness: 0.35 });
  MT.blueLacquer = phys({ color: 0x24405c, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 });
  MT.greyLacquer = phys({ color: 0x6a7077, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  MT.beigeLacquer = phys({ color: 0xd3c5ae, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.12 });
  MT.taupe = phys({ color: 0xb2a089, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  MT.white = phys({ color: 0xf3efe9, roughness: 0.2, clearcoat: 0.6 });
  MT.ceramic = phys({ color: 0xf6f3ee, roughness: 0.12, clearcoat: 1 });
  MT.black = phys({ color: 0x101216, roughness: 0.1, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
  MT.charcoal = std({ color: 0x343231, roughness: 0.9 });
  MT.stoneware = std({ color: 0x8a7e70, roughness: 0.85 });
  MT.clay = std({ color: 0xb38a64, roughness: 0.8 });
  MT.cream = std({ color: 0xe8dcc8, roughness: 0.9 });
  MT.paper = std({ color: 0xece4d4, roughness: 0.95 });
  MT.glass = std({ color: 0xc4d2da, transparent: true, opacity: 0.12, metalness: 0.9, roughness: 0.04, depthWrite: false });
  MT.glassTint = std({ color: 0x6f5236, transparent: true, opacity: 0.32, metalness: 0.6, roughness: 0.06, depthWrite: false });
  MT.glassSmoke = std({ color: 0x9aa4a8, transparent: true, opacity: 0.4, metalness: 0.4, roughness: 0.05, depthWrite: false });
  MT.amberGlass = std({ color: 0xc98a4a, emissive: 0x6a3a14, emissiveIntensity: 0.7, transparent: true, opacity: 0.62, roughness: 0.12, metalness: 0.3, side: T.DoubleSide, depthWrite: false });
  MT.mirror = std({ color: 0xc0c4c8, metalness: 1, roughness: 0.02 });
  MT.led = new T.MeshBasicMaterial({ color: new T.Color(0xffc98a).multiplyScalar(3.2) });
  MT.ledSoft = new T.MeshBasicMaterial({ color: new T.Color(0xffe2bc).multiplyScalar(1.8) });
  MT.glow = std({ color: 0xfff2dc, emissive: 0xffd8a0, emissiveIntensity: 1.6, roughness: 0.5 });
  MT.pearl = std({ color: 0xfff6e6, emissive: 0xffc27a, emissiveIntensity: 1.6, roughness: 0.25 });
  MT.bark = std({ color: 0x5f5242, roughness: 0.95 });
  MT.leaf = std({ color: 0xffffff, roughness: 0.75, side: T.DoubleSide });
  MT.rug = std({ map: TX.rug, roughness: 1 });
  MT.rugGrey = wuv(std({ map: TX.rugGrey, roughness: 1 }), 0.8);
  MT.rugDark = std({ color: 0x4d4a47, roughness: 1 });
  MT.sky = new T.MeshBasicMaterial({ map: TX.sky, side: T.BackSide, fog: false, color: new T.Color(1.25, 1.25, 1.25) });
  MT.ground = wuv(std({ map: TX.sand, roughness: 1 }), 1.5);
  MT.hedge = wuv(std({ map: TX.hedge, roughness: 1 }), 1.2);
  MT.palmLeaf = std({ color: 0x5f8231, roughness: 0.8, side: T.DoubleSide });
  MT.palmTrunk = std({ color: 0x7d6849, roughness: 1 });
  MT.facadeStone = wuv(std({ map: TX.trav, roughness: 0.7, color: 0xf4eee4 }), 1.2, 0.6);
  MT.deskText = new T.MeshBasicMaterial({ map: TX.desk, transparent: true, depthWrite: false });
  MT.globe = std({ color: 0xaabccb, transparent: true, opacity: 0.32, metalness: 0.5, roughness: 0.03, depthWrite: false });
  MT.globeAmber = std({ color: 0xd0a070, emissive: 0x804a1a, emissiveIntensity: 0.8, transparent: true, opacity: 0.55, metalness: 0.4, roughness: 0.05, depthWrite: false });
  MT.art = [0x8c6a4a, 0x3d5168, 0xc9b79c, 0x6b4f3a, 0x2e3f52].map((c) => std({ color: c, roughness: 0.85 }));
  MT.books = [0xd9cbb5, 0x2d2a27, 0x8b6a4c, 0x4f6274, 0xe9e2d6, 0x6e3b2c, 0xb89b74, 0x9a8d7a, 0x1f3346, 0xc4b08f].map((c) => std({ color: c, roughness: 0.75 }));
  MT.water = std({ color: 0x9fb5bd, transparent: true, opacity: 0.25, roughness: 0, depthWrite: false });
  const blobTex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  blobTex.colorSpace = T.NoColorSpace;
  MT.shadow = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false, alphaMap: blobTex });
  MT.shadow.userData.merge = true;
}

// ------------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------------
const root = new T.Group(); scene.add(root);
const floors = [new T.Group(), new T.Group()];
const shell = new T.Group();
root.add(floors[0], floors[1], shell);
let target = shell;

const add = (mesh, parent) => { (parent || target).add(mesh); return mesh; };
function box(w, h, d, mat, x, y, z, ry) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); if (ry) m.rotation.y = ry;
  return add(m);
}
const boxB = (w, h, d, mat, x, y0, z, ry) => box(w, h, d, mat, x, y0 + h / 2, z, ry);
const lod = (n) => LOW ? Math.max(8, Math.round(n * 0.55)) : n;   // fewer segments on weak devices
function cyl(rt, rb, h, mat, x, y0, z, seg) {
  const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, lod(seg || 32)), mat);
  m.position.set(x, y0 + h / 2, z); return add(m);
}
const rbCache = new Map();
function rbox(w, h, d, r, mat, x, y0, z, ry) {
  r = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
  const key = [w, h, d, r].map((v) => v.toFixed(3)).join('_');
  if (!rbCache.has(key)) rbCache.set(key, new RoundedBoxGeometry(w, h, d, 3, r));
  const m = new T.Mesh(rbCache.get(key), mat);
  m.position.set(x, y0 + h / 2, z); if (ry) m.rotation.y = ry;
  return add(m);
}
/** annular sector in XZ (angle a: x = cos a, z = sin a), extruded up from y0 */
function sector(cx, cz, rIn, rOut, a0, a1, y0, h, mat, bevel) {
  const s = new T.Shape();
  s.absarc(0, 0, rOut, a0, a1, false);
  s.lineTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
  s.absarc(0, 0, rIn, a1, a0, true);
  s.closePath();
  const b = bevel || 0;
  const g = new T.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 48 });
  g.rotateX(Math.PI / 2); g.translate(0, h - b, 0);
  const m = new T.Mesh(g, mat); m.position.set(cx, y0, cz);
  return add(m);
}
function group(x, y, z, ry, parent) {
  const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0;
  (parent || target).add(g); return g;
}
function within(g, fn) { const prev = target; target = g; fn(); target = prev; return g; }
function lathe(points, mat, x, y0, z, seg) {
  const m = new T.Mesh(new T.LatheGeometry(points.map((p) => new T.Vector2(p[0], p[1])), lod(seg || 28)), mat);
  m.position.set(x, y0, z); return add(m);
}
function plane(w, h, mat, x, y, z, rx, ry) {
  const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0, 'YXZ');
  return add(m);
}
function blob(x, y, z, w, d, ry) {   // soft contact shadow
  const m = plane(w, d, MT.shadow, x, y + 0.004, z, -Math.PI / 2, ry || 0);
  m.renderOrder = 1; return m;
}

// minimap footprints
const FP = [[], []];
const fpRect = (f, x0, z0, x1, z1, k) => FP[f].push({ t: 'r', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), k: k || 'f' });
const fpCirc = (f, x, z, r, k) => FP[f].push({ t: 'c', x, z, r, k: k || 'f' });
const fpArc = (f, x, z, r0, r1, a0, a1, k) => FP[f].push({ t: 'a', x, z, r0, r1, a0, a1, k: k || 'f' });

// ------------------------------------------------------------------
// Small objects (the details)
// ------------------------------------------------------------------
function vase(x, y0, z, h, mat) {
  const r = h * R(0.22, 0.4), k = rnd();
  const prof = k < 0.33
    ? [[0, 0], [r * 0.6, 0], [r, h * 0.3], [r * 0.85, h * 0.7], [r * 0.3, h * 0.92], [r * 0.38, h], [0.001, h]]
    : k < 0.66
      ? [[0, 0], [r * 0.5, 0], [r * 0.9, h * 0.5], [r * 0.5, h * 0.85], [r * 0.25, h], [0.001, h]]
      : [[0, 0], [r * 0.8, 0], [r * 0.7, h * 0.4], [r, h * 0.9], [r * 0.95, h], [0.001, h]];
  return lathe(prof, mat, x, y0, z, 24);
}
function bowl(x, y0, z, r, mat) {
  return lathe([[0.001, 0], [r * 0.45, 0], [r * 0.9, r * 0.35], [r, r * 0.5], [r * 0.94, r * 0.5], [r * 0.82, r * 0.34], [0.001, r * 0.12]], mat, x, y0, z, 28);
}
function book(x, y0, z, w, h, d, rz) {
  const m = boxB(w, h, d, pick(MT.books), x, y0, z);
  if (rz) m.rotation.z = rz;
  return m;
}
/** a stack of lying books with visible page edges */
function bookStack(x, y0, z, w, ry, n) {
  const g = group(x, y0, z, ry || 0);
  within(g, () => {
    let y = 0; n = n || 2 + Math.floor(R(0, 3));
    for (let i = 0; i < n; i++) {
      const t = R(0.025, 0.05), bw = w * R(0.82, 1), bd = R(0.17, 0.25), a = R(-0.12, 0.12);
      boxB(bw, t, bd, pick(MT.books), 0, y, 0, a);
      boxB(bw - 0.012, t * 0.8, bd - 0.008, MT.paper, 0.008, y + t * 0.1, 0, a);
      y += t;
    }
  });
  return g;
}
/** a run of standing books along x */
function bookRow(x, y0, z, maxW, maxH, d) {
  let px = 0;
  while (px < maxW - 0.03) {
    const t = R(0.018, 0.045), h = Math.min(maxH, R(0.18, 0.31));
    const lean = px > maxW - 0.12 && rnd() < 0.5 ? -0.25 : 0;
    book(x + px + t / 2, y0, z, t, h, d || R(0.15, 0.22), lean);
    px += t + 0.002;
  }
  return px;
}
function sculpture(x, y0, z, s) {
  const k = rnd();
  if (k < 0.3) {
    const m = new T.Mesh(new T.TorusKnotGeometry(0.06 * s, 0.022 * s, 80, 10, 2, 3), pick([MT.bronze, MT.brass, MT.ceramic]));
    m.position.set(x, y0 + 0.1 * s, z); m.rotation.set(R(0, 3), R(0, 3), 0); add(m);
  } else if (k < 0.6) {
    cyl(0.05 * s, 0.06 * s, 0.03 * s, MT.blackMetal, x, y0, z, 16);
    const m = new T.Mesh(new T.TorusGeometry(0.08 * s, 0.025 * s, 12, 32), pick([MT.stoneware, MT.ceramic, MT.clay]));
    m.position.set(x, y0 + 0.11 * s, z); m.rotation.y = R(0, 3); add(m);
  } else {
    let y = y0;
    for (let i = 0; i < 3; i++) {
      const r = R(0.035, 0.06) * s;
      const m = new T.Mesh(new T.SphereGeometry(r, lod(18), lod(12)), pick([MT.stoneware, MT.ceramic, MT.clay, MT.travBlock]));
      m.scale.y = 0.75; m.position.set(x + R(-0.01, 0.01), y + r * 0.75, z); add(m); y += r * 1.45;
    }
  }
}
function carafe(x, y0, z, s) {
  s = s || 1;
  lathe([[0.001, 0], [0.06 * s, 0], [0.07 * s, 0.06 * s], [0.065 * s, 0.14 * s], [0.025 * s, 0.2 * s], [0.022 * s, 0.26 * s], [0.026 * s, 0.27 * s], [0.001, 0.27 * s]], MT.glassSmoke, x, y0, z, 20);
}
function glassCup(x, y0, z) { lathe([[0.001, 0], [0.032, 0], [0.036, 0.09], [0.034, 0.09], [0.03, 0.01], [0.001, 0.01]], MT.glassSmoke, x, y0, z, 16); }
function tray(x, y0, z, r, mat) { cyl(r, r * 0.97, 0.025, mat || MT.leatherDark, x, y0, z, 32); cyl(r * 0.92, r * 0.92, 0.004, MT.leather, x, y0 + 0.022, z, 32); }
function branches(x, y0, z, h) {
  vase(x, y0, z, h * 0.35, MT.stoneware);
  for (let i = 0; i < 6; i++) {
    const a = R(0, 6.28), l = h * R(0.6, 1);
    const pts = [new T.Vector3(x, y0 + h * 0.3, z), new T.Vector3(x + Math.cos(a) * 0.05, y0 + h * 0.6, z + Math.sin(a) * 0.05), new T.Vector3(x + Math.cos(a) * l * 0.35, y0 + h * 0.3 + l, z + Math.sin(a) * l * 0.35)];
    add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 8, 0.004, 4), MT.bark));
  }
}
function pottedPlant(x, y0, z, s) {
  cyl(0.18 * s, 0.14 * s, 0.32 * s, MT.stoneware, x, y0, z, 24);
  blob(x, y0, z, 0.6 * s, 0.6 * s);
  const n = 70, geo = new T.SphereGeometry(0.05 * s, 6, 4);
  const im = new T.InstancedMesh(geo, MT.leaf, n);
  const q = new T.Object3D(), c = new T.Color();
  for (let i = 0; i < n; i++) {
    const a = R(0, 6.28), r = R(0, 0.22) * s, hh = R(0.3, 0.75) * s;
    q.position.set(x + Math.cos(a) * r, y0 + hh, z + Math.sin(a) * r);
    q.scale.set(R(0.8, 1.6), 0.25, R(0.4, 0.7)); q.rotation.set(R(-0.6, 0.6), R(0, 6), R(-0.6, 0.6)); q.updateMatrix();
    im.setMatrixAt(i, q.matrix); c.setHSL(R(0.22, 0.28), R(0.35, 0.5), R(0.18, 0.3)); im.setColorAt(i, c);
  }
  add(im);
}

function decorItem(x, y0, z, maxH, maxW) {
  const r = rnd();
  if (r < 0.34) bookRow(x - maxW / 2, y0, z, maxW * R(0.45, 0.9), maxH - 0.03);
  else if (r < 0.5) { bookStack(x, y0, z, R(0.22, 0.32), R(-0.2, 0.2)); if (rnd() < 0.6) sculpture(x + R(-0.05, 0.05), y0 + 0.12, z, 0.7); }
  else if (r < 0.68) vase(x, y0, z, Math.min(maxH - 0.04, R(0.18, 0.4)), pick([MT.bronze, MT.ceramic, MT.charcoal, MT.stoneware, MT.clay, MT.brass]));
  else if (r < 0.8) bowl(x, y0, z, R(0.09, 0.16), pick([MT.bronze, MT.ceramic, MT.travBlock, MT.stoneware]));
  else if (r < 0.9) sculpture(x, y0, z, R(0.8, 1.3));
  else {
    const g = group(x, y0, z, 0);
    within(g, () => {
      const fh = Math.min(maxH - 0.05, 0.3);
      const f = boxB(0.26, fh, 0.02, MT.oak, 0, 0, -0.04); f.rotation.x = -0.12;
      const a = boxB(0.2, fh - 0.06, 0.005, pick(MT.art), 0, 0.03, -0.028); a.rotation.x = -0.12;
    });
  }
}

/** shelving along local x with a stone back panel; place = {x, z, ry} */
function shelving(x0, x1, zBack, y0, h, depth, backMat, opts) {
  opts = opts || {};
  const pl = opts.place || { x: 0, z: 0, ry: 0 };
  const g = group(pl.x, y0, pl.z, pl.ry);
  within(g, () => {
    const len = x1 - x0, cols = Math.max(1, Math.round(len / (opts.col || 1.0))), cw = len / cols;
    const rows = opts.rows || 5, rh = h / rows, zc = zBack + depth / 2;
    box(len, h, 0.03, backMat, (x0 + x1) / 2, h / 2, zBack + 0.015);
    for (let c = 0; c <= cols; c++) {
      const x = x0 + c * cw;
      boxB(c % 2 ? 0.03 : 0.05, h, depth, c % 2 ? MT.bronze : MT.blueLacquer, x, 0, zc);
    }
    for (let r = 0; r <= rows; r++) {
      const y = r * rh;
      boxB(len, 0.035, depth, opts.shelfMat || MT.oak, (x0 + x1) / 2, y, zc);
      if (r > 0 && r < rows) box(len - 0.1, 0.008, 0.015, MT.led, (x0 + x1) / 2, y - 0.008, zBack + depth - 0.04);
      if (r === rows || r === 0) continue;
      for (let c = 0; c < cols; c++) {
        const cx = x0 + c * cw + cw / 2;
        if (rnd() < 0.15) { for (let k = -5; k <= 5; k++) boxB(0.022, rh - 0.06, 0.02, MT.oak, cx + k * cw / 12, y + 0.04, zBack + 0.08); continue; }
        const n = rnd() < 0.55 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const sx = n === 1 ? cx : cx + (k ? 0.22 : -0.22) * cw;
          decorItem(sx, y + 0.035, zc + R(-0.04, 0.04), rh - 0.04, cw / n * 0.85);
        }
      }
    }
  });
  return g;
}

// furniture -----------------------------------------------------------
function pillow(x, y0, z, mat, ry, tilt, w) {
  w = w || 0.46;
  const m = rbox(w, w * 0.92, 0.15, 0.07, mat, x, y0, z, ry || 0);
  m.rotation.x = tilt === undefined ? -0.25 : tilt; return m;
}
function strapPillow(x, y0, z, mat, ry) {
  const g = group(x, y0, z, ry || 0);
  within(g, () => {
    pillow(0, 0, 0, mat, 0, -0.2);
    const s = boxB(0.07, 0.44, 0.16, MT.leather, 0.1, -0.005, 0.0); s.rotation.x = -0.2;
    const b = cyl(0.018, 0.018, 0.02, MT.brass, 0.1, 0.2, 0.08); b.rotation.x = Math.PI / 2 - 0.2;
  });
  return g;
}
function loungeChair(x, z, ry) {
  const g = group(x, 0, z, ry);
  within(g, () => {
    rbox(0.9, 0.38, 0.85, 0.14, MT.boucle, 0, 0.06, 0);
    rbox(0.9, 0.44, 0.34, 0.15, MT.boucle, 0, 0.36, -0.28);
    rbox(0.92, 0.06, 0.9, 0.025, MT.leather, 0, 0.02, 0);
    [-0.25, 0.25].forEach((sx) => {
      boxB(0.07, 0.02, 0.88, MT.leather, sx, 0.435, 0);
      boxB(0.07, 0.42, 0.02, MT.leather, sx, 0.4, -0.455);
    });
    blob(0, 0, 0, 1.3, 1.25);
  });
  return g;
}
function chunkyChair(x, z, ry) {
  const g = group(x, 0, z, ry);
  within(g, () => {
    rbox(0.95, 0.3, 0.9, 0.14, MT.boucle, 0, 0.06, 0);
    rbox(0.95, 0.3, 0.9, 0.14, MT.boucle, 0, 0.35, 0.06);
    rbox(0.95, 0.36, 0.32, 0.15, MT.boucle, 0, 0.63, -0.3);
    [-0.485, 0.485].forEach((sx) => {
      boxB(0.025, 0.07, 0.86, MT.leather, sx, 0.3, 0.05);
      boxB(0.025, 0.07, 0.86, MT.leather, sx, 0.6, 0.05);
    });
    boxB(0.97, 0.06, 0.06, MT.leather, 0, 0.06, 0.47);
    pillow(0, 0.66, -0.12, MT.leather, 0, -0.3, 0.38);
    blob(0, 0, 0, 1.35, 1.3);
  });
  return g;
}
function roundTable(x, z, r, h, topMat, baseMat, f) {
  cyl(r * 0.85, r * 0.85, h - 0.05, baseMat, x, 0, z, 48);
  cyl(r, r, 0.05, topMat, x, h - 0.05, z, 48);
  cyl(r * 0.86, r * 0.86, 0.012, MT.brass, x, h - 0.06, z, 48);
  blob(x, 0.015, z, r * 2.6, r * 2.6);
  if (f !== undefined) fpCirc(f, x, z, r);
}
function sideTable(x, z, y0) {
  y0 = y0 || 0;
  const n = 18;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; boxB(0.03, 0.42, 0.03, MT.walnut, x + Math.cos(a) * 0.17, y0, z + Math.sin(a) * 0.17, -a); }
  cyl(0.16, 0.16, 0.42, MT.walnut, x, y0, z, 24);
  cyl(0.3, 0.3, 0.025, MT.bronze, x, y0 + 0.42, z, 40);
  cyl(0.29, 0.29, 0.012, MT.mirror, x, y0 + 0.445, z, 40);
  blob(x, y0 + 0.015, z, 0.8, 0.8);
}
/** chair facing −z when ry = 0 */
function diningChair(x, z, ry, fab, seatY, y0) {
  const g = group(x, y0 || 0, z, ry || 0);
  seatY = seatY || 0.46;
  within(g, () => {
    const legH = seatY - 0.06;
    [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]].forEach((p) => {
      const l = boxB(0.032, legH, 0.032, MT.walnut, p[0], 0, p[1]); l.rotation.z = p[0] * 0.12; l.rotation.x = -p[1] * 0.1;
    });
    if (seatY > 0.6) { boxB(0.44, 0.02, 0.02, MT.walnut, 0, 0.28, -0.19); boxB(0.44, 0.02, 0.02, MT.brass, 0, 0.28, 0.19); }
    rbox(0.5, 0.09, 0.48, 0.04, fab, 0, legH, 0);
    sector(0, 0, 0.25, 0.3, Math.PI * 0.12, Math.PI * 0.88, legH + 0.07, 0.4, fab, 0.015);
    blob(0, 0, 0, 0.75, 0.75);
  });
  return g;
}

// Pearl garlands -------------------------------------------------------
const pearlPts = [];
function garland(a, b, sag) {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const steps = Math.max(10, Math.round((len + sag * 1.6) / 0.13));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pearlPts.push(new T.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t));
  }
  cyl(0.05, 0.05, 0.06, MT.bronze, a[0], a[1] + 0.02, a[2], 16);
  cyl(0.05, 0.05, 0.06, MT.bronze, b[0], b[1] + 0.02, b[2], 16);
}
function flushPearls() {
  const geo = new T.SphereGeometry(0.05, LOW ? 9 : 18, LOW ? 6 : 12);
  geo.scale(1, 1.08, 1);
  const im = new T.InstancedMesh(geo, MT.pearl, pearlPts.length);
  const m = new T.Matrix4();
  pearlPts.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m); });
  shell.add(im);
  const rm = new T.InstancedMesh(new T.CylinderGeometry(0.018, 0.018, 0.035, LOW ? 6 : 10), MT.bronze, pearlPts.length);
  const q = new T.Object3D();
  pearlPts.forEach((p, i) => { q.position.set(p.x, p.y + 0.06, p.z); q.updateMatrix(); rm.setMatrixAt(i, q.matrix); });
  shell.add(rm);
}

// Olive tree ----------------------------------------------------------
function oliveTree(x, z, y0, s) {
  s = s || 1;
  const g = group(x, y0, z, R(0, 6));
  const tips = [];
  within(g, () => {
    cyl(0.48 * s, 0.42 * s, 0.6 * s, MT.blueLacquer, 0, 0, 0, 48);
    cyl(0.49 * s, 0.49 * s, 0.03, MT.brass, 0, 0.6 * s, 0, 48);
    cyl(0.45 * s, 0.45 * s, 0.02, MT.stoneware, 0, 0.58 * s, 0, 32);
    blob(0, 0, 0, 1.5 * s, 1.5 * s);
    for (let b = 0; b < 6; b++) {
      let a = b / 6 * Math.PI * 2 + R(-0.3, 0.3);
      const pts = [new T.Vector3(R(-0.04, 0.04), 0.55 * s, R(-0.04, 0.04))];
      let px = 0, pz = 0, py = 0.55 * s;
      for (let k = 0; k < 4; k++) {
        px += Math.cos(a) * R(0.08, 0.28) * s; pz += Math.sin(a) * R(0.08, 0.28) * s; py += R(0.36, 0.58) * s;
        a += R(-0.6, 0.6); pts.push(new T.Vector3(px, py, pz));
      }
      add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 20, 0.065 * s * (b === 0 ? 1.4 : 1), 7, false), MT.bark));
      tips.push(pts[4], pts[3], pts[2]);
    }
    const count = isMobile ? 1400 : 2200;
    const leafGeo = new T.PlaneGeometry(0.11 * s, 0.026 * s);
    const im = new T.InstancedMesh(leafGeo, MT.leaf, count);
    const q = new T.Object3D(), col = new T.Color();
    for (let i = 0; i < count; i++) {
      const tp = tips[i % tips.length];
      const rr = R(0.05, 0.6) * s, a = R(0, 6.28);
      q.position.set(tp.x + Math.cos(a) * rr, tp.y + R(-0.35, 0.45) * s, tp.z + Math.sin(a) * rr);
      q.rotation.set(R(-1.2, 1.2), R(0, 6.28), R(-0.9, 0.9));
      q.updateMatrix(); im.setMatrixAt(i, q.matrix);
      col.setHSL(R(0.18, 0.24), R(0.22, 0.4), rnd() < 0.3 ? R(0.38, 0.5) : R(0.2, 0.3)); im.setColorAt(i, col);
    }
    add(im);
  });
  return g;
}

function palm(x, z, h) {
  const g = group(x, -0.05, z, R(0, 6), shell);
  within(g, () => {
    const lean = R(-0.15, 0.15);
    const pts = [new T.Vector3(0, 0, 0), new T.Vector3(lean * h * 0.3, h * 0.5, 0), new T.Vector3(lean * h, h, 0)];
    add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 10, 0.2, 10, false), MT.palmTrunk));
    const top = pts[2];
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      const fg = new T.PlaneGeometry(0.55, 2.8, 4, 8);
      const pos = fg.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const yy = pos.getY(v) + 1.4, xx = pos.getX(v);
        pos.setZ(v, -yy * yy * 0.12 - Math.abs(xx) * 0.4);
        pos.setX(v, xx * (1 - yy / 3));
        pos.setY(v, yy);
      }
      fg.computeVertexNormals();
      const f = new T.Mesh(fg, MT.palmLeaf);
      f.position.copy(top); f.rotation.set(-0.6 - R(0, 0.3), a, 0, 'YXZ');
      add(f);
    }
  });
}

// ------------------------------------------------------------------
// BUILDING SHELL — everything is in drawing coordinates:
// x 0..W along the plan (left → right), z 0..D down the plan
// (z = 0 is the glazed facade at the top of the drawings, z = D the back wall).
// Dimensions from the KSTALT wall-installation and door plans.
// ------------------------------------------------------------------
function rectFloor(x0, x1, z0, z1, y, mat) { return plane(x1 - x0, z1 - z0, mat, (x0 + x1) / 2, y, (z0 + z1) / 2, -Math.PI / 2); }
function rectCeil(x0, x1, z0, z1, y, mat) { return plane(x1 - x0, z1 - z0, mat, (x0 + x1) / 2, y, (z0 + z1) / 2, Math.PI / 2); }
// first-floor slab = full plan minus the stair void (two rectangles)
const SLAB = [[0, S2X0, 0, D], [S2X0, VB_X0, 0, S1Z1], [VB_X0, W, 0, VB_Z0]];

/**
 * A straight wall with openings.  axis 'x' = wall runs along x at z = c,
 * axis 'z' = runs along z at x = c.  side = +1/-1: which way the thickness grows.
 * openings: [from, to, sill, head] in wall-local metres (relative to y0).
 */
function wallRun(axis, c, a0, a1, y0, h, t, side, mat, openings) {
  const ops = (openings || []).slice().sort((p, q) => p[0] - q[0]);
  const piece = (u0, u1, v0, v1) => {
    if (u1 - u0 < 0.005 || v1 - v0 < 0.005) return;
    const cu = (u0 + u1) / 2, cv = y0 + (v0 + v1) / 2, cc = c + side * t / 2;
    if (axis === 'x') box(u1 - u0, v1 - v0, t, mat, cu, cv, cc);
    else box(t, v1 - v0, u1 - u0, mat, cc, cv, cu);
  };
  let u = a0;
  ops.forEach((o) => {
    piece(u, o[0], 0, h);
    piece(o[0], o[1], 0, o[2]);
    piece(o[0], o[1], o[3], h);
    u = o[1];
  });
  piece(u, a1, 0, h);
}
/** glazing + bronze frame for an opening in a wall run */
function windowUnit(axis, c, u0, u1, y0, sill, head, mullions, curtains) {
  const len = u1 - u0, cu = (u0 + u1) / 2, h = head - sill, cy = y0 + (sill + head) / 2;
  const B = (w, hh, d, mat, u, y, off) => axis === 'x' ? box(w, hh, d, mat, u, y, c + off) : box(d, hh, w, mat, c + off, y, u);
  B(len, h, 0.02, MT.glass, cu, cy, 0);
  const n = mullions || Math.max(1, Math.round(len / 1.0));
  for (let k = 0; k <= n; k++) B(0.05, h, 0.09, MT.bronze, u0 + k * len / n, cy, 0);
  B(len, 0.05, 0.1, MT.bronze, cu, y0 + sill + 0.025, 0);
  B(len, 0.05, 0.1, MT.bronze, cu, y0 + head - 0.025, 0);
  B(len + 0.1, 0.03, 0.22, MT.travBlock, cu, y0 + sill - 0.015, 0);
  if (curtains) {
    for (let k = 0; k < 4; k++) {
      const off = 0.32;
      if (axis === 'x') cyl(0.06, 0.06, h + 0.2, MT.sandFab, u0 - 0.2 + k * 0.07, y0 + sill - 0.1, c + off + Math.sin(k * 2) * 0.03, 12);
    }
  }
}

function buildShell() {
  target = shell;
  // floors and ceilings
  rectFloor(0, W, 0, D, 0, MT.trav);
  SLAB.forEach((r) => {
    rectFloor(r[0], r[1], r[2], r[3], F1, MT.trav);
    slatCeiling(r[0], r[1], r[2], r[3], G_CEIL, 'x');
    rectCeil(r[0], r[1], r[2], r[3], G_CEIL + 0.12, MT.ceilDark);
  });
  // slab edges round the void
  box(VB_X0 - S2X0, F1 - G_CEIL, 0.06, MT.oak, (S2X0 + VB_X0) / 2, (F1 + G_CEIL) / 2, S1Z1);
  box(0.06, F1 - G_CEIL, D - S1Z1, MT.oak, S2X0, (F1 + G_CEIL) / 2, (S1Z1 + D) / 2);
  box(0.06, F1 - G_CEIL, S1Z1 - VB_Z0, MT.oak, VB_X0, (F1 + G_CEIL) / 2, (VB_Z0 + S1Z1) / 2);
  box(W - VB_X0, F1 - G_CEIL, 0.06, MT.oak, (VB_X0 + W) / 2, (F1 + G_CEIL) / 2, VB_Z0);
  // first floor ceiling: slats over the open studio, oak elsewhere
  slatCeiling(5.11, 11.3, 0, D, F1_CEIL, 'z');
  rectCeil(0, 5.11, 0, D, F1_CEIL, MT.oakPanel);
  rectCeil(11.3, W, 0, D, F1_CEIL, MT.oakPanel);
  rectCeil(0, W, 0, D, F1_CEIL + 0.12, MT.ceilDark);
  for (let tz = 1.6; tz < D; tz += 2.0) {
    box(W - 1.5, 0.04, 0.05, MT.blackMetal, W / 2 - 0.3, G_CEIL - 0.03, tz);
    for (let s = 0; s < 6; s++) cyl(0.03, 0.03, 0.12, MT.blackMetal, 1.5 + s * 3.0, G_CEIL - 0.17, tz, 12);
  }

  // ---- outer walls (ground band 0..F1, upper band F1..top) ----
  const T_W = 0.3, TOP = F1_CEIL + 0.3;
  // facade (z = 0): five windows on each floor
  const gWin = WIN.map((w) => [w[0], w[1], 0.1, 3.0]);
  const uWin = WIN.map((w) => [w[0], w[1], 0.15, 2.9]);
  wallRun('x', 0, -T_W, W + T_W, 0, F1, T_W, -1, MT.plaster, gWin);
  wallRun('x', 0, -T_W, W + T_W, F1, TOP - F1, T_W, -1, MT.plaster, uWin);
  WIN.forEach((w) => { windowUnit('x', -0.12, w[0], w[1], 0, 0.1, 3.0, 2, true); windowUnit('x', -0.12, w[0], w[1], F1, 0.15, 2.9, 2, false); });
  // back wall (z = D): solid downstairs, one window in the meeting room
  wallRun('x', D, -T_W, W + T_W, 0, F1, T_W, 1, MT.plaster, []);
  wallRun('x', D, -T_W, W + T_W, F1, TOP - F1, T_W, 1, MT.plaster, [[BACK_WIN[0], BACK_WIN[1], 0.15, 2.9]]);
  windowUnit('x', D + 0.12, BACK_WIN[0], BACK_WIN[1], F1, 0.15, 2.9, 2, false);
  // left end (x = 0): entrance doors in the middle + two windows downstairs; upstairs the openings are closed
  wallRun('z', 0, 0, D, 0, F1, T_W, -1, MT.plaster, [[LWIN[0][0], LWIN[0][1], 0.3, 2.9], [DOOR_Z0, DOOR_Z1, 0, 2.9], [LWIN[1][0], LWIN[1][1], 0.3, 2.9]]);
  wallRun('z', 0, 0, D, F1, TOP - F1, T_W, -1, MT.plaster, []);
  LWIN.forEach((w) => windowUnit('z', -0.12, w[0], w[1], 0, 0.3, 2.9, 1, false));
  // right end (x = W): solid
  wallRun('z', W, 0, D, 0, TOP, T_W, 1, MT.plaster, []);
  // exterior stone skin with the same openings
  wallRun('x', -T_W, -T_W - 0.04, W + T_W + 0.04, 0, F1, 0.04, -1, MT.facadeStone, gWin);
  wallRun('x', -T_W, -T_W - 0.04, W + T_W + 0.04, F1, TOP - F1, 0.04, -1, MT.facadeStone, uWin);
  wallRun('z', -T_W, -T_W, D + T_W, 0, F1, 0.04, -1, MT.facadeStone, [[LWIN[0][0], LWIN[0][1], 0.3, 2.9], [DOOR_Z0, DOOR_Z1, 0, 2.9], [LWIN[1][0], LWIN[1][1], 0.3, 2.9]]);
  wallRun('z', -T_W, -T_W, D + T_W, F1, TOP - F1, 0.04, -1, MT.facadeStone, []);
  box(W + 0.8, 0.35, D + 0.8, MT.oak, W / 2, TOP + 0.17, D / 2);
  box(W + 0.7, 0.3, 0.12, MT.oak, W / 2, F1 + 0.05, -T_W - 0.08);
  box(0.12, 0.3, D + 0.7, MT.oak, -T_W - 0.08, F1 + 0.05, D / 2);
  // skirting
  boxB(W, 0.06, 0.02, MT.bronze, W / 2, 0, D - 0.01);
  boxB(W, 0.06, 0.02, MT.bronze, W / 2, F1, D - 0.01);

  entranceDoor();
  buildStair();

  // outside: paving along the facade and the entrance end, hedges, palms
  const sky = new T.Mesh(new T.SphereGeometry(100, 32, 16), MT.sky);
  sky.position.set(W / 2, 0, D / 2); shell.add(sky);
  plane(220, 220, MT.ground, W / 2, -0.06, D / 2, -Math.PI / 2);
  boxB(W + 6, 0.06, 2.6, MT.travBlock, W / 2 - 1.5, -0.06, -1.6);
  boxB(3.2, 0.06, D + 3, MT.travBlock, -1.9, -0.06, D / 2 - 1);
  boxB(W + 6, 1.4, 1.0, MT.hedge, W / 2 - 1, -0.05, -3.5);
  boxB(1.0, 1.4, 2.6, MT.hedge, -4.0, -0.05, 0.5);
  boxB(1.0, 1.4, 3.0, MT.hedge, -4.0, -0.05, 7.2);
  [[-1.5, DOOR_Z0 - 0.7], [-1.5, DOOR_Z1 + 0.7]].forEach((p) => { cyl(0.42, 0.36, 0.8, MT.charcoal, p[0], -0.05, p[1], 28); });
  oliveTree(-1.5, DOOR_Z0 - 0.7, 0.75, 0.55);
  oliveTree(-1.5, DOOR_Z1 + 0.7, 0.75, 0.55);
  palm(2.5, -6.5, 8.5); palm(8.0, -8.0, 9.5); palm(14.5, -6.2, 8); palm(19.5, -7.5, 10); palm(-7, -4, 9); palm(-8, 6, 8.5); palm(-6.5, 12, 9.5);
  [[-6, -30, 18, 7], [14, -36, 22, 9], [36, -28, 14, 6], [-30, 4, 10, 8], [W / 2, 22, 40, 12]].forEach((b) => boxB(b[2], b[3], 8, MT.cream, b[0], -0.05, b[1]));
}

function entranceDoor() {
  const z0 = DOOR_Z0, z1 = DOOR_Z1, cz = (z0 + z1) / 2, wl = (z1 - z0) / 2;
  // frame
  boxB(0.34, 0.08, z1 - z0 + 0.1, MT.bronze, -0.15, 2.9, cz);
  boxB(0.34, 2.9, 0.06, MT.bronze, -0.15, 0, z0); boxB(0.34, 2.9, 0.06, MT.bronze, -0.15, 0, z1);
  // two glass leaves swung inwards
  [[z0, 1], [z1, -1]].forEach((p) => {
    const g = group(0.02, 0, p[0], p[1] > 0 ? Math.PI / 2 - 0.25 : -(Math.PI / 2 - 0.25));
    within(g, () => {
      boxB(0.03, 2.85, wl - 0.04, MT.glass, 0, 0.02, p[1] * wl / 2);
      boxB(0.05, 2.85, 0.05, MT.bronze, 0, 0.02, p[1] * (wl - 0.03));
      boxB(0.05, 2.85, 0.05, MT.bronze, 0, 0.02, p[1] * 0.025);
      boxB(0.05, 0.06, wl, MT.bronze, 0, 0.02, p[1] * wl / 2); boxB(0.05, 0.06, wl, MT.bronze, 0, 2.81, p[1] * wl / 2);
      boxB(0.04, 1.2, 0.03, MT.brass, 0.06, 0.6, p[1] * (wl - 0.14));
    });
  });
  // canopy + lettering band + step
  boxB(1.8, 0.14, z1 - z0 + 1.6, MT.oak, -1.0, 3.05, cz);
  box(0.02, 0.012, z1 - z0 + 1.4, MT.led, -1.88, 3.04, cz);
  boxB(1.5, 0.06, z1 - z0 + 0.6, MT.marbleWarm, -0.9, -0.05, cz);
  // marble inlay inside the entrance (as drawn on the plan)
  boxB(2.0, 0.006, z1 - z0, MT.marbleWarm, 1.0, 0, cz);
  boxB(2.04, 0.004, z1 - z0 + 0.04, MT.bronze, 1.0, 0, cz);
  fpRect(0, 0, z0, 2.0, z1, 'rug');
}

function slatCeiling(x0, x1, z0, z1, y, along) {
  const gap = 0.1, w = 0.04, d = 0.09;
  const span = along === 'x' ? (x1 - x0) : (z1 - z0);
  const len = along === 'x' ? (z1 - z0) : (x1 - x0);
  const count = Math.floor(span / gap);
  if (count < 1) return;
  const im = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), MT.slat, count);
  const q = new T.Object3D();
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) * gap;
    if (along === 'x') { q.position.set(x0 + s, y + d / 2, (z0 + z1) / 2); q.scale.set(w, d, len); }
    else { q.position.set((x0 + x1) / 2, y + d / 2, z0 + s); q.scale.set(len, d, w); }
    q.updateMatrix(); im.setMatrixAt(i, q.matrix);
  }
  shell.add(im);
}

/** L-shaped stair: flight 1 along the right wall towards the back, corner landing, flight 2 along the back wall to the left */
function buildStair() {
  const n1 = 12, n2 = 12;
  const r1 = H1 / n1, t1 = (S1Z1 - S1Z0) / n1, w1x0 = S1X0 + 0.05, w1x1 = W - 0.05, c1 = (w1x0 + w1x1) / 2, w1 = w1x1 - w1x0;
  for (let i = 0; i < n1; i++) {
    const y = (i + 1) * r1, z = S1Z0 + (i + 0.5) * t1;
    box(w1, 0.05, t1 + 0.02, MT.travBlock, c1, y - 0.025, z);
    box(w1, r1, 0.02, MT.travBlock, c1, y - r1 / 2, z - t1 / 2);
    box(w1 - 0.1, 0.01, 0.02, MT.led, c1, y - 0.06, z - t1 / 2 - 0.012);
  }
  const len1 = Math.hypot(H1, S1Z1 - S1Z0);
  const u1 = box(w1, 0.1, len1, MT.plaster, c1, H1 / 2 - 0.2, (S1Z0 + S1Z1) / 2); u1.rotation.x = -Math.atan2(H1, S1Z1 - S1Z0);
  // landing in the back-right corner
  boxB(W - S1X0, 0.2, D - S1Z1, MT.travBlock, (S1X0 + W) / 2, H1 - 0.2, (S1Z1 + D) / 2);
  // flight 2: along the back wall, rising towards the left
  const r2 = (F1 - H1) / n2, t2 = (S1X0 - S2X0) / n2, z0 = S1Z1 + 0.05, z1 = D - 0.05, c2 = (z0 + z1) / 2, w2 = z1 - z0;
  for (let i = 0; i < n2; i++) {
    const y = H1 + (i + 1) * r2, x = S1X0 - (i + 0.5) * t2;
    box(t2 + 0.02, 0.05, w2, MT.travBlock, x, y - 0.025, c2);
    box(0.02, r2, w2, MT.travBlock, x + t2 / 2, y - r2 / 2, c2);
    box(0.02, 0.01, w2 - 0.1, MT.led, x + t2 / 2 + 0.012, y - 0.05, c2);
  }
  // enclosure under flight 2 (the rounded wall seen from the kitchen)
  box(S1X0 - S2X0 - 0.3, G_CEIL, 0.12, MT.beigeLacquer, (S2X0 + 0.3 + S1X0) / 2, G_CEIL / 2, S1Z1 - 0.06);
  const rc = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, G_CEIL, 32, 1, false, Math.PI, Math.PI / 2), MT.beigeLacquer);
  rc.position.set(S2X0 + 0.3, G_CEIL / 2, S1Z1 + 0.24); add(rc);
  box(0.12, G_CEIL, D - S1Z1 - 0.24, MT.beigeLacquer, S2X0 + 0.06, G_CEIL / 2, (S1Z1 + 0.24 + D) / 2);
  // stair side of the kitchen wall: blue arched niche + oak block at the foot (as in the render)
  const niche = new T.Shape();
  niche.moveTo(-0.4, 0); niche.lineTo(-0.4, 1.3); niche.absarc(0, 1.3, 0.4, Math.PI, 0, true); niche.lineTo(0.4, 0); niche.closePath();
  const nm = new T.Mesh(new T.ExtrudeGeometry(niche, { depth: 0.03, bevelEnabled: false, curveSegments: 24 }), MT.blueLacquer);
  nm.rotation.y = Math.PI / 2; nm.position.set(KW_X1 + 0.005, 0, S1Z0 + 0.35); add(nm);
  rbox(0.3, 1.05, 0.6, 0.12, MT.oak, KW_X1 + 0.16, 0, S1Z0 + 0.35);
  // sculptural sconces on the right wall along flight 1
  [[0.9, 2.6], [1.25, 3.4], [1.45, 3.9], [1.8, 4.7], [2.3, 5.6]].forEach((p, i) => {
    const m = new T.Mesh(new T.TorusGeometry(0.11, 0.022, 10, 32), MT.bronze);
    m.position.set(W - 0.04, p[0] + 1.0, p[1]); m.rotation.y = Math.PI / 2; add(m);
    const l = new T.Mesh(new T.CircleGeometry(0.09, 24), MT.glow);
    l.position.set(W - 0.035, p[0] + 1.0, p[1]); l.rotation.y = -Math.PI / 2; add(l);
    if (i < 4) { const a = box(0.02, 0.02, 0.5, MT.bronze, W - 0.04, p[0] + 1.25, p[1] + 0.3); a.rotation.x = -0.7; }
  });
  // first floor: floor-recessed glass railing h 1100 along the void
  box(17.93 - S2X0, 1.1, 0.02, MT.glass, (S2X0 + 17.93) / 2, F1 + 0.55, S1Z1 + 0.02);
  box(17.93 - S2X0, 0.04, 0.05, MT.bronze, (S2X0 + 17.93) / 2, F1 + 1.1, S1Z1 + 0.02);
  fpRect(0, S1X0, S1Z0, W, S1Z1, 's'); fpRect(0, S1X0, S1Z1, W, D, 's'); fpRect(0, S2X0, S1Z1, S1X0, D, 'w');
  fpRect(1, S2X0, S1Z1, W, D, 's'); fpRect(1, VB_X0, VB_Z0, W, S1Z1, 's');
}

// ------------------------------------------------------------------
// GROUND FLOOR (planning sheet)
// ------------------------------------------------------------------
function buildGround() {
  target = floors[0];
  const f = 0;

  // --- Entrance + reception (left end) -----------------------------
  // back wall behind the reception: woven leather, coffee bar, three framed pieces
  box(3.2, G_CEIL, 0.04, MT.weave, 1.6, G_CEIL / 2, D - 0.02);
  box(2.4, 2.2, 0.05, MT.beigeLacquer, 1.55, 1.75, D - 0.05);
  rbox(2.3, 0.9, 0.6, 0.04, MT.blueLacquer, 1.55, 0, D - 0.33);
  boxB(2.36, 0.05, 0.66, MT.marbleWarm, 1.55, 0.9, D - 0.34);
  boxB(1.8, 0.02, 0.25, MT.oak, 1.55, 1.55, D - 0.16); boxB(1.8, 0.02, 0.25, MT.oak, 1.55, 1.2, D - 0.16);
  const rowG = group(0.7, 1.22, D - 0.16, 0); within(rowG, () => bookRow(0, 0, 0, 0.55, 0.3, 0.16));
  [[0.95, 0], [1.55, 1], [2.15, 2]].forEach((a) => {
    boxB(0.42, 0.55, 0.03, MT.art[a[1]], a[0], 1.9, D - 0.08);
    boxB(0.47, 0.6, 0.02, MT.white, a[0], 1.875, D - 0.065);
  });
  carafe(0.75, 0.95, D - 0.35, 1.1); carafe(1.0, 0.95, D - 0.35, 1.1);
  boxB(0.28, 0.36, 0.32, MT.mirror, 2.3, 0.95, D - 0.33); boxB(0.2, 0.06, 0.26, MT.blackMetal, 2.3, 1.0, D - 0.35);
  [1.4, 1.52, 1.64].forEach((x) => lathe([[0.001, 0], [0.03, 0], [0.04, 0.07], [0.036, 0.07], [0.026, 0.008], [0.001, 0.008]], MT.ceramic, x, 0.95, D - 0.4, 16));
  blob(1.55, 0, D - 0.35, 2.6, 1.0);
  fpRect(f, 0.4, D - 0.66, 2.7, D);
  // curved reception desk "Colors of Living" facing the entrance
  const dcx = 1.6, dcz = 6.2, da0 = Math.PI * 1.05, da1 = Math.PI * 1.9;
  sector(dcx, dcz, 0.95, 1.3, da0, Math.PI * 1.6, 0.06, 1.02, MT.marbleWarm, 0.02);
  sector(dcx, dcz, 0.95, 1.36, Math.PI * 1.6, da1, 0.06, 1.02, MT.marbleBlue, 0.02);
  sector(dcx, dcz, 0.9, 1.25, da0, da1, 0, 0.06, MT.bronze, 0);
  sector(dcx, dcz, 1.26, 1.3, da0, Math.PI * 1.6, 0.05, 0.012, MT.led, 0);
  sector(dcx, dcz, 0.85, 1.42, da0 - 0.03, da1 + 0.03, 1.08, 0.04, MT.marbleBlue, 0.01);
  const tx = new T.Mesh(new T.CylinderGeometry(1.305, 1.305, 0.3, 64, 1, true, Math.PI * 0.78, Math.PI * 0.44), MT.deskText);
  tx.position.set(dcx, 0.62, dcz); add(tx);
  blob(dcx, 0, dcz - 0.8, 2.8, 1.6);
  fpArc(f, dcx, dcz, 0.95, 1.36, da0, da1);
  diningChair(dcx, dcz + 0.3, 0, MT.leather);
  boxB(0.5, 0.012, 0.32, MT.paper, dcx - 0.3, 1.12, dcz - 1.05, 0.2);
  // olive tree + round lounge chair (top-left corner)
  oliveTree(0.95, 0.78, 0, 1.1);
  fpCirc(f, 0.95, 0.78, 0.5);
  cyl(1.05, 1.05, 0.015, MT.rugDark, 1.95, 0, 1.7, 64);
  const rc = group(1.95, 0, 1.7, -2.4);
  within(rc, () => {
    cyl(0.62, 0.62, 0.38, MT.oliveFab, 0, 0.08, 0, 48);
    cyl(0.58, 0.58, 0.08, MT.leatherDark, 0, 0, 0, 40);
    const back = new T.Mesh(new T.CylinderGeometry(0.66, 0.66, 0.72, 40, 1, false, Math.PI * 0.75, Math.PI * 1.1), MT.leather);
    back.position.set(0, 0.42, 0); add(back);
    pillow(-0.2, 0.46, -0.38, MT.leather, 0.3); strapPillow(0.22, 0.46, -0.36, MT.oliveFab, -0.3); pillow(0, 0.5, -0.46, MT.weave, 0);
    blob(0, 0.016, 0, 1.6, 1.6);
  });
  fpCirc(f, 1.95, 1.7, 0.66);
  sideTable(2.95, 0.85);
  carafe(2.95, 0.46, 0.9, 0.8); glassCup(2.83, 0.46, 0.78);

  // --- Living zone 1: round sofa on a round rug -------------------
  const cx = 5.3, cz = 4.55;
  cyl(2.12, 2.12, 0.015, MT.rug, cx, 0, cz, 96);
  cyl(2.19, 2.19, 0.01, MT.leatherDark, cx, 0, cz, 96);
  fpCirc(f, cx, cz, 2.12, 'rug');
  const arcs = [[Math.PI * 1.25, Math.PI * 1.73], [Math.PI * 1.8, Math.PI * 2.17]];
  arcs.forEach((a) => {
    sector(cx, cz, 1.95, 2.75, a[0], a[1], 0.09, 0.36, MT.boucle, 0.08);
    sector(cx, cz, 2.5, 2.85, a[0], a[1], 0.09, 0.86, MT.boucle, 0.11);
    sector(cx, cz, 1.93, 2.87, a[0], a[1], 0, 0.1, MT.leather, 0.02);
    sector(cx, cz, 2.84, 2.9, a[0], a[1], 0.12, 0.7, MT.leather, 0.01);
    fpArc(f, cx, cz, 1.95, 2.9, a[0], a[1]);
    const n = Math.round((a[1] - a[0]) / 0.3);
    for (let k = 0; k < n; k++) {
      const ang = a[0] + (a[1] - a[0]) * (k + 0.5) / n;
      const px = cx + Math.cos(ang) * 2.5, pz = cz + Math.sin(ang) * 2.5;
      const mats = [MT.boucle, MT.slateFab, MT.leather];
      const p = k % 3 === 1 ? strapPillow(px, 0.44, pz, MT.boucle, 0) : pillow(px, 0.44, pz, mats[k % 3], 0, -0.3);
      p.rotation.y = -Math.PI / 2 - ang;
      if (k % 2 === 0) { const st = boxB(0.06, 0.8, 0.03, MT.leather, cx + Math.cos(ang + 0.08) * 2.88, 0.1, cz + Math.sin(ang + 0.08) * 2.88); st.rotation.y = -Math.PI / 2 - (ang + 0.08); }
    }
    for (let k = 0; k <= 8; k++) { const ang = a[0] + (a[1] - a[0]) * k / 8; blob(cx + Math.cos(ang) * 2.4, 0.015, cz + Math.sin(ang) * 2.4, 1.4, 1.4); }
  });
  [[Math.PI, 1.55, chunkyChair], [Math.PI * 0.64, 1.4, loungeChair]].forEach((c) => {
    const px = cx + Math.cos(c[0]) * c[1], pz = cz + Math.sin(c[0]) * c[1];
    const ch = c[2](px, pz, 0);
    ch.rotation.y = Math.atan2(cx - px, cz - pz);
    ch.position.y = 0.015;
    fpCirc(f, px, pz, 0.5);
  });
  roundTable(5.0, 3.55, 0.32, 0.46, MT.marbleWarm, MT.blueLacquer, f);
  roundTable(5.75, 3.45, 0.5, 0.38, MT.marbleWarm, MT.leatherDark, f);
  roundTable(6.35, 5.1, 0.5, 0.38, MT.marbleWarm, MT.bronze, f);
  bookStack(5.65, 0.38, 3.4, 0.32, 0.3, 3); sculpture(5.65, 0.48, 3.4, 0.9);
  tray(6.4, 0.38, 5.0, 0.2); carafe(6.4, 0.405, 5.0, 0.85); glassCup(6.55, 0.405, 5.15);
  bowl(5.0, 0.46, 3.55, 0.13, MT.bronze);
  // full-height shelving with blue quartzite on the facade pier + low console under the next window
  shelving(3.35, 5.5, 0, 0, 3.5, 0.42, MT.marbleBlue, { rows: 6, col: 1.05 });
  fpRect(f, 3.35, 0, 5.5, 0.42);
  rbox(2.4, 0.5, 0.42, 0.03, MT.walnut, 6.8, 0, 0.24);
  boxB(2.44, 0.04, 0.46, MT.marbleBlue, 6.8, 0.5, 0.24);
  vase(6.1, 0.54, 0.25, 0.4, MT.stoneware); bookStack(7.0, 0.54, 0.25, 0.3, 0.1, 3); sculpture(7.6, 0.54, 0.25, 1.1);
  fpRect(f, 5.6, 0, 8.0, 0.45);
  // TV wall on the back wall: beige panel, TV, sideboard, round étagères
  box(6.0, G_CEIL, 0.04, MT.weave, 6.6, G_CEIL / 2, D - 0.02);
  box(4.2, 2.6, 0.06, MT.beigeLacquer, 6.6, 1.3 + 0.35, D - 0.05);
  box(1.9, 1.07, 0.05, MT.black, 6.6, 1.65, D - 0.1);
  rbox(4.6, 0.45, 0.45, 0.03, MT.walnut, 6.6, 0.0, D - 0.25);
  boxB(4.6, 0.03, 0.47, MT.marbleWarm, 6.6, 0.45, D - 0.25);
  vase(5.0, 0.48, D - 0.25, 0.35, MT.ceramic); bookStack(8.0, 0.48, D - 0.25, 0.3, 0.2, 3); bowl(7.4, 0.48, D - 0.25, 0.14, MT.bronze);
  [4.0, 9.2].forEach((ex) => cageShelf(ex, 0.5, D - 0.32, 2.4));
  blob(6.6, 0, D - 0.3, 5.2, 1.0);
  fpRect(f, 3.8, D - 0.5, 9.5, D);
  // pearl garlands over the round sofa
  const y = G_CEIL - 0.02;
  garland([3.4, y, 3.0], [7.4, y, 5.6], 0.9);
  garland([3.6, y, 5.9], [7.2, y, 2.6], 1.0);
  garland([4.6, y, 2.4], [6.1, y, 6.5], 0.95);
  garland([3.2, y, 4.4], [7.6, y, 4.6], 0.75);
  garland([5.3, y, 2.2], [7.8, y, 6.2], 0.6);
  garland([2.8, y, 5.8], [5.4, y, 2.3], 0.65);

  // --- Curved double shelving partition + amber glass screens -------
  shelving(0, 3.6, 0, 0, 3.5, 0.36, MT.marbleBlue, { rows: 6, col: 0.9, place: { x: 9.1, z: 1.9, ry: -Math.PI / 2 } });
  shelving(0, 3.6, 0, 0, 3.5, 0.36, MT.marbleBlue, { rows: 6, col: 0.9, place: { x: 9.1, z: 5.5, ry: Math.PI / 2 } });
  const pc = new T.Mesh(new T.CylinderGeometry(0.36, 0.36, 3.5, 32, 1, false, Math.PI / 2, Math.PI), MT.walnut);
  pc.position.set(9.1, 1.75, 1.9); add(pc);
  fpRect(f, 8.74, 1.55, 9.46, 5.5);
  const amber = (x, z, ry, list) => list.forEach((p) => {
    const s = new T.Shape(); s.absellipse(0, 0, p[2], p[3] / 2, 0, Math.PI * 2, false, 0);
    const m = new T.Mesh(new T.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3, curveSegments: 24 }), MT.amberGlass);
    m.position.set(x + Math.cos(ry) * p[1], p[0] + 0.3, z - Math.sin(ry) * p[1]); m.rotation.y = ry; add(m);
  });
  [[8.65, 5.52], [8.65, 5.92]].forEach((p) => boxB(0.03, 3.5, 0.03, MT.bronze, p[0], 0, p[1]));
  amber(8.65, 5.72, Math.PI / 2, [[0.4, -0.06, 0.13, 0.7], [1.2, 0.05, 0.14, 0.6], [2.0, -0.05, 0.13, 0.7], [2.7, 0.06, 0.12, 0.5]]);
  [[6.9, 1.0], [7.8, 1.0]].forEach((p) => boxB(0.03, 3.5, 0.03, MT.bronze, p[0], 0, p[1]));
  amber(7.35, 1.0, 0, [[0.5, -0.25, 0.3, 0.8], [1.4, 0.2, 0.34, 0.7], [2.3, -0.15, 0.28, 0.8], [3.0, 0.25, 0.22, 0.5]]);
  boxB(1.0, 0.04, 0.04, MT.bronze, 7.35, 3.48, 1.0);
  fpRect(f, 6.85, 0.95, 7.85, 1.05);

  // --- Living zone 2: L-sofa against the facade --------------------
  rbox(3.45, 0.42, 0.95, 0.12, MT.boucle, 12.48, 0.07, 0.95);
  rbox(3.45, 0.45, 0.28, 0.12, MT.boucle, 12.48, 0.47, 0.6);
  rbox(0.95, 0.42, 1.9, 0.12, MT.boucle, 11.08, 0.07, 2.4);
  rbox(0.28, 0.45, 1.9, 0.12, MT.boucle, 10.75, 0.47, 2.4);
  rbox(3.55, 0.08, 1.0, 0.025, MT.leather, 12.48, 0, 0.95);
  rbox(1.0, 0.08, 2.0, 0.025, MT.leather, 11.08, 0, 2.4);
  boxB(0.1, 0.8, 0.98, MT.leather, 14.25, 0.06, 0.95);
  boxB(0.98, 0.8, 0.1, MT.leather, 11.08, 0.06, 3.38);
  pillow(11.8, 0.5, 0.82, MT.leather, Math.PI); strapPillow(12.5, 0.5, 0.82, MT.boucle, Math.PI); pillow(13.3, 0.5, 0.82, MT.oliveFab, Math.PI);
  pillow(10.92, 0.5, 2.0, MT.slateFab, -Math.PI / 2);
  blob(12.48, 0, 0.95, 4.0, 1.5); blob(11.08, 0, 2.4, 1.5, 2.4);
  fpRect(f, 10.62, 0.45, 14.3, 1.45); fpRect(f, 10.62, 0.45, 11.55, 3.45);
  boxB(4.86, 0.012, 3.4, MT.rugGrey, 12.63, 0, 2.0);
  rbox(1.44, 0.36, 0.85, 0.08, MT.bronze, 13.15, 0.012, 2.42);
  fpRect(f, 12.43, 2.0, 13.87, 2.85);
  sideTable(14.05, 2.77);
  cyl(0.2, 0.22, 0.48, MT.walnut, 11.8, 0, 2.95, 24); cyl(0.24, 0.24, 0.02, MT.marbleWarm, 11.8, 0.48, 2.95, 32);
  vase(12.9, 0.37, 2.35, 0.3, MT.ceramic); bookStack(13.4, 0.37, 2.45, 0.28, 0.4, 2); bowl(13.1, 0.37, 2.6, 0.1, MT.stoneware);

  // --- Work table zone: grey cabinets on the back wall ---------------
  box(4.9, G_CEIL, 0.04, MT.weave, 12.65, G_CEIL / 2, D - 0.02);
  box(3.8, 2.6, 0.06, MT.beigeLacquer, 12.65, 1.3, D - 0.05);
  [11.6, 13.7].forEach((x) => {
    rbox(0.95, 1.05, 0.5, 0.02, MT.greyLacquer, x, 0.75, D - 0.32);
    boxB(0.92, 0.03, 0.46, MT.bronze, x, 0.72, D - 0.32);
    [[-0.43, -0.2], [0.43, -0.2], [-0.43, 0.2], [0.43, 0.2]].forEach((q) => boxB(0.025, 0.72, 0.025, MT.bronze, x + q[0], 0, D - 0.32 + q[1]));
    boxB(0.02, 0.3, 0.03, MT.brass, x - 0.05, 1.2, D - 0.585); boxB(0.02, 0.3, 0.03, MT.brass, x + 0.05, 1.2, D - 0.585);
    blob(x, 0, D - 0.35, 1.2, 0.8);
  });
  boxB(0.4, 1.6, 0.05, MT.walnut, 12.4, 0.2, D - 0.12); boxB(0.4, 1.6, 0.05, MT.walnut, 12.9, 0.2, D - 0.12);
  box(0.03, 1.4, 0.02, MT.led, 12.62, 1.0, D - 0.16); box(0.03, 1.4, 0.02, MT.led, 12.68, 1.0, D - 0.16);
  fpRect(f, 11.07, D - 0.6, 14.3, D);
  boxB(4.86, 0.012, 2.63, MT.rugGrey, 12.63, 0, 5.1);
  const tbl = group(12.69, 0, 5.06, 0);
  within(tbl, () => {
    rbox(2.55, 0.05, 1.02, 0.015, MT.marbleWarm, 0, 0.72, 0);
    rbox(0.1, 0.72, 0.7, 0.03, MT.bronze, -0.7, 0, 0); rbox(0.1, 0.72, 0.7, 0.03, MT.bronze, 0.7, 0, 0);
    boxB(0.42, 0.015, 0.3, MT.paper, 0.35, 0.77, 0.05, 0.15); boxB(0.43, 0.006, 0.31, MT.books[1], 0.35, 0.765, 0.05, 0.15);
    tray(-0.35, 0.77, 0.05, 0.18); glassCup(-0.4, 0.795, 0.0); glassCup(-0.3, 0.795, 0.1); carafe(-0.36, 0.795, 0.02, 0.7);
    branches(0.95, 0.77, -0.15, 0.5);
    blob(0, 0.013, 0, 3.2, 1.7);
  });
  fpRect(f, 11.41, 4.55, 13.96, 5.57);
  [[12.09, 4.3, Math.PI], [13.28, 4.3, Math.PI], [12.09, 5.85, 0], [13.28, 5.85, 0]].forEach((c) => diningChair(c[0], c[1], c[2], MT.suede, 0.46, 0.012));

  // --- Kitchen: island along the room, tall cabinet wall in front of the stair ---
  const isl = group(16.59, 0, 3.23, Math.PI / 2);
  within(isl, () => {
    rbox(3.48, 0.9, 1.02, 0.03, MT.marbleWarm, 0, 0.05, 0);
    boxB(3.38, 0.05, 0.92, MT.bronze, 0, 0, 0);
    boxB(3.5, 0.05, 0.4, MT.walnut, 0, 1.02, -0.62);
    boxB(0.06, 0.08, 0.36, MT.bronze, -1.2, 0.95, -0.62); boxB(0.06, 0.08, 0.36, MT.bronze, 1.2, 0.95, -0.62);
    boxB(0.6, 0.008, 0.42, MT.black, 0.6, 0.95, 0.12);
    vase(-0.6, 0.95, -0.2, 0.25, MT.glassSmoke);
    bowl(-1.1, 0.95, -0.15, 0.16, MT.ceramic);
    for (let i = 0; i < 4; i++) cyl(0.04, 0.04, 0.04, MT.clay, -1.1 + R(-0.05, 0.05), 1.0, -0.15 + R(-0.05, 0.05), 12);
    boxB(0.02, 0.6, 0.85, MT.walnut, 1.73, 0.15, 0);
    for (let p = 0; p < 8; p++) cyl(0.12, 0.11, 0.012, MT.ceramic, 1.6, 0.4 + p * 0.016, -0.18, 24);
    blob(0, 0, 0, 4.2, 1.8);
  });
  fpRect(f, 16.08, 1.49, 17.1, 4.97);
  [2.35, 3.23, 4.11].forEach((z) => diningChair(15.62, z, -Math.PI / 2, MT.suede, 0.72));
  const bl = branchLamp(16.6, G_CEIL, 3.23, 2.4); bl.rotation.y = Math.PI / 2 + 0.15;
  // tall cabinet wall (kitchen side) with lit niche and a marble counter
  boxB(KW_X1 - KW_X0, G_CEIL, KW_Z1 - KW_Z0 - 0.5, MT.beigeLacquer, (KW_X0 + KW_X1) / 2, 0, (KW_Z0 + 0.5 + KW_Z1) / 2);
  boxB(KW_X1 - KW_X0 - 0.5, G_CEIL, 0.5, MT.beigeLacquer, (KW_X0 + 0.5 + KW_X1) / 2, 0, KW_Z0 + 0.25);
  for (let z = KW_Z0 + 0.6; z < KW_Z1; z += 0.6) box(0.01, G_CEIL - 0.1, 0.006, MT.bronze, KW_X0 - 0.003, G_CEIL / 2, z);
  const kcv = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, G_CEIL, 32, 1, false, Math.PI, Math.PI / 2), MT.beigeLacquer);
  kcv.position.set(KW_X0 + 0.5, G_CEIL / 2, KW_Z0 + 0.5); add(kcv);
  boxB(0.4, 1.1, 2.0, MT.walnut, KW_X0 - 0.05, 1.0, 3.7);
  boxB(0.36, 1.0, 1.9, MT.ledSoft, KW_X0 - 0.06, 1.05, 3.7);
  for (let s = 0; s < 3; s++) boxB(0.38, 0.02, 1.9, MT.walnut, KW_X0 - 0.08, 1.05 + s * 0.33, 3.7);
  for (let s = 0; s < 3; s++) for (let k = 0; k < 8; k++) {
    const gz = 2.9 + k * 0.22, gy = 1.07 + s * 0.33;
    if (s === 1 && k > 4) { for (let p = 0; p < 6; p++) cyl(0.1, 0.09, 0.012, MT.ceramic, KW_X0 - 0.1, gy + p * 0.014, 4.3, 24); break; }
    if (s === 2 && k % 3 === 2) { vase(KW_X0 - 0.1, gy, gz, 0.2, MT.stoneware); continue; }
    lathe([[0.001, 0], [0.03, 0], [0.03, 0.005], [0.006, 0.01], [0.006, 0.09], [0.035, 0.12], [0.04, 0.2], [0.037, 0.2], [0.032, 0.13], [0.001, 0.1]], MT.glassSmoke, KW_X0 - 0.1, gy, gz, 16);
  }
  boxB(0.68, 0.9, 2.4, MT.marbleWarm, KW_X0 - 0.34, 0, 3.7);
  boxB(0.72, 0.05, 2.44, MT.marbleWarm, KW_X0 - 0.36, 0.9, 3.7);
  cyl(0.012, 0.012, 0.3, MT.brass, KW_X0 - 0.12, 0.95, 3.0, 12); box(0.18, 0.012, 0.012, MT.brass, KW_X0 - 0.2, 1.25, 3.0);
  lathe([[0.001, 0], [0.07, 0], [0.08, 0.1], [0.06, 0.2], [0.001, 0.2]], MT.ceramic, KW_X0 - 0.3, 0.95, 4.6, 20);
  fpRect(f, KW_X0 - 0.7, KW_Z0, KW_X1, KW_Z1, 'w');
  // sofa by the kitchen window + plants
  pottedPlant(14.9, 0, 6.8, 1.2);
  pottedPlant(9.9, 0, 0.5, 1.1);
  pottedPlant(0.5, 0, 2.5, 1.0);
}

function cageShelf(x, y0, z, h) {
  const r = 0.24, levels = 5;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; boxB(0.012, h, 0.012, MT.bronze, x + Math.cos(a) * r, y0, z + Math.sin(a) * r); }
  for (let l = 0; l < levels; l++) {
    const y = y0 + l * h / (levels - 1);
    const ring = new T.Mesh(new T.TorusGeometry(r, 0.008, 6, 40), MT.bronze); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z); add(ring);
    cyl(r - 0.01, r - 0.01, 0.012, MT.walnut, x, y - 0.006, z, 32);
    if (l < levels - 1) {
      const k = rnd();
      if (k < 0.45) { const g = group(x - 0.12, y + 0.006, z, R(-0.3, 0.3)); within(g, () => bookRow(0, 0, 0, 0.24, h / (levels - 1) - 0.06, 0.15)); }
      else if (k < 0.75) vase(x, y + 0.006, z, Math.min(0.4, h / (levels - 1) - 0.08), pick([MT.ceramic, MT.stoneware, MT.bronze]));
      else sculpture(x, y + 0.006, z, 0.9);
    }
  }
}
function branchLamp(x, ceil, z, span) {
  const g = group(x, ceil - 1.1, z, 0.3);
  within(g, () => {
    box(0.01, 1.1, 0.01, MT.blackMetal, 0, 0.55, 0);
    box(span, 0.03, 0.03, MT.bronze, 0, 0, 0);
    for (let i = 0; i < 16; i++) {
      const t = (i / 15 - 0.5) * span, a = R(-1.2, 1.2), l = R(0.18, 0.4);
      const b = box(l, 0.018, 0.018, MT.bronze, t + Math.cos(a) * l / 2, Math.sin(a) * l / 4, Math.sin(a) * l / 2);
      b.rotation.y = -a;
      const tube = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.24, 16), MT.glow);
      tube.position.set(t + Math.cos(a) * l, Math.sin(a) * l / 2, Math.sin(a) * l);
      tube.rotation.set(R(-1, 1), 0, R(-1.4, 1.4)); add(tube);
    }
  });
  return g;
}

// ------------------------------------------------------------------
// FIRST FLOOR (wall-installation plan + door plan)
// ------------------------------------------------------------------
function iwall(x0, z0, x1, z1, y0, h, mat, t) {   // interior wall between two points (axis-aligned)
  t = t || 0.12;
  if (Math.abs(z1 - z0) < 0.001) box(Math.abs(x1 - x0), h, t, mat, (x0 + x1) / 2, y0 + h / 2, z0);
  else box(t, h, Math.abs(z1 - z0), mat, x0, y0 + h / 2, (z0 + z1) / 2);
}
function swingDoor(x, z, along, width, y0, openSign, mat) {   // open leaf, hinge at (x,z)
  const g = group(x, y0, z, along === 'z' ? openSign * 1.3 : Math.PI / 2 + openSign * 1.3);
  within(g, () => {
    boxB(0.04, 2.1, width - 0.02, mat || MT.taupe, 0, 0.01, width / 2);
    boxB(0.02, 0.02, 0.14, MT.brass, 0.04, 1.0, width - 0.12);
  });
  return g;
}
function buildFirst() {
  target = floors[1];
  const f = 1, y0 = F1, H = F1_CEIL - F1;

  // --- walls ------------------------------------------------------
  // office | meeting divider (in the middle of the left rooms)
  iwall(0, 3.89, 4.54, 3.89, y0, H, MT.plaster, 0.15);
  fpRect(f, 0, 3.82, 4.54, 3.96, 'w');
  // solid partition with sliding glass doors SD-1 / SD-2
  iwall(4.54, 2.36, 4.54, 5.46, y0, H, MT.oakPanel, 0.12);
  iwall(4.54, 2.36, 5.11, 2.36, y0, H, MT.oakPanel, 0.12);
  iwall(4.54, 5.46, 5.11, 5.46, y0, H, MT.oakPanel, 0.12);
  fpRect(f, 4.48, 2.3, 5.11, 2.42, 'w'); fpRect(f, 4.48, 2.36, 4.6, 5.46, 'w'); fpRect(f, 4.48, 5.4, 5.11, 5.52, 'w');
  const slider = (z0, z1, parkFrom) => {
    box(0.08, H - 3.0, z1 - z0, MT.oakPanel, 5.11, y0 + 3.0 + (H - 3.0) / 2, (z0 + z1) / 2);   // bulkhead above 3000
    box(0.06, 0.05, z1 - z0, MT.bronze, 5.11, y0 + 2.98, (z0 + z1) / 2);
    const pz0 = parkFrom, pz1 = parkFrom + 0.85;
    [0, 0.05].forEach((o, i) => {
      boxB(0.02, 2.9, 0.85, MT.glassTint, 5.07 + o, y0 + 0.02, pz0 + 0.43 + i * 0.12);
      boxB(0.04, 2.9, 0.03, MT.bronze, 5.07 + o, y0 + 0.02, pz0 + 0.015 + i * 0.12);
      boxB(0.04, 2.9, 0.03, MT.bronze, 5.07 + o, y0 + 0.02, pz1 - 0.015 + i * 0.12);
    });
    fpRect(f, 5.06, z0, 5.16, z1, 'g');
  };
  slider(0, 2.36, 0.15);
  slider(5.46, D, 6.25);
  // shower glass partition (h 3200, 2500 wide)
  boxB(2.5, 3.2, 0.02, MT.glassTint, 8.7, y0, 1.55);
  boxB(2.54, 0.04, 0.05, MT.bronze, 8.7, y0 + 3.18, 1.55);
  boxB(0.04, 3.2, 0.05, MT.bronze, 7.45, y0, 1.55); boxB(0.04, 3.2, 0.05, MT.bronze, 9.95, y0, 1.55);
  fpRect(f, 7.45, 1.5, 9.95, 1.6, 'g');
  // toilet display niche at the top
  iwall(11.67, 0, 11.67, 1.2, y0, H, MT.marbleGrey, 0.1);
  iwall(12.0, 0, 12.0, 1.2, y0, H, MT.marbleGrey, 0.1);
  iwall(11.67, 1.2, 12.0, 1.2, y0, H, MT.marbleGrey, 0.1);
  fpRect(f, 11.62, 0, 12.05, 1.25, 'w');
  // central partition with display box and glass wardrobe
  iwall(11.33, 2.6, 11.33, 6.0, y0, H, MT.walnut, 0.12);
  fpRect(f, 11.27, 2.6, 11.39, 6.0, 'w');
  // headboard wall in the middle of the bedroom
  iwall(13.16, 2.84, 16.67, 2.84, y0, 2.9, MT.walnut, 0.15);
  fpRect(f, 13.16, 2.77, 16.67, 2.91, 'w');
  // service block: WC 1/2, wash area, tech kitchen
  const B = MT.plaster;
  iwall(17.93, 0, 17.93, 0.55, y0, H, B); iwall(17.93, 1.45, 17.93, 3.8, y0, H, B); iwall(17.93, 4.7, 17.93, 6.15, y0, H, B);
  box(0.12, H - 2.2, 0.9, B, 17.93, y0 + 2.2 + (H - 2.2) / 2, 1.0); box(0.12, H - 2.2, 0.9, B, 17.93, y0 + 2.2 + (H - 2.2) / 2, 4.25);
  iwall(17.93, 6.15, VB_X0, 6.15, y0, H, B);
  iwall(VB_X0, VB_Z0, VB_X0, S1Z1, y0, H, B);
  iwall(17.93, 3.25, W, 3.25, y0, H, B);
  iwall(17.93, 1.85, 18.45, 1.85, y0, H, B); iwall(19.3, 1.85, 19.95, 1.85, y0, H, B); iwall(20.75, 1.85, W, 1.85, y0, H, B);
  box(0.85, H - 2.2, 0.12, B, 18.875, y0 + 2.2 + (H - 2.2) / 2, 1.85); box(0.8, H - 2.2, 0.12, B, 20.35, y0 + 2.2 + (H - 2.2) / 2, 1.85);
  iwall(19.57, 1.85, 19.57, 3.25, y0, H, B);
  swingDoor(17.93, 1.45, 'z', 0.9, y0, -1, MT.taupe);
  swingDoor(17.93, 4.7, 'z', 0.9, y0, -1, MT.taupe);
  [[0.55, 1.45], [3.8, 4.7]].forEach((d) => { boxB(0.16, 2.2, 0.03, MT.bronze, 17.93, y0, d[0]); boxB(0.16, 2.2, 0.03, MT.bronze, 17.93, y0, d[1]); boxB(0.16, 0.03, d[1] - d[0], MT.bronze, 17.93, y0 + 2.2, (d[0] + d[1]) / 2); });
  fpRect(f, 17.87, 0, 17.99, 0.55, 'w'); fpRect(f, 17.87, 1.45, 17.99, 3.8, 'w'); fpRect(f, 17.87, 4.7, 17.99, 6.15, 'w');
  fpRect(f, 17.93, 6.09, VB_X0, 6.21, 'w'); fpRect(f, 17.93, 3.19, W, 3.31, 'w'); fpRect(f, 17.93, 1.79, W, 1.91, 'w'); fpRect(f, 19.51, 1.85, 19.63, 3.25, 'w');
  fpRect(f, VB_X0 - 0.06, VB_Z0, VB_X0 + 0.06, S1Z1, 'w');
  // inside the service rooms (seen through the open doors)
  box(W - 17.99, H, 0.03, MT.marbleBlue, (17.99 + W) / 2, y0 + H / 2, 0.02);
  rbox(1.2, 0.12, 0.5, 0.02, MT.marbleDark, 19.4, y0 + 0.82, 0.3); lathe([[0.001, 0], [0.18, 0], [0.2, 0.12], [0.001, 0.12]], MT.ceramic, 19.4, y0 + 0.94, 0.3, 24);
  boxB(1.0, 0.8, 0.02, MT.mirror, 19.4, y0 + 1.25, 0.06);
  [18.85, 20.35].forEach((x) => { rbox(0.38, 0.35, 0.55, 0.12, MT.ceramic, x, y0 + 0.35, 2.95); box(0.5, 1.1, 0.04, MT.marbleBlue, x, y0 + 1.0, 3.2); });
  boxB(1.5, 0.9, 0.6, MT.walnut, 18.75, y0, 5.75); boxB(1.55, 0.04, 0.62, MT.marbleGrey, 18.75, y0 + 0.9, 5.75);
  boxB(1.5, 0.8, 0.35, MT.walnut, 18.75, y0 + 1.6, 5.95);
  // left end: closed window openings, clad with decorative panels; TV wall in the meeting room
  box(0.04, H, D, MT.oakPanel, 0.02, y0 + H / 2, D / 2);

  // --- Office (top-left) ---------------------------------------------
  [[1.6, 1.5], [2.8, 1.5]].forEach((p) => {
    rbox(1.18, 0.04, 1.4, 0.01, MT.walnut, p[0], y0 + 0.72, p[1]);
    boxB(0.04, 0.72, 1.3, MT.bronze, p[0] - 0.56, y0, p[1]); boxB(0.04, 0.72, 1.3, MT.bronze, p[0] + 0.56, y0, p[1]);
    [-0.35, 0.35].forEach((dz) => {
      boxB(0.5, 0.32, 0.02, MT.black, p[0], y0 + 0.86, p[1] + dz * 0.25); boxB(0.06, 0.12, 0.06, MT.blackMetal, p[0], y0 + 0.76, p[1] + dz * 0.25);
      boxB(0.38, 0.012, 0.13, MT.charcoal, p[0], y0 + 0.76, p[1] + dz * 1.4);
    });
    cyl(0.035, 0.035, 0.09, MT.ceramic, p[0] - 0.4, y0 + 0.76, p[1] + 0.4, 16);
    diningChair(p[0], 0.55, Math.PI, MT.boucle, 0.46, y0 + 0.012);
    diningChair(p[0], 2.45, 0, MT.boucle, 0.46, y0 + 0.012);
  });
  blob(2.2, y0 + 0.013, 1.5, 3.0, 2.4);
  fpRect(f, 1.01, 0.8, 3.39, 2.2);
  boxB(4.2, 0.012, 2.8, MT.rugGrey, 2.2, y0, 1.6);
  // storage along the divider (office side) and display cabinets (meeting side)
  rbox(4.3, 2.4, 0.55, 0.01, MT.beigeLacquer, 2.27, y0, 3.53);
  for (let x = 0.4; x < 4.4; x += 0.72) box(0.006, 2.36, 0.01, MT.bronze, x, y0 + 1.2, 3.25);
  fpRect(f, 0.1, 3.25, 4.45, 3.82);
  shelving(0.1, 4.45, 0, y0, 2.4, 0.5, MT.marbleGrey, { rows: 4, col: 1.1, place: { x: 0, z: 3.96, ry: 0 } });
  fpRect(f, 0.1, 3.96, 4.45, 4.5);
  pottedPlant(4.1, y0, 0.45, 1.1);

  // --- Meeting room (bottom-left) -------------------------------------
  const tb = group(2.09, y0, 5.98, 0);
  within(tb, () => {
    rbox(2.3, 0.05, 1.1, 0.02, MT.marbleGrey, 0, 0.72, 0);
    [-0.7, 0.7].forEach((px) => {
      boxB(0.6, 0.04, 0.7, MT.bronze, px, 0.02, 0); boxB(0.6, 0.04, 0.7, MT.bronze, px, 0.68, 0);
      [[-0.28, -0.33], [0.28, -0.33], [-0.28, 0.33], [0.28, 0.33]].forEach((q) => boxB(0.03, 0.66, 0.03, MT.bronze, px + q[0], 0.04, q[1]));
    });
    tray(0, 0.77, 0, 0.28); carafe(-0.05, 0.795, 0, 0.9); glassCup(0.12, 0.795, 0.08); glassCup(0.1, 0.795, -0.1);
    [-0.7, 0, 0.7].forEach((px) => { boxB(0.3, 0.004, 0.22, MT.paper, px, 0.77, -0.33, 0.1); boxB(0.3, 0.004, 0.22, MT.paper, px, 0.77, 0.33, -0.1); });
    blob(0, 0.013, 0, 3.2, 2.4);
  });
  fpRect(f, 0.94, 5.43, 3.24, 6.53);
  [[1.39, 5.2, Math.PI], [2.09, 5.2, Math.PI], [2.79, 5.2, Math.PI], [1.39, 6.76, 0], [2.09, 6.76, 0], [2.79, 6.76, 0]].forEach((c) => diningChair(c[0], c[1], c[2], MT.leather, 0.46, y0 + 0.012));
  [[1.5, 5.85, 0.24], [2.1, 6.1, 0.3], [2.7, 5.8, 0.22], [2.4, 6.3, 0.2]].forEach((p) => {
    const yy = F1_CEIL - 0.75 - p[2];
    box(0.006, F1_CEIL - yy, 0.006, MT.brass, p[0], (F1_CEIL + yy) / 2, p[1]);
    const gm = new T.Mesh(new T.SphereGeometry(p[2], lod(32), lod(20)), MT.globe); gm.position.set(p[0], yy, p[1]); add(gm);
    box(0.025, p[2] * 1.4, 0.025, MT.led, p[0], yy, p[1]);
    cyl(0.03, 0.03, 0.03, MT.brass, p[0], yy + p[2] - 0.01, p[1], 12);
  });
  box(0.05, 0.95, 1.65, MT.black, 0.07, y0 + 1.45, 5.98);
  boxB(3.6, 0.012, 2.4, MT.rugGrey, 2.09, y0, 5.98);

  // --- Open studio: basins, shower, presentation table, freestanding tub, vanity ---
  rbox(1.4, 0.06, 0.55, 0.02, MT.marbleRed, 6.25, y0 + 0.85, 0.4);
  boxB(1.3, 0.75, 0.5, MT.walnut, 6.25, y0 + 0.1, 0.4);
  [5.9, 6.6].forEach((x) => { lathe([[0.001, 0], [0.16, 0], [0.2, 0.14], [0.18, 0.15], [0.14, 0.03], [0.001, 0.03]], MT.ceramic, x, y0 + 0.91, 0.42, 28); cyl(0.012, 0.012, 0.3, MT.bronze, x, y0 + 0.91, 0.18, 10); });
  fpRect(f, 5.55, 0.12, 6.95, 0.68);
  boxB(1.9, 0.08, 1.0, MT.marbleDark, 8.65, y0, 0.8);
  box(0.6, 0.02, 0.4, MT.led, 8.65, F1_CEIL - 0.05, 0.8);
  boxB(0.6, 0.03, 0.4, MT.blackMetal, 8.65, F1_CEIL - 0.08, 0.8);
  box(1.9, 2.6, 0.03, MT.marbleDark, 8.65, y0 + 1.3, 0.04);
  fpRect(f, 7.7, 0.3, 9.6, 1.3);
  const pt = group(7.72, y0, 3.95, Math.PI / 2);
  within(pt, () => {
    rbox(1.3, 0.82, 1.3, 0.04, MT.marbleRed, -0.6, 0.08, 0);
    rbox(1.2, 0.82, 1.25, 0.03, MT.glassTint, 0.66, 0.08, 0);
    for (let d = 0; d < 3; d++) boxB(1.1, 0.015, 1.22, MT.bronze, 0.66, 0.12 + d * 0.27, 0);
    rbox(2.6, 0.07, 1.45, 0.02, MT.travSlab, 0, 0.9, 0);
    boxB(0.8, 0.01, 0.5, MT.black, -0.5, 0.97, 0.2); boxB(0.8, 0.01, 0.5, MT.black, 0.5, 0.97, -0.2);
    boxB(2.4, 0.08, 1.2, MT.bronze, 0, 0, 0);
    for (let i = 0; i < 5; i++) boxB(0.2, 0.015, 0.28, pick([MT.marbleBlue, MT.marbleWarm, MT.marbleGrey, MT.marbleRed]), -1.0 + i * 0.24, 0.97, -0.4, R(-0.2, 0.2));
    blob(0, 0, 0, 3.4, 2.0);
  });
  fpRect(f, 6.95, 2.7, 8.5, 5.2);
  [3.2, 4.6].forEach((z) => {
    const tube = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1.4, 24), MT.glow);
    tube.rotation.x = Math.PI / 2; tube.position.set(7.72, F1_CEIL - 1.25, z); add(tube);
    [-0.7, -0.35, 0, 0.35, 0.7].forEach((o) => { const r = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.04, 24), MT.brass); r.rotation.x = Math.PI / 2; r.position.set(7.72, F1_CEIL - 1.25, z + o); add(r); });
    box(0.005, 1.2, 0.005, MT.blackMetal, 7.72, F1_CEIL - 0.6, z - 0.5); box(0.005, 1.2, 0.005, MT.blackMetal, 7.72, F1_CEIL - 0.6, z + 0.5);
  });
  const tub = lathe([[0.001, 0], [0.62, 0], [0.7, 0.2], [0.72, 0.55], [0.67, 0.57], [0.62, 0.15], [0.001, 0.12]], MT.black, 10.85, y0, 4.9, 64);
  tub.scale.set(0.48, 1, 1.1);
  const wat = cyl(0.64, 0.64, 0.01, MT.water, 10.85, y0 + 0.44, 4.9, 48); wat.scale.set(0.45, 1, 1.05);
  boxB(0.03, 1.0, 0.03, MT.bronze, 10.3, y0, 5.6); box(0.25, 0.02, 0.02, MT.bronze, 10.42, y0 + 1.0, 5.6);
  blob(10.85, y0, 4.9, 1.2, 2.0);
  fpRect(f, 10.5, 4.1, 11.2, 5.7);
  // vanity wall on the back wall
  box(3.4, 2.6, 0.04, MT.fluted, 9.3, y0 + 1.3, D - 0.03);
  [7.6, 11.0].forEach((x) => box(0.3, H, 0.06, MT.marbleBlue, x, y0 + H / 2, D - 0.04));
  const van = group(9.3, y0, D - 0.32, Math.PI);
  within(van, () => {
    boxB(2.6, 0.72, 0.56, MT.taupe, 0, 0.12, 0);
    boxB(0.3, 0.84, 0.58, MT.walnut, -1.45, 0, 0); boxB(0.3, 0.84, 0.58, MT.walnut, 1.45, 0, 0);
    boxB(3.2, 0.06, 0.6, MT.marbleDark, 0, 0.84, 0);
    [-0.6, 0.6].forEach((x) => {
      box(0.55, 1.2, 0.03, MT.mirror, x, 1.85, -0.25);
      boxB(0.02, 0.28, 0.02, MT.bronze, x, 0.9, -0.2); box(0.015, 0.015, 0.14, MT.bronze, x, 1.17, -0.14);
      lathe([[0.001, 0], [0.03, 0], [0.03, 0.14], [0.012, 0.16], [0.012, 0.19], [0.001, 0.19]], MT.black, x + 0.2, 0.9, 0.08, 14);
    });
    boxB(0.4, 0.05, 0.25, MT.creamFab, 0, 0.9, 0.08);
    blob(0, 0, 0.1, 3.4, 1.0);
  });
  fpRect(f, 7.7, 6.7, 10.9, D);
  rbox(1.3, 0.06, 0.5, 0.02, MT.marbleRed, 6.1, y0 + 0.85, D - 0.3);
  boxB(1.2, 0.72, 0.46, MT.black, 6.1, y0 + 0.12, D - 0.3);
  lathe([[0.001, 0], [0.16, 0], [0.2, 0.14], [0.18, 0.15], [0.14, 0.03], [0.001, 0.03]], MT.marbleRed, 6.1, y0 + 0.91, D - 0.3, 28);
  box(0.9, 1.0, 0.02, MT.mirror, 6.1, y0 + 1.7, D - 0.04);
  fpRect(f, 5.45, 6.7, 6.75, D);
  // wall-hung toilet in the display niche
  rbox(0.55, 0.35, 0.38, 0.12, MT.ceramic, 11.38, y0 + 0.35, 0.65);
  box(0.02, 0.15, 0.22, MT.bronze, 11.66, y0 + 1.1, 0.65);
  // display box + glass wardrobe on the central partition
  boxB(0.7, 2.6, 1.27, MT.walnut, 11.65, y0, 3.1);
  for (let s = 0; s < 6; s++) { boxB(0.6, 0.02, 1.2, MT.oak, 11.62, y0 + 0.3 + s * 0.42, 3.1); if (s < 5) decorItem(11.62, y0 + 0.32 + s * 0.42, 3.1, 0.38, 0.9); }
  fpRect(f, 11.3, 2.47, 12.0, 3.74);
  const wd = group(11.72, y0, 3.8, 0);
  within(wd, () => {
    boxB(0.64, H - 0.3, D - 3.8, MT.walnut, 0, 0, (D - 3.8) / 2);
    const back = boxB(0.5, H - 0.6, D - 3.9, MT.glow, -0.02, 0.15, (D - 3.8) / 2);
    back.material = std({ color: 0xf0c890, emissive: 0x8a5020, emissiveIntensity: 0.6, roughness: 0.6 });
    boxB(0.66, H - 0.3, D - 3.8, MT.glassTint, 0, 0, (D - 3.8) / 2);
    for (let i = 0; i < 9; i++) {
      const z = 0.25 + i * 0.36;
      boxB(0.05, 0.004, 0.36, MT.bronze, 0, 1.95, z);
      boxB(0.06, R(0.8, 1.1), 0.4, pick([MT.sandFab, MT.creamFab, MT.greyFab, MT.slateFab]), R(-0.08, 0.08), 0.9, z);
    }
    for (let i = 0; i < 4; i++) boxB(0.3, 0.12, 0.3, pick([MT.leather, MT.leatherDark, MT.cream]), 0, 2.4, 0.4 + i * 0.85);
    for (let i = 0; i <= 5; i++) boxB(0.68, H - 0.3, 0.02, MT.bronze, 0, 0, i * (D - 3.8) / 5);
  });
  fpRect(f, 11.39, 3.8, 12.05, D);

  // --- Bedroom --------------------------------------------------------
  const bx = 14.95;
  box(2.6, 2.6, 0.04, MT.greyFab, bx, y0 + 1.45, 2.94);
  for (let gx = -1.2; gx <= 1.21; gx += 0.6) boxB(0.03, 2.6, 0.04, MT.bronze, bx + gx, y0 + 0.15, 2.97);
  [0.9, 1.7, 2.4].forEach((gy) => boxB(2.6, 0.03, 0.04, MT.bronze, bx, y0 + gy, 2.97));
  box(2.6, 0.02, 0.05, MT.led, bx, y0 + 2.82, 2.98);
  [bx - 1.6, bx + 1.6].forEach((x) => box(0.55, 2.6, 0.04, MT.bronzeGrid, x, y0 + 1.45, 2.94));
  // desk console on the other side of the headboard wall
  boxB(3.2, 0.05, 0.5, MT.walnut, bx, y0 + 0.75, 2.5); boxB(3.2, 0.6, 0.05, MT.walnut, bx, y0 + 0.15, 2.74);
  box(1.2, 0.8, 0.02, MT.mirror, bx, y0 + 1.5, 2.75);
  vase(bx - 1.0, y0 + 0.8, 2.5, 0.3, MT.ceramic); bookStack(bx + 0.9, y0 + 0.8, 2.5, 0.3, 0.2, 3);
  diningChair(bx, 2.0, Math.PI, MT.boucle, 0.46, y0);
  fpRect(f, 13.35, 2.25, 16.55, 2.77);
  const bed = group(bx, y0, 4.29, 0);
  within(bed, () => {
    rbox(2.3, 0.32, 2.3, 0.12, MT.greyFab, 0, 0.02, 0.15);
    for (let k = -3; k <= 3; k++) box(0.01, 0.2, 0.02, MT.charcoal, k * 0.3, 0.17, 1.3);
    rbox(2.05, 0.28, 2.05, 0.08, MT.creamFab, 0, 0.3, 0.2);
    rbox(2.08, 0.06, 1.1, 0.03, MT.sandFab, 0, 0.57, 0.65);
    rbox(2.1, 0.045, 0.55, 0.02, MT.slateFab, 0, 0.61, 0.9);
    rbox(2.4, 0.78, 0.36, 0.16, MT.sandFab, 0, 0.3, -0.95);
    [-0.7, -0.25, 0.25, 0.7].forEach((x, i) => pillow(x, 0.6, -0.65, i % 3 ? MT.creamFab : MT.sandFab, 0, -0.3, 0.5));
    [-0.45, 0.45].forEach((x) => strapPillow(x, 0.6, -0.45, MT.greyFab, 0));
    blob(0, 0.013, 0.15, 2.9, 2.9);
  });
  fpRect(f, bx - 1.2, 3.1, bx + 1.2, 5.4);
  [bx - 1.55, bx + 1.55].forEach((x) => {
    cyl(0.25, 0.25, 0.5, MT.black, x, y0, 3.35, 40);
    cyl(0.26, 0.26, 0.03, MT.marbleWarm, x, y0 + 0.5, 3.35, 40);
    bookStack(x - 0.05, y0 + 0.53, 3.35, 0.2, 0.3, 2);
    lathe([[0.001, 0], [0.06, 0], [0.04, 0.25], [0.12, 0.28], [0.1, 0.42], [0.001, 0.42]], MT.glow, x + 0.1, y0 + 0.53, 3.25, 20);
    blob(x, y0, 3.35, 0.8, 0.8);
    fpCirc(f, x, 3.35, 0.26);
  });
  boxB(3.4, 0.012, 2.9, MT.rugGrey, bx, y0, 4.6);
  // black freestanding bath under the facade window
  boxB(2.2, 0.1, 1.0, MT.marbleBlue, 14.86, y0, 0.6);
  const tub2 = lathe([[0.001, 0], [0.62, 0], [0.7, 0.2], [0.72, 0.55], [0.67, 0.57], [0.62, 0.15], [0.001, 0.12]], MT.black, 14.86, y0 + 0.1, 0.6, 64);
  tub2.scale.set(1.2, 1, 0.48);
  boxB(0.03, 1.0, 0.03, MT.bronze, 16.0, y0 + 0.1, 0.4);
  cyl(0.18, 0.18, 0.02, MT.ceramic, 13.5, y0 + 0.5, 0.55, 24); cyl(0.02, 0.06, 0.5, MT.travBlock, 13.5, y0, 0.55, 12);
  for (let i = 0; i < 3; i++) rbox(0.22, 0.05, 0.16, 0.02, MT.creamFab, 13.5, y0 + 0.52 + i * 0.05, 0.55, i * 0.2);
  fpRect(f, 13.76, 0.1, 15.96, 1.1);
  const bp = group(14.86, F1_CEIL, 0.75, 0);
  within(bp, () => {
    box(0.008, 0.9, 0.008, MT.bronze, 0, -0.45, 0);
    box(1.2, 0.012, 0.012, MT.bronze, 0, -0.9, 0); box(0.012, 0.9, 0.012, MT.bronze, 0.3, -1.3, 0);
    [[-0.6, -0.9], [0.6, -0.9], [0.3, -1.75]].forEach((p) => { const s = new T.Mesh(new T.SphereGeometry(0.06, 20, 14), MT.glow); s.position.set(p[0], p[1], 0); add(s); });
  });
  // armchair + side table near the stair
  const ac = group(12.85, y0, 6.6, -0.6);
  within(ac, () => {
    cyl(0.42, 0.38, 0.4, MT.leather, 0, 0, 0, 40);
    cyl(0.4, 0.4, 0.1, MT.boucle, 0, 0.4, 0, 40);
    sector(0, 0, 0.36, 0.45, Math.PI * 1.1, Math.PI * 1.9, 0.4, 0.42, MT.boucle, 0.03);
    blob(0, 0, 0, 1.2, 1.2);
  });
  fpCirc(f, 12.85, 6.6, 0.45);
  sideTable(13.5, 6.95, y0); carafe(13.5, y0 + 0.46, 6.95, 0.8);
  pottedPlant(17.5, y0, 0.45, 1.1);
}

function glassWall(x0, z0, x1, z1, y0, h) {
  const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
  const g = group((x0 + x1) / 2, y0, (z0 + z1) / 2, ang);
  within(g, () => {
    boxB(0.02, h, len, MT.glassTint, 0, 0, 0);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) boxB(0.04, h, 0.04, MT.bronze, 0, 0, -len / 2 + i * len / n);
    boxB(0.05, 0.04, len, MT.bronze, 0, 0, 0); boxB(0.05, 0.04, len, MT.bronze, 0, h - 0.04, 0);
  });
}
function stoneSamples(x, y0, z0, z1) {
  const mats = [MT.marbleRed, MT.marbleBlue, MT.marbleWarm, MT.marbleDark, MT.marbleGrey, MT.travBlock, MT.fluted];
  for (let r = 0; r < 3; r++) {
    for (let z = z0 + 0.1; z < z1 - 0.1; z += R(0.06, 0.12)) {
      boxB(0.3, R(0.35, 0.55), 0.03, pick(mats), x + 0.05, y0 + r * 0.68 + 0.05, z, R(-0.05, 0.05));
    }
  }
}

// ------------------------------------------------------------------
// Post-build: merge static meshes by material, world-space UVs
// ------------------------------------------------------------------
function worldUV(g, s) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x / s[0], z / s[1]);
    else if (nx >= nz) uv.setXY(i, z / s[0], y / s[1]);
    else uv.setXY(i, x / s[0], y / s[1]);
  }
  uv.needsUpdate = true;
}
function mergeStatic(container) {
  container.updateMatrixWorld(true);
  const buckets = new Map(), remove = [];
  container.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const m = o.material;
    if (m.transparent && !m.userData.merge) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    Object.keys(g.attributes).forEach((k) => { if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); });
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups(); g.morphAttributes = {};
    if (m.userData.uv) worldUV(g, m.userData.uv);
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m).push(g);
    remove.push(o);
  });
  remove.forEach((o) => o.removeFromParent());
  buckets.forEach((list, m) => {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new T.Mesh(merged, m);
    mesh.castShadow = !m.transparent && m !== MT.ceilDark && !m.isMeshBasicMaterial;
    mesh.receiveShadow = !m.isMeshBasicMaterial;
    if (m === MT.shadow) mesh.renderOrder = 1;
    container.add(mesh);
  });
  const empties = [];
  container.traverse((o) => { if (o !== container && o.isGroup && o.children.length === 0) empties.push(o); });
  empties.forEach((o) => o.removeFromParent());
}
function finishMaterials() {
  const seen = new Set();
  scene.traverse((o) => {
    if (o.isInstancedMesh) { o.castShadow = o.material !== MT.slat; o.receiveShadow = true; }
    const m = o.material; if (!m || seen.has(m) || Array.isArray(m)) return;
    seen.add(m);
    if (m.isMeshStandardMaterial) m.envMapIntensity = m.metalness > 0.5 ? 1.0 : 0.55;
  });
}

// ------------------------------------------------------------------
// LIGHTING + environment
// ------------------------------------------------------------------
function buildLights() {
  scene.add(new T.HemisphereLight(0xfff1e0, 0x5c4532, LOW ? 1.55 : 1.1));
  const sun = new T.DirectionalLight(0xffe4bc, 4.2);
  const dir = new T.Vector3(-0.5, 0.62, -1).normalize();    // late sun from the facade side
  const center = new T.Vector3(W / 2, 3, D / 2);
  sun.position.copy(center).addScaledVector(dir, 40);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOW ? 2048 : 4096, LOW ? 2048 : 4096);
  const c = sun.shadow.camera;
  c.left = -17; c.right = 17; c.top = 12; c.bottom = -12; c.near = 10; c.far = 80;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(0xffe2c2, 0.5);
  fill.position.set(W + 6, 10, D + 8); scene.add(fill);
  [[5.3, 2.9, 4.55, 12], [12.5, 2.9, 2.0, 8], [12.7, 2.9, 5.0, 8], [16.6, 2.9, 3.2, 9], [1.8, 2.9, 4.0, 8], [20.0, 3.2, 4.2, 5],
   [2.2, F1 + 2.6, 1.8, 7], [2.1, F1 + 2.6, 6.0, 7], [8.0, F1 + 2.7, 3.5, 9], [9.6, F1 + 2.7, 6.2, 6], [14.95, F1 + 2.6, 4.2, 8], [14.9, F1 + 2.6, 1.2, 6], [17.0, F1 + 2.6, 6.7, 4]
  ].forEach((p) => { if (LOW) return; const l = new T.PointLight(0xffc68a, p[3], 11, 1.6); l.position.set(p[0], p[1], p[2]); scene.add(l); });

  const pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pm.dispose();
}

// ------------------------------------------------------------------
// TOUR — nodes in drawing coordinates (x, z, floor, look yaw°, name, render, sales info)
// yaw 0 = towards the facade (−z), 90 = towards the stair end (+x), 180 = back wall, −90 = entrance end
// ------------------------------------------------------------------
const NODES = [
  { x: -2.3, z: 3.8, f: 0, yaw: 90, name: 'Arrival', photo: 'overview', zone: 'entrance' },
  { x: 1.0, z: 3.8, f: 0, yaw: 90, name: 'Entrance', photo: 'tvwall', zone: 'entrance' },
  { x: 3.0, z: 3.6, f: 0, yaw: -147, name: 'Reception', photo: 'reception', zone: 'reception' },
  { x: 3.0, z: 2.4, f: 0, yaw: -55, name: 'Olive Lounge', photo: 'olive', zone: 'olive' },
  { x: 3.4, z: 6.45, f: 0, yaw: 40, name: 'Living Zone 1', photo: 'living', zone: 'living1' },
  { x: 8.1, z: 6.4, f: 0, yaw: -56, name: 'Pearl Garlands', photo: 'shelves', zone: 'living1' },
  { x: 10.1, z: 5.9, f: 0, yaw: 28, name: 'Living Zone 2', zone: 'living2' },
  { x: 10.3, z: 3.75, f: 0, yaw: 118, name: 'Work Table', photo: 'worktable', zone: 'table' },
  { x: 14.3, z: 3.55, f: 0, yaw: 78, name: 'Kitchen', photo: 'kitchen', zone: 'kitchen' },
  { x: 15.0, z: 0.95, f: 0, yaw: 125, name: 'Kitchen Island', photo: 'island', zone: 'kitchen' },
  { x: 18.0, z: 0.7, f: 0, yaw: 90, name: 'To the Stairs', zone: 'stairs' },
  { x: 19.95, z: 1.35, f: 0, yaw: 180, name: 'Stairs', photo: 'stairs', zone: 'stairs' },
  { x: 19.95, z: 4.2, f: 0, yaw: 180, name: 'Stairs', stair: true, zone: 'stairs' },
  { x: 20.05, z: 6.8, f: 0, yaw: -90, name: 'Landing', stair: true, zone: 'stairs' },
  { x: 17.9, z: 6.78, f: 0, yaw: -90, name: 'Stairs', stair: true, zone: 'stairs' },
  { x: 15.5, z: 6.65, f: 1, yaw: -25, name: 'First Floor', photo: 'bedroom', zone: 'bedroom' },
  { x: 12.75, z: 5.6, f: 1, yaw: 58, name: 'Bedroom', zone: 'bedroom' },
  { x: 12.75, z: 1.9, f: 1, yaw: 60, name: 'Freestanding Bath', photo: 'bathtub', zone: 'bath' },
  { x: 10.0, z: 2.1, f: 1, yaw: -130, name: 'Presentation Table', photo: 'presentation', zone: 'studio' },
  { x: 9.3, z: 5.6, f: 1, yaw: 150, name: 'Tub & Vanity', photo: 'vanity', zone: 'bath' },
  { x: 5.6, z: 6.0, f: 1, yaw: -95, name: 'Meeting Room', photo: 'meeting', zone: 'meeting' },
  { x: 6.2, z: 2.3, f: 1, yaw: -15, name: 'Basins & Shower', zone: 'studio' },
  { x: 3.8, z: 1.3, f: 1, yaw: -110, name: 'Office', zone: 'office' }
];
/** floor height under a point: flight 1, corner landing, flight 2, floors */
function groundAt(x, z, fb) {
  if (x >= S1X0 && z >= S1Z0 && z < S1Z1 && fb < F1 - 0.05) return (z - S1Z0) / (S1Z1 - S1Z0) * H1;
  if (x >= S1X0 && z >= S1Z1) return H1;
  if (x >= S2X0 && x < S1X0 && z >= S1Z1) return H1 + (S1X0 - x) / (S1X0 - S2X0) * (F1 - H1);
  return fb > (H1 + F1) / 2 ? F1 : (fb < H1 / 2 ? 0 : fb);
}
NODES.forEach((n, i) => { n.i = i; n.groundY = groundAt(n.x, n.z, n.f ? F1 : 0); n.y = n.groundY + EYE; });

// ------------------------------------------------------------------
// View state
// ------------------------------------------------------------------
const PITCH0 = -0.12;
const view = { yaw: NODES[0].yaw * Math.PI / 180, pitch: PITCH0, fov: 72 };
const pos = new T.Vector3(NODES[0].x, NODES[0].y, NODES[0].z);
let current = 0, moving = null, dirty = true;
let autoTour = false;
const auto = { t: 0, dur: 2, base: 0 };
const spin = { v: 0, p: 0 };   // look inertia (rad/s)
const WALK_SPEED = 2.4, TOUR_SPEED = 1.5;   // m/s (manual / auto tour)

function applyCamera() {
  camera.position.copy(pos);
  camera.rotation.set(view.pitch, -view.yaw, 0, 'YXZ');
  if (camera.fov !== view.fov) { camera.fov = view.fov; camera.updateProjectionMatrix(); }
  floors[0].visible = pos.y < F1 + 1.2;
  floors[1].visible = pos.y > 2.9;
}
const angleTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, -(tz - fz));
function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
const easeSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * x * (x * (x * 6 - 15) + 10); };
const mixAng = (a, b, w) => a + wrap(b - a) * w;
const neighbours = (i) => [i - 1, i + 1].filter((j) => j >= 0 && j < NODES.length);

/** walk to node i along a smooth curve through every node in between */
function goTo(i) {
  const from = moving ? moving.to : current;
  if (i === from && !moving) return;
  const idx = [], step = i > from ? 1 : -1;
  if (i !== from) for (let k = from + step; step > 0 ? k <= i : k >= i; k += step) idx.push(k);
  else idx.push(i);
  const pts = [new T.Vector3(pos.x, pos.y - EYE, pos.z)];
  idx.forEach((k) => pts.push(new T.Vector3(NODES[k].x, NODES[k].groundY, NODES[k].z)));
  const curve = pts.length === 2 ? new T.LineCurve3(pts[0], pts[1]) : new T.CatmullRomCurve3(pts, false, 'centripetal');
  const L = Math.max(0.01, curve.getLength());
  let acc = 0; const cum = [0];
  for (let k = 1; k < pts.length; k++) { acc += pts[k].distanceTo(pts[k - 1]); cum.push(acc); }
  const speed = autoTour ? TOUR_SPEED : WALK_SPEED;
  const p0 = curve.getPointAt(0), pa = curve.getPointAt(Math.min(1, 1.2 / L));
  const pe = curve.getPointAt(Math.max(0, 1 - 1.2 / L)), p1 = curve.getPointAt(1);
  const ty = Math.hypot(pa.x - p0.x, pa.z - p0.z) > 0.05 ? angleTo(p0.x, p0.z, pa.x, pa.z) : view.yaw;
  const tyEnd = Math.hypot(p1.x - pe.x, p1.z - pe.z) > 0.05 ? angleTo(pe.x, pe.z, p1.x, p1.z) : ty;
  const y1 = NODES[i].yaw * Math.PI / 180;
  // long enough that the head never turns faster than ~55°/s on the tour (~120°/s by hand)
  const maxTurn = (autoTour ? 54 : 120) * Math.PI / 180;
  // smootherstep peaks at 1.875× its mean rate, so give each turn enough time
  const aT = Math.max(autoTour ? 1.7 : 1.1, Math.abs(wrap(ty - view.yaw)) / maxTurn * 1.9);
  const bT = Math.max(autoTour ? 2.2 : 1.5, Math.abs(wrap(y1 - tyEnd)) / maxTurn * 1.9);
  const dur = Math.min(autoTour ? 24 : 7, Math.max(1.0, L / speed + (autoTour ? 0.8 : 0.4), (aT + bT) * 0.9));
  adaptResolution();
  moving = {
    curve, L, dur, t: 0, to: i,
    y0: view.yaw, p0: view.pitch, y1, ty, aT, bT,
    marks: idx.slice(0, -1).map((k, j) => ({ i: k, u: cum[j + 1] / acc })), passed: 0
  };
  spin.v = spin.p = 0;
  hideArrows();
  zoneEl.hidden = true; endEl.hidden = true;
}

function update(dt) {
  if (moving) {
    const m = moving;
    m.t = Math.min(1, m.t + dt / m.dur);
    const s = easeSine(m.t);
    const p = m.curve.getPointAt(s);
    pos.set(p.x, groundAt(p.x, p.z, p.y) + EYE, p.z);
    // look along the path (smoothed look-ahead), then settle on the stop's best view
    const ahead = m.curve.getPointAt(Math.min(1, s + 1.6 / m.L));
    if (Math.hypot(ahead.x - p.x, ahead.z - p.z) > 0.35) {
      m.ty += wrap(angleTo(p.x, p.z, ahead.x, ahead.z) - m.ty) * (1 - Math.exp(-dt * 3));
    }
    const a = Math.min(0.5, m.aT / m.dur), b = Math.min(0.55, m.bT / m.dur);
    view.yaw = mixAng(mixAng(m.y0, m.ty, smooth(0, a, m.t)), m.y1, smooth(1 - b, 1, m.t));
    view.pitch = mix(m.p0, PITCH0, smooth(0, a, m.t));
    while (m.passed < m.marks.length && s >= m.marks[m.passed].u) { current = m.marks[m.passed].i; onPass(); m.passed++; }
    if (m.t >= 1) {
      current = m.to; moving = null; view.yaw = m.y1;
      onArrive();
      if (autoTour) { auto.t = 0; auto.dur = 3.8; auto.base = view.yaw; }
    }
    dirty = true;
  }
  if (!dragging && (Math.abs(spin.v) > 0.003 || Math.abs(spin.p) > 0.003)) {
    view.yaw += spin.v * dt;
    view.pitch = Math.max(-1.25, Math.min(1.25, view.pitch + spin.p * dt));
    const damp = Math.pow(0.03, dt);
    spin.v *= damp; spin.p *= damp;
    dirty = true;
  }
  if (autoTour && !moving && !dragging) {
    // slow look left and right, starting and ending at rest, then walk on
    auto.t += dt;
    const k = Math.min(1, auto.t / auto.dur), amp = auto.dur > 3 ? 0.3 : 0;
    view.yaw = auto.base + amp * Math.sin(2 * Math.PI * k) * Math.sin(Math.PI * k);
    view.pitch = mix(view.pitch, PITCH0, 1 - Math.exp(-dt * 2));
    dirty = true;
    if (k >= 1) { if (current < NODES.length - 1) goTo(current + 1); else { setAuto(false); showEnd(); } }
  }
  // fade the floor arrows in
  if (arrowGroup.visible && arrowFade < 1) {
    arrowFade = Math.min(1, arrowFade + dt / 0.5);
    const f = smooth(0, 1, arrowFade);
    arrowMat.opacity = 0.92 * f; arrowShadowMat.opacity = 0.25 * f; discMat.opacity = 0.25 * f; discRingMat.opacity = 0.8 * f;
    dirty = true;
  }
}

// ------------------------------------------------------------------
// Arrows / hotspots
// ------------------------------------------------------------------
const arrowGroup = new T.Group(); scene.add(arrowGroup);
const arrowMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthTest: false, toneMapped: false });
const arrowShadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthTest: false });
const discMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false });
const discRingMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
const arrowGeo = (() => {
  const s = new T.Shape();
  s.moveTo(0, 0.34); s.lineTo(0.34, -0.02); s.lineTo(0.22, -0.12); s.lineTo(0, 0.1); s.lineTo(-0.22, -0.12); s.lineTo(-0.34, -0.02); s.closePath();
  const g = new T.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g;
})();
let hotspots = [], arrowFade = 0;
const discs = [];
function buildDiscs() {
  const dg = new T.CircleGeometry(0.22, 40); dg.rotateX(-Math.PI / 2);
  const rg = new T.RingGeometry(0.22, 0.26, 40); rg.rotateX(-Math.PI / 2);
  NODES.forEach((n, i) => {
    const g = new T.Group();
    const d = new T.Mesh(dg, discMat); d.userData.node = i;
    const r = new T.Mesh(rg, discRingMat); r.userData.node = i;
    g.add(d, r); g.position.set(n.x, n.groundY + 0.02, n.z); g.renderOrder = 5;
    scene.add(g); discs.push(g);
  });
}
function hideArrows() { arrowGroup.visible = false; discs.forEach((d) => { d.visible = false; }); }
function showArrows() {
  arrowGroup.clear(); hotspots = [];
  if (autoTour) { hideArrows(); return; }
  const n = NODES[current];
  arrowFade = 0; arrowMat.opacity = arrowShadowMat.opacity = discMat.opacity = discRingMat.opacity = 0;
  neighbours(current).forEach((j) => {
    const m = NODES[j], a = angleTo(n.x, n.z, m.x, m.z);
    const slope = (m.groundY - n.groundY) / Math.max(0.5, Math.hypot(m.x - n.x, m.z - n.z));
    const g = new T.Group();
    const sh = new T.Mesh(arrowGeo, arrowShadowMat); sh.position.set(0.02, -0.005, 0.02); sh.renderOrder = 9;
    const ar = new T.Mesh(arrowGeo, arrowMat); ar.renderOrder = 10;
    ar.userData.node = j; sh.userData.node = j;
    g.add(sh, ar); g.scale.setScalar(1.5);
    const ad = Math.min(2.2, Math.hypot(m.x - n.x, m.z - n.z) * 0.8);
    const ax = n.x + Math.sin(a) * ad, az = n.z - Math.cos(a) * ad;
    g.position.set(ax, groundAt(ax, az, n.groundY) + 0.05, az);
    g.rotation.set(0, -a, 0, 'YXZ');
    if (Math.abs(slope) > 0.1) g.rotateX(Math.atan(slope));
    arrowGroup.add(g); hotspots.push(ar);
  });
  arrowGroup.visible = true;
  discs.forEach((d, i) => { d.visible = i !== current && NODES[i].f === n.f && !NODES[i].stair && Math.hypot(NODES[i].x - n.x, NODES[i].z - n.z) < 9; });
  dirty = true;
}

// ------------------------------------------------------------------
// UI
// ------------------------------------------------------------------
const elName = $('place-name'), elFloor = $('place-floor'), elSteps = $('steps');
const btnPrev = $('btn-prev'), btnNext = $('btn-next'), btnPlay = $('btn-play');
const photoBtn = $('photo-btn'), photoThumb = $('photo-thumb'), lightbox = $('lightbox'), lbImg = $('lightbox-img'), lbCap = $('lightbox-cap');
const stepEls = NODES.map((n, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'step' + (n.f ? ' is-upper' : '');
  b.setAttribute('aria-label', n.name);
  b.addEventListener('click', () => { setAuto(false); goTo(i); });
  elSteps.appendChild(b); return b;
});
let shownName = '';
function showName(n) {
  if (n.name === shownName) return;
  shownName = n.name;
  elName.classList.add('is-fading');
  setTimeout(() => { elName.textContent = shownName; elName.classList.remove('is-fading'); }, 260);
}
function onPass() {
  const n = NODES[current];
  showName(n);
  elFloor.textContent = n.f ? 'First floor' : 'Ground floor';
  stepEls.forEach((b, i) => b.classList.toggle('is-active', i === current));
  if (mapFloor !== n.f) { mapFloor = n.f; updateTabs(); }
}
function onArrive() {
  const n = NODES[current];
  showName(n);
  elFloor.textContent = n.f ? 'First floor' : 'Ground floor';
  stepEls.forEach((b, i) => b.classList.toggle('is-active', i === current));
  btnPrev.disabled = current === 0;
  btnNext.disabled = current === NODES.length - 1;
  showZone(n);
  mapFloor = n.f; updateTabs();
  showArrows();
  if (current === NODES.length - 1 && !autoTour) showEnd();
}
btnPrev.addEventListener('click', () => { setAuto(false); const c = moving ? moving.to : current; if (c > 0) goTo(c - 1); });
btnNext.addEventListener('click', () => { setAuto(false); const c = moving ? moving.to : current; if (c < NODES.length - 1) goTo(c + 1); });
function setAuto(on) {
  if (on === autoTour) return;
  autoTour = on; btnPlay.classList.toggle('is-on', on);
  if (on) { auto.t = 0; auto.dur = 1.2; auto.base = view.yaw; hideArrows(); }
  else if (!moving) showArrows();
}
btnPlay.addEventListener('click', () => { const on = !autoTour; setAuto(on); if (on && current === NODES.length - 1 && !moving) goTo(0); });
photoBtn.addEventListener('click', () => {
  const n = NODES[current]; if (!n.photo) return;
  setAuto(false);
  lbImg.src = 'assets/renders/' + n.photo + '.jpg'; lbCap.textContent = n.name + ' · visualisation';
  lightbox.hidden = false;
});
lightbox.addEventListener('click', () => { lightbox.hidden = true; });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') lightbox.hidden = true;
  else if (e.key === 'ArrowLeft' || e.key === 'a') { view.yaw -= 0.12; dirty = true; }
  else if (e.key === 'ArrowRight' || e.key === 'd') { view.yaw += 0.12; dirty = true; }
  else if (e.key === 'ArrowUp' || e.key === 'w') { setAuto(false); stepToward(view.yaw); }
  else if (e.key === 'ArrowDown' || e.key === 's') { setAuto(false); stepToward(view.yaw + Math.PI); }
  else if (e.key === 'PageDown' || e.key === ']') btnNext.click();
  else if (e.key === 'PageUp' || e.key === '[') btnPrev.click();
});
function stepToward(yaw) {
  if (moving) return;
  const n = NODES[current]; let best = -1, bestA = 1.2;
  neighbours(current).forEach((j) => {
    const a = Math.abs(wrap(angleTo(n.x, n.z, NODES[j].x, NODES[j].z) - yaw));
    if (a < bestA) { bestA = a; best = j; }
  });
  if (best >= 0) goTo(best);
}

// Sales layer: zone card, booking, end card -----------------------------
/** Contact for bookings: put the showroom's WhatsApp number here (digits only, e.g. "9715xxxxxxxx").
 *  Empty = WhatsApp opens with the message ready and the visitor picks the chat. */
const CONTACT = { whatsapp: '' };
const ZONES = {
  entrance: { title: 'Entrance & Reception', interest: 'Whole home', text: 'Double glass doors open onto a sculpted reception desk in two quartzites, framed by woven leather walls.', tags: ['Blue quartzite', 'Taj Mahal quartzite', 'Woven leather', 'Bronze'] },
  reception: { title: 'Reception & Coffee Bar', interest: 'Whole home', text: 'A curved stone desk lettered “Colors of Living”, a lacquered coffee bar and art on woven leather.', tags: ['Quartzite', 'Blue lacquer', 'Woven leather'] },
  olive: { title: 'Olive Lounge', interest: 'Living room', text: 'A living olive tree and a round lounge chair in olive velvet: the calm corner by the entrance.', tags: ['Olive velvet', 'Leather', 'Walnut', 'Live olive tree'] },
  living1: { title: 'Living Zone 1', interest: 'Living room', text: 'A curved bouclé sofa under hand-made pearl garlands, a library in blue quartzite and a TV wall with bronze étagères.', tags: ['Bouclé', 'Blue quartzite', 'Pearl glass', 'Leather straps'] },
  living2: { title: 'Living Zone 2', interest: 'Living room', text: 'An L-shaped bouclé sofa by the window with bronze coffee tables, behind a double-sided stone library.', tags: ['Bouclé', 'Bronze', 'Amber glass screen'] },
  table: { title: 'Work & Dining Table', interest: 'Whole home', text: 'A marble table with olive suede chairs and lacquered cabinets on a woven leather wall.', tags: ['Marble', 'Olive suede', 'Grey lacquer', 'Woven leather'] },
  kitchen: { title: 'Kitchen', interest: 'Kitchen', text: 'A quartzite island along the room and a wall of tall lacquered cabinets with a lit glass niche.', tags: ['Taj Mahal quartzite', 'Walnut', 'Champagne lacquer'] },
  stairs: { title: 'Stair Hall', interest: 'Stone & marble', text: 'A travertine stair with lit risers, sculptural bronze sconces and a blue arched niche.', tags: ['Travertine', 'LED risers', 'Bronze'] },
  bedroom: { title: 'Bedroom Suite', interest: 'Bedroom', text: 'An upholstered headboard wall with bronze grids in the middle of the room, a glass wardrobe and a reading chair.', tags: ['Linen', 'Bronze grid', 'Walnut', 'Glass wardrobe'] },
  bath: { title: 'Bathroom Gallery', interest: 'Bathroom', text: 'Black freestanding bathtubs, a double vanity on fluted travertine and blue marble pilasters.', tags: ['Black solid surface', 'Fluted travertine', 'Blue marble'] },
  studio: { title: 'Material Studio', interest: 'Stone & marble', text: 'A presentation table in Calacatta Viola for choosing stone, basins and a walk-in shower behind glass.', tags: ['Calacatta Viola', 'Travertine', 'Bronze glass'] },
  meeting: { title: 'Meeting Room', interest: 'Office / meeting room', text: 'A table for six under glass globe pendants, with a TV wall and a library of stone samples.', tags: ['Grey marble', 'Leather', 'Glass globes'] },
  office: { title: 'Design Office', interest: 'Office / meeting room', text: 'Four workstations where your project is drawn, priced and ordered.', tags: ['Walnut', 'Bouclé', 'Lacquer'] }
};
const zoneEl = $('zone'), endEl = $('endcard'), bookEl = $('book');
function showZone(n) {
  const z = ZONES[n.zone]; if (!z) { zoneEl.hidden = true; return; }
  $('zone-title').textContent = n.name === z.title || n.stair ? z.title : n.name;
  $('zone-text').textContent = z.text;
  $('zone-tags').innerHTML = '';
  z.tags.forEach((t) => { const li = document.createElement('li'); li.textContent = t; $('zone-tags').appendChild(li); });
  zoneEl.classList.toggle('no-photo', !n.photo);
  if (n.photo) photoThumb.src = 'assets/renders/' + n.photo + '.jpg';
  zoneEl.hidden = false;
  zoneEl.style.animation = 'none'; void zoneEl.offsetWidth; zoneEl.style.animation = '';
}
$('zone-fold').addEventListener('click', (e) => { const o = zoneEl.classList.toggle('is-open'); e.currentTarget.textContent = o ? '–' : '+'; });
$('zone-cta').addEventListener('click', () => { const z = ZONES[NODES[current].zone]; openBooking(z ? z.interest : null, z ? z.title : null); });
function showEnd() { endEl.hidden = false; }
$('end-restart').addEventListener('click', () => { endEl.hidden = true; goTo(1); });
function openBooking(interest, zoneTitle) {
  setAuto(false);
  endEl.hidden = true;
  $('book-form-wrap').hidden = false; $('book-done').hidden = true; $('f-error').hidden = true;
  if (interest) $('f-interest').value = interest;
  if (zoneTitle) $('f-msg').value = 'I liked the ' + zoneTitle + ' in the Venezia showroom.';
  bookEl.hidden = false;
  setTimeout(() => { try { $('f-name').focus({ preventScroll: true }); } catch (e) {} }, 50);
}
document.querySelectorAll('[data-book]').forEach((b) => b.addEventListener('click', () => openBooking()));
bookEl.addEventListener('click', (e) => { if (e.target === bookEl || e.target.closest('[data-close]')) bookEl.hidden = true; });
$('book-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('f-name').value.trim(), phone = $('f-phone').value.trim();
  if (!name || phone.replace(/\D/g, '').length < 6) { $('f-error').hidden = false; return; }
  const date = $('f-date').value, interest = $('f-interest').value, msg = $('f-msg').value.trim();
  const text = 'Hello Colors of Living! I would like a private viewing of the Venezia showroom.\n' +
    'Name: ' + name + '\nPhone: ' + phone + (date ? '\nPreferred date: ' + date : '') + '\nInterested in: ' + interest + (msg ? '\n' + msg : '');
  $('book-wa').href = 'https://wa.me/' + CONTACT.whatsapp + '?text=' + encodeURIComponent(text);
  $('book-summary').textContent = name + ', tap the button to send your request' + (date ? ' for ' + date : '') + '. We reply with a time for your visit.';
  $('book-form-wrap').hidden = true; $('book-done').hidden = false;
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { bookEl.hidden = true; endEl.hidden = true; } });

// Minimap --------------------------------------------------------------
const MAP_Z0 = -0.7, MAP_Z1 = D + 0.4, MAP_X0 = -3.0, MAP_X1 = W + 0.4;
const mapEl = $('map'), mapCanvas = $('map-canvas'), mctx = mapCanvas.getContext('2d');
let mapFloor = 0, mapScale = 10;
mapCanvas.style.aspectRatio = (MAP_X1 - MAP_X0).toFixed(2) + ' / ' + (MAP_Z1 - MAP_Z0).toFixed(2);
const tabs = [...document.querySelectorAll('.map__tab')];
function updateTabs() { tabs.forEach((t) => t.classList.toggle('is-active', +t.dataset.floor === mapFloor)); }
tabs.forEach((t) => t.addEventListener('click', () => { mapFloor = +t.dataset.floor; updateTabs(); drawMap(); }));
$('map-toggle').addEventListener('click', (e) => {
  const c = mapEl.classList.toggle('is-collapsed');
  e.currentTarget.textContent = c ? '+' : '–';
  if (!c) resizeMap();
});
if (window.innerWidth < 640) { mapEl.classList.add('is-collapsed'); $('map-toggle').textContent = '+'; }
function resizeMap() {
  const w = mapCanvas.clientWidth; if (!w) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  mapCanvas.width = w * dpr; mapCanvas.height = w * ((MAP_Z1 - MAP_Z0) / (MAP_X1 - MAP_X0)) * dpr;
  mapScale = mapCanvas.width / (MAP_X1 - MAP_X0);
  drawMap();
}
const mx = (x) => (x - MAP_X0) * mapScale, mz = (z) => (z - MAP_Z0) * mapScale;
/** the minimap is drawn exactly like the drawings: facade on top, entrance on the left */
function drawMap() {
  const c = mctx, s = mapScale, w = mapCanvas.width;
  if (!w) return;
  c.clearRect(0, 0, w, mapCanvas.height);
  c.fillStyle = '#e3d8c6'; c.fillRect(0, 0, w, mapCanvas.height);
  c.fillStyle = '#efe7da'; c.fillRect(mx(0), mz(0), W * s, D * s);
  FP[mapFloor].forEach((p) => {
    c.fillStyle = p.k === 'rug' ? 'rgba(160,130,95,.18)' : p.k === 's' ? 'rgba(42,33,26,.12)' : p.k === 'w' ? '#4a3d31' : p.k === 'g' ? 'rgba(80,140,180,.7)' : 'rgba(90,70,52,.42)';
    c.beginPath();
    if (p.t === 'r') c.rect(mx(p.x0), mz(p.z0), (p.x1 - p.x0) * s, (p.z1 - p.z0) * s);
    else if (p.t === 'c') c.arc(mx(p.x), mz(p.z), p.r * s, 0, Math.PI * 2);
    else { c.arc(mx(p.x), mz(p.z), p.r1 * s, p.a0, p.a1, false); c.arc(mx(p.x), mz(p.z), p.r0 * s, p.a1, p.a0, true); c.closePath(); }
    c.fill();
  });
  // outer walls with openings
  const wt = Math.max(3, s * 0.3);
  c.fillStyle = '#2a211a';
  const seg = (x0, z0, x1, z1) => c.fillRect(mx(Math.min(x0, x1)) - (x0 === x1 ? wt : 0), mz(Math.min(z0, z1)) - (z0 === z1 ? wt : 0), Math.max(wt, Math.abs(x1 - x0) * s + (x0 === x1 ? 0 : 0)), Math.max(wt, Math.abs(z1 - z0) * s));
  const run = (axis, cst, a0, a1, gaps) => { let u = a0; gaps.forEach((g) => { axis === 'x' ? seg(u, cst, g[0], cst) : seg(cst, u, cst, g[0]); u = g[1]; }); axis === 'x' ? seg(u, cst, a1, cst) : seg(cst, u, cst, a1); };
  run('x', 0, 0, W, WIN);
  run('x', D + wt / s, 0, W, mapFloor ? [BACK_WIN] : []);
  run('z', 0, 0, D + wt / s, mapFloor ? [] : [LWIN[0], [DOOR_Z0, DOOR_Z1], LWIN[1]]);
  run('z', W + wt / s, 0, D + wt / s, []);
  c.fillStyle = '#8fb6cc';
  WIN.forEach((g) => c.fillRect(mx(g[0]), mz(0) - wt * 0.6, (g[1] - g[0]) * s, wt * 0.5));
  if (mapFloor) c.fillRect(mx(BACK_WIN[0]), mz(D) + wt * 0.3, (BACK_WIN[1] - BACK_WIN[0]) * s, wt * 0.5);
  else LWIN.forEach((g) => c.fillRect(mx(0) - wt * 0.6, mz(g[0]), wt * 0.5, (g[1] - g[0]) * s));
  if (!mapFloor) { c.fillStyle = '#b0773f'; c.fillRect(mx(0) - wt, mz(DOOR_Z0), wt * 0.35, (DOOR_Z1 - DOOR_Z0) * s); }
  // stair treads
  c.strokeStyle = 'rgba(42,33,26,.5)'; c.lineWidth = 1;
  for (let i = 0; i <= 12; i++) { const zz = S1Z0 + i * (S1Z1 - S1Z0) / 12; c.beginPath(); c.moveTo(mx(S1X0), mz(zz)); c.lineTo(mx(W), mz(zz)); c.stroke(); }
  for (let i = 0; i <= 12; i++) { const xx = S1X0 - i * (S1X0 - S2X0) / 12; c.beginPath(); c.moveTo(mx(xx), mz(S1Z1)); c.lineTo(mx(xx), mz(D)); c.stroke(); }
  // route
  c.setLineDash([s * 0.25, s * 0.2]); c.strokeStyle = 'rgba(160,110,60,.9)'; c.lineWidth = Math.max(1.5, s * 0.08);
  c.beginPath(); let started = false;
  NODES.forEach((n) => {
    if (n.f === mapFloor || n.stair) { if (!started) { c.moveTo(mx(n.x), mz(n.z)); started = true; } else c.lineTo(mx(n.x), mz(n.z)); }
  });
  c.stroke(); c.setLineDash([]);
  NODES.forEach((n, i) => {
    if (n.f !== mapFloor || n.stair) return;
    c.beginPath(); c.arc(mx(n.x), mz(n.z), s * 0.22, 0, Math.PI * 2);
    c.fillStyle = i === current ? '#b0773f' : '#fff'; c.fill();
    c.lineWidth = Math.max(1.2, s * 0.06); c.strokeStyle = '#b0773f'; c.stroke();
  });
  const myFloor = pos.y > F1 + 0.8 ? 1 : 0;
  if (myFloor === mapFloor || (pos.y > 2 && pos.y < F1 + 0.8)) {
    const fovH = 2 * Math.atan(Math.tan(view.fov * Math.PI / 360) * camera.aspect);
    const r = s * 2.4;
    const g = c.createRadialGradient(mx(pos.x), mz(pos.z), 0, mx(pos.x), mz(pos.z), r);
    g.addColorStop(0, 'rgba(176,119,63,.55)'); g.addColorStop(1, 'rgba(176,119,63,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(mx(pos.x), mz(pos.z));
    const ca = Math.atan2(-Math.cos(view.yaw), Math.sin(view.yaw));
    c.arc(mx(pos.x), mz(pos.z), r, ca - fovH / 2, ca + fovH / 2); c.closePath(); c.fill();
    c.beginPath(); c.arc(mx(pos.x), mz(pos.z), s * 0.3, 0, Math.PI * 2);
    c.fillStyle = '#2a211a'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
  }
}
mapCanvas.addEventListener('click', (e) => {
  const r = mapCanvas.getBoundingClientRect(), k = mapCanvas.width / r.width;
  const x = (e.clientX - r.left) * k / mapScale + MAP_X0, z = (e.clientY - r.top) * k / mapScale + MAP_Z0;
  let best = -1, bd = 2.2;
  NODES.forEach((n, i) => { if (n.f !== mapFloor || n.stair) return; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } });
  if (best >= 0) { setAuto(false); goTo(best); }
});

// ------------------------------------------------------------------
// Pointer: drag to look (with inertia), tap to walk, pinch / wheel zoom
// ------------------------------------------------------------------
const LOOK_SENS = 1.75;           // a drag across the full screen height turns ≈ 1.75 π
const pointers = new Map();
let dragging = false, downInfo = null, pinch0 = null, lastMove = { t: 0, vx: 0, vy: 0 };
const raycaster = new T.Raycaster(), ndc = new T.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  spin.v = spin.p = 0;
  if (pointers.size === 1) { downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; dragging = true; canvas.classList.add('is-dragging'); lastMove = { t: performance.now(), vx: 0, vy: 0 }; }
  else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: view.fov }; downInfo = null; }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2 && pinch0) {
    const [a, b] = [...pointers.values()];
    view.fov = Math.max(32, Math.min(88, pinch0.fov * pinch0.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))));
    dirty = true; return;
  }
  if (!dragging) return;
  if (downInfo) downInfo.moved += Math.abs(dx) + Math.abs(dy);
  const k = (view.fov / 72) * (Math.PI / canvas.clientHeight) * LOOK_SENS;
  view.yaw -= dx * k; view.pitch = Math.max(-1.25, Math.min(1.25, view.pitch + dy * k));
  const now = performance.now(), dtm = Math.max(1, now - lastMove.t) / 1000;
  lastMove = { t: now, vx: mix(lastMove.vx, -dx * k / dtm, 0.5), vy: mix(lastMove.vy, dy * k / dtm, 0.5) };
  if (downInfo && downInfo.moved > 6) setAuto(false);
  dirty = true;
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    dragging = false; canvas.classList.remove('is-dragging'); pinch0 = null;
    if (downInfo && downInfo.moved < 10 && performance.now() - downInfo.t < 500) onTap(e.clientX, e.clientY);
    else if (performance.now() - lastMove.t < 80) { spin.v = Math.max(-6, Math.min(6, lastMove.vx)); spin.p = Math.max(-3, Math.min(3, lastMove.vy)) * 0.5; }
    downInfo = null;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.fov = Math.max(32, Math.min(88, view.fov + e.deltaY * 0.03)); dirty = true; }, { passive: false });

function onTap(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  let hits = raycaster.intersectObjects(hotspots, false);
  if (hits.length) { setAuto(false); goTo(hits[0].object.userData.node); return; }
  const dm = []; discs.forEach((d) => { if (d.visible) dm.push(...d.children); });
  hits = raycaster.intersectObjects(dm, false);
  if (hits.length) { setAuto(false); goTo(hits[0].object.userData.node); return; }
  const dir = raycaster.ray.direction;
  if (dir.y < 0.3) { setAuto(false); stepToward(Math.atan2(dir.x, -dir.z)); }
}

// ------------------------------------------------------------------
// Render: fast pass while moving, HQ (GTAO + bloom) when still
// ------------------------------------------------------------------
let composer, gtao, bloom;
function setupComposer() {
  if (LOW) return;
  const rt = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 1.0;
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: isMobile ? 12 : 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  composer.addPass(gtao);
  bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.26, 0.5, 1.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
let ao = 1, bloomOn = true, frameAvg = 1 / 60, last = performance.now(), mapTick = 0;
function setRes(scale) {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = DPR_MAX * scale;
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); }
}
let booted = false;
function resize() {
  if (!booted) return;
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  if (w < h) view.fov = Math.max(view.fov, 82);
  camera.updateProjectionMatrix();
  setRes(dprScale);
  resizeMap(); dirty = true;
}
window.addEventListener('resize', resize);
/** adapt resolution between walks (never mid-motion, so nothing pops) */
let aoOn = !LOW;
function adaptResolution() {
  if (frameAvg > 1 / 40 && aoOn) { aoOn = false; bloomOn = false; }          // weak GPU: drop post effects first
  else if (frameAvg > 1 / 45 && dprScale > 0.6) { dprScale = Math.max(0.6, dprScale - 0.12); setRes(dprScale); }
  else if (frameAvg < 1 / 100 && dprScale < 1) { dprScale = Math.min(1, dprScale + 0.05); setRes(dprScale); }
}
function render() {
  if (!composer) { renderer.render(scene, camera); return; }
  gtao.enabled = aoOn && ao > 0.005;
  gtao.blendIntensity = smooth(0, 1, ao);
  bloom.enabled = bloomOn;
  composer.render();
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt);
  // ambient occlusion fades out while walking / dragging and back in when still
  const aoTarget = (moving || dragging || !aoOn) ? 0 : 1;
  if (ao !== aoTarget) {
    ao = aoTarget ? Math.min(1, ao + dt / 0.7) : Math.max(0, ao - dt / 0.3);
    dirty = true;
  }
  if (dirty) {
    applyCamera();
    render();
    if (moving && (ao === 0 || !aoOn)) frameAvg = mix(frameAvg, dt, 0.05);
    mapTick += dt;
    if (mapTick > 0.05 || !moving) { drawMap(); mapTick = 0; }
    dirty = false;
  }
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
const bar = $('intro-bar'), introBtn = $('intro-btn');
const setBar = (v) => { bar.style.width = (v * 100).toFixed(0) + '%'; };
const tick = () => new Promise((r) => setTimeout(r, 0));
async function boot() {
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]);
  await loadPhotos((p) => setBar(p * 0.25));
  const steps = [buildGeneratedTextures, buildMaterials, buildShell, buildGround, flushPearls, buildFirst,
    () => { mergeStatic(shell); mergeStatic(floors[0]); mergeStatic(floors[1]); }, buildLights, finishMaterials, buildDiscs, setupComposer];
  for (let i = 0; i < steps.length; i++) { steps[i](); setBar(0.25 + 0.75 * (i + 1) / steps.length); await tick(); }
  booted = true; resize();
  floors[0].visible = floors[1].visible = true;
  renderer.compile(scene, camera);
  renderer.shadowMap.needsUpdate = true;
  applyCamera();
  render();
  onArrive();
  requestAnimationFrame(loop);
  introBtn.disabled = false; introBtn.querySelector('.btn__label').textContent = 'Start the 3D tour';
  $('intro-tour').disabled = false;
  window.__showroom = {
    goTo, NODES, view,
    jump(i) { moving = null; current = i; const n = NODES[i]; pos.set(n.x, n.y, n.z); view.yaw = n.yaw * Math.PI / 180; view.pitch = PITCH0; ao = 1; onArrive(); dirty = true; },
    setAuto,
    sim(dt) { update(dt); return { current, yaw: view.yaw, pitch: view.pitch, x: pos.x, y: pos.y, z: pos.z, moving: !!moving }; },
    state: () => ({ current, moving: !!moving, hq: (ao >= 1 || !aoOn) && !dirty, low: LOW, auto: autoTour, yaw: view.yaw, x: pos.x, z: pos.z, dpr: renderer.getPixelRatio() }),
    render: () => { dirty = true; },
    info: () => renderer.info.render,
    plan(fl) {   // debug: orthographic top view of one floor, cut below its ceiling
      const cut = fl ? F1_CEIL - 0.3 : G_CEIL - 0.4;
      renderer.clippingPlanes = [new T.Plane(new T.Vector3(0, -1, 0), cut)];
      floors[0].visible = !fl; floors[1].visible = !!fl;
      const asp = window.innerWidth / window.innerHeight, hh = 6.2;
      const oc = new T.OrthographicCamera(-hh * asp, hh * asp, hh, -hh, 0.1, 100);
      oc.position.set(W / 2 - 1, 40, D / 2); oc.up.set(0, 0, -1); oc.lookAt(W / 2 - 1, 0, D / 2);
      if (!composer) renderer.render(scene, oc);
      else { gtao.enabled = false; bloom.enabled = false; const rp = composer.passes[0]; rp.camera = oc; composer.render(); rp.camera = camera; }
      renderer.clippingPlanes = [];
    }
  };
}
introBtn.addEventListener('click', () => { $('intro').classList.add('is-hidden'); dirty = true; });
$('intro-tour').addEventListener('click', () => { $('intro').classList.add('is-hidden'); dirty = true; setTimeout(() => setAuto(true), 700); });
boot().catch((e) => { console.error(e); introBtn.querySelector('.btn__label').textContent = 'Error: ' + e.message; });
