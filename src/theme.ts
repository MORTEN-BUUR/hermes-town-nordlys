import type { Place } from './sim/toolMap';
import { FRAME_COLUMNS, FRAME_H, FRAME_W, idleFrame, lookFor, paintCharacterSheet } from './art/characters';

/**
 * Presentation theme. `nordlys` is the Nordlys datacenter / Norway AI look:
 * a modern Nordic campus under the polar night. `classic` is the original
 * medieval town. Themes change art and copy only, never what an event means.
 */
export type ThemeId = 'nordlys' | 'classic';

export function resolveTheme(search: string, buildDefault: string | undefined): ThemeId {
  const requested = new URLSearchParams(search).get('theme') ?? buildDefault ?? 'nordlys';
  return requested === 'classic' ? 'classic' : 'nordlys';
}

export interface PlaceInfo {
  /** Campus name shown in the world and on the HUD. */
  name: string;
  /** The classic name, kept as a subtitle so the work vocabulary stays readable. */
  classic: string;
  /** What kind of tool call sends a runner here. */
  work: string;
  image: string;
  /** A campus resident who is not a session: shown on the card, never in the town's counts. */
  mascot?: { name: string; image: string; note: string };
}

const img = (file: string): string => new URL(`./assets/nordlys/places/${file}.jpg`, import.meta.url).href;

export const NORDLYS_PLACES: Record<Place, PlaceInfo> = {
  hall: { name: 'AI-paviljongen', classic: 'Town hall', work: 'planning, delegation and model turns', image: img('hall') },
  library: { name: 'Arkivet', classic: 'Library', work: 'reading files, search and memory', image: img('library') },
  workshop: { name: 'Verkstedet', classic: 'Workshop', work: 'editing, writing and patching', image: img('workshop') },
  forge: { name: 'Datasenteret', classic: 'Forge', work: 'shell commands, tests and builds, beside the quantum lab', image: img('forge') },
  post: { name: 'Portalen', classic: 'Post office', work: 'git, GitHub and messages out', image: img('post') },
  observatory: { name: 'Observatoriet', classic: 'Observatory', work: 'web search and browsing', image: img('observatory') },
  tavern: { name: 'Loungen', classic: 'Tavern', work: 'finished sessions resting between turns', image: img('tavern'),
    mascot: { name: 'Ella', image: new URL('./assets/nordlys/ella.jpg', import.meta.url).href, note: 'campus dog, usually asleep by the door' } },
  market: { name: 'Torget', classic: 'Market', work: 'skills and tools the town does not know yet', image: img('market') },
};

export const CAMPUS_IMAGE = new URL('./assets/nordlys/campus.jpg', import.meta.url).href;
export const GUIDE_IMAGE = new URL('./assets/nordlys/staff/staff-03.jpg', import.meta.url).href;

export interface StaffPortrait {
  name: string;
  image: string;
  /** Whether the owner confirmed which portrait this name belongs to. */
  confirmed: boolean;
}

/**
 * The Nordlys team, used as avatars in the inspector. A portrait is a face
 * for a session, picked by a stable hash; it never claims that person did
 * the work. The numbers match the portrait sheet the owner confirmed.
 */
const TEAM: [string, boolean][] = [
  ['Sherlock Holmes', true], ['Odin', true], ['Lise', true],
  ['Morten Büür', true], ['Tord', true], ['Aleksander Olsen', true], ['Gary', true], ['Cody jr', true],
  ['Claude', true],
];
export const STAFF: readonly StaffPortrait[] = TEAM.map(([name, confirmed], i) => ({
  name, confirmed,
  image: name === 'Claude' ? paintedPortrait('claude') : new URL(`./assets/nordlys/staff/staff-${String(i + 1).padStart(2, '0')}.jpg`, import.meta.url).href,
}));

/**
 * Claude joined the team at the owner's invitation. There is no photo, so the
 * portrait is the resident sprite itself in the Nordlys suit, under the aurora.
 */
function paintedPortrait(id: string): string {
  const sheet = paintCharacterSheet(lookFor(id, 'coordinator', 'nordlys'));
  const frame = idleFrame('down', 0);
  const c = document.createElement('canvas');
  c.width = FRAME_W * 6; c.height = FRAME_H * 6;
  const ctx = c.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#0b1630'); sky.addColorStop(0.55, '#102a3c'); sky.addColorStop(1, '#070b14');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, c.width, c.height);
  for (const [y, colour] of [[44, 'rgba(73,242,214,0.38)'], [76, 'rgba(42,212,217,0.24)'], [108, 'rgba(169,139,255,0.2)']] as const) {
    const band = ctx.createLinearGradient(0, y - 30, 0, y + 30);
    band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.5, colour); band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band; ctx.fillRect(0, y - 30, c.width, 60);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, (frame % FRAME_COLUMNS) * FRAME_W, Math.floor(frame / FRAME_COLUMNS) * FRAME_H, FRAME_W, FRAME_H, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export function placeName(theme: ThemeId, place: Place, classic: string): string {
  return theme === 'nordlys' ? NORDLYS_PLACES[place].name : classic;
}
