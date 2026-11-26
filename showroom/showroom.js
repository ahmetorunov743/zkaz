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
const W = 26, D = 9;
const G_CEIL = 3.6;            // ground floor ceiling (slats)
const F1 = 3.9;                // first floor level
const F1_CEIL = F1 + 3.3;      // first floor ceiling
const EYE = 1.6;
// stair: foot at the back (next to the kitchen), climbs towards the facade
const STAIR_X0 = 24.45, STAIR_X1 = 25.95, STAIR_Z0 = 1.5, STAIR_Z1 = 7.3, STEPS = 20;
const DOOR_X0 = 12.2, DOOR_X1 = 13.8;

// ------------------------------------------------------------------
// Renderer
// ------------------------------------------------------------------
const canvas = $('scene');
let renderer;
try {
  renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) { $('nowebgl').hidden = false; throw e; }
const isMobile = Math.min(window.innerWidth, window.innerHeight) < 700 || /Android|iPhone|iPad/i.test(navigator.userAgent);
const DPR_MAX = Math.min(window.devicePixelRatio || 1, 2);
let dprScale = isMobile ? 0.8 : 1;           // adaptive while moving
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
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
const phys = (o) => new T.MeshPhysicalMaterial(o);
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
function cyl(rt, rb, h, mat, x, y0, z, seg) {
  const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 32), mat);
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
  const m = new T.Mesh(new T.LatheGeometry(points.map((p) => new T.Vector2(p[0], p[1])), seg || 28), mat);
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
      const m = new T.Mesh(new T.SphereGeometry(r, 18, 12), pick([MT.stoneware, MT.ceramic, MT.clay, MT.travBlock]));
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
  const geo = new T.SphereGeometry(0.05, 18, 12);
  geo.scale(1, 1.08, 1);
  const im = new T.InstancedMesh(geo, MT.pearl, pearlPts.length);
  const m = new T.Matrix4();
  pearlPts.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m); });
  shell.add(im);
  const rm = new T.InstancedMesh(new T.CylinderGeometry(0.018, 0.018, 0.035, 10), MT.bronze, pearlPts.length);
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
// BUILDING SHELL
// ------------------------------------------------------------------
function buildShell() {
  target = shell;
  plane(W, D, MT.trav, W / 2, 0, D / 2, -Math.PI / 2);
  // first floor slab: everything except the stair void (x > STAIR_X0, z < STAIR_Z1)
  plane(STAIR_X0, D, MT.trav, STAIR_X0 / 2, F1, D / 2, -Math.PI / 2);
  plane(W - STAIR_X0, D - STAIR_Z1, MT.trav, (W + STAIR_X0) / 2, F1, (D + STAIR_Z1) / 2, -Math.PI / 2);
  box(0.06, F1 - G_CEIL, STAIR_Z1, MT.oak, STAIR_X0, (F1 + G_CEIL) / 2, STAIR_Z1 / 2);
  box(W - STAIR_X0, F1 - G_CEIL, 0.06, MT.oak, (W + STAIR_X0) / 2, (F1 + G_CEIL) / 2, STAIR_Z1);

  // ceilings
  slatCeiling(0, STAIR_X0, 0, D, G_CEIL, 'x');
  slatCeiling(STAIR_X0, W, STAIR_Z1, D, G_CEIL, 'x');
  plane(STAIR_X0, D, MT.ceilDark, STAIR_X0 / 2, G_CEIL + 0.12, D / 2, Math.PI / 2);
  plane(W - STAIR_X0, D - STAIR_Z1, MT.ceilDark, (W + STAIR_X0) / 2, G_CEIL + 0.12, (D + STAIR_Z1) / 2, Math.PI / 2);
  slatCeiling(5.7, 17, 0, D, F1_CEIL, 'z');
  plane(5.7, D, MT.oakPanel, 2.85, F1_CEIL, D / 2, Math.PI / 2);
  plane(W - 17, D, MT.oakPanel, (W + 17) / 2, F1_CEIL, D / 2, Math.PI / 2);
  plane(W, D, MT.ceilDark, W / 2, F1_CEIL + 0.12, D / 2, Math.PI / 2);
  for (let tx = 2; tx < 24; tx += 4.2) {
    box(0.05, 0.04, 6, MT.blackMetal, tx, G_CEIL - 0.03, 4.5);
    box(0.05, 0.04, 6, MT.blackMetal, tx, F1_CEIL - 0.03, 4.5);
    for (let s = 0; s < 3; s++) {
      cyl(0.03, 0.03, 0.12, MT.blackMetal, tx, G_CEIL - 0.17, 2.5 + s * 2, 12);
      cyl(0.03, 0.03, 0.12, MT.blackMetal, tx, F1_CEIL - 0.17, 2.5 + s * 2, 12);
    }
  }

  // walls
  const wallH = F1_CEIL + 0.2;
  box(W, wallH, 0.2, MT.plaster, W / 2, wallH / 2, -0.1);
  box(0.2, wallH, D, MT.oakPanel, -0.1, wallH / 2, D / 2);
  box(0.2, wallH, D, MT.plaster, W + 0.1, wallH / 2, D / 2);
  boxB(W, 0.06, 0.02, MT.bronze, W / 2, 0, 0.01);
  boxB(W, 0.06, 0.02, MT.bronze, W / 2, F1, 0.01);
  box(W, F1 - G_CEIL + 0.3, 0.3, MT.oak, W / 2, (F1 + G_CEIL) / 2, D + 0.1);
  box(W, 0.4, 0.3, MT.oak, W / 2, F1_CEIL + 0.1, D + 0.1);

  facade(0, G_CEIL, [[0.3, 5.9], [6.3, 11.9], [14.1, 19.3], [19.7, 23.6]], MT.oak, true);
  facade(F1, F1_CEIL - F1, [[0.6, 4.9], [6.4, 8.4], [9.0, 11.4], [13.1, 16.2], [17.6, 21.4], [22.6, 23.9]], MT.facadeStone, false);
  entranceDoor();
  buildStair();

  // outside
  const sky = new T.Mesh(new T.SphereGeometry(100, 32, 16), MT.sky);
  sky.position.set(13, 0, 4.5); shell.add(sky);
  plane(200, 200, MT.ground, 13, -0.06, 20, -Math.PI / 2);
  boxB(W + 4, 0.06, 2.0, MT.travBlock, W / 2, -0.06, 10.0);
  boxB(11.6, 1.5, 1.2, MT.hedge, 13 - 7.4 - 1.8, -0.05, 11.6);
  boxB(11.6, 1.5, 1.2, MT.hedge, 13 + 7.4 + 1.8, -0.05, 11.6);
  [[11.4, 11.6], [14.6, 11.6]].forEach((p) => cyl(0.35, 0.3, 0.7, MT.charcoal, p[0], -0.05, p[1], 24));
  palm(3, 15, 8.5); palm(9.0, 17, 9.5); palm(17.5, 15.5, 8); palm(22, 16.5, 10); palm(-4, 12, 9); palm(29, 12, 8.5); palm(11.2, 13.2, 6.5); palm(14.9, 13.4, 7);
  [[-14, 34, 16, 6], [6, 40, 20, 9], [28, 36, 14, 7], [44, 28, 10, 5], [-30, 22, 12, 8]].forEach((b) => boxB(b[2], b[3], 8, MT.cream, b[0], -0.05, b[1]));
}

function facade(y0, h, wins, solidMat, curtains) {
  const edges = [0];
  wins.forEach((w) => edges.push(w[0], w[1]));
  edges.push(W);
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i], b = edges[i + 1];
    if (b - a > 0.01 && !(y0 === 0 && a < DOOR_X1 && b > DOOR_X0)) box(b - a, h, 0.3, solidMat, (a + b) / 2, y0 + h / 2, D + 0.1);
  }
  wins.forEach((w) => {
    const x0 = w[0], x1 = w[1], len = x1 - x0;
    box(len, h, 0.02, MT.glass, (x0 + x1) / 2, y0 + h / 2, D + 0.05);
    const n = Math.max(1, Math.round(len / 1.6));
    for (let k = 0; k <= n; k++) boxB(0.05, h, 0.08, MT.bronze, x0 + k * len / n, y0, D + 0.05);
    boxB(len, 0.05, 0.1, MT.bronze, (x0 + x1) / 2, y0, D + 0.05);
    boxB(len, 0.05, 0.1, MT.bronze, (x0 + x1) / 2, y0 + h - 0.05, D + 0.05);
    if (curtains) {
      const cg = group(x0 + 0.25, y0, D - 0.12, 0);
      within(cg, () => { for (let k = 0; k < 4; k++) cyl(0.06, 0.06, h - 0.1, MT.sandFab, -0.12 + k * 0.08, 0, Math.sin(k * 2) * 0.04, 12); });
    }
  });
}

function entranceDoor() {
  const cx = (DOOR_X0 + DOOR_X1) / 2;
  boxB(0.3, G_CEIL, 0.34, MT.oak, 11.9 + 0.15, 0, D + 0.1);
  boxB(0.3, G_CEIL, 0.34, MT.oak, 14.1 - 0.15, 0, D + 0.1);
  box(DOOR_X1 - DOOR_X0, 0.5, 0.3, MT.oak, cx, G_CEIL - 0.25, D + 0.1);
  boxB(DOOR_X1 - DOOR_X0 + 0.1, 0.06, 0.12, MT.bronze, cx, G_CEIL - 0.56, D + 0.05);
  // two sliding leaves parked behind the fixed glass
  [[11.35, 1], [14.65, -1]].forEach((p) => {
    boxB(0.85, G_CEIL - 0.6, 0.02, MT.glass, p[0], 0.02, D - 0.06);
    boxB(0.04, G_CEIL - 0.6, 0.05, MT.bronze, p[0] + p[1] * 0.42, 0.02, D - 0.06);
    boxB(0.02, 1.1, 0.04, MT.brass, p[0] + p[1] * 0.33, 0.6, D - 0.11);
  });
  boxB(4.0, 0.14, 1.6, MT.oak, cx, G_CEIL - 0.3, D + 1.0);
  box(3.8, 0.012, 0.02, MT.led, cx, G_CEIL - 0.31, D + 1.75);
  boxB(1.4, 0.012, 0.9, MT.rugDark, cx, 0, D - 0.55);
}

function slatCeiling(x0, x1, z0, z1, y, along) {
  const gap = 0.1, w = 0.04, d = 0.09;
  const span = along === 'x' ? (x1 - x0) : (z1 - z0);
  const len = along === 'x' ? (z1 - z0) : (x1 - x0);
  const count = Math.floor(span / gap);
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

function buildStair() {
  const rise = F1 / STEPS, run = (STAIR_Z1 - STAIR_Z0) / STEPS;
  const w = STAIR_X1 - STAIR_X0, cx = (STAIR_X0 + STAIR_X1) / 2;
  for (let i = 0; i < STEPS; i++) {
    const y = (i + 1) * rise, z = STAIR_Z0 + (i + 0.5) * run;
    box(w, 0.05, run + 0.02, MT.travBlock, cx, y - 0.025, z);
    box(w, rise, 0.02, MT.travBlock, cx, y - rise / 2, z - run / 2);
    box(w - 0.1, 0.01, 0.02, MT.led, cx, y - 0.06, z - run / 2 - 0.012);
  }
  const len = Math.hypot(F1, STAIR_Z1 - STAIR_Z0);
  const under = box(w, 0.08, len, MT.plaster, cx, F1 / 2 - 0.2, (STAIR_Z0 + STAIR_Z1) / 2);
  under.rotation.x = -Math.atan2(F1, STAIR_Z1 - STAIR_Z0);
  // wall between kitchen and stair, rounded at the stair entrance (back)
  const wz0 = 2.25;
  box(0.25, G_CEIL, D - wz0, MT.beigeLacquer, STAIR_X0 - 0.12, G_CEIL / 2, (D + wz0) / 2);
  const curve = new T.Mesh(new T.CylinderGeometry(0.125, 0.125, G_CEIL, 24, 1, false, Math.PI, Math.PI), MT.beigeLacquer);
  curve.position.set(STAIR_X0 - 0.12, G_CEIL / 2, wz0); shell.add(curve);
  // blue arched niche with an oak block at the foot
  const niche = new T.Shape();
  niche.moveTo(-0.4, 0); niche.lineTo(-0.4, 1.3); niche.absarc(0, 1.3, 0.4, Math.PI, 0, true); niche.lineTo(0.4, 0); niche.closePath();
  const nm = new T.Mesh(new T.ExtrudeGeometry(niche, { depth: 0.03, bevelEnabled: false, curveSegments: 24 }), MT.blueLacquer);
  nm.rotation.y = Math.PI / 2; nm.position.set(STAIR_X0 + 0.005, 0, 3.0); shell.add(nm);
  rbox(0.32, 1.05, 0.62, 0.12, MT.oak, STAIR_X0 + 0.16, 0, 3.0);
  // sculptural sconces on the right wall, following the stair
  [[1.3, 2.2], [2.0, 3.0], [2.2, 3.4], [3.1, 4.7], [4.1, 6.1]].forEach((p, i) => {
    const m = new T.Mesh(new T.TorusGeometry(0.11, 0.022, 10, 32), MT.bronze);
    m.position.set(W - 0.04, p[0] + 0.6, p[1]); m.rotation.y = Math.PI / 2; shell.add(m);
    const l = new T.Mesh(new T.CircleGeometry(0.09, 24), MT.glow);
    l.position.set(W - 0.035, p[0] + 0.6, p[1]); l.rotation.y = -Math.PI / 2; shell.add(l);
    if (i < 4) { const a = box(0.02, 0.02, 0.5, MT.bronze, W - 0.04, p[0] + 0.85, p[1] + 0.3); a.rotation.x = -0.7; }
  });
  box(0.02, 1.0, STAIR_Z1, MT.glass, STAIR_X0 - 0.02, F1 + 0.5, STAIR_Z1 / 2);
  box(0.05, 0.05, STAIR_Z1, MT.bronze, STAIR_X0 - 0.02, F1 + 1.0, STAIR_Z1 / 2);
  fpRect(0, STAIR_X0, STAIR_Z0, STAIR_X1, STAIR_Z1, 's');
  fpRect(1, STAIR_X0, 0, STAIR_X1, STAIR_Z1, 's');
  fpRect(0, STAIR_X0 - 0.25, wz0, STAIR_X0, D, 'w');
}

// ------------------------------------------------------------------
// GROUND FLOOR
// ------------------------------------------------------------------
function buildGround() {
  target = floors[0];
  const f = 0;

  // --- Reception (x 0..3.3) -------------------------------------
  box(0.04, G_CEIL, 4.6, MT.weave, 0.02, G_CEIL / 2, 6.5);
  box(0.05, 2.2, 2.4, MT.beigeLacquer, 0.05, 1.7, 6.4);
  rbox(0.6, 0.9, 2.2, 0.04, MT.blueLacquer, 0.35, 0, 6.4);
  boxB(0.66, 0.05, 2.26, MT.marbleWarm, 0.36, 0.9, 6.4);
  boxB(0.25, 0.02, 1.8, MT.oak, 0.16, 1.55, 6.4);
  boxB(0.25, 0.02, 1.8, MT.oak, 0.16, 1.2, 6.4);
  const rowG = group(0.16, 1.22, 7.25, Math.PI / 2);
  within(rowG, () => bookRow(0, 0, 0, 0.6, 0.3, 0.16));
  [[5.9, 0], [6.4, 1], [6.9, 2]].forEach((a) => {
    boxB(0.03, 0.55, 0.42, MT.art[a[1]], 0.08, 1.9, a[0]);
    boxB(0.02, 0.6, 0.47, MT.white, 0.065, 1.875, a[0]);
  });
  carafe(0.35, 0.95, 5.65, 1.1); carafe(0.35, 0.95, 5.9, 1.1);
  boxB(0.32, 0.36, 0.28, MT.mirror, 0.33, 0.95, 7.05); boxB(0.26, 0.06, 0.2, MT.blackMetal, 0.35, 1.0, 7.05);
  cyl(0.02, 0.02, 0.08, MT.blackMetal, 0.48, 1.12, 7.0, 10);
  [6.3, 6.42, 6.54].forEach((z) => lathe([[0.001, 0], [0.03, 0], [0.04, 0.07], [0.036, 0.07], [0.026, 0.008], [0.001, 0.008]], MT.ceramic, 0.4, 0.95, z, 16));
  blob(0.35, 0, 6.4, 1.0, 2.6);
  fpRect(f, 0, 5.3, 0.66, 7.5);
  sector(1.25, 8.0, 0.95, 1.3, Math.PI, Math.PI * 1.75, 0.06, 1.02, MT.marbleWarm, 0.02);
  sector(1.25, 8.0, 0.95, 1.36, Math.PI * 1.75, Math.PI * 2.15, 0.06, 1.02, MT.marbleBlue, 0.02);
  sector(1.25, 8.0, 0.9, 1.25, Math.PI, Math.PI * 2.15, 0, 0.06, MT.bronze, 0);
  sector(1.25, 8.0, 1.26, 1.3, Math.PI, Math.PI * 1.75, 0.05, 0.012, MT.led, 0);
  sector(1.25, 8.0, 0.85, 1.42, Math.PI * 1.02, Math.PI * 2.1, 1.08, 0.04, MT.marbleBlue, 0.01);
  const tx = new T.Mesh(new T.CylinderGeometry(1.305, 1.305, 0.3, 64, 1, true, Math.PI * 0.62, Math.PI * 0.5), MT.deskText);
  tx.position.set(1.25, 0.62, 8.0); add(tx);
  blob(1.25, 0, 7.6, 3.0, 1.8);
  fpArc(f, 1.25, 8.0, 0.95, 1.36, Math.PI, Math.PI * 2.15);
  diningChair(1.0, 8.55, Math.PI, MT.leather);
  // olive lounge
  oliveTree(1.0, 1.2, 0, 1.1);
  fpCirc(f, 1.0, 1.2, 0.55);
  cyl(1.0, 1.0, 0.015, MT.rugDark, 2.1, 0, 2.0, 64);
  const rc = group(2.1, 0, 2.0, -0.6);
  within(rc, () => {
    cyl(0.62, 0.62, 0.38, MT.oliveFab, 0, 0.08, 0, 48);
    cyl(0.58, 0.58, 0.08, MT.leatherDark, 0, 0, 0, 40);
    const back = new T.Mesh(new T.CylinderGeometry(0.66, 0.66, 0.72, 40, 1, false, Math.PI * 0.75, Math.PI * 1.1), MT.leather);
    back.position.set(0, 0.42, 0); add(back);
    pillow(-0.2, 0.46, -0.38, MT.leather, 0.3); strapPillow(0.22, 0.46, -0.36, MT.oliveFab, -0.3); pillow(0, 0.5, -0.46, MT.weave, 0);
    blob(0, 0.016, 0, 1.6, 1.6);
  });
  fpCirc(f, 2.1, 2.0, 0.66);
  sideTable(3.0, 1.2);
  carafe(3.0, 0.46, 1.25, 0.8); glassCup(2.88, 0.46, 1.1);

  // --- Living zone 1 (x 3.3..11.6) ------------------------------
  const cx = 7.6, cz = 4.3;
  cyl(3.0, 3.0, 0.015, MT.rug, cx, 0, cz, 96);
  cyl(3.07, 3.07, 0.01, MT.leatherDark, cx, 0, cz, 96);
  fpCirc(f, cx, cz, 3.0, 'rug');
  const a0 = Math.PI * 1.08, a1 = Math.PI * 1.92;
  sector(cx, cz, 1.85, 2.75, a0, a1, 0.09, 0.36, MT.boucle, 0.08);
  sector(cx, cz, 2.5, 2.85, a0, a1, 0.09, 0.86, MT.boucle, 0.11);
  sector(cx, cz, 1.83, 2.87, a0, a1, 0, 0.1, MT.leather, 0.02);
  sector(cx, cz, 2.84, 2.9, a0, a1, 0.12, 0.7, MT.leather, 0.01);
  fpArc(f, cx, cz, 1.85, 2.9, a0, a1);
  for (let k = 0; k < 9; k++) {
    const a = a0 + (a1 - a0) * (k + 0.5) / 9;
    const px = cx + Math.cos(a) * 2.45, pz = cz + Math.sin(a) * 2.45;
    const mats = [MT.boucle, MT.slateFab, MT.leather];
    const p = k % 3 === 1 ? strapPillow(px, 0.44, pz, MT.boucle, 0) : pillow(px, 0.44, pz, mats[k % 3], 0, -0.3);
    p.rotation.y = Math.PI / 2 - a;
    if (k % 2 === 0) {
      const st = boxB(0.06, 0.8, 0.03, MT.leather, cx + Math.cos(a + 0.09) * 2.88, 0.1, cz + Math.sin(a + 0.09) * 2.88);
      st.rotation.y = Math.PI / 2 - (a + 0.09);
    }
  }
  for (let k = 0; k <= 12; k++) {
    const a = a0 + (a1 - a0) * k / 12;
    blob(cx + Math.cos(a) * 2.4, 0.015, cz + Math.sin(a) * 2.4, 1.4, 1.4);
  }
  [[Math.PI * 0.82, 2.15, chunkyChair], [Math.PI * 0.2, 2.15, chunkyChair], [Math.PI * 0.5, 2.5, loungeChair]].forEach((c) => {
    const px = cx + Math.cos(c[0]) * c[1], pz = cz + Math.sin(c[0]) * c[1];
    const ch = c[2](px, pz, 0);
    ch.rotation.y = Math.atan2(cx - px, cz - pz);
    ch.position.y = 0.015;
    fpCirc(f, px, pz, 0.5);
  });
  roundTable(cx + 0.3, cz - 0.1, 0.72, 0.38, MT.marbleWarm, MT.leatherDark, f);
  roundTable(cx - 0.75, cz - 0.55, 0.42, 0.44, MT.marbleWarm, MT.blueLacquer, f);
  sideTable(cx + 1.2, cz - 1.0);
  cyl(0.35, 0.38, 0.32, MT.bronze, cx - 0.4, 0, cz + 0.75, 40);
  bookStack(cx + 0.15, 0.38, cz - 0.2, 0.32, 0.3, 3);
  sculpture(cx + 0.15, 0.48, cz - 0.2, 0.9);
  tray(cx + 0.6, 0.38, cz + 0.15, 0.2); carafe(cx + 0.6, 0.405, cz + 0.15, 0.85); glassCup(cx + 0.7, 0.405, cz + 0.05);
  bowl(cx - 0.75, 0.44, cz - 0.55, 0.14, MT.bronze);
  bookStack(cx + 1.2, 0.46, cz - 1.0, 0.24, -0.4, 2);
  shelving(3.2, 11.4, 0, 0, 3.5, 0.42, MT.marbleBlue, { rows: 6, col: 1.05 });
  fpRect(f, 3.2, 0, 11.4, 0.42);
  shelving(0, 3.6, 0, 0, 3.5, 0.36, MT.marbleBlue, { rows: 6, col: 0.9, place: { x: 11.8, z: 0.5, ry: -Math.PI / 2 } });
  for (let i = 0; i < 5; i++) boxB(0.03, 3.5, 0.03, MT.bronze, 11.98, 0, 4.1 + i * 0.36);
  boxB(0.04, 0.04, 1.5, MT.bronze, 11.98, 3.48, 4.8);
  [[0.6, 4.5, 0.32, 0.9], [1.5, 4.95, 0.36, 0.7], [2.4, 4.42, 0.3, 0.8], [2.1, 5.1, 0.25, 0.6], [1.0, 5.15, 0.26, 0.5], [3.0, 4.9, 0.3, 0.7], [0.3, 5.0, 0.2, 0.45]].forEach((p) => {
    const s = new T.Shape(); s.absellipse(0, 0, p[2], p[3] / 2, 0, Math.PI * 2, false, 0);
    const m = new T.Mesh(new T.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3, curveSegments: 24 }), MT.amberGlass);
    m.position.set(11.98, p[0] + 0.3, p[1]); m.rotation.y = Math.PI / 2; add(m);
  });
  fpRect(f, 11.6, 0.5, 12.0, 5.4);
  const y = G_CEIL - 0.02;
  garland([4.6, y, 2.0], [10.6, y, 3.4], 0.85);
  garland([5.0, y, 6.6], [10.2, y, 1.6], 1.0);
  garland([6.0, y, 1.4], [9.4, y, 7.0], 0.95);
  garland([4.4, y, 4.4], [10.9, y, 5.6], 0.75);
  garland([7.6, y, 1.0], [11.2, y, 7.0], 0.6);
  garland([3.8, y, 6.8], [7.6, y, 1.0], 0.65);
  garland([5.6, y, 3.0], [9.6, y, 3.0], 0.55);

  // --- Living zone 2 (x 12..16) L-sofa --------------------------
  const sx = 12.4;
  rbox(2.8, 0.42, 0.95, 0.12, MT.boucle, sx + 1.55, 0.07, 1.0);
  rbox(2.8, 0.45, 0.28, 0.12, MT.boucle, sx + 1.55, 0.47, 0.62);
  rbox(0.95, 0.42, 1.7, 0.12, MT.boucle, sx + 0.65, 0.07, 2.3);
  rbox(0.28, 0.45, 1.7, 0.12, MT.boucle, sx + 0.32, 0.47, 2.3);
  rbox(2.9, 0.08, 1.0, 0.025, MT.leather, sx + 1.6, 0, 1.0);
  rbox(1.0, 0.08, 1.8, 0.025, MT.leather, sx + 0.65, 0, 2.3);
  boxB(0.1, 0.8, 0.98, MT.leather, sx + 3.0, 0.06, 1.0);
  boxB(0.98, 0.8, 0.1, MT.leather, sx + 0.65, 0.06, 3.15);
  pillow(sx + 1.2, 0.5, 0.86, MT.leather, 0); strapPillow(sx + 1.8, 0.5, 0.86, MT.boucle, 0); pillow(sx + 2.4, 0.5, 0.86, MT.oliveFab, 0);
  pillow(sx + 0.56, 0.5, 1.9, MT.slateFab, Math.PI / 2);
  blob(sx + 1.6, 0, 1.0, 3.4, 1.5); blob(sx + 0.65, 0, 2.3, 1.5, 2.3);
  fpRect(f, sx + 0.15, 0.5, sx + 3.05, 1.5); fpRect(f, sx + 0.15, 0.5, sx + 1.15, 3.2);
  cyl(2.0, 2.0, 0.012, MT.rugGrey, sx + 1.9, 0, 2.4, 64);
  rbox(1.0, 0.36, 0.7, 0.08, MT.bronze, sx + 2.0, 0.012, 2.3);
  rbox(0.7, 0.28, 0.55, 0.08, MT.bronze, sx + 2.6, 0.012, 2.75);
  blob(sx + 2.2, 0.012, 2.5, 1.6, 1.2);
  vase(sx + 1.85, 0.37, 2.25, 0.3, MT.ceramic);
  bookStack(sx + 2.25, 0.37, 2.3, 0.28, 0.4, 2);
  bowl(sx + 2.6, 0.29, 2.75, 0.12, MT.stoneware);
  // feature wall behind the sofa: stone panel + round bronze étagères
  box(1.7, 1.05, 0.03, MT.marbleBlue, sx + 1.55, 2.25, 0.05);
  box(1.8, 1.15, 0.025, MT.bronze, sx + 1.55, 2.25, 0.03);
  box(1.4, 0.012, 0.03, MT.led, sx + 1.55, 2.86, 0.09);
  [sx + 0.35, sx + 2.75].forEach((ex) => cageShelf(ex, 1.0, 0.28, 2.2));

  // --- Work table zone (x 15.2..19) ---------------------
  box(4.4, G_CEIL, 0.04, MT.weave, 17.0, G_CEIL / 2, 0.02);
  box(3.4, 2.6, 0.06, MT.beigeLacquer, 17.0, 1.3, 0.05);
  [15.9, 18.1].forEach((x) => {
    rbox(0.95, 1.05, 0.5, 0.02, MT.greyLacquer, x, 0.75, 0.32);
    boxB(0.92, 0.03, 0.46, MT.bronze, x, 0.72, 0.32);
    [[-0.43, -0.2], [0.43, -0.2], [-0.43, 0.2], [0.43, 0.2]].forEach((q) => boxB(0.025, 0.72, 0.025, MT.bronze, x + q[0], 0, 0.32 + q[1]));
    boxB(0.02, 0.3, 0.03, MT.brass, x - 0.05, 1.2, 0.585); boxB(0.02, 0.3, 0.03, MT.brass, x + 0.05, 1.2, 0.585);
    box(0.005, 0.95, 0.01, MT.charcoal, x, 1.27, 0.575);
    blob(x, 0, 0.35, 1.2, 0.8);
  });
  boxB(0.4, 1.6, 0.05, MT.walnut, 16.75, 0.2, 0.12); boxB(0.4, 1.6, 0.05, MT.walnut, 17.25, 0.2, 0.12);
  box(0.03, 1.4, 0.02, MT.led, 16.97, 1.0, 0.16); box(0.03, 1.4, 0.02, MT.led, 17.03, 1.0, 0.16);
  boxB(3.0, 0.05, 0.3, MT.bronze, 17.0, 0.72, 0.5);
  sculpture(16.6, 0.77, 0.5, 1.2); vase(17.4, 0.77, 0.5, 0.35, MT.stoneware);
  fpRect(f, 15.4, 0, 18.6, 0.6);
  const tbl = group(17.0, 0, 3.0, 0);
  within(tbl, () => {
    rbox(2.6, 0.05, 1.05, 0.015, MT.marbleWarm, 0, 0.72, 0);
    rbox(0.1, 0.72, 0.7, 0.03, MT.bronze, -0.7, 0, 0); rbox(0.1, 0.72, 0.7, 0.03, MT.bronze, 0.7, 0, 0);
    boxB(0.42, 0.015, 0.3, MT.paper, 0.35, 0.77, 0.05, 0.15); boxB(0.43, 0.006, 0.31, MT.books[1], 0.35, 0.765, 0.05, 0.15);
    tray(-0.35, 0.77, 0.05, 0.18); glassCup(-0.4, 0.795, 0.0); glassCup(-0.3, 0.795, 0.1); carafe(-0.36, 0.795, 0.02, 0.7);
    branches(0.95, 0.77, -0.15, 0.5);
    blob(0, 0.013, 0, 3.2, 1.7);
  });
  fpRect(f, 15.7, 2.45, 18.3, 3.55);
  boxB(4.0, 0.012, 2.8, MT.rugGrey, 17.0, 0, 3.0);
  [[16.3, 3.85, 0], [17.0, 3.85, 0], [17.7, 3.85, 0], [16.3, 2.15, Math.PI], [17.7, 2.15, Math.PI], [15.4, 3.0, -Math.PI / 2], [18.6, 3.0, Math.PI / 2]].forEach((c) => {
    diningChair(c[0], c[1], c[2], MT.suede, 0.46, 0.012);
  });

  // --- Kitchen (x 19.2..24) ------------------------------------
  const kx0 = 19.3, kx1 = 23.6, kc = (kx0 + kx1) / 2;
  boxB(kx1 - kx0, G_CEIL, 0.62, MT.beigeLacquer, kc, 0, 0.31);
  for (let x = kx0 + 0.6; x < kx1; x += 0.6) box(0.006, G_CEIL - 0.1, 0.01, MT.bronze, x, G_CEIL / 2, 0.625);
  const kcurve = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, G_CEIL, 32, 1, false, 0, Math.PI / 2), MT.beigeLacquer);
  kcurve.position.set(kx1, G_CEIL / 2, 0); add(kcurve);
  boxB(2.0, 1.1, 0.4, MT.walnut, 21.3, 1.0, 0.45);
  boxB(1.9, 1.0, 0.36, MT.ledSoft, 21.3, 1.05, 0.44);
  for (let s = 0; s < 3; s++) boxB(1.9, 0.02, 0.38, MT.walnut, 21.3, 1.05 + s * 0.33, 0.47);
  for (let s = 0; s < 3; s++) for (let k = 0; k < 9; k++) {
    const gx = 20.45 + k * 0.21, gy = 1.07 + s * 0.33;
    if (s === 1 && k > 5) { for (let p = 0; p < 6; p++) cyl(0.1, 0.09, 0.012, MT.ceramic, 21.85, gy + p * 0.014, 0.5, 24); break; }
    if (s === 2 && k % 3 === 2) { vase(gx, gy, 0.5, 0.2, MT.stoneware); continue; }
    lathe([[0.001, 0], [0.03, 0], [0.03, 0.005], [0.006, 0.01], [0.006, 0.09], [0.035, 0.12], [0.04, 0.2], [0.037, 0.2], [0.032, 0.13], [0.001, 0.1]], MT.glassSmoke, gx, gy, 0.5, 16);
  }
  boxB(2.1, 0.9, 0.7, MT.marbleWarm, 21.3, 0, 0.62);
  boxB(2.1, 0.05, 0.75, MT.marbleWarm, 21.3, 0.9, 0.62);
  cyl(0.012, 0.012, 0.3, MT.brass, 21.3, 0.95, 0.35, 12); box(0.012, 0.012, 0.18, MT.brass, 21.3, 1.25, 0.43);
  lathe([[0.001, 0], [0.07, 0], [0.08, 0.1], [0.06, 0.2], [0.001, 0.2]], MT.ceramic, 20.6, 0.95, 0.5, 20);
  fpRect(f, kx0, 0, kx1 + 0.3, 0.98);
  const isl = group(21.4, 0, 3.6, 0);
  within(isl, () => {
    rbox(3.4, 0.9, 1.1, 0.03, MT.marbleWarm, 0, 0.05, 0);
    boxB(3.3, 0.05, 1.0, MT.bronze, 0, 0, 0);
    boxB(3.6, 0.05, 0.45, MT.walnut, -0.1, 1.02, 0.65);
    boxB(0.06, 0.08, 0.4, MT.bronze, -1.2, 0.95, 0.65); boxB(0.06, 0.08, 0.4, MT.bronze, 1.0, 0.95, 0.65);
    boxB(0.6, 0.008, 0.42, MT.black, 0.6, 0.95, -0.15);
    [0.45, 0.6, 0.75].forEach((k) => { const kn = cyl(0.025, 0.025, 0.02, MT.blackMetal, k, 0.82, -0.56, 16); kn.rotation.x = Math.PI / 2; });
    vase(-0.6, 0.95, -0.2, 0.25, MT.glassSmoke);
    bowl(-1.05, 0.95, -0.15, 0.16, MT.ceramic);
    for (let i = 0; i < 4; i++) cyl(0.04, 0.04, 0.04, MT.clay, -1.05 + R(-0.05, 0.05), 1.0, -0.15 + R(-0.05, 0.05), 12);
    boxB(0.02, 0.6, 0.9, MT.walnut, 1.72, 0.15, 0);
    for (let p = 0; p < 8; p++) cyl(0.12, 0.11, 0.012, MT.ceramic, 1.55, 0.4 + p * 0.016, -0.2, 24);
    for (let p = 0; p < 5; p++) cyl(0.09, 0.08, 0.012, MT.stoneware, 1.55, 0.4 + p * 0.016, 0.2, 24);
    blob(0, 0, 0, 4.2, 1.8);
  });
  fpRect(f, 19.7, 3.05, 23.1, 4.15);
  [20.4, 21.2, 22.0].forEach((x) => diningChair(x, 4.55, 0, MT.suede, 0.72));
  branchLamp(21.4, G_CEIL, 3.6, 2.4);
  rbox(2.2, 0.42, 0.9, 0.12, MT.boucle, 22.9, 0.06, 8.2);
  rbox(2.2, 0.4, 0.26, 0.11, MT.boucle, 22.9, 0.45, 8.55);
  pillow(22.4, 0.5, 8.35, MT.oliveFab, 0); strapPillow(23.2, 0.5, 8.35, MT.boucle, 0);
  blob(22.9, 0, 8.2, 2.8, 1.4);
  fpRect(f, 21.8, 7.75, 24.0, 8.7);
  box(0.18, 1.6, 0.04, MT.ledSoft, 19.4, 1.8, 8.85); box(0.18, 1.6, 0.04, MT.ledSoft, 19.6, 1.8, 8.85);
  oliveTree(15.6, 8.3, 0, 0.8);
  fpCirc(f, 15.6, 8.3, 0.4);
  pottedPlant(5.4, 0, 8.6, 1.2);
  pottedPlant(19.0, 0, 1.0, 1.3);
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
}

// ------------------------------------------------------------------
// FIRST FLOOR
// ------------------------------------------------------------------
function buildFirst() {
  target = floors[1];
  const f = 1, y0 = F1, H = F1_CEIL - F1;

  // --- Office (x 0..5.7, z 0..4.6) & Meeting (z 4.6..9) ------------
  glassWall(0, 4.6, 4.25, 4.6, y0, H);
  glassWall(5.7, 0, 5.7, 6.1, y0, H);
  glassWall(5.7, 7.5, 5.7, D, y0, H);
  fpRect(f, 0, 4.55, 4.25, 4.65, 'w'); fpRect(f, 5.65, 0, 5.75, 6.1, 'w'); fpRect(f, 5.65, 7.5, 5.75, D, 'w');
  shelving(0, 3.6, 0, y0, 2.6, 0.36, MT.marbleGrey, { rows: 4, col: 0.9, place: { x: 0, z: 8.6, ry: Math.PI / 2 } });
  stoneSamples(0.2, y0 + 0.04, 5.2, 8.4);
  fpRect(f, 0, 5.0, 0.4, 8.6);
  const tb = group(2.8, y0, 6.8, 0);
  within(tb, () => {
    rbox(3.2, 0.05, 1.15, 0.02, MT.marbleGrey, 0, 0.72, 0);
    [-1.0, 1.0].forEach((px) => {
      boxB(0.7, 0.04, 0.7, MT.bronze, px, 0.02, 0); boxB(0.7, 0.04, 0.7, MT.bronze, px, 0.68, 0);
      [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]].forEach((q) => boxB(0.03, 0.66, 0.03, MT.bronze, px + q[0], 0.04, q[1]));
    });
    tray(0, 0.77, 0, 0.3);
    carafe(-0.05, 0.795, 0, 0.9); glassCup(0.12, 0.795, 0.08); glassCup(0.1, 0.795, -0.1);
    [-1.0, 1.0].forEach((px) => { boxB(0.3, 0.004, 0.22, MT.paper, px, 0.77, -0.3, 0.1); boxB(0.3, 0.004, 0.22, MT.paper, px + 0.2, 0.77, 0.3, -0.1); });
    blob(0, 0.013, 0, 4.0, 2.4);
  });
  fpRect(f, 1.2, 6.22, 4.4, 7.38);
  [[1.8, 6.0, Math.PI], [2.8, 6.0, Math.PI], [3.8, 6.0, Math.PI], [1.8, 7.6, 0], [2.8, 7.6, 0], [3.8, 7.6, 0]].forEach((c) => diningChair(c[0], c[1], c[2], MT.leather, 0.46, y0 + 0.012));
  [[2.0, 6.7, 0.24], [2.6, 6.95, 0.3], [3.3, 6.6, 0.22], [3.7, 7.0, 0.26]].forEach((p) => {
    const yy = F1_CEIL - 0.75 - p[2];
    box(0.006, F1_CEIL - yy, 0.006, MT.brass, p[0], (F1_CEIL + yy) / 2, p[1]);
    const gm = new T.Mesh(new T.SphereGeometry(p[2], 32, 20), MT.globe); gm.position.set(p[0], yy, p[1]); add(gm);
    box(0.025, p[2] * 1.4, 0.025, MT.led, p[0], yy, p[1]);
    cyl(0.03, 0.03, 0.03, MT.brass, p[0], yy + p[2] - 0.01, p[1], 12);
  });
  boxB(4.4, 0.012, 2.6, MT.rugGrey, 2.8, y0, 6.8);
  [[1.6, 1.7], [3.6, 1.7]].forEach((p) => {
    rbox(1.5, 0.04, 0.75, 0.01, MT.walnut, p[0], y0 + 0.72, p[1]);
    boxB(0.04, 0.72, 0.7, MT.bronze, p[0] - 0.7, y0, p[1]); boxB(0.04, 0.72, 0.7, MT.bronze, p[0] + 0.7, y0, p[1]);
    boxB(0.55, 0.34, 0.02, MT.black, p[0], y0 + 0.86, p[1] - 0.22); boxB(0.06, 0.12, 0.06, MT.blackMetal, p[0], y0 + 0.76, p[1] - 0.22);
    boxB(0.4, 0.012, 0.13, MT.charcoal, p[0], y0 + 0.76, p[1]);
    boxB(0.3, 0.008, 0.22, MT.paper, p[0] + 0.45, y0 + 0.76, p[1] + 0.05, 0.2);
    cyl(0.035, 0.035, 0.09, MT.ceramic, p[0] - 0.5, y0 + 0.76, p[1] + 0.1, 16);
    diningChair(p[0], p[1] + 0.7, 0, MT.boucle, 0.46, y0 + 0.012);
    blob(p[0], y0 + 0.013, p[1], 2.0, 1.3);
    fpRect(f, p[0] - 0.75, p[1] - 0.38, p[0] + 0.75, p[1] + 0.38);
  });
  shelving(0.4, 5.2, 0, y0, 2.4, 0.36, MT.marbleRed, { rows: 4, col: 1.2 });
  fpRect(f, 0.4, 0, 5.2, 0.36);
  boxB(4.2, 0.012, 2.4, MT.rugGrey, 2.6, y0, 2.2);
  pottedPlant(0.5, y0, 4.1, 1.1);

  // --- Presentation area (x 5.7..12.6) ---------------------------
  box(6.8, H, 0.06, MT.marbleGrey, 9.2, y0 + H / 2, 0.03);
  box(5.0, 1.6, 0.05, MT.fluted, 9.4, y0 + 1.8, 0.08);
  boxB(4.6, 0.55, 0.55, MT.black, 9.4, y0 + 0.35, 0.3);
  boxB(4.8, 0.35, 0.58, MT.marbleRed, 9.4, y0, 0.3);
  boxB(4.6, 0.04, 0.58, MT.marbleRed, 9.4, y0 + 0.9, 0.3);
  [8.4, 10.4].forEach((x) => {
    rbox(0.55, 0.14, 0.42, 0.03, MT.marbleWarm, x, y0 + 0.94, 0.3);
    box(1.3, 0.9, 0.02, MT.mirror, x, y0 + 1.95, 0.1);
    boxB(0.02, 0.25, 0.02, MT.bronze, x, y0 + 1.0, 0.1); box(0.015, 0.015, 0.14, MT.bronze, x, y0 + 1.24, 0.17);
    cyl(0.03, 0.03, 0.14, MT.stoneware, x + 0.38, y0 + 0.94, 0.3, 14);
  });
  for (let px = 6.6; px < 12.2; px += 1.1) boxB(0.3, 0.05, 0.12, MT.marbleRed, px, y0 + 2.9, 0.12);
  fpRect(f, 7.0, 0, 11.8, 0.6);
  const isl = group(9.2, y0, 3.9, 0);
  within(isl, () => {
    rbox(1.5, 0.82, 1.3, 0.04, MT.marbleRed, -0.7, 0.08, 0);
    rbox(1.4, 0.82, 1.25, 0.03, MT.glassTint, 0.75, 0.08, 0);
    for (let d = 0; d < 3; d++) boxB(1.3, 0.015, 1.22, MT.bronze, 0.75, 0.12 + d * 0.27, 0);
    rbox(3.0, 0.07, 1.4, 0.02, MT.travSlab, 0, 0.9, 0);
    boxB(0.9, 0.01, 0.5, MT.black, -0.6, 0.97, 0.2); boxB(0.9, 0.01, 0.5, MT.black, 0.6, 0.97, -0.2);
    boxB(2.8, 0.08, 1.2, MT.bronze, 0, 0, 0);
    for (let i = 0; i < 5; i++) boxB(0.22, 0.015, 0.3, pick([MT.marbleBlue, MT.marbleWarm, MT.marbleGrey, MT.marbleRed]), -1.2 + i * 0.25, 0.97, -0.35, R(-0.2, 0.2));
    blob(0, 0, 0, 3.8, 2.0);
  });
  fpRect(f, 7.7, 3.2, 10.7, 4.6);
  [[8.6, 3.7], [9.8, 4.1]].forEach((p) => {
    const tube = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1.4, 24), MT.glow);
    tube.rotation.z = Math.PI / 2; tube.position.set(p[0], F1_CEIL - 1.25, p[1]); add(tube);
    [-0.7, -0.35, 0, 0.35, 0.7].forEach((o) => { const r = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.04, 24), MT.brass); r.rotation.z = Math.PI / 2; r.position.set(p[0] + o, F1_CEIL - 1.25, p[1]); add(r); });
    box(0.005, 1.2, 0.005, MT.blackMetal, p[0] - 0.5, F1_CEIL - 0.6, p[1]); box(0.005, 1.2, 0.005, MT.blackMetal, p[0] + 0.5, F1_CEIL - 0.6, p[1]);
  });
  boxB(0.5, 2.6, 2.6, MT.walnut, 12.3, y0, 2.0);
  stoneSamples(12.04, y0 + 0.3, 1.0, 3.0);
  fpRect(f, 12.05, 0.7, 12.55, 3.3);
  [[7.0, 8.0, MT.marbleRed], [7.9, 8.0, MT.glassTint]].forEach((s) => {
    lathe([[0, 0], [0.22, 0], [0.18, 0.4], [0.12, 0.8], [0.001, 0.8]], MT.glow, s[0], y0, s[1], 32);
    lathe([[0.001, 0], [0.18, 0.02], [0.24, 0.18], [0.22, 0.2], [0.16, 0.06], [0.001, 0.06]], s[2], s[0], y0 + 0.8, s[1], 32);
    cyl(0.012, 0.012, 0.45, MT.blackMetal, s[0], y0 + 0.86, s[1] + 0.28, 10);
    fpCirc(f, s[0], s[1], 0.25);
  });
  const shower = group(10.4, y0, 7.6, 0);
  within(shower, () => {
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
  [12.85, 16.65].forEach((x) => box(0.45, H, 0.08, MT.marbleBlue, x, y0 + H / 2, 0.06));
  box(3.6, 0.03, 0.05, MT.led, 14.75, y0 + 2.75, 0.12);
  const van = group(14.75, y0, 0.45, 0);
  within(van, () => {
    boxB(2.6, 0.72, 0.6, MT.taupe, 0, 0.12, 0);
    for (let k = -1; k <= 1; k++) box(0.004, 0.7, 0.01, MT.charcoal, k * 0.65, 0.48, 0.3);
    boxB(0.3, 0.84, 0.62, MT.walnut, -1.45, 0, 0); boxB(0.3, 0.84, 0.62, MT.walnut, 1.45, 0, 0);
    boxB(3.2, 0.06, 0.64, MT.marbleDark, 0, 0.84, 0);
    [-0.55, 0.55].forEach((x) => {
      box(0.6, 1.3, 0.03, MT.mirror, x, 1.85, -0.27);
      boxB(0.02, 0.28, 0.02, MT.bronze, x, 0.9, -0.2); box(0.015, 0.015, 0.14, MT.bronze, x, 1.17, -0.14);
      lathe([[0.001, 0], [0.03, 0], [0.03, 0.14], [0.012, 0.16], [0.012, 0.19], [0.001, 0.19]], MT.black, x + 0.2, 0.9, 0.08, 14);
      lathe([[0.001, 0], [0.03, 0], [0.03, 0.12], [0.012, 0.14], [0.012, 0.17], [0.001, 0.17]], MT.clay, x + 0.28, 0.9, 0.1, 14);
    });
    boxB(0.4, 0.05, 0.25, MT.creamFab, 0.0, 0.9, 0.08); boxB(0.4, 0.05, 0.25, MT.creamFab, 0.0, 0.95, 0.08);
    blob(0, 0, 0.1, 3.4, 1.0);
  });
  [13.1, 16.4].forEach((x) => {
    boxB(0.035, 1.4, 0.035, MT.glow, x, y0 + 0.4, 0.95);
    box(0.008, H - 1.8, 0.008, MT.bronze, x, F1_CEIL - (H - 1.8) / 2, 0.95);
  });
  fpRect(f, 13.15, 0.1, 16.35, 0.8);
  boxB(2.6, 0.12, 1.5, MT.marbleBlue, 14.6, y0, 7.9);
  const tub = lathe([[0.001, 0], [0.62, 0], [0.7, 0.2], [0.72, 0.55], [0.67, 0.57], [0.62, 0.15], [0.001, 0.12]], MT.black, 14.6, y0 + 0.12, 7.9, 64);
  tub.scale.set(1.35, 1, 0.75);
  const wat = cyl(0.64, 0.64, 0.01, MT.water, 14.6, y0 + 0.55, 7.9, 48); wat.scale.set(1.3, 1, 0.72);
  boxB(0.03, 1.0, 0.03, MT.bronze, 15.7, y0 + 0.12, 7.6); box(0.02, 0.02, 0.25, MT.bronze, 15.7, y0 + 1.1, 7.72);
  cyl(0.18, 0.18, 0.02, MT.ceramic, 13.0, y0 + 0.5, 7.9, 24); cyl(0.02, 0.06, 0.5, MT.travBlock, 13.0, y0, 7.9, 12);
  for (let i = 0; i < 3; i++) rbox(0.22, 0.05, 0.16, 0.02, MT.creamFab, 13.0, y0 + 0.52 + i * 0.05, 7.9, i * 0.2);
  fpRect(f, 13.3, 7.15, 15.9, 8.65);
  const bp = group(14.6, F1_CEIL, 7.6, 0);
  within(bp, () => {
    box(0.008, 0.9, 0.008, MT.bronze, 0, -0.45, 0);
    box(1.2, 0.012, 0.012, MT.bronze, 0, -0.9, 0); box(0.012, 0.9, 0.012, MT.bronze, 0.3, -1.3, 0);
    [[-0.6, -0.9], [0.6, -0.9], [0.3, -1.75]].forEach((p) => { const s = new T.Mesh(new T.SphereGeometry(0.06, 20, 14), MT.glow); s.position.set(p[0], p[1], 0); add(s); });
  });
  boxB(1.6, 0.012, 0.9, MT.rugGrey, 14.6, y0, 6.6);
  const wd = group(16.95, y0, 0, 0);
  within(wd, () => {
    boxB(0.6, H - 0.3, 3.8, MT.walnut, 0, 0, 1.9);
    const back = boxB(0.5, H - 0.6, 3.6, MT.glow, 0, 0.15, 1.9);
    back.material = std({ color: 0xf0c890, emissive: 0x8a5020, emissiveIntensity: 0.6, roughness: 0.6 });
    boxB(0.62, H - 0.3, 3.8, MT.glassTint, 0, 0, 1.9);
    for (let i = 0; i < 10; i++) {
      const z = 0.3 + i * 0.34;
      boxB(0.05, 0.004, 0.36, MT.bronze, 0, 1.95, z);
      boxB(0.06, R(0.8, 1.1), 0.4, pick([MT.sandFab, MT.creamFab, MT.greyFab, MT.slateFab]), R(-0.08, 0.08), 0.9, z);
    }
    for (let i = 0; i < 4; i++) boxB(0.3, 0.12, 0.3, pick([MT.leather, MT.leatherDark, MT.cream]), 0, 2.4, 0.4 + i * 0.9);
    for (let i = 0; i <= 6; i++) boxB(0.64, H - 0.3, 0.02, MT.bronze, 0, 0, i * 3.8 / 6);
  });
  fpRect(f, 16.65, 0, 17.25, 3.8);

  // --- Bedroom (x 17.3..22) ---------------------------------------
  const bx = 19.6;
  box(4.4, H, 0.06, MT.walnut, bx, y0 + H / 2, 0.03);
  box(2.6, 2.7, 0.04, MT.greyFab, bx, y0 + 1.55, 0.08);
  for (let gx = -1.2; gx <= 1.21; gx += 0.6) boxB(0.03, 2.7, 0.04, MT.bronze, bx + gx, y0 + 0.2, 0.11);
  [0.9, 1.7, 2.5].forEach((gy) => boxB(2.6, 0.03, 0.04, MT.bronze, bx, y0 + gy, 0.11));
  box(2.6, 0.02, 0.05, MT.led, bx, y0 + 2.92, 0.12);
  [bx - 1.75, bx + 1.75].forEach((x) => box(0.9, 2.9, 0.04, MT.bronzeGrid, x, y0 + 1.55, 0.08));
  const bed = group(bx, y0, 1.45, 0);
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
  fpRect(f, bx - 1.2, 0.3, bx + 1.2, 2.6);
  [bx - 1.6, bx + 1.6].forEach((x) => {
    cyl(0.26, 0.26, 0.5, MT.black, x, y0, 0.45, 40);
    boxB(0.12, 0.03, 0.03, MT.leather, x, y0 + 0.32, 0.72);
    cyl(0.27, 0.27, 0.03, MT.marbleWarm, x, y0 + 0.5, 0.45, 40);
    bookStack(x - 0.05, y0 + 0.53, 0.45, 0.2, 0.3, 2);
    lathe([[0.001, 0], [0.06, 0], [0.04, 0.25], [0.12, 0.28], [0.1, 0.42], [0.001, 0.42]], MT.glow, x + 0.1, y0 + 0.53, 0.35, 20);
    blob(x, y0, 0.45, 0.8, 0.8);
    fpCirc(f, x, 0.45, 0.27);
  });
  boxB(3.4, 0.012, 2.6, MT.rugGrey, bx, y0, 2.4);
  const ac = group(21.4, y0, 4.3, -2.3);
  within(ac, () => {
    cyl(0.42, 0.38, 0.4, MT.leather, 0, 0, 0, 40);
    cyl(0.4, 0.4, 0.1, MT.boucle, 0, 0.4, 0, 40);
    sector(0, 0, 0.36, 0.45, Math.PI * 1.1, Math.PI * 1.9, 0.4, 0.42, MT.boucle, 0.03);
    blob(0, 0, 0, 1.2, 1.2);
  });
  fpCirc(f, 21.4, 4.3, 0.45);
  sideTable(21.1, 5.2, y0); carafe(21.1, y0 + 0.46, 5.2, 0.8);
  [[2.2, 4.0], [2.9, 4.6], [2.3, 5.2]].forEach((p) => {
    const m = new T.Mesh(new T.SphereGeometry(0.16, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), MT.globeAmber);
    m.rotation.z = Math.PI / 2; m.position.set(21.95, y0 + p[0], p[1]); add(m);
  });
  box(0.04, H, 2.6, MT.plaster, 22.0, y0 + H / 2, 4.5);
  fpRect(f, 21.95, 3.2, 22.05, 5.8, 'w');

  // WC at the back-right, landing panelling
  box(2.4, H, 0.08, MT.walnut, 23.2, y0 + H / 2, 2.6);
  box(0.08, H, 2.6, MT.walnut, 22.0, y0 + H / 2, 1.3);
  boxB(0.9, 2.2, 0.02, MT.oak, 23.2, y0, 2.65);
  boxB(0.02, 0.3, 0.03, MT.brass, 22.85, y0 + 1.0, 2.68);
  fpRect(f, 22.0, 0, 24.4, 2.6, 'w');
  [23.0, 23.6].forEach((x) => box(0.14, 1.4, 0.04, MT.ledSoft, x, y0 + 1.8, 2.66));
  box(0.04, H, 1.7, MT.oak, W - 0.02, y0 + H / 2, 8.15);
}

function glassWall(x0, z0, x1, z1, y0, h) {
  const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
  const g = group((x0 + x1) / 2, y0, (z0 + z1) / 2, ang);
  within(g, () => {
    boxB(0.02, h, len, MT.glassTint, 0, 0, 0);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) boxB(0.04, h, 0.04, MT.bronze, 0, 0, -len / 2 + i * len / n);
    boxB(0.05, 0.04, len, MT.bronze, 0, 0, 0); boxB(0.05, 0.04, len, MT.bronze, 0, h - 0.04, 0);
    boxB(0.05, 0.04, len, MT.bronze, 0, 1.0, 0);
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
  scene.add(new T.HemisphereLight(0xfff1e0, 0x5c4532, 1.1));
  const sun = new T.DirectionalLight(0xffe4bc, 4.2);
  const dir = new T.Vector3(-0.45, 0.62, 1).normalize();
  const center = new T.Vector3(13, 3, 4.5);
  sun.position.copy(center).addScaledVector(dir, 40);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isMobile ? 2048 : 4096, isMobile ? 2048 : 4096);
  const c = sun.shadow.camera;
  c.left = -19; c.right = 19; c.top = 13; c.bottom = -13; c.near = 10; c.far = 80;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(0xffe2c2, 0.5);
  fill.position.set(20, 10, -8); scene.add(fill);
  [[7.6, 2.9, 4.3, 14], [21.4, 2.9, 3.6, 10], [16.8, 2.9, 3.0, 8], [2.0, 2.9, 4.5, 8], [24.6, 2.9, 4.0, 5],
   [3.0, F1 + 2.8, 5.5, 9], [3.0, F1 + 2.8, 2.0, 6], [9.5, F1 + 2.8, 4.0, 10], [14.8, F1 + 2.8, 4.0, 8], [19.6, F1 + 2.8, 3.5, 9], [24.0, F1 + 2.8, 8.0, 4]
  ].forEach((p) => { const l = new T.PointLight(0xffc68a, p[3], 11, 1.6); l.position.set(p[0], p[1], p[2]); scene.add(l); });

  const pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pm.dispose();
}

// ------------------------------------------------------------------
// TOUR — nodes (x, z, floor, look yaw in degrees, name, photo)
// yaw 0 = towards the back wall (−z), 90 = right (+x), 180 = facade
// ------------------------------------------------------------------
const NODES = [
  { x: 13.0, z: 11.3, f: 0, yaw: 0, name: 'Arrival', photo: 'overview' },
  { x: 13.0, z: 7.8, f: 0, yaw: -38, name: 'Entrance', photo: 'tvwall' },
  { x: 7.6, z: 8.1, f: 0, yaw: 0, name: 'Living Zone 1', photo: 'living' },
  { x: 3.4, z: 5.6, f: 0, yaw: -128, name: 'Reception', photo: 'reception' },
  { x: 3.7, z: 3.2, f: 0, yaw: -72, name: 'Olive Lounge', photo: 'olive' },
  { x: 5.4, z: 7.9, f: 0, yaw: 62, name: 'Pearl Garlands', photo: 'shelves' },
  { x: 13.9, z: 6.3, f: 0, yaw: -18, name: 'Living Zone 2' },
  { x: 17.0, z: 6.6, f: 0, yaw: 0, name: 'Work Table', photo: 'worktable' },
  { x: 21.2, z: 6.8, f: 0, yaw: -6, name: 'Kitchen Zone', photo: 'kitchen' },
  { x: 23.6, z: 6.6, f: 0, yaw: -95, name: 'Kitchen · View West', photo: 'island' },
  { x: 24.0, z: 0.98, f: 0, yaw: 140, name: 'To the Stairs', photo: 'stairs' },
  { x: 25.2, z: 0.85, f: 0, yaw: 180, name: 'Stairs', photo: 'stairs' },
  { x: 25.2, z: 4.6, f: 0, yaw: 180, name: 'Stairs', stair: true },
  { x: 25.2, z: 8.1, f: 1, yaw: -90, name: 'Upper Landing' },
  { x: 23.1, z: 7.9, f: 1, yaw: -50, name: 'Upper Hall' },
  { x: 19.6, z: 6.8, f: 1, yaw: 0, name: 'Bedroom', photo: 'bedroom' },
  { x: 14.75, z: 3.3, f: 1, yaw: 0, name: 'Bathroom', photo: 'vanity' },
  { x: 14.6, z: 5.4, f: 1, yaw: 175, name: 'Black Bathtub', photo: 'bathtub' },
  { x: 10.4, z: 5.9, f: 1, yaw: -28, name: 'Presentation Island', photo: 'presentation' },
  { x: 5.0, z: 6.8, f: 1, yaw: -90, name: 'Meeting Room', photo: 'meeting' },
  { x: 4.9, z: 2.9, f: 1, yaw: -58, name: 'Office' }
];
/** floor height under a point (stair ramp, landings, floors) */
function groundAt(x, z, fallback) {
  if (x > STAIR_X0 - 0.05 && x < W) {
    if (z <= STAIR_Z0) return fallback < 2 ? 0 : fallback;
    if (z >= STAIR_Z1) return F1;
    return (z - STAIR_Z0) / (STAIR_Z1 - STAIR_Z0) * F1;
  }
  return fallback;
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
const WALK_SPEED = 2.0, TOUR_SPEED = 0.95;   // m/s (manual / auto tour)

function applyCamera() {
  camera.position.copy(pos);
  camera.rotation.set(view.pitch, -view.yaw, 0, 'YXZ');
  if (camera.fov !== view.fov) { camera.fov = view.fov; camera.updateProjectionMatrix(); }
  floors[0].visible = pos.y < F1 + 1.2;
  floors[1].visible = pos.y > F1 - 0.2;
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
  const dur = Math.min(autoTour ? 40 : 8, Math.max(1.1, L / speed + (autoTour ? 1.4 : 0.6)));
  const p0 = curve.getPointAt(0), pa = curve.getPointAt(Math.min(1, 1.2 / L));
  adaptResolution();
  moving = {
    curve, L, dur, t: 0, to: i,
    y0: view.yaw, p0: view.pitch, y1: NODES[i].yaw * Math.PI / 180,
    ty: Math.hypot(pa.x - p0.x, pa.z - p0.z) > 0.05 ? angleTo(p0.x, p0.z, pa.x, pa.z) : view.yaw,
    marks: idx.slice(0, -1).map((k, j) => ({ i: k, u: cum[j + 1] / acc })), passed: 0
  };
  spin.v = spin.p = 0;
  hideArrows();
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
    const a = Math.min(0.4, 1.6 / m.dur), b = Math.min(0.55, 2.2 / m.dur);
    view.yaw = mixAng(mixAng(m.y0, m.ty, smooth(0, a, m.t)), m.y1, smooth(1 - b, 1, m.t));
    view.pitch = mix(m.p0, PITCH0, smooth(0, a, m.t));
    while (m.passed < m.marks.length && s >= m.marks[m.passed].u) { current = m.marks[m.passed].i; onPass(); m.passed++; }
    if (m.t >= 1) {
      current = m.to; moving = null; view.yaw = m.y1;
      onArrive();
      if (autoTour) { auto.t = 0; auto.dur = 5.5; auto.base = view.yaw; }
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
    const k = Math.min(1, auto.t / auto.dur), amp = auto.dur > 3 ? 0.38 : 0;
    view.yaw = auto.base + amp * Math.sin(2 * Math.PI * k) * Math.sin(Math.PI * k);
    view.pitch = mix(view.pitch, PITCH0, 1 - Math.exp(-dt * 2));
    dirty = true;
    if (k >= 1) { if (current < NODES.length - 1) goTo(current + 1); else setAuto(false); }
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
  if (n.photo) { photoThumb.src = 'assets/renders/' + n.photo + '.jpg'; photoBtn.hidden = false; }
  else photoBtn.hidden = true;
  mapFloor = n.f; updateTabs();
  showArrows();
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

// Minimap --------------------------------------------------------------
const MAP_Z0 = -0.3, MAP_Z1 = 10.8, MAP_X0 = -0.3, MAP_X1 = W + 0.3;
const mapEl = $('map'), mapCanvas = $('map-canvas'), mctx = mapCanvas.getContext('2d');
let mapFloor = 0, mapScale = 10;
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
function drawMap() {
  const c = mctx, s = mapScale, w = mapCanvas.width;
  if (!w) return;
  c.clearRect(0, 0, w, mapCanvas.height);
  c.fillStyle = '#e3d8c6'; c.fillRect(mx(MAP_X0), mz(D), (MAP_X1 - MAP_X0) * s, (MAP_Z1 - D) * s);
  c.fillStyle = '#efe7da'; c.fillRect(mx(0), mz(0), W * s, D * s);
  c.strokeStyle = '#2a211a'; c.lineWidth = Math.max(2, s * 0.18);
  c.beginPath();
  c.moveTo(mx(DOOR_X0), mz(D)); c.lineTo(mx(0), mz(D)); c.lineTo(mx(0), mz(0)); c.lineTo(mx(W), mz(0)); c.lineTo(mx(W), mz(D)); c.lineTo(mx(DOOR_X1), mz(D));
  c.stroke();
  c.fillStyle = '#9fc0d4'; c.fillRect(mx(0.3), mz(D) - 1, (DOOR_X0 - 0.6) * s, 2.5); c.fillRect(mx(DOOR_X1 + 0.3), mz(D) - 1, (W - DOOR_X1 - 2.7) * s, 2.5);
  FP[mapFloor].forEach((p) => {
    c.fillStyle = p.k === 'rug' ? 'rgba(160,130,95,.18)' : p.k === 's' ? 'rgba(42,33,26,.12)' : p.k === 'w' ? '#5a4a3c' : 'rgba(90,70,52,.42)';
    c.beginPath();
    if (p.t === 'r') c.rect(mx(p.x0), mz(p.z0), (p.x1 - p.x0) * s, (p.z1 - p.z0) * s);
    else if (p.t === 'c') c.arc(mx(p.x), mz(p.z), p.r * s, 0, Math.PI * 2);
    else { c.arc(mx(p.x), mz(p.z), p.r1 * s, p.a0, p.a1, false); c.arc(mx(p.x), mz(p.z), p.r0 * s, p.a1, p.a0, true); c.closePath(); }
    c.fill();
  });
  c.strokeStyle = 'rgba(42,33,26,.45)'; c.lineWidth = 1;
  for (let i = 0; i <= STEPS; i++) { const zz = STAIR_Z0 + i * (STAIR_Z1 - STAIR_Z0) / STEPS; c.beginPath(); c.moveTo(mx(STAIR_X0), mz(zz)); c.lineTo(mx(STAIR_X1), mz(zz)); c.stroke(); }
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
  composer.setPixelRatio(pr); composer.setSize(w, h);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  if (w < h) view.fov = Math.max(view.fov, 82);
  camera.updateProjectionMatrix();
  setRes(dprScale);
  resizeMap(); dirty = true;
}
window.addEventListener('resize', resize);
/** adapt resolution between walks (never mid-motion, so nothing pops) */
function adaptResolution() {
  if (frameAvg > 1 / 45 && dprScale > 0.55) { dprScale = Math.max(0.55, dprScale - 0.1); setRes(dprScale); }
  else if (frameAvg > 1 / 45) bloomOn = false;
  else if (frameAvg < 1 / 100 && dprScale < 1) { dprScale = Math.min(1, dprScale + 0.05); setRes(dprScale); }
}
function render() {
  gtao.enabled = ao > 0.005;
  gtao.blendIntensity = smooth(0, 1, ao);
  bloom.enabled = bloomOn;
  composer.render();
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt);
  // ambient occlusion fades out while walking / dragging and back in when still
  const aoTarget = moving || dragging ? 0 : 1;
  if (ao !== aoTarget) {
    ao = aoTarget ? Math.min(1, ao + dt / 0.7) : Math.max(0, ao - dt / 0.3);
    dirty = true;
  }
  if (dirty) {
    applyCamera();
    render();
    if (moving && ao === 0) frameAvg = mix(frameAvg, dt, 0.05);
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
  resize();
  floors[0].visible = floors[1].visible = true;
  renderer.shadowMap.needsUpdate = true;
  applyCamera();
  render();
  onArrive();
  requestAnimationFrame(loop);
  introBtn.disabled = false; introBtn.textContent = 'Enter the showroom';
  window.__showroom = {
    goTo, NODES, view,
    jump(i) { moving = null; current = i; const n = NODES[i]; pos.set(n.x, n.y, n.z); view.yaw = n.yaw * Math.PI / 180; view.pitch = PITCH0; ao = 1; onArrive(); dirty = true; },
    setAuto,
    state: () => ({ current, moving: !!moving, hq: ao >= 1 && !dirty, auto: autoTour, yaw: view.yaw, x: pos.x, z: pos.z, dpr: renderer.getPixelRatio() }),
    render: () => { dirty = true; },
    info: () => renderer.info.render
  };
}
introBtn.addEventListener('click', () => { $('intro').classList.add('is-hidden'); dirty = true; });
boot().catch((e) => { console.error(e); introBtn.textContent = 'Error: ' + e.message; });
