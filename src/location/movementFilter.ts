import { projectOntoCorridor, segmentsByFloor, type Point, type Snap } from '../routing/routing';
import { angleDifference, createFloorBearing, createFloorDistance } from './coordinates';

// Demo limits. The margin absorbs small position and floor calibration errors.
const MAX_SPEED_METERS_PER_SECOND = 7;
const POSITION_MARGIN_METERS = 4;

export type TimedSnap = { snap: Snap; timestamp: number };

const floorGraphs = new Map([...segmentsByFloor].map(([floor, segments]) => {
  const distance = createFloorDistance(floor);
  const lengths = new Map<string, number>();
  const neighbors = new Map<string, { id: string; meters: number }[]>();

  for (const { edgeId, start, end } of segments) {
    const meters = distance(start, end);
    lengths.set(edgeId, meters);
    if (!neighbors.has(start.id)) neighbors.set(start.id, []);
    if (!neighbors.has(end.id)) neighbors.set(end.id, []);
    neighbors.get(start.id)!.push({ id: end.id, meters });
    neighbors.get(end.id)!.push({ id: start.id, meters });
  }

  return [floor, { lengths, neighbors, distance, bearing: createFloorBearing(floor) }] as const;
}));

export function canReachPosition(previous: TimedSnap, next: TimedSnap): boolean {
  const seconds = (next.timestamp - previous.timestamp) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0 || previous.snap.floor !== next.snap.floor) return false;

  const { snap: from } = previous;
  const { snap: to } = next;
  const graph = floorGraphs.get(from.floor);
  if (!graph) return false;
  const fromLength = graph.lengths.get(from.segment.edgeId);
  const toLength = graph.lengths.get(to.segment.edgeId);
  if (fromLength === undefined || toLength === undefined) return false;

  const budget = MAX_SPEED_METERS_PER_SECOND * seconds + POSITION_MARGIN_METERS;
  if (from.segment.edgeId === to.segment.edgeId &&
      Math.abs(from.fraction - to.fraction) * fromLength <= budget) return true;

  // Treat each point on an edge as having a partial connection to both endpoints.
  const pending = new Map([
    [from.segment.start.id, from.fraction * fromLength],
    [from.segment.end.id, (1 - from.fraction) * fromLength],
  ]);
  const finish = new Map([
    [to.segment.start.id, to.fraction * toLength],
    [to.segment.end.id, (1 - to.fraction) * toLength],
  ]);
  const visited = new Set<string>();

  while (pending.size > 0) {
    let nearest: string | undefined;
    let meters = Infinity;
    for (const [id, distance] of pending) {
      if (distance < meters) {
        nearest = id;
        meters = distance;
      }
    }
    if (nearest === undefined || meters > budget) return false;
    if (meters + (finish.get(nearest) ?? Infinity) <= budget) return true;

    pending.delete(nearest);
    visited.add(nearest);
    for (const neighbor of graph.neighbors.get(nearest) ?? []) {
      const distance = meters + neighbor.meters;
      if (!visited.has(neighbor.id) && distance <= budget && distance < (pending.get(neighbor.id) ?? Infinity)) {
        pending.set(neighbor.id, distance);
      }
    }
  }

  return false;
}

type Direction = { degrees: number; weight: number };
export type PositionReading = Point & { timestamp: number };
const CANDIDATE_WINDOW_METERS = 2.5;
const MAX_TRACKING_ACCURACY_METERS = 20;
const MAX_RECOVERY_ACCURACY_METERS = 15;
const RECOVERY_SAMPLE_COUNT = 3;
const RECOVERY_MAX_GAP_MS = 8000;

export function hasUsableAccuracy(accuracy: number) {
  return Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= MAX_TRACKING_ACCURACY_METERS;
}

type Recovery = { position: TimedSnap; count: number };
export type PositionMatch = {
  snap: Snap | null;
  reacquired: boolean;
  recovery: Recovery | null;
  detail: string;
};

export function movementDirection(
  floor: number, current: PositionReading, previous: PositionReading | null,
  course: number | null, speed: number | null, compass: number | null,
): Direction | null {
  if (course !== null && Number.isFinite(course) && speed !== null && speed >= 0.8) {
    return { degrees: course, weight: 2 };
  }

  const elapsed = previous ? current.timestamp - previous.timestamp : 0;
  const graph = floorGraphs.get(floor);
  if (!graph || compass === null || !previous || elapsed <= 0 || elapsed > 5000 ||
      graph.distance(previous, current) < 2.5) return null;
  const measuredBearing = graph.bearing(previous, current);
  if (Math.abs(angleDifference(compass, measuredBearing)) > 45) return null;
  return { degrees: compass, weight: 1.25 };
}

export function matchMovingPosition(
  reading: PositionReading, previous: TimedSnap, direction: Direction | null,
): Snap | null {
  const floor = previous.snap.floor;
  const graph = floorGraphs.get(floor);
  if (!graph || reading.timestamp <= previous.timestamp) return null;

  const candidates: { snap: Snap; offset: number }[] = [];
  let closestOffset = Infinity;
  for (const segment of segmentsByFloor.get(floor) ?? []) {
    const snap = projectOntoCorridor(reading, segment);
    if (!snap) continue;
    const offset = graph.distance(reading, snap);
    candidates.push({ snap, offset });
    closestOffset = Math.min(closestOffset, offset);
  }

  let best: Snap | null = null;
  let bestScore = Infinity;
  for (const { snap, offset } of candidates) {
    if (offset > closestOffset + CANDIDATE_WINDOW_METERS ||
        !canReachPosition(previous, { snap, timestamp: reading.timestamp })) continue;

    let score = offset;
    if (direction && graph.distance(previous.snap, snap) >= 2.5) {
      const bearing = graph.bearing(previous.snap, snap);
      // Alignment is a weak bonus for a movement supported by a position fix.
      score -= direction.weight * Math.cos(angleDifference(direction.degrees, bearing) * Math.PI / 180);
    }
    if (score < bestScore) {
      best = snap;
      bestScore = score;
    }
  }
  return best;
}

export function trackPosition(
  reading: PositionReading, accuracy: number, previous: TimedSnap, nearest: Snap | null,
  direction: Direction | null, recovery: Recovery | null,
): PositionMatch {
  if (reading.timestamp <= previous.timestamp) {
    return { snap: null, reacquired: false, recovery, detail: 'Measurement predates the last accepted position.' };
  }
  if (!hasUsableAccuracy(accuracy)) {
    return { snap: null, reacquired: false, recovery: null, detail: 'GPS accuracy is too low to update the corridor.' };
  }

  const matched = matchMovingPosition(reading, previous, direction);
  const graph = floorGraphs.get(previous.snap.floor);
  if (graph && nearest && accuracy <= MAX_RECOVERY_ACCURACY_METERS) {
    // Follow a second sequence independently when the raw fix consistently fits
    // another corridor better than the one reachable from the current track.
    const betterAlternative = !matched || (
      nearest.segment.edgeId !== matched.segment.edgeId &&
      graph.distance(reading, matched) - graph.distance(reading, nearest) >= 2
    );
    if (betterAlternative && graph.distance(reading, nearest) <= 5) {
      const position = { snap: nearest, timestamp: reading.timestamp };
      const gap = recovery ? reading.timestamp - recovery.position.timestamp : Infinity;
      const consistent = recovery && gap <= RECOVERY_MAX_GAP_MS &&
        canReachPosition(recovery.position, position) &&
        graph.distance(recovery.position.snap, nearest) <= 2.5 * (gap / 1000) + POSITION_MARGIN_METERS;
      const count = consistent ? recovery.count + 1 : 1;
      if (count >= RECOVERY_SAMPLE_COUNT) {
        return { snap: nearest, reacquired: true, recovery: null, detail: 'Position recovered from 3 consistent GPS fixes.' };
      }
      return {
        snap: null, reacquired: false, recovery: { position, count },
        detail: `Checking another corridor (${count}/${RECOVERY_SAMPLE_COUNT} consistent fixes).`,
      };
    }
  }

  return {
    snap: matched, reacquired: false, recovery: null,
    detail: matched ? '' : 'No nearby corridor passed the movement filter.',
  };
}
