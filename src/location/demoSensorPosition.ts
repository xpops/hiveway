import { floors, segmentsByFloor, type Snap, type Waypoint } from '../routing/routing';
import { angleDifference, createFloorBearing, createFloorDistance } from './coordinates';

type Segment = Snap['segment'];
type Direction = 1 | -1;
const FORWARD_LIMIT_DEGREES = 120;
type Hop = { segment: Segment; direction: Direction; from: Waypoint; to: Waypoint; heading: number };
export type SensorTrack = { snap: Snap; hop: Hop | null; heading: number | null };

const graphs = new Map(floors.map(({ floor }) => {
  const distance = createFloorDistance(floor);
  const bearing = createFloorBearing(floor);
  const junctions = new Map<string, Hop[]>();
  for (const segment of segmentsByFloor.get(floor) ?? []) {
    const { start, end } = segment;
    if (distance(start, end) < 0.0001) continue;
    for (const hop of [
      { segment, direction: 1 as const, from: start, to: end, heading: bearing(start, end) },
      { segment, direction: -1 as const, from: end, to: start, heading: bearing(end, start) },
    ]) {
      const outgoing = junctions.get(hop.from.id) ?? [];
      outgoing.push(hop);
      junctions.set(hop.from.id, outgoing);
    }
  }
  return [floor, { junctions, distance }] as const;
}));

function positionOn(hop: Hop, fraction: number): Snap {
  const { start, end } = hop.segment;
  return {
    segment: hop.segment, floor: start.floor, fraction, distancePx: 0,
    x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction,
  };
}

export function updateSensorTrack(track: SensorTrack, meters: number, phoneHeading: number) {
  const graph = graphs.get(track.snap.floor)!;
  const angle = (hop: Hop, heading: number) => Math.abs(angleDifference(hop.heading, heading));
  function choose(hops: Hop[], heading: number, limit = Infinity) {
    let best: Hop | null = null;
    for (const hop of hops) {
      const difference = angle(hop, heading);
      if (difference >= limit) continue;
      best = hop;
      limit = difference;
    }
    return best;
  }

  function corridorEnd(hop: Hop) {
    let meters = graph.distance(track.snap, hop.to);
    const seen = new Set([hop.from.id]);
    while (!seen.has(hop.to.id)) {
      if (hop.to.junction) return { arrival: hop, meters };
      seen.add(hop.to.id);
      const links = (graph.junctions.get(hop.to.id) ?? []).filter(link => link.segment.edgeId !== hop.segment.edgeId);
      const corridor = links.filter(link => link.to.kind !== 'stairs' && link.to.kind !== 'elevator');
      const straight = choose(corridor.length ? corridor : links, hop.heading);
      if (!straight) break;
      hop = straight;
      meters += graph.distance(hop.from, hop.to);
    }
    return null;
  }

  const { segment, fraction } = track.snap;
  const forward = graph.junctions.get(segment.start.id)?.find(link => link.segment.edgeId === segment.edgeId);
  const backward = graph.junctions.get(segment.end.id)?.find(link => link.segment.edgeId === segment.edgeId);
  if (!forward || !backward) return { track, detail: 'No corridor at this position.' };

  const atCurrentPoint = fraction === 0 ? graph.junctions.get(segment.start.id)! :
    fraction === 1 ? graph.junctions.get(segment.end.id)! : [forward, backward];
  function trackOn(hop: Hop) {
    return {
      hop,
      heading: phoneHeading,
      snap: hop.segment.edgeId === segment.edgeId ? track.snap : positionOn(hop, hop.direction === 1 ? 0 : 1),
    };
  }

  let next = track;
  let detail = '';
  if (track.heading === null || !track.hop) {
    const candidates = track.heading === null ? atCurrentPoint : atCurrentPoint.filter(link =>
      link.segment.edgeId !== segment.edgeId || angle(link, phoneHeading) <= 45);
    const hop = choose(candidates, phoneHeading, FORWARD_LIMIT_DEGREES);
    if (!hop) return { track, detail: 'Point the phone along the corridor.' };
    next = trackOn(hop);
  } else if (Math.abs(angleDifference(phoneHeading, track.heading)) >= 55) {
    const ends = [corridorEnd(forward), corridorEnd(backward)];
    const [ahead, behind] = ends;
    const nearest = !behind || (ahead && ahead.meters <= behind.meters) ? ahead : behind;
    if (!nearest) return { track, detail: 'No marked junction found along this corridor.' };
    const { arrival } = nearest;
    const outgoing = graph.junctions.get(arrival.to.id) ?? [];
    const reverse = outgoing.find(link => link.segment.edgeId === arrival.segment.edgeId);
    // Skip the incoming corridor unless the phone points back along it.
    const candidates = outgoing.filter(link => link !== reverse || angle(link, phoneHeading) <= 45);
    const hop = choose(candidates, phoneHeading, FORWARD_LIMIT_DEGREES);
    const snap = hop
      ? positionOn(hop, hop.direction === 1 ? 0 : 1)
      : positionOn(arrival, arrival.direction === 1 ? 1 : 0);
    const snapped = `Turn · snapped to ${arrival.to.id} (${nearest.meters.toFixed(1)} m)`;
    return {
      track: { snap, hop, heading: phoneHeading },
      detail: hop ? snapped : `${snapped} · Point the phone toward a connected corridor.`,
    };
  } else if (angle(track.hop, phoneHeading) >= FORWARD_LIMIT_DEGREES) {
    // Compass direction can change without crossing the turn threshold.
    const hop = choose(atCurrentPoint, phoneHeading, FORWARD_LIMIT_DEGREES);
    if (!hop) return { track, detail: 'No corridor ahead of the phone.' };
    next = trackOn(hop);
  }

  let { snap, hop } = next;
  while (hop && meters > 0.0001) {
    const length = graph.distance(hop.from, hop.to);
    const available = length * (hop.direction === 1 ? 1 - snap.fraction : snap.fraction);
    const traveled = Math.min(meters, available);
    const endFraction = hop.direction === 1 ? 1 : 0;
    snap = positionOn(hop, traveled === available ? endFraction : snap.fraction + hop.direction * traveled / length);
    meters -= traveled;
    if (traveled !== available || meters <= 0.0001) break;
    const links = (graph.junctions.get(hop.to.id) ?? []).filter(link => link.segment.edgeId !== hop!.segment.edgeId);
    const straight = hop.to.junction
      ? choose(links, phoneHeading, 40)
      : choose(links.filter(link => link.to.kind !== 'stairs' && link.to.kind !== 'elevator'), phoneHeading, FORWARD_LIMIT_DEGREES)
        ?? choose(links, phoneHeading, FORWARD_LIMIT_DEGREES);
    if (!straight) {
      detail ||= 'At corridor end. Turn the phone toward the next corridor.';
      break;
    }
    hop = straight;
    snap = positionOn(hop, hop.direction === 1 ? 0 : 1);
  }
  return { track: { ...next, hop, snap }, detail };
}
