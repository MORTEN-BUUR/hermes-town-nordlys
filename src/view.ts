import type { Place } from './sim/toolMap';

/**
 * What the HUD needs from a renderer. The 2D town scene and the 3D diorama
 * both satisfy it, so the HUD, the inspector and the minimap are written
 * once and never ask which view is on screen.
 */
export interface TownView {
  /** Frame the whole campus. */
  overview(): void;
  /** Move to a building by its map id. */
  goTo(place: Place | string): void;
  /** Centre on a point in world pixels. */
  centerOn(x: number, y: number): void;
  /** The visible ground rectangle in world pixels, for the minimap. */
  getCameraRect(): { x: number; y: number; w: number; h: number };
  select(id: string | null): void;
  selectedId(): string | null;
  setFollow(on: boolean): void;
  isFollowing(): boolean;
  setDirector(on: boolean): void;
  isDirector(): boolean;
  /** 0 is full daylight, 0.78 is the darkest night. Presentation only. */
  darkness(): number;
}
