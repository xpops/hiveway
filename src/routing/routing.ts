import data from '../data/klaus/klaus-graph.json';

export type Point = { x: number; y: number };
export type Waypoint = Point & { id: string; floor: number; kind?: string; junction?: string };
type Edge = (typeof data.edges)[number];
type Segment = { edgeId: string; start: Waypoint; end: Waypoint; cost: number };
export type Snap = Point & { floor: number; segment: Segment; fraction: number; distancePx: number };
export type Route = { exit: Waypoint; cost: number; points: (Point & { floor: number })[]; edgeIds: string[] };

export const floors = data.floors;
export const exitLabels = new Map(data.landmarks.filter(item => item.kind === 'exit').map(item => [item.nodeId, item.label]));
export const nodes = new Map<string, Waypoint>(data.nodes.map(node => [node.id, node]));
export const edges = new Map(data.edges.map(edge => [edge.id, edge]));
export const segmentsByFloor = new Map<number, Segment[]>(floors.map(({ floor }) => [floor, []]));
const neighbors = new Map<string, { nodeId: string; edge: Edge }[]>(data.nodes.map(node => [node.id, []]));

for (const edge of data.edges) {
  const start = nodes.get(edge.source)!;
  const end = nodes.get(edge.target)!;
  if (edge.kind === 'walk' && start.floor === end.floor) {
    segmentsByFloor.get(start.floor)!.push({ edgeId: edge.id, start, end, cost: edge.cost });
  }
  neighbors.get(start.id)!.push({ nodeId: end.id, edge });
  neighbors.get(end.id)!.push({ nodeId: start.id, edge });
}

// Based on the team's coordinate test. Keep a continuous position within the corridor.
export function findClosestCorridor(point: Point, floor: number): Snap | null {
  let closest: Snap | null = null;
  for (const segment of segmentsByFloor.get(floor) ?? []) {
    const snap = projectOntoCorridor(point, segment);
    if (snap && (!closest || snap.distancePx < closest.distancePx)) closest = snap;
  }
  return closest;
}

export function projectOntoCorridor(point: Point, segment: Segment): Snap | null {
  const { start, end } = segment;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return null;
  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const fraction = Math.max(0, Math.min(1, projection));
  const x = start.x + fraction * dx;
  const y = start.y + fraction * dy;
  return { segment, floor: start.floor, fraction, x, y, distancePx: Math.hypot(point.x - x, point.y - y) };
}

export function findNearestExit(
  snap: Snap,
  closedEdges: ReadonlySet<string> = new Set(),
  blockedNodes: ReadonlySet<string> = new Set(),
): Route | null {
  const { segment, fraction } = snap;
  const distances = new Map<string, number>();
  // A start at an open endpoint can use other connections without crossing a closed segment.
  if (!blockedNodes.has(segment.start.id) && (!closedEdges.has(segment.edgeId) || fraction === 0)) {
    distances.set(segment.start.id, fraction * segment.cost);
  }
  if (!blockedNodes.has(segment.end.id) && (!closedEdges.has(segment.edgeId) || fraction === 1)) {
    distances.set(segment.end.id, (1 - fraction) * segment.cost);
  }

  const predecessors = new Map<string, { nodeId: string; edgeId: string }>();
  const visited = new Set<string>();
  while (true) {
    let current: string | undefined;
    let cost = Infinity;
    for (const [nodeId, distance] of distances) {
      if (!visited.has(nodeId) && distance < cost) {
        current = nodeId;
        cost = distance;
      }
    }
    if (current === undefined) return null;
    const waypoint = nodes.get(current)!;
    if (waypoint.kind === 'exit' && !blockedNodes.has(current)) {
      const points = [waypoint];
      const edgeIds: string[] = [];
      for (let previous = predecessors.get(current); previous; previous = predecessors.get(previous.nodeId)) {
        points.push(nodes.get(previous.nodeId)!);
        edgeIds.push(previous.edgeId);
      }
      if (points.at(-1)!.x !== snap.x || points.at(-1)!.y !== snap.y) edgeIds.push(segment.edgeId);
      return { exit: waypoint, cost, points: [snap, ...points.reverse()], edgeIds: edgeIds.reverse() };
    }
    visited.add(current);
    for (const { nodeId, edge } of neighbors.get(current)!) {
      if (edge.kind === 'elevator' || closedEdges.has(edge.id) || blockedNodes.has(nodeId)) continue;
      const candidate = cost + edge.cost;
      if (candidate < (distances.get(nodeId) ?? Infinity)) {
        distances.set(nodeId, candidate);
        predecessors.set(nodeId, { nodeId: current, edgeId: edge.id });
      }
    }
  }
}
