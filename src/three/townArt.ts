import { ReferenceArt, REFERENCE_ATLASES } from '../art/reference';
import { paintTerrain } from '../art/terrain';
import { paintStructures } from '../art/structures';
import { paintEmote } from '../art/characters';
import { hashString } from '../art/painter';
import { paintGlow, paintShadow } from '../art/tiles';
import { dustSnow, paintNordlysBuilding, paintNordlysEquipment, paintNordlysProp, winterGrade, type NordlysPropKind } from '../art/nordlys';
import { PROP_ANCHORS, TREE_ANCHORS } from '../world/dressing';
import type { PropKind, TownMap } from '../world/map';
import type { ThemeId } from '../theme';

/**
 * The 3D diorama draws the same painted art as the 2D town: one texel grid,
 * one winter grade, one set of buildings. Only the projection changes, so a
 * place looks the same whichever view is open.
 */
export interface TownArt {
  terrain: HTMLCanvasElement;
  structures: HTMLCanvasElement;
  /** Per building id, the occupied and empty paintings. */
  buildings: Map<string, { lit: HTMLCanvasElement; dark: HTMLCanvasElement }>;
  /** Per prop art key. */
  props: Map<string, HTMLCanvasElement>;
  glow: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  emotes: Record<'ok' | 'fail' | 'think' | 'zzz' | 'wait', HTMLCanvasElement>;
  ella: HTMLCanvasElement | null;
}

export function propArtKey(kind: PropKind, variant: number): string {
  return kind === 'tree' ? `tree${variant % 6}` : kind;
}

/** The placement anchor the map authored, independent of the painted size. */
export function propAnchor(kind: PropKind, variant: number): readonly [number, number] {
  return kind === 'tree' ? TREE_ANCHORS[variant % 6]! : PROP_ANCHORS[kind]!;
}

/** Load the authored chroma-key atlases without a game framework. */
export async function loadReferenceArt(): Promise<ReferenceArt> {
  const entries = Object.entries(REFERENCE_ATLASES);
  const images = await Promise.all(entries.map(([, url]) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`atlas ${url} did not load`));
    image.src = url;
  })));
  const byKey = Object.fromEntries(entries.map(([key], i) => [key, images[i]!]));
  return new ReferenceArt(byKey as Record<keyof typeof REFERENCE_ATLASES, HTMLImageElement>);
}

export function buildTownArt(map: TownMap, art: ReferenceArt, theme: ThemeId): TownArt {
  const nordlys = theme === 'nordlys';
  /** The authored atlases are a summer village; regrade them to the winter campus. */
  const grade = (key: string, c: HTMLCanvasElement): HTMLCanvasElement => {
    if (!nordlys) return c;
    if (key.startsWith('tree') || key === 'bush' || key === 'hedge') { winterGrade(c, 'foliage'); dustSnow(c, 0.55, hashString(`art-${key}`)); }
    else { winterGrade(c, 'built'); if (key === 'rock' || key === 'chapel' || key === 'fountain') dustSnow(c, 0.6, hashString(`art-${key}`)); }
    return c;
  };

  const terrain = paintTerrain(map);
  if (nordlys) winterGrade(terrain, 'ground');
  const structures = paintStructures(map, art);
  if (nordlys) winterGrade(structures, 'built');

  const props = new Map<string, HTMLCanvasElement>();
  for (let i = 0; i < 6; i++) props.set(`tree${i}`, grade(`tree${i}`, art.tree(i)));
  props.set('bush', grade('bush', art.bush()));
  props.set('hedge', grade('hedge', art.bush()));
  props.set('fountain', grade('fountain', art.prop(0, 82, 78)));
  props.set('chapel', grade('chapel', art.prop(1, 76, 80)));
  props.set('marketStall0', grade('marketStall0', art.prop(2, 54, 46)));
  props.set('marketStall1', grade('marketStall1', art.prop(3, 54, 46)));
  props.set('bridge', grade('bridge', art.prop(4, 70, 35)));
  props.set('dock', grade('dock', art.prop(4, 30, 18)));
  props.set('rock', grade('rock', art.prop(5, 25, 18)));
  props.set('lamp', grade('lamp', art.prop(6, 11, 35)));
  props.set('cart', grade('cart', art.prop(7, 32, 23)));

  const furniture: [string, number, number, number][] = [
    ['bench', 0, 24, 16], ['porchBench', 0, 18, 12], ['flowerBox', 1, 25, 16], ['planter', 1, 22, 15],
    ['barrel', 2, 16, 15], ['crate', 3, 18, 17], ['noticeBoard', 4, 26, 30], ['signpost', 5, 19, 27],
    ['grave0', 6, 17, 22], ['grave1', 7, 15, 23], ['grave2', 6, 14, 19], ['banner', 15, 17, 35],
  ];
  for (const [key, index, w, h] of furniture) props.set(key, grade(key, art.furniture(index, w, h)));

  const equipment: [string, number, number, number][] = [
    ['anvil', 0, 19, 17], ['workbench', 1, 25, 18], ['lectern', 2, 17, 21],
    ['telescope', 3, 23, 27], ['postbox', 4, 13, 21], ['desk', 5, 24, 18], ['stall', 6, 24, 17],
  ];
  for (const [key, index, w, h] of equipment) {
    if (nordlys && key !== 'stall') props.set(key, paintNordlysEquipment(key as 'anvil', w, h));
    else props.set(key, grade(key, art.equipment(index, w, h)));
  }

  let ella: HTMLCanvasElement | null = null;
  if (nordlys) {
    props.set('lamp', paintNordlysEquipment('lamp', 11, 35));
    props.set('banner', paintNordlysEquipment('banner', 17, 35));
    const campus: [NordlysPropKind, number, number][] = [
      ['fountain', 82, 78], ['chapel', 76, 80], ['marketStall0', 54, 46], ['marketStall1', 54, 46],
      ['noticeBoard', 26, 30], ['grave0', 17, 22], ['grave1', 15, 23], ['grave2', 14, 19], ['stall', 24, 17],
    ];
    for (const [kind, w, h] of campus) props.set(kind, paintNordlysProp(kind, w, h));
    ella = paintNordlysProp('ella', 22, 13);
  }

  const buildings = new Map<string, { lit: HTMLCanvasElement; dark: HTMLCanvasElement }>();
  for (const b of [...map.buildings, ...map.homes]) {
    const width = b.w * 16 + 6;
    buildings.set(b.id, {
      lit: nordlys ? paintNordlysBuilding(b.kind, width, true, b.id) : grade(`b-${b.id}`, art.building(b.kind, width, true)),
      dark: nordlys ? paintNordlysBuilding(b.kind, width, false, b.id) : grade(`b-${b.id}`, art.building(b.kind, width, false)),
    });
  }

  return {
    terrain, structures, buildings, props,
    glow: paintGlow(), shadow: paintShadow(12, 5),
    emotes: {
      ok: paintEmote('ok'), fail: paintEmote('fail'), think: paintEmote('think'),
      zzz: paintEmote('zzz'), wait: paintEmote('wait'),
    },
    ella,
  };
}
