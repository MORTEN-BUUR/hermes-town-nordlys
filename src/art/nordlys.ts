import type { BuildingKind } from './buildings';
import { Painter, hashString, mulberry, outline, shade } from './painter';

/**
 * Nordlys campus art: modern Nordic architecture under the polar night,
 * painted in code at two texels per world pixel, the same density as the
 * imported atlases. Dark timber and black metal, big glass, snow on the roofs,
 * and the teal LED trim from the Nordlys datacenter pictures.
 *
 * `lit` means a resident is inside: glass glows warm. LED trim, the hologram
 * and the gate ring are architecture, dimmer when empty, and never animate on
 * their own, so nothing here implies work that did not happen.
 */
export const NL = {
  ink: '#06090f',
  frame: '#0b0f17',
  timber: '#1c2331',
  timber2: '#232c3d',
  timber3: '#2b3548',
  metal: '#161b26',
  metal2: '#202736',
  cedar: '#6e4a31',
  cedar2: '#8b5f3e',
  granite: '#3b4250',
  granite2: '#4b5362',
  roof: '#262d3b',
  roof2: '#1b212d',
  snow: '#eaf1f8',
  snow2: '#c9d6e6',
  snow3: '#9fb1c9',
  glass: '#152030',
  glass2: '#1d2c40',
  glassHi: '#3a5270',
  warm: '#ffd59a',
  warm2: '#f3a85e',
  warm3: '#c9733a',
  teal: '#49f2d6',
  tealDim: '#1f7f78',
  cyan: '#7fe9ff',
  violet: '#a98bff',
  gold: '#ffbe62',
} as const;

type P = Painter;

/** Vertical board cladding with grooves and a little grain. */
function cladding(p: P, x: number, y: number, w: number, h: number, base: string, seed: number): void {
  p.rect(x, y, w, h, base);
  for (let i = 0; i < w; i += 5) {
    p.vline(x + i, y, h, shade(base, 0.72));
    if ((i / 5) % 2 === 1) p.rect(x + i + 1, y, 4, h, shade(base, 1.07));
  }
  p.noise(x, y, w, h, shade(base, 1.18), 0.025, seed);
  p.noise(x, y, w, h, shade(base, 0.8), 0.03, seed + 1);
  // eave shadow and ground bounce
  p.rect(x, y, w, 3, shade(base, 0.6));
  p.rect(x, y + h - 2, w, 2, shade(base, 0.7));
}

/** Black standing-seam metal. */
function metalWall(p: P, x: number, y: number, w: number, h: number, seed: number): void {
  p.rect(x, y, w, h, NL.metal2);
  for (let i = 2; i < w; i += 7) p.vline(x + i, y, h, NL.metal);
  p.noise(x, y, w, h, '#2a3346', 0.02, seed);
  p.rect(x, y, w, 3, NL.ink);
}

/** A glazed opening, split into panes, warm when someone is inside. */
function glass(p: P, x: number, y: number, w: number, h: number, lit: boolean, pane = 14, seed = 1): void {
  p.rect(x - 2, y - 2, w + 4, h + 4, NL.frame);
  for (let j = 0; j < h; j++) {
    const t = j / Math.max(1, h - 1);
    p.hline(x, y + j, w, lit ? mix(NL.warm, NL.warm2, t) : mix(NL.glass2, NL.glass, t));
  }
  const r = mulberry(seed);
  if (lit) {
    // Interior: a few dark silhouettes of furniture and a cool screen glow.
    for (let k = 0; k < Math.max(1, Math.floor(w / 24)); k++) {
      const fx = x + 3 + Math.floor(r() * Math.max(1, w - 14)), fw = 6 + Math.floor(r() * 8);
      p.rect(fx, y + h - 6, fw, 6, NL.warm3);
      if (r() < 0.5) p.rect(fx + 2, y + h - 11, 3, 4, '#5fe0d0');
    }
    p.rect(x, y, w, 2, '#fff1d0');
  } else {
    // A cold diagonal reflection of the sky.
    for (let k = 0; k < h; k++) {
      const rx = x + Math.floor(w * 0.25) + k - Math.floor(h / 2);
      if (rx >= x && rx + 3 < x + w) p.rect(rx, y + k, 3, 1, NL.glassHi);
    }
  }
  for (let i = pane; i < w - 2; i += pane) p.rect(x + i, y, 2, h, NL.frame);
  if (h > 34) p.rect(x, y + Math.floor(h * 0.45), w, 2, NL.frame);
}

/** Flat roof seen from above: dark membrane, snow cover, crisp fascia. */
function flatRoof(p: P, x: number, y: number, w: number, depth: number, seed: number, fascia = 4): void {
  p.rect(x, y, w, depth, NL.roof);
  snowField(p, x + 3, y + 2, w - 6, depth - 4, seed);
  p.rect(x, y + depth, w, fascia, NL.ink);
  p.hline(x, y + depth, w, '#3a4458');
}

function snowField(p: P, x: number, y: number, w: number, h: number, seed: number): void {
  const r = mulberry(seed);
  p.rect(x, y, w, h, NL.snow2);
  // Wind-shaped drifts, brighter toward the top.
  for (let j = 0; j < h; j++) {
    const edge = Math.floor(Math.sin((j + seed) * 0.7) * 2 + r() * 2);
    p.hline(x + Math.max(0, edge), y + j, w - Math.max(0, edge) * 2, j < h * 0.6 ? NL.snow : NL.snow2);
  }
  p.noise(x, y, w, h, NL.snow3, 0.04, seed + 7);
  p.noise(x, y, w, h, '#ffffff', 0.03, seed + 9);
}

/** Gable roof: two pitched planes, the near one in light, snow-loaded. */
function gableRoof(p: P, x: number, y: number, w: number, h: number, overhang: number, seed: number): void {
  const cx = x + w / 2;
  for (let j = 0; j < h; j++) {
    const half = (w / 2 + overhang) * (j + 1) / h;
    const l = Math.round(cx - half), rr = Math.round(cx + half);
    p.hline(l, y + j, Math.round(cx) - l, j % 4 === 0 ? NL.snow2 : NL.snow);
    p.hline(Math.round(cx), y + j, rr - Math.round(cx), j % 4 === 0 ? NL.snow3 : NL.snow2);
  }
  p.noise(x - overhang, y, w + overhang * 2, h, '#ffffff', 0.02, seed);
  // dark fascia under the snow
  p.rect(Math.round(cx - w / 2 - overhang), y + h, w + overhang * 2, 3, NL.ink);
}

function led(p: P, x: number, y: number, w: number, colour: string, bright: boolean): void {
  p.hline(x, y, w, bright ? colour : shade(colour, 0.55));
  if (bright) p.hline(x, y + 1, w, shade(colour, 0.5));
}

function door(p: P, cx: number, base: number, lit: boolean, w = 16, h = 26): void {
  const x = Math.round(cx - w / 2);
  p.rect(x - 3, base - h - 3, w + 6, h + 3, NL.frame);
  glass(p, x, base - h, w, h, lit, 99, 3);
  p.vline(x + w / 2, base - h, h, NL.frame);
  p.rect(x - 6, base - 2, w + 12, 2, NL.granite2);
}

function plinth(p: P, x: number, y: number, w: number, h: number, seed: number): void {
  p.rect(x, y, w, h, NL.granite);
  p.hline(x, y, w, NL.granite2);
  p.noise(x, y, w, h, '#59616f', 0.08, seed);
}

/** Nordlys mark: a mountain inside a ring, the logo from the campus posters. */
function mark(p: P, cx: number, cy: number, r: number, colour: string): void {
  for (let a = 0; a < 360; a += 3) {
    const t = a * Math.PI / 180;
    p.px(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), colour);
  }
  const h = Math.round(r * 0.9);
  for (let j = 0; j < h; j++) {
    p.hline(Math.round(cx - j * 0.8), Math.round(cy - h / 2 + j + 1), Math.max(1, Math.round(j * 1.6)), colour);
  }
}

function line(p: P, x0: number, y0: number, x1: number, y1: number, c: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) p.px(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
}

function ring(p: P, cx: number, cy: number, r: number, thick: number, c: string, c2: string): void {
  for (let y = -r - thick; y <= r + thick; y++) for (let x = -r - thick; x <= r + thick; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d >= r && d <= r + thick) p.px(cx + x, cy + y, d < r + thick / 2 ? c : c2);
  }
}

function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// ------------------------------------------------------------- buildings

/**
 * Paint one campus building. `width` is in world pixels, like the atlas
 * importer; the canvas is twice that. The bottom row is the ground line.
 */
export function paintNordlysBuilding(kind: BuildingKind, width: number, lit: boolean, id: string = kind): HTMLCanvasElement {
  const W = Math.round(width * 2);
  const seed = hashString(id);
  const H = Math.round(W * ({ hall: 0.98, library: 0.86, workshop: 0.9, forge: 0.82, post: 0.98, observatory: 1.12, tavern: 0.95, house: 1.0, market: 0.8 } as const)[kind]);
  const p = new Painter(W, H);
  const base = H - 1;
  switch (kind) {
    case 'hall': hall(p, W, base, lit, seed); break;
    case 'library': archive(p, W, base, lit, seed); break;
    case 'workshop': lab(p, W, base, lit, seed); break;
    case 'forge': datacenter(p, W, base, lit, seed); break;
    case 'post': portal(p, W, base, lit, seed); break;
    case 'observatory': observatory(p, W, base, lit, seed); break;
    case 'tavern': lounge(p, W, base, lit, seed); break;
    default: cabin(p, W, base, lit, seed); break;
  }
  outline(p, NL.ink);
  return p.canvas;
}

/** AI-paviljongen: a glass pavilion with a butterfly roof and a hologram atrium. */
function hall(p: P, W: number, base: number, lit: boolean, seed: number): void {
  const x0 = 10, x1 = W - 10, wallH = 104, top = base - 10 - wallH;
  plinth(p, x0 - 6, base - 12, x1 - x0 + 12, 12, seed);
  // wings in dark timber
  const wing = Math.round((x1 - x0) * 0.3);
  cladding(p, x0, top + 20, wing, wallH - 20, NL.timber2, seed);
  cladding(p, x1 - wing, top + 20, wing, wallH - 20, NL.timber2, seed + 3);
  for (const wx of [x0 + 10, x0 + wing - 34, x1 - wing + 10, x1 - 34]) glass(p, wx, top + 40, 24, 50, lit, 12, seed + wx);
  // central glass hall
  const cx0 = x0 + wing, cx1 = x1 - wing;
  glass(p, cx0 + 2, top + 4, cx1 - cx0 - 4, wallH - 6, lit, 18, seed + 11);
  // butterfly roofs: each wing slopes down toward the atrium
  for (const [a, b, rising] of [[x0 - 8, x0 + wing + 6, -1], [x1 - wing - 6, x1 + 8, 1]] as const) {
    for (let x = a; x < b; x++) {
      const t = (x - a) / (b - a);
      const lift = Math.round((rising < 0 ? 1 - t : t) * 22);
      const y = top + 20 - lift;
      p.rect(x, y - 16, 1, 16, NL.snow);
      p.rect(x, y - 3, 1, 3, NL.snow2);
      p.rect(x, y, 1, 4, NL.ink);
    }
  }
  flatRoof(p, cx0 - 4, top - 30, cx1 - cx0 + 8, 30, seed + 5);
  led(p, cx0 - 4, top + 4, cx1 - cx0 + 8, NL.teal, true);
  // hologram over the atrium: a wire icosahedron, brighter while occupied
  const hx = Math.round(W / 2), hy = top - 70, r = 30;
  const c1 = lit ? NL.cyan : NL.tealDim, c2 = lit ? NL.violet : '#4a3f7a';
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) pts.push([hx + Math.round(Math.cos(i * Math.PI / 3 + Math.PI / 6) * r), hy + Math.round(Math.sin(i * Math.PI / 3 + Math.PI / 6) * r)]);
  for (let i = 0; i < 6; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % 6]!;
    line(p, ax, ay, bx, by, c1);
    line(p, hx, hy, ax, ay, i % 2 ? c2 : c1);
    if (i % 2 === 0) { const [cx, cy] = pts[(i + 2) % 6]!; line(p, ax, ay, cx, cy, c2); }
  }
  p.disc(hx, hy, 3, lit ? '#e8fffb' : c1);
  // light beam from the roof to the hologram
  for (let y = hy + r; y < top - 30; y += 2) p.px(hx, y, c1);
  ring(p, hx, top - 34, 10, 1, c1, c2);
  door(p, W / 2, base - 12, lit, 22, 30);
  mark(p, x0 + wing / 2, top + 30, 7, lit ? NL.teal : NL.tealDim);
}

/** Arkivet: a long timber block with data-shelf slits and a skylight. */
function archive(p: P, W: number, base: number, lit: boolean, seed: number): void {
  const x0 = 8, x1 = W - 8, wallH = 96, top = base - 8 - wallH;
  plinth(p, x0 - 4, base - 8, x1 - x0 + 8, 8, seed);
  cladding(p, x0, top, x1 - x0, wallH, NL.timber, seed);
  // the cedar-lined entrance recess
  const ex = Math.round(W / 2) - 30;
  cladding(p, ex, top + 8, 60, wallH - 8, NL.cedar, seed + 2);
  // long horizontal reading window on the left, shelf slits on the right
  glass(p, x0 + 12, top + 22, ex - x0 - 24, 30, lit, 20, seed + 4);
  const r = mulberry(seed);
  for (let x = ex + 72; x < x1 - 12; x += 12) {
    glass(p, x, top + 16, 6, 62, lit && r() < 0.8, 99, seed + x);
    for (let y = top + 22; y < top + 76; y += 6) p.hline(x, y, 6, lit ? NL.warm3 : NL.glass);
  }
  for (let x = x0 + 12; x < ex - 12; x += 16) p.rect(x, top + 62, 10, 18, lit ? '#2b3b52' : NL.timber3);
  flatRoof(p, x0 - 6, top - 46, x1 - x0 + 12, 46, seed + 5);
  // skylight strip in the snow
  glass(p, x0 + 40, top - 34, x1 - x0 - 80, 8, lit, 24, seed + 8);
  led(p, x0 - 6, top + 2, x1 - x0 + 12, NL.teal, lit);
  door(p, W / 2, base - 8, lit, 18, 30);
  mark(p, Math.round(W / 2), top + 18, 6, lit ? NL.teal : NL.tealDim);
}

/** Verkstedet: a sawtooth-roof lab with glazed north lights. */
function lab(p: P, W: number, base: number, lit: boolean, seed: number): void {
  const x0 = 8, x1 = W - 8, wallH = 84, top = base - 6 - wallH;
  plinth(p, x0 - 4, base - 6, x1 - x0 + 8, 6, seed);
  metalWall(p, x0, top, x1 - x0, wallH, seed);
  glass(p, x0 + 14, top + 18, Math.round((x1 - x0) * 0.32), 56, lit, 16, seed + 1);
  glass(p, x1 - 14 - Math.round((x1 - x0) * 0.32), top + 18, Math.round((x1 - x0) * 0.32), 56, lit, 16, seed + 2);
  // sawtooth roof: four teeth, each with a glazed vertical face
  const teeth = 4, tw = (x1 - x0 + 12) / teeth, rise = 34;
  for (let t = 0; t < teeth; t++) {
    const a = Math.round(x0 - 6 + t * tw), b = Math.round(x0 - 6 + (t + 1) * tw);
    for (let x = a; x < b; x++) {
      const h = Math.round(((x - a) / (b - a)) * rise);
      p.rect(x, top - 14 - h, 1, h + 14, x % 3 === 0 ? NL.snow2 : NL.snow);
    }
    glass(p, b - 4, top - 14 - rise + 4, 4, rise + 10, lit, 99, seed + t);
  }
  p.rect(x0 - 6, top - 2, x1 - x0 + 12, 4, NL.ink);
  led(p, x0 - 6, top + 2, x1 - x0 + 12, NL.cyan, lit);
  door(p, W / 2, base - 6, lit, 28, 34);
  mark(p, Math.round(W / 2), top + 12, 5, lit ? NL.cyan : NL.tealDim);
}

/** Datasenteret: server halls with LED rack fronts, cooling on the roof, a core window. */
function datacenter(p: P, W: number, base: number, lit: boolean, seed: number): void {
  const x0 = 6, x1 = W - 6, wallH = 78, top = base - 6 - wallH;
  plinth(p, x0 - 4, base - 6, x1 - x0 + 8, 6, seed);
  metalWall(p, x0, top, x1 - x0, wallH, seed);
  const r = mulberry(seed);
  // rack fronts: fixed status LEDs, not a blinking activity meter
  for (let x = x0 + 8; x < x1 - 8; x += 14) {
    if (Math.abs(x + 5 - W / 2) < 36) continue;
    p.rect(x, top + 12, 10, 58, '#0e131c');
    for (let y = top + 15; y < top + 68; y += 4) {
      p.hline(x + 1, y, 8, '#1a2130');
      const c = r() < 0.75 ? NL.teal : r() < 0.6 ? NL.cyan : NL.gold;
      p.px(x + 2 + Math.floor(r() * 6), y + 1, lit ? c : shade(c, 0.45));
    }
  }
  // the core: concentric rings behind a round window, as in the Nordlys pictures
  const cx = Math.round(W / 2), cy = top + 38;
  p.disc(cx, cy, 30, NL.frame);
  ring(p, cx, cy, 24, 4, lit ? '#2fb8c9' : '#1b5560', lit ? '#1b6f7a' : '#123a42');
  ring(p, cx, cy, 15, 3, lit ? NL.cyan : '#226777', lit ? '#3fd0e6' : '#17485a');
  ring(p, cx, cy, 7, 2, lit ? '#d8fbff' : '#2a7a8a', lit ? NL.cyan : '#1d5a68');
  p.disc(cx, cy, 4, lit ? '#ffffff' : '#2f8a99');
  // roof with cooling units
  flatRoof(p, x0 - 6, top - 40, x1 - x0 + 12, 40, seed + 5);
  for (let x = x0 + 10; x < x1 - 30; x += 34) {
    p.rect(x, top - 36, 26, 22, NL.metal2);
    p.rect(x, top - 36, 26, 3, '#2d3547');
    p.disc(x + 13, top - 24, 8, NL.ink);
    p.disc(x + 13, top - 24, 6, '#2a3446');
    line(p, x + 7, top - 24, x + 19, top - 24, NL.ink); line(p, x + 13, top - 30, x + 13, top - 18, NL.ink);
  }
  led(p, x0 - 6, top + 2, x1 - x0 + 12, NL.teal, true);
  door(p, x1 - 30, base - 6, lit, 16, 28);
}

/** Portalen: a small timber hub beside a ring gate glowing gold. */
function portal(p: P, W: number, base: number, lit: boolean, seed: number): void {
  const x0 = Math.round(W * 0.42), x1 = W - 8, wallH = 82, top = base - 8 - wallH;
  plinth(p, 6, base - 8, W - 12, 8, seed);
  cladding(p, x0, top, x1 - x0, wallH, NL.timber, seed);
  glass(p, x0 + 10, top + 16, x1 - x0 - 20, 40, lit, 18, seed + 1);
  flatRoof(p, x0 - 6, top - 36, x1 - x0 + 12, 36, seed + 5);
  door(p, Math.round(W / 2) + 8, base - 8, lit, 18, 28);
  // the gate: stone feet, timber frame, a gold ring
  const gx = Math.round(W * 0.22), gy = base - 66, R = 46;
  p.rect(gx - R - 10, base - 30, 14, 22, NL.granite2);
  p.rect(gx + R - 4, base - 30, 14, 22, NL.granite2);
  line(p, gx - R - 4, base - 30, gx - 10, gy - R - 10, NL.cedar);
  line(p, gx - R - 3, base - 30, gx - 9, gy - R - 10, NL.cedar2);
  line(p, gx + R + 4, base - 30, gx + 10, gy - R - 10, NL.cedar);
  line(p, gx + R + 3, base - 30, gx + 9, gy - R - 10, NL.cedar2);
  ring(p, gx, gy, R, 6, NL.cedar2, NL.cedar);
  ring(p, gx, gy, R - 4, 3, lit ? NL.gold : '#8a5a2a', lit ? '#ffe2a8' : '#6a4520');
  if (lit) ring(p, gx, gy, R - 7, 1, '#fff3d6', '#fff3d6');
  mark(p, x1 - 20, top + 10, 5, lit ? NL.gold : '#8a5a2a');
}

/** Observatoriet: a round tower with a slit dome and an antenna mast. */
function observatory(p: P, W: number, base: number, lit: boolean, seed: number): void {
  const cx = Math.round(W * 0.42), r = Math.round(W * 0.27);
  plinth(p, 6, base - 8, W - 12, 8, seed);
  // glass annex
  const ax0 = cx + r - 6, ax1 = W - 8, at = base - 8 - 54;
  glass(p, ax0, at + 6, ax1 - ax0, 48, lit, 14, seed + 2);
  flatRoof(p, ax0 - 4, at - 18, ax1 - ax0 + 8, 18, seed + 3);
  // tower drum with horizontal shading
  const towerTop = base - 8 - 96;
  for (let x = -r; x <= r; x++) {
    const t = (x + r) / (2 * r);
    const c = mix(NL.timber3, NL.metal, Math.min(1, Math.abs(t - 0.35) * 1.6));
    p.rect(cx + x, towerTop, 1, base - 8 - towerTop, c);
    if ((x + r) % 6 === 0) p.rect(cx + x, towerTop, 1, base - 8 - towerTop, shade(c, 0.8));
  }
  glass(p, cx - 18, towerTop + 36, 36, 40, lit, 12, seed + 4);
  led(p, cx - r, towerTop + 4, 2 * r + 1, NL.violet, lit);
  // dome
  for (let y = -r; y <= 0; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y > r * r) continue;
    const light = (-(x + y * 0.6)) / r;
    p.px(cx + x, towerTop + y, light > 0.35 ? NL.snow : light > -0.2 ? NL.snow2 : NL.snow3);
  }
  // the open slit shows the instrument; violet when observing
  p.rect(cx - 5, towerTop - r + 6, 10, r - 6, NL.ink);
  p.rect(cx - 3, towerTop - r + 10, 6, r - 14, lit ? NL.violet : '#2b2550');
  // antenna mast and dish
  const mx = W - 26;
  p.rect(mx, at - 70, 3, 52, NL.metal2);
  p.disc(mx + 1, at - 74, 7, NL.snow2);
  p.disc(mx + 1, at - 74, 4, NL.snow3);
  p.px(mx + 1, at - 84, lit ? NL.teal : NL.tealDim);
  door(p, cx, base - 8, lit, 16, 26);
}

/** Loungen: a cedar A-frame with a full-height glass gable. */
function lounge(p: P, W: number, base: number, lit: boolean, seed: number): void {
  const x0 = 12, x1 = W - 12, top = base - 8 - 70;
  plinth(p, x0 - 6, base - 8, x1 - x0 + 12, 8, seed);
  cladding(p, x0, top, x1 - x0, 70, NL.cedar, seed);
  const cx = Math.round(W / 2), gh = Math.round((x1 - x0) * 0.58);
  // the gable is glazed down to the floor
  for (let j = 0; j < gh; j++) {
    const half = Math.round((x1 - x0) / 2 * (j / gh)) - 10;
    if (half <= 0) continue;
    const y = top - gh + j + 20;
    const t = j / gh;
    p.hline(cx - half, y, half * 2, lit ? mix('#ffe4b0', NL.warm2, t) : mix(NL.glass2, NL.glass, t));
  }
  for (let x = cx - 60; x <= cx + 60; x += 20) for (let y = top - gh + 20; y < top + 70; y++) {
    const j = y - (top - gh + 20), half = Math.round((x1 - x0) / 2 * (j / gh)) - 10;
    if (Math.abs(x - cx) < half) p.px(x, y, NL.frame);
  }
  glass(p, cx - 50, top + 6, 100, 56, lit, 20, seed + 3);
  if (lit) { p.disc(cx - 30, top + 54, 5, '#ff8a3a'); p.disc(cx - 30, top + 52, 3, '#ffe08a'); }
  // snow-loaded roof planes
  for (let j = 0; j < gh + 16; j++) {
    const y = top - gh + j + 4;
    const half = Math.round(((x1 - x0) / 2 + 12) * (j / (gh + 16)));
    p.rect(cx - half - 1, y, 12, 1, NL.snow);
    p.rect(cx + half - 11, y, 12, 1, NL.snow2);
  }
  // chimney (the scene's smoke comes from the right side)
  p.rect(x1 - 26, top - 46, 12, 30, NL.granite2);
  p.rect(x1 - 28, top - 48, 16, 4, NL.snow);
  led(p, x0, top + 66, x1 - x0, NL.gold, lit);
  door(p, cx + 30, base - 8, lit, 16, 26);
}

/** A home: a small black cabin with a snowy gable and one big window. */
function cabin(p: P, W: number, base: number, lit: boolean, seed: number): void {
  const r = mulberry(seed);
  const x0 = 10, x1 = W - 10, wallH = 50, top = base - 6 - wallH;
  const body = [NL.timber, NL.timber2, '#2a2422', '#1f2a2a'][Math.floor(r() * 4)]!;
  plinth(p, x0 - 4, base - 6, x1 - x0 + 8, 6, seed);
  cladding(p, x0, top, x1 - x0, wallH, body, seed);
  const winLeft = r() < 0.5;
  glass(p, winLeft ? x0 + 8 : x1 - 8 - 34, top + 12, 34, 28, lit, 17, seed + 1);
  cladding(p, winLeft ? x1 - 30 : x0 + 6, top + 4, 24, wallH - 4, NL.cedar, seed + 3);
  door(p, winLeft ? x1 - 18 : x0 + 18, base - 6, lit, 12, 24);
  gableRoof(p, x0, top - 52, x1 - x0, 52, 8, seed);
  // chimney or skylight, per house
  if (r() < 0.6) { p.rect(x1 - 30, top - 44, 9, 18, NL.granite2); p.rect(x1 - 31, top - 46, 11, 3, NL.snow); }
}

// ------------------------------------------------------------- grading

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Regrade painted art to the Nordlys winter: meadows become frost and snow,
 * foliage becomes dark spruce, earth and stone cool down. `mode` picks which.
 */
export function winterGrade(canvas: HTMLCanvasElement, mode: 'ground' | 'foliage' | 'built'): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let [h, s, l] = rgbToHsl(d[i]!, d[i + 1]!, d[i + 2]!);
    const green = h >= 45 && h <= 170 && s > 0.12;
    const earth = h < 45 || h > 330;
    if (mode === 'ground') {
      if (green) { h = 205; s = s * 0.18; l = 0.62 + l * 0.42; }
      else if (earth) { h = 215; s = s * 0.25; l = l * 0.88 + 0.04; }
      else { h = h * 0.4 + 200 * 0.6; s = s * 0.8; }
    } else if (mode === 'foliage') {
      if (green || earth) { h = 168 + (h - 100) * 0.08; s = s * 0.42; l = l * 0.7; }
      else { s *= 0.6; }
    } else {
      if (earth) { s *= 0.45; l *= 0.85; } else if (green) { h = 175; s *= 0.4; l *= 0.85; }
      else { h = h * 0.6 + 210 * 0.4; s *= 0.7; }
    }
    const [r, g, b] = hslToRgb(h, Math.min(1, s), Math.min(1, l));
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}

/** Dust snow on the upward-facing edges of a sprite (tree crowns, rocks). */
export function dustSnow(canvas: HTMLCanvasElement, amount: number, seed: number): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data, w = canvas.width, h = canvas.height;
  const r = mulberry(seed);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3]!;
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
    if (a(x, y) < 128) continue;
    // exposed from above within the last couple of texels
    const exposed = a(x, y - 1) < 128 || (a(x, y - 2) < 128 && r() < 0.5);
    if (!exposed || r() > amount) continue;
    for (let k = 0; k < 2 && y + k < h; k++) {
      const i = ((y + k) * w + x) * 4;
      if (d[i + 3]! < 128) break;
      const v = k === 0 ? 240 : 205;
      d[i] = v - 10; d[i + 1] = v - 4; d[i + 2] = v + 8 > 255 ? 255 : v + 8;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ------------------------------------------------------------- sky

/** A soft round lamp glow in cold LED white, for the night layer. */
export const LAMP_TINT = 0xbff3ff;
export const NIGHT_COLD = 0x16244a;

// ------------------------------------------------------------- equipment

/**
 * Campus versions of the workstations, at the same world size as the atlas
 * equipment so stations, grips and baselines stay where the sim expects them.
 */
export function paintNordlysEquipment(kind: 'anvil' | 'workbench' | 'lectern' | 'telescope' | 'postbox' | 'desk' | 'lamp' | 'banner', w: number, h: number): HTMLCanvasElement {
  const W = w * 2, H = h * 2;
  const p = new Painter(W, H);
  const b = H - 1;
  switch (kind) {
    case 'anvil': { // a compute node: a short rack with status LEDs
      p.rect(4, 6, W - 8, b - 6, NL.metal);
      p.rect(4, 6, W - 8, 4, '#2d3547');
      for (let y = 13; y < b - 4; y += 4) {
        p.hline(7, y, W - 14, '#1f2636');
        p.px(9 + (y * 7) % (W - 20), y + 1, y % 3 ? NL.teal : NL.cyan);
      }
      p.rect(6, b - 3, W - 12, 3, NL.ink);
      break;
    }
    case 'workbench': { // a lab bench with a glowing cube
      p.rect(2, 12, W - 4, 6, NL.timber3);
      p.hline(2, 12, W - 4, NL.cyan);
      p.rect(5, 18, 4, b - 18, NL.metal2); p.rect(W - 9, 18, 4, b - 18, NL.metal2);
      p.rect(12, 2, 10, 10, '#1b5560'); p.rect(14, 4, 6, 6, NL.cyan); p.rect(16, 6, 2, 2, '#e8fffb');
      p.rect(W - 22, 6, 12, 6, NL.metal2); p.hline(W - 21, 7, 10, NL.teal);
      break;
    }
    case 'lectern': { // a holo-terminal: pedestal and a floating panel
      p.rect(W / 2 - 3, 16, 6, b - 18, NL.metal2);
      p.rect(W / 2 - 9, b - 3, 18, 3, NL.metal);
      p.rect(3, 2, W - 6, 12, '#174a55');
      p.rect(5, 4, W - 10, 8, '#2fb8c9');
      for (let y = 5; y < 11; y += 2) p.hline(7, y, W - 16 - (y % 4) * 2, '#c8fbff');
      break;
    }
    case 'telescope': { // a white instrument on a black tripod
      line(p, W / 2, 24, 8, b, NL.metal2); line(p, W / 2, 24, W - 8, b, NL.metal2); line(p, W / 2, 24, W / 2, b, NL.metal2);
      for (let i = 0; i < 22; i++) p.rect(10 + i, 26 - i, 6, 6, i > 18 ? NL.violet : i % 5 === 0 ? NL.snow3 : NL.snow);
      break;
    }
    case 'postbox': { // a parcel locker with the gate's gold ring
      p.rect(2, 4, W - 4, b - 4, NL.metal2);
      for (let y = 8; y < b - 2; y += 9) p.hline(4, y, W - 8, NL.metal);
      p.vline(W / 2, 6, b - 8, NL.metal);
      ring(p, W / 2, 14, 4, 1, NL.gold, '#8a5a2a');
      break;
    }
    case 'desk': { // a slim desk with a lit monitor
      p.rect(2, 16, W - 4, 4, NL.timber3);
      p.hline(2, 16, W - 4, '#3a4458');
      p.rect(5, 20, 3, b - 20, NL.metal2); p.rect(W - 8, 20, 3, b - 20, NL.metal2);
      p.rect(W / 2 - 10, 2, 20, 12, NL.frame); p.rect(W / 2 - 8, 4, 16, 8, '#1f7f78');
      p.hline(W / 2 - 6, 6, 10, NL.cyan); p.hline(W / 2 - 6, 9, 7, NL.teal);
      p.rect(W / 2 - 1, 14, 2, 2, NL.metal2);
      break;
    }
    case 'lamp': { // a black post with a cold LED head
      p.rect(W / 2 - 1, 10, 3, b - 10, NL.metal2);
      p.rect(W / 2 - 4, b - 2, 9, 2, NL.metal);
      p.rect(W / 2 - 4, 4, 9, 6, NL.metal2);
      p.rect(W / 2 - 3, 9, 7, 2, '#dffcff');
      break;
    }
    case 'banner': { // a tall dark flag with the Nordlys mark
      p.rect(2, 0, 3, b, NL.metal2);
      p.rect(5, 4, W - 8, Math.round(H * 0.62), '#141c2c');
      p.vline(W - 4, 4, Math.round(H * 0.62), NL.teal);
      mark(p, Math.round((W + 2) / 2), Math.round(H * 0.3), 6, NL.teal);
      break;
    }
  }
  outline(p, NL.ink);
  return p.canvas;
}
