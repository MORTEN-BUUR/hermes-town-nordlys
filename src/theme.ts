import type { Place } from './sim/toolMap';

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
}

const img = (file: string): string => new URL(`./assets/nordlys/places/${file}.jpg`, import.meta.url).href;

export const NORDLYS_PLACES: Record<Place, PlaceInfo> = {
  hall: { name: 'AI-paviljongen', classic: 'Town hall', work: 'planning, delegation and model turns', image: img('hall') },
  library: { name: 'Arkivet', classic: 'Library', work: 'reading files, search and memory', image: img('library') },
  workshop: { name: 'Verkstedet', classic: 'Workshop', work: 'editing, writing and patching', image: img('workshop') },
  forge: { name: 'Datasenteret', classic: 'Forge', work: 'shell commands, tests and builds', image: img('forge') },
  post: { name: 'Portalen', classic: 'Post office', work: 'git, GitHub and messages out', image: img('post') },
  observatory: { name: 'Observatoriet', classic: 'Observatory', work: 'web search and browsing', image: img('observatory') },
  tavern: { name: 'Loungen', classic: 'Tavern', work: 'finished sessions resting between turns', image: img('tavern') },
  market: { name: 'Torget', classic: 'Market', work: 'skills and tools the town does not know yet', image: img('market') },
};

export const CAMPUS_IMAGE = new URL('./assets/nordlys/campus.jpg', import.meta.url).href;
export const GUIDE_IMAGE = new URL('./assets/nordlys/staff/lise.jpg', import.meta.url).href;

/**
 * Team portraits used as avatars in the inspector. A portrait is a face for a
 * session, picked by a stable hash; it never claims that person did the work.
 */
export const STAFF_PORTRAITS: readonly string[] = Array.from({ length: 10 }, (_, i) =>
  new URL(`./assets/nordlys/staff/staff-${String(i + 1).padStart(2, '0')}.jpg`, import.meta.url).href);

export function placeName(theme: ThemeId, place: Place, classic: string): string {
  return theme === 'nordlys' ? NORDLYS_PLACES[place].name : classic;
}
