import { createFloorDistance } from '../location/coordinates';
import { floors, type Point, type Route } from '../routing/routing';

type RoutePoint = Point & { floor: number };
export type RouteProgress = { index: number; fraction: number };
export const routeStart: RouteProgress = { index: 0, fraction: 0 };

const distanceByFloor = new Map(floors.map(({ floor }) => [floor, createFloorDistance(floor)]));
const MAX_ROUTE_OFFSET_METERS = 5;
const STAIR_PROMPT_DISTANCE_METERS = 4;

function interpolate(from: RoutePoint, to: RoutePoint, fraction: number): RoutePoint {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction, floor: from.floor };
}

export function advanceProgress(points: RoutePoint[], progress: RouteProgress, location: RoutePoint): RouteProgress {
  if (points[progress.index]?.floor !== location.floor) return progress;
  const distance = distanceByFloor.get(location.floor)!;
  let best = progress;
  let bestOffset = MAX_ROUTE_OFFSET_METERS;
  // Check the current segment and two ahead. A floor change always stops the search.
  for (let index = progress.index; index <= progress.index + 2; index++) {
    const from = points[index];
    const to = points[index + 1];
    if (!to || from.floor !== to.floor) break;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared === 0 ? 1 : Math.max(0, Math.min(1,
      ((location.x - from.x) * dx + (location.y - from.y) * dy) / lengthSquared));
    // Keep a backwards or stationary fix as a competing candidate so GPS jitter
    // cannot advance progress merely because a later segment was considered.
    const offset = distance(location, interpolate(from, to, fraction));
    if (offset >= bestOffset) continue;
    bestOffset = offset;
    if (index === progress.index && fraction < progress.fraction) {
      best = progress;
    } else {
      best = fraction === 1 ? { index: index + 1, fraction: 0 } : { index, fraction };
    }
  }
  return best;
}

export function remainingRoutePoints(route: Route, progress: RouteProgress): RoutePoint[] {
  const points = route.points.slice(progress.index);
  if (progress.fraction > 0 && points.length > 1) {
    points[0] = interpolate(points[0], points[1], progress.fraction);
  }
  return points;
}

export function nearbyStair(route: Route, progress: RouteProgress) {
  const points = route.points;
  const current = points[progress.index];
  const distance = distanceByFloor.get(current.floor)!;
  let meters = 0;
  for (let index = progress.index; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];
    if (from.floor !== to.floor) return { index, from, to };
    const fractionLeft = index === progress.index ? 1 - progress.fraction : 1;
    meters += distance(from, to) * fractionLeft;
    if (meters > STAIR_PROMPT_DISTANCE_METERS) return null;
  }
  return null;
}
