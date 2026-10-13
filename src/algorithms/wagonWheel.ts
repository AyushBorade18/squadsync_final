/** 8 named shot zones around the ground, picked as discrete buttons rather than a freeform
 *  angle — simpler to tap mid-over, and still enough to see a batter's scoring spread. */
export type ShotZone =
  | 'long_on' | 'long_off' | 'mid_wicket' | 'cover'
  | 'square_leg' | 'point' | 'fine_leg' | 'third_man';

export const SHOT_ZONES: { id: ShotZone; label: string; angleDeg: number }[] = [
  { id: 'long_off', label: 'Long off', angleDeg: -67.5 },
  { id: 'cover', label: 'Cover', angleDeg: -22.5 },
  { id: 'point', label: 'Point', angleDeg: 22.5 },
  { id: 'third_man', label: 'Third man', angleDeg: 67.5 },
  { id: 'fine_leg', label: 'Fine leg', angleDeg: 112.5 },
  { id: 'square_leg', label: 'Square leg', angleDeg: 157.5 },
  { id: 'mid_wicket', label: 'Mid-wicket', angleDeg: 202.5 },
  { id: 'long_on', label: 'Long on', angleDeg: 247.5 },
];

export interface ShotEvent { zone: ShotZone; runs: number; isBoundary: boolean }

/** Plot point for one shot: distance from center scales with runs (capped), angle from the zone. */
export function shotToPoint(shot: ShotEvent, maxRadius = 100): { x: number; y: number } {
  const zone = SHOT_ZONES.find((z) => z.id === shot.zone)!;
  const radius = Math.min(maxRadius, maxRadius * (0.35 + (Math.min(shot.runs, 6) / 6) * 0.65));
  const rad = (zone.angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

/** Per-zone totals, for a simple "where do they score" breakdown alongside the plot. */
export function zoneBreakdown(shots: ShotEvent[]): { zone: ShotZone; label: string; runs: number; shots: number }[] {
  return SHOT_ZONES.map((z) => {
    const inZone = shots.filter((s) => s.zone === z.id);
    return { zone: z.id, label: z.label, runs: inZone.reduce((a, s) => a + s.runs, 0), shots: inZone.length };
  });
}
