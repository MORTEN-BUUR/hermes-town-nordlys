import * as THREE from 'three';
import { TILE } from '../art/tiles';
import { CHARACTER_BASELINE, FRAME_COLUMNS, FRAME_H, FRAME_W, lookFor, paintCharacterSheet } from '../art/characters';
import { hashString, mulberry } from '../art/painter';
import { LAMP_TINT, NIGHT_COLD, NL } from '../art/nordlys';
import { residentPose } from '../scenes/residentAnimation';
import type { Resident, TownSim } from '../sim/town';
import type { Place } from '../sim/toolMap';
import { MAP_H, MAP_W, type Building, type TownMap } from '../world/map';
import { NORDLYS_PLACES, type ThemeId } from '../theme';
import type { TownView } from '../view';
import { buildTownArt, loadReferenceArt, propAnchor, propArtKey, type TownArt } from './townArt';

export interface View3DOptions {
  map: TownMap;
  sim: TownSim;
  hour: number | null;
  theme: ThemeId;
  parent: HTMLElement;
  onSelect: (id: string | null) => void;
}

const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;
const FOV = 45;
/**
 * Every prop was painted as a side elevation, so in the diorama it stands up
 * and turns with the camera. Only what is flat on the ground stays flat.
 */
const FLAT = new Set(['dock', 'fountain']);

interface ResidentMesh {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.Texture;
  rows: number;
  flipped: boolean;
  frame: number;
}

interface BuildingMesh {
  building: Building;
  facade: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  lit: HTMLCanvasElement;
  dark: HTMLCanvasElement;
  litTexture: THREE.Texture;
  darkTexture: THREE.Texture;
  isLit: boolean;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null;
  steam: Steam | null;
}

/** A chimney plume: a handful of rising quads, gated on real activity. */
interface Steam {
  quads: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  ages: number[];
  origin: THREE.Vector3;
  on: boolean;
}

/** Soft gradients (glow, shadow, steam) are not pixel art; keep them smooth. */
function softTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function pixelTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The campus as a diorama: the same simulation, the same painted art, seen
 * from a free camera. Painted sprites stand upright in a lit 3D world; the
 * building masses behind them are generated from the map's own footprints.
 * Nothing here reads a lifecycle fact; geometry and light are presentation.
 */
export class TownView3D implements TownView {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly overlay: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D;
  private readonly raycaster = new THREE.Raycaster();

  private readonly residents = new Map<string, ResidentMesh>();
  private readonly sheets = new Map<string, { texture: THREE.Texture; rows: number }>();
  private readonly buildings: BuildingMesh[] = [];
  private readonly lampGlows: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly tinted: { material: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  private readonly sun: THREE.DirectionalLight;
  private readonly ambient: THREE.HemisphereLight;
  /** Building volumes in world pixels, so the camera never ends up inside one. */
  private readonly masses: {
    x0: number; z0: number; x1: number; z1: number; top: number;
    box: THREE.Box3; faces: THREE.MeshLambertMaterial[]; facade: THREE.MeshBasicMaterial | null; faded: boolean;
  }[] = [];

  // camera rig, in world pixels and radians
  private target = new THREE.Vector3(52 * TILE, 0, 40 * TILE);
  private wantTarget = this.target.clone();
  private azimuth = -0.55;
  private wantAzimuth = this.azimuth;
  private elevation = 0.78;
  private wantElevation = this.elevation;
  private distance = 1000;
  private wantDistance = this.distance;

  private selected: string | null = null;
  private following = false;
  private director = true;
  private directorTarget: string | null = null;
  private clock = 0;
  private touchedAt = -1e9;
  private lastFrame = performance.now();
  private drag: { x: number; y: number; pan: boolean; moved: boolean } | null = null;

  constructor(private readonly opts: View3DOptions, private readonly art: TownArt) {
    const { parent } = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    parent.appendChild(this.renderer.domElement);

    this.overlay = document.createElement('canvas');
    this.overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    parent.appendChild(this.overlay);
    this.octx = this.overlay.getContext('2d')!;

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 4, 6000);

    const nordlys = opts.theme === 'nordlys';
    const horizon = new THREE.Color(nordlys ? '#0e1730' : '#2b2a3a');
    this.scene.fog = new THREE.FogExp2(horizon.getHex(), nordlys ? 0.00085 : 0.0006);
    this.scene.background = horizon;

    this.ambient = new THREE.HemisphereLight(nordlys ? 0x4d6c9c : 0x8899bb, nordlys ? 0x1a2435 : 0x3a3328, 1.5);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(nordlys ? 0xbcd6ff : 0xffd9a8, 1.1);
    this.sun.position.set(-700, 900, -500);
    this.scene.add(this.sun);

    this.buildSky(nordlys);
    this.buildGround();
    this.buildBuildings(nordlys);
    this.buildProps(nordlys);
    this.buildElla();

    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.overview();
    this.sync(1);
    requestAnimationFrame(this.frame);
  }

  // --------------------------------------------------------------- world

  private buildSky(nordlys: boolean): void {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    if (nordlys) {
      g.addColorStop(0, '#04070f'); g.addColorStop(0.42, '#0a1430');
      g.addColorStop(0.68, '#13304a'); g.addColorStop(0.86, '#1b3d53'); g.addColorStop(1, '#0a1220');
    } else {
      g.addColorStop(0, '#1a1b33'); g.addColorStop(0.55, '#4a4765');
      g.addColorStop(0.85, '#8e7a6a'); g.addColorStop(1, '#2a2520');
    }
    ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(4200, 24, 16),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    dome.position.set(WORLD_W / 2, -400, WORLD_H / 2);
    dome.renderOrder = -10;
    this.scene.add(dome);

    // Distant ridgelines: the countryside falls away into the fjord.
    const ridge = new THREE.Color(nordlys ? '#0c1526' : '#2e2b36');
    for (const [radius, height, tone] of [[2600, 420, 0.9], [1900, 300, 1.25]] as const) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 48, 1, true),
        new THREE.MeshBasicMaterial({ color: ridge.clone().multiplyScalar(tone), side: THREE.BackSide, fog: false, depthWrite: false }),
      );
      mesh.position.set(WORLD_W / 2, height / 2 - 60, WORLD_H / 2);
      mesh.renderOrder = -9;
      this.scene.add(mesh);
    }
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, WORLD_H),
      this.track(new THREE.MeshLambertMaterial({ map: this.sheetTexture(this.art.terrain) })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_W / 2, 0, WORLD_H / 2);
    this.scene.add(ground);

    const structures = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, WORLD_H),
      this.track(new THREE.MeshLambertMaterial({ map: this.sheetTexture(this.art.structures), transparent: true, depthWrite: false })),
    );
    structures.rotation.x = -Math.PI / 2;
    structures.position.set(WORLD_W / 2, 0.6, WORLD_H / 2);
    this.scene.add(structures);
  }

  private sheetTexture(canvas: HTMLCanvasElement): THREE.Texture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private track<M extends THREE.MeshLambertMaterial | THREE.MeshBasicMaterial>(material: M): M {
    this.tinted.push({ material, base: material.color.clone() });
    return material;
  }

  /** Settled snow, so a roof is a surface rather than a slab of flat colour. */
  private roofTexture(nordlys: boolean): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = nordlys ? NL.snow : '#5a4634';
    ctx.fillRect(0, 0, 64, 64);
    const random = mulberry(9173);
    for (let i = 0; i < 900; i++) {
      const x = random() * 64, y = random() * 64, r = random();
      ctx.fillStyle = nordlys
        ? r < 0.5 ? 'rgba(255,255,255,0.5)' : r < 0.8 ? 'rgba(201,214,230,0.5)' : 'rgba(159,177,201,0.45)'
        : r < 0.5 ? 'rgba(120,92,66,0.4)' : 'rgba(58,44,32,0.4)';
      ctx.fillRect(x, y, 1 + random() * 3, 1 + random() * 2);
    }
    // Standing-seam lines along the fall of the roof.
    ctx.fillStyle = nordlys ? 'rgba(120,140,168,0.3)' : 'rgba(40,30,22,0.35)';
    for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 1, 64);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private buildBuildings(nordlys: boolean): void {
    const wall = new THREE.Color(nordlys ? NL.timber : '#6b5a44');
    const roof = new THREE.Color(nordlys ? NL.snow2 : '#4a3a2c');
    const roofMap = this.roofTexture(nordlys);
    for (const b of [...this.opts.map.buildings, ...this.opts.map.homes]) {
      const art = this.art.buildings.get(b.id)!;
      const w = art.lit.width / 2, h = art.lit.height / 2;
      const frontZ = (b.y + b.h) * TILE;
      const depth = Math.max(TILE, b.h * TILE);

      // The mass behind the painted elevation: the map's own footprint, with
      // a snow-covered roof. It gives the facade somewhere to stand.
      const faces = [
        this.track(new THREE.MeshLambertMaterial({ color: wall.clone() })),
        this.track(new THREE.MeshLambertMaterial({ color: wall.clone() })),
        this.track(new THREE.MeshLambertMaterial({ color: roof.clone(), map: this.roofMap(roofMap, b.w * TILE, depth) })),
        this.track(new THREE.MeshLambertMaterial({ color: wall.clone().multiplyScalar(0.7) })),
        this.track(new THREE.MeshLambertMaterial({ color: wall.clone() })),
        this.track(new THREE.MeshLambertMaterial({ color: wall.clone() })),
      ];
      const mass = new THREE.Mesh(new THREE.BoxGeometry(b.w * TILE, h * 0.74, depth), faces);
      mass.position.set((b.x + b.w / 2) * TILE, h * 0.37, frontZ - depth / 2);
      this.scene.add(mass);
      const volume = {
        x0: b.x * TILE - 4, x1: (b.x + b.w) * TILE + 4,
        z0: frontZ - depth - 4, z1: frontZ + 4, top: Math.max(h * 0.74, h),
        box: new THREE.Box3(
          new THREE.Vector3(b.x * TILE, 0, frontZ - depth),
          new THREE.Vector3((b.x + b.w) * TILE, h, frontZ + 2),
        ),
        faces, facade: null as THREE.MeshBasicMaterial | null, faded: false,
      };
      this.masses.push(volume);

      const darkTexture = pixelTexture(art.dark);
      const litTexture = pixelTexture(art.lit);
      const facade = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: darkTexture, alphaTest: 0.5, side: THREE.DoubleSide }),
      );
      this.tinted.push({ material: facade.material, base: new THREE.Color(1, 1, 1) });
      facade.position.set(b.x * TILE - 3 + w / 2, h / 2, frontZ + 0.8);
      this.scene.add(facade);
      volume.facade = facade.material;

      let glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
      if (b.kind !== 'house') {
        glow = this.groundGlow((b.x + b.w / 2) * TILE, frontZ + 14, b.w * TILE * 0.9, b.kind === 'forge' || b.kind === 'tavern' ? 0xf6c15a : 0xf2c063);
      }

      let steam: Steam | null = null;
      if (b.kind === 'forge' || (b.kind === 'workshop' && !nordlys) || b.kind === 'tavern') {
        const cx = nordlys ? b.x * TILE - 3 + (b.kind === 'forge' ? w / 2 : (w - 20)) : (b.x + b.w) * TILE - (b.kind === 'forge' ? 8 : 11);
        steam = this.makeSteam(new THREE.Vector3(cx, nordlys ? h - 6 : h * 0.8, frontZ - depth / 2));
      }

      this.buildings.push({ building: b, facade, lit: art.lit, dark: art.dark, litTexture, darkTexture, isLit: false, glow, steam });
    }
  }

  /** One snow texture, repeated to the footprint so the grain keeps its scale. */
  private roofMap(source: THREE.Texture, width: number, depth: number): THREE.Texture {
    const texture = source.clone();
    texture.needsUpdate = true;
    texture.repeat.set(Math.max(1, width / 48), Math.max(1, depth / 48));
    return texture;
  }

  private groundGlow(x: number, z: number, size: number, colour: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size * 0.62),
      new THREE.MeshBasicMaterial({
        map: softTexture(this.art.glow), color: colour, blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false, opacity: 0,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 1.2, z);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    return mesh;
  }

  private makeSteam(origin: THREE.Vector3): Steam {
    const quads: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
    const ages: number[] = [];
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshBasicMaterial({ map: softTexture(this.art.glow), color: 0xdfe8f2, transparent: true, opacity: 0, depthWrite: false }),
      );
      mesh.visible = false;
      this.scene.add(mesh);
      quads.push(mesh);
      ages.push(i * 0.45);
    }
    return { quads, ages, origin, on: false };
  }

  private buildProps(nordlys: boolean): void {
    for (const placed of this.opts.map.props) {
      const key = propArtKey(placed.kind, placed.variant ?? 0);
      const canvas = this.art.props.get(key);
      if (!canvas) continue;
      const [anchorW, anchorH] = propAnchor(placed.kind, placed.variant ?? 0);
      const w = canvas.width / 2, h = canvas.height / 2;
      const x = placed.x + anchorW / 2, z = placed.y + anchorH;
      const flat = FLAT.has(placed.kind);
      const variation = hashString(`${placed.x},${placed.y}`);
      const material = new THREE.MeshBasicMaterial({ map: pixelTexture(canvas), alphaTest: 0.5, side: THREE.DoubleSide });
      if (placed.kind === 'tree') {
        material.color.setHex((nordlys ? [0xe6eef6, 0xd2e0ea, 0xdce8ee, 0xc8d6e2] : [0xe2ebe1, 0xc4d9d1, 0xe2dfb9, 0xd2e3d0])[variation % 4]!);
      }
      this.tinted.push({ material, base: material.color.clone() });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      if (flat) {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, 1.4, z - h / 2);
      } else {
        mesh.position.set(x, h / 2, z);
        mesh.userData.billboard = true;
      }
      this.scene.add(mesh);
      if (placed.kind === 'lamp') {
        this.lampGlows.push(this.groundGlow(x, z, 70, nordlys ? LAMP_TINT : 0xf2c063));
      }
    }
  }

  private buildElla(): void {
    if (!this.art.ella) return;
    const lounge = this.opts.map.buildings.find((b) => b.kind === 'tavern');
    if (!lounge) return;
    const material = new THREE.MeshBasicMaterial({ map: pixelTexture(this.art.ella), alphaTest: 0.5, side: THREE.DoubleSide });
    this.tinted.push({ material, base: new THREE.Color(1, 1, 1) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.art.ella.width / 2, this.art.ella.height / 2), material);
    mesh.position.set((lounge.x + 2.2) * TILE, this.art.ella.height / 4, (lounge.y + lounge.h) * TILE + 7);
    mesh.userData.billboard = true;
    this.scene.add(mesh);
  }

  // ----------------------------------------------------------- residents

  private sheetFor(r: Resident): { texture: THREE.Texture; rows: number } {
    const bucket = `${r.role}-${hashString(r.parentId ?? r.id) % 16}`;
    const key = `${this.opts.theme}-${bucket}`;
    const cached = this.sheets.get(key);
    if (cached) return cached;
    const canvas = paintCharacterSheet(lookFor(bucket, r.role, this.opts.theme));
    const texture = pixelTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.NearestFilter;
    const made = { texture, rows: Math.max(1, Math.round(canvas.height / FRAME_H)) };
    this.sheets.set(key, made);
    return made;
  }

  private makeResident(r: Resident): ResidentMesh {
    const sheet = this.sheetFor(r);
    const texture = sheet.texture.clone();
    texture.needsUpdate = true;
    texture.repeat.set(1 / FRAME_COLUMNS, 1 / sheet.rows);
    const scale = r.kind === 'runner' ? 0.8 : 1;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(FRAME_W * scale, FRAME_H * scale),
      new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.4, transparent: true, side: THREE.DoubleSide }),
    );
    this.tinted.push({ material: mesh.material, base: new THREE.Color(1, 1, 1) });
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(13 * scale, 6 * scale),
      new THREE.MeshBasicMaterial({ map: softTexture(this.art.shadow), transparent: true, opacity: 0.55, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(mesh, shadow);
    const made: ResidentMesh = { mesh, shadow, texture, rows: sheet.rows, flipped: false, frame: -1 };
    this.residents.set(r.id, made);
    return made;
  }

  private syncResident(v: ResidentMesh, r: Resident): void {
    const scale = r.kind === 'runner' ? 0.8 : 1;
    const lift = (FRAME_H / 2 - (FRAME_H - CHARACTER_BASELINE)) * scale;
    v.mesh.position.set(r.x, lift, r.y);
    v.mesh.rotation.y = this.azimuth;
    v.shadow.position.set(r.x, 1.6, r.y);
    const alpha = r.state === 'resting' ? 0.85 : r.fade;
    v.mesh.material.opacity = alpha;
    v.shadow.material.opacity = 0.5 * alpha;

    const pose = residentPose(r, this.opts.sim.now());
    if (pose.frame !== v.frame || pose.flipX !== v.flipped) {
      v.frame = pose.frame;
      v.flipped = pose.flipX;
      const col = pose.frame % FRAME_COLUMNS, row = Math.floor(pose.frame / FRAME_COLUMNS);
      const u = 1 / FRAME_COLUMNS, w = 1 / v.rows;
      v.texture.repeat.set(pose.flipX ? -u : u, w);
      v.texture.offset.set(pose.flipX ? (col + 1) * u : col * u, 1 - (row + 1) * w);
    }
  }

  // -------------------------------------------------------------- camera

  private place(): void {
    const cosE = Math.cos(this.elevation);
    const x = this.target.x + Math.sin(this.azimuth) * this.distance * cosE;
    const z = this.target.z + Math.cos(this.azimuth) * this.distance * cosE;
    let y = Math.max(14, this.target.y + Math.sin(this.elevation) * this.distance);
    // Standing inside a wall shows nothing: step over whatever is underfoot.
    for (const m of this.masses) {
      if (x < m.x0 || x > m.x1 || z < m.z0 || z > m.z1) continue;
      y = Math.max(y, m.top + 12);
    }
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  private resize(): void {
    const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const ratio = Math.min(2, window.devicePixelRatio);
    this.overlay.width = Math.round(w * ratio);
    this.overlay.height = Math.round(h * ratio);
  }

  overview(): void {
    this.following = false;
    this.select(null);
    this.directorTarget = null;
    this.touchedAt = this.clock;
    this.wantTarget.set(52 * TILE, 0, 40 * TILE);
    this.wantAzimuth = -0.55;
    this.wantElevation = 0.78;
    const spread = 2 * Math.tan((FOV / 2) * Math.PI / 180);
    this.wantDistance = Math.max((50 * TILE * Math.sin(0.78)) / spread, (92 * TILE) / (spread * this.camera.aspect));
  }

  goTo(place: Place | string): void {
    const b = this.opts.map.buildings.find((x) => x.id === place);
    if (!b) return;
    this.touchedAt = this.clock;
    this.directorTarget = null;
    this.setFollow(false);
    this.wantTarget.set((b.x + b.w / 2) * TILE, 0, (b.y + b.h) * TILE + 20);
    this.wantDistance = Math.max(170, b.w * TILE * 2.1);
    this.wantElevation = 0.42;
  }

  centerOn(x: number, y: number): void {
    this.touchedAt = this.clock;
    this.directorTarget = null;
    this.setFollow(false);
    this.wantTarget.set(x, 0, y);
  }

  /** The ground the camera can see, for the minimap rectangle. */
  getCameraRect(): { x: number; y: number; w: number; h: number } {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const point = this.raycaster.ray.intersectPlane(plane, hit);
      const p = point ?? this.raycaster.ray.at(6000, hit);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const x = Math.max(0, minX), y = Math.max(0, minZ);
    return { x, y, w: Math.min(WORLD_W, maxX) - x, h: Math.min(WORLD_H, maxZ) - y };
  }

  select(id: string | null): void {
    this.selected = id;
    this.opts.onSelect(id);
    if (this.following) this.setFollow(true);
  }

  selectedId(): string | null { return this.selected; }

  setFollow(on: boolean): void {
    this.following = on;
    this.directorTarget = null;
    if (!on) return;
    this.wantDistance = 150;
    this.wantElevation = 0.46;
  }

  isFollowing(): boolean { return this.following; }

  setDirector(on: boolean): void {
    this.director = on;
    if (!on) this.directorTarget = null;
  }

  isDirector(): boolean { return this.director; }

  /**
   * With a few residents the camera should be where the action is, as in the
   * 2D town: whoever most recently had something happen, unless the viewer
   * moved the camera in the last 45 seconds.
   */
  private direct(): void {
    const { sim } = this.opts;
    if (!this.director || this.following) return;
    if (this.clock - this.touchedAt < 45) return;
    if (sim.active().length > 3) { this.directorTarget = null; return; }
    const pick = sim.mostRecent();
    if (!pick) return;
    let target = pick;
    const runners = sim.runners().filter((r) => r.parentId === pick.id || pick.parentId === r.parentId);
    const moving = runners.find((r) => r.state === 'moving' || r.state === 'returning');
    if (moving) target = moving;
    if (target.id === this.directorTarget) return;
    this.directorTarget = target.id;
    this.wantDistance = 230;
    this.wantElevation = 0.5;
  }

  // --------------------------------------------------------------- input

  private bindInput(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey, moved: false };
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      if (!d.moved) return;
      d.x = e.clientX; d.y = e.clientY;
      this.touchedAt = this.clock;
      this.directorTarget = null;
      if (d.pan) {
        if (this.following) this.setFollow(false);
        const k = this.distance * 0.0016;
        const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
        const up = new THREE.Vector3(Math.sin(this.azimuth), 0, Math.cos(this.azimuth));
        this.wantTarget.addScaledVector(right, -dx * k).addScaledVector(up, -dy * k);
        this.wantTarget.x = THREE.MathUtils.clamp(this.wantTarget.x, 0, WORLD_W);
        this.wantTarget.z = THREE.MathUtils.clamp(this.wantTarget.z, 0, WORLD_H);
      } else {
        this.wantAzimuth -= dx * 0.006;
        this.wantElevation = THREE.MathUtils.clamp(this.wantElevation + dy * 0.005, 0.12, 1.45);
      }
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved) return;
      this.pick(e.clientX, e.clientY);
    });
    el.addEventListener('pointercancel', () => { this.drag = null; });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.touchedAt = this.clock;
      this.directorTarget = null;
      this.wantDistance = THREE.MathUtils.clamp(this.wantDistance * Math.exp(e.deltaY * 0.0012), 70, 1900);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const v of this.residents.values()) if (v.mesh.visible) meshes.push(v.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) { this.select(null); return; }
    const hit = hits[0]!.object;
    for (const [id, v] of this.residents) if (v.mesh === hit) { this.select(id); return; }
  }

  // ---------------------------------------------------------------- loop

  /** Renderer facts for the headless world check. Never shown to a viewer. */
  stats(): { triangles: number; residents: number; buildings: number; distance: number; target: { x: number; y: number } } {
    return {
      triangles: this.renderer.info.render.triangles,
      residents: this.residents.size,
      buildings: this.buildings.length,
      distance: this.distance,
      target: { x: this.target.x, y: this.target.z },
    };
  }

  darkness(): number {
    const h = this.opts.hour ?? (new Date().getHours() + new Date().getMinutes() / 60);
    const t = Math.cos(((h - 13) / 24) * Math.PI * 2);
    const d = THREE.MathUtils.clamp((0.5 - t * 0.5) * 0.78, 0, 0.78);
    return this.opts.theme === 'nordlys' ? Math.max(d, 0.5) : d;
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.clock += dt;
    this.opts.sim.update(dt);
    this.sync(dt);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
    requestAnimationFrame(this.frame);
  };

  private sync(dt: number): void {
    const { sim } = this.opts;
    const seen = new Set<string>();
    for (const r of sim.residents.values()) {
      seen.add(r.id);
      this.syncResident(this.residents.get(r.id) ?? this.makeResident(r), r);
    }
    for (const [id, v] of this.residents) {
      if (seen.has(id)) continue;
      this.scene.remove(v.mesh, v.shadow);
      v.mesh.geometry.dispose(); v.mesh.material.dispose(); v.texture.dispose();
      v.shadow.geometry.dispose(); v.shadow.material.dispose();
      this.residents.delete(id);
      if (this.selected === id) this.select(null);
      if (this.directorTarget === id) this.directorTarget = null;
    }

    this.direct();
    const held = this.following ? this.selected : this.directorTarget;
    const lead = held ? sim.residents.get(held) : null;
    if (lead) this.wantTarget.set(lead.x, 0, lead.y);

    const k = 1 - Math.exp(-dt * 3.4);
    this.target.lerp(this.wantTarget, k);
    this.azimuth += (this.wantAzimuth - this.azimuth) * k;
    this.elevation += (this.wantElevation - this.elevation) * k;
    this.distance += (this.wantDistance - this.distance) * k;
    this.place();

    // Billboards turn with the camera, and whatever the camera is standing in
    // steps aside rather than filling the screen with one tree.
    const near = this.camera.position;
    for (const obj of this.scene.children) {
      if (!obj.userData.billboard) continue;
      obj.rotation.y = this.azimuth;
      const dx = obj.position.x - near.x, dz = obj.position.z - near.z;
      obj.visible = dx * dx + dz * dz > 34 * 34;
    }

    this.fadeOccluders();
    const dark = this.darkness();
    this.applyLight(dark);
    for (const bv of this.buildings) {
      const place = bv.building.kind as Place;
      const act = bv.building.kind === 'house' ? 0 : sim.activity.get(place) ?? 0;
      const homeUsed = bv.building.kind === 'house' && [...sim.residents.values()].some((r) => r.home === bv.building && r.state === 'resting');
      const lit = act > 0.15 || homeUsed || bv.building.kind !== 'house' || dark > 0.3 || hashString(bv.building.id) % 3 === 0;
      if (lit !== bv.isLit) {
        bv.isLit = lit;
        bv.facade.material.map = lit ? bv.litTexture : bv.darkTexture;
        bv.facade.material.needsUpdate = true;
      }
      if (bv.glow) bv.glow.material.opacity = lit ? dark * (bv.building.kind === 'tavern' || bv.building.kind === 'forge' ? 0.55 : 0.34) : 0;
      if (bv.steam) this.updateSteam(bv.steam, act > 0.2, dt);
    }
    for (const glow of this.lampGlows) glow.material.opacity = dark * 0.5;
  }

  /**
   * A wall between the camera and what it is looking at hides the work going
   * on there, so it turns to glass instead of blocking the view.
   */
  private fadeOccluders(): void {
    const from = this.camera.position;
    const toTarget = this.target.clone().sub(from);
    const span = toTarget.length();
    const ray = new THREE.Ray(from, toTarget.normalize());
    const hit = new THREE.Vector3();
    for (const m of this.masses) {
      const point = ray.intersectBox(m.box, hit);
      const fade = point !== null && from.distanceTo(point) < span - 8;
      if (fade === m.faded) continue;
      m.faded = fade;
      for (const face of m.faces) { face.transparent = fade; face.opacity = fade ? 0.2 : 1; face.depthWrite = !fade; face.needsUpdate = true; }
      if (m.facade) { m.facade.transparent = fade; m.facade.opacity = fade ? 0.25 : 1; m.facade.needsUpdate = true; }
    }
  }

  /** One night tint over the painted art, matching the 2D town's dusk. */
  private applyLight(dark: number): void {
    const nordlys = this.opts.theme === 'nordlys';
    const warm = new THREE.Color(nordlys ? 0x7f90b8 : 0xb08a6a);
    const cold = new THREE.Color(nordlys ? NIGHT_COLD : 0x2a3550);
    const base = warm.clone().lerp(cold, THREE.MathUtils.clamp((dark - 0.2) / 0.6, 0, 1));
    const tint = new THREE.Color(1, 1, 1).lerp(base, dark);
    for (const t of this.tinted) t.material.color.copy(t.base).multiply(tint);
    this.sun.intensity = 1.15 - dark * 0.75;
    this.ambient.intensity = 1.55 - dark * 0.45;
  }

  private updateSteam(steam: Steam, on: boolean, dt: number): void {
    steam.on = on;
    for (let i = 0; i < steam.quads.length; i++) {
      const quad = steam.quads[i]!;
      let age = steam.ages[i]! + dt;
      if (age > 2.6) {
        if (!on) { quad.visible = false; steam.ages[i] = 0; continue; }
        age = 0;
      }
      steam.ages[i] = age;
      if (!on && age === 0) { quad.visible = false; continue; }
      quad.visible = true;
      const f = age / 2.6;
      quad.position.set(steam.origin.x + Math.sin(age * 1.7 + i) * 4, steam.origin.y + f * 46, steam.origin.z);
      quad.scale.setScalar(0.6 + f * 2.4);
      quad.material.opacity = Math.max(0, 0.42 * (1 - f));
      quad.rotation.y = this.azimuth;
    }
  }

  // ------------------------------------------------------------- overlay

  /** Name tags, bubbles and place names, drawn above the 3D view. */
  private drawOverlay(): void {
    const ctx = this.octx;
    const ratio = this.overlay.width / Math.max(1, this.renderer.domElement.clientWidth);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width / ratio, this.overlay.height / ratio);
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    const point = new THREE.Vector3();
    const project = (x: number, y: number, z: number): { sx: number; sy: number; depth: number } => {
      point.set(x, y, z).project(this.camera);
      return { sx: (point.x * 0.5 + 0.5) * w, sy: (-point.y * 0.5 + 0.5) * h, depth: point.z };
    };

    const nordlys = this.opts.theme === 'nordlys';
    ctx.textAlign = 'center';
    ctx.font = '600 11px system-ui, Segoe UI, Helvetica, sans-serif';
    for (const bv of this.buildings) {
      const b = bv.building;
      if (b.kind === 'house') continue;
      const label = nordlys ? NORDLYS_PLACES[b.kind as Place].name : b.label;
      const p = project((b.x + b.w / 2) * TILE, bv.lit.height / 2 + 12, (b.y + b.h) * TILE);
      if (p.depth > 1 || p.sx < -80 || p.sx > w + 80) continue;
      this.chip(ctx, label, p.sx, p.sy, '#bff7ec', 0.85);
    }

    const crowd = this.residents.size;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const r of this.opts.sim.residents.values()) {
      const v = this.residents.get(r.id);
      if (!v) continue;
      const selected = this.selected === r.id;
      const head = project(r.x, FRAME_H * (r.kind === 'runner' ? 0.8 : 1) - 4, r.y);
      if (head.depth > 1) continue;
      const near = this.distance < 420;
      if (r.bubble && r.fade > 0.9 && r.state !== 'resting' && (near || selected)) {
        this.chip(ctx, r.bubble, head.sx, head.sy - 14, '#f7f1e3', 0.95, '#10151f');
      }
      if (selected || (near && crowd <= 80)) {
        const foot = project(r.x, 0, r.y);
        ctx.globalAlpha = 0.92 * r.fade;
        ctx.fillStyle = selected ? '#ffd36b' : r.kind === 'runner' ? '#a9c4d6' : r.role === 'scheduled' ? '#9fd0e0' : r.isChild ? '#c9b58f' : r.memory ? '#8f8677' : '#f3e6c9';
        ctx.fillText(r.name, foot.sx, foot.sy + 12);
        ctx.globalAlpha = 1;
      }
      if (r.emote && (near || selected)) {
        const art = this.art.emotes[r.emote];
        ctx.globalAlpha = 0.95;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(art, head.sx + 10, head.sy - 34 - Math.sin(r.clock * 6) * 2, art.width / 2, art.height / 2);
        ctx.globalAlpha = 1;
      }
      if (selected) {
        const foot = project(r.x, 0, r.y);
        ctx.strokeStyle = '#ffd36b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(foot.sx, foot.sy, 14, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string, alpha: number, background = 'rgba(6,10,18,0.78)'): void {
    const width = ctx.measureText(text).width;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = background;
    ctx.fillRect(x - width / 2 - 4, y - 11, width + 8, 14);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }
}

/** Build the diorama once its painted art is ready. */
export async function createTownView3D(opts: View3DOptions): Promise<TownView> {
  const art = buildTownArt(opts.map, await loadReferenceArt(), opts.theme);
  return new TownView3D(opts, art);
}
