import { edges, findNearestExit, nodes, type Route, type Snap } from '../routing/routing';

const fireNeighbors = new Map<string, string[]>();
for (const edge of edges.values()) {
  if (edge.kind !== 'walk' || nodes.get(edge.source)?.floor !== nodes.get(edge.target)?.floor) continue;
  for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
    const adjacent = fireNeighbors.get(from) ?? [];
    adjacent.push(to);
    fireNeighbors.set(from, adjacent);
  }
}

const ignitionCandidates = [...fireNeighbors.keys()].filter(id => !nodes.get(id)?.kind);
export const spreadIntervalMs = 5000;

export type FireSimulation = {
  ignition: string;
  elapsedSeconds: number;
  burning: ReadonlySet<string>;
  frontier: ReadonlySet<string>;
  route: Route | null;
};

function routeAfterSpread(
  start: Snap, route: Route | null, burning: ReadonlySet<string>, newlyBurning: ReadonlySet<string>,
) {
  if (!route) return null;
  const touchesFire = (id: string, fire: ReadonlySet<string>) => {
    const edge = edges.get(id)!;
    return fire.has(edge.source) || fire.has(edge.target);
  };
  const startNode = start.fraction === 0 ? start.segment.start : start.fraction === 1 ? start.segment.end : null;
  if (startNode && burning.has(startNode.id)) return null;
  if (!newlyBurning.has(route.exit.id) && !route.edgeIds.some(id => touchesFire(id, newlyBurning))) {
    return route;
  }
  const blockedEdges = new Set(
    [...edges.keys()].filter(id => touchesFire(id, burning)),
  );
  return findNearestExit(start, blockedEdges, burning);
}

export function startFire(start: Snap, route: Route | null, ignition = ignitionCandidates[
  Math.floor(Math.random() * ignitionCandidates.length)
]): FireSimulation {
  const burning = new Set([ignition]);
  return { ignition, elapsedSeconds: 0, burning, frontier: burning, route: routeAfterSpread(start, route, burning, burning) };
}

export function spreadFire(start: Snap, simulation: FireSimulation): FireSimulation {
  const frontier = new Set<string>();
  for (const id of simulation.frontier) {
    for (const neighbor of fireNeighbors.get(id) ?? []) {
      if (!simulation.burning.has(neighbor)) frontier.add(neighbor);
    }
  }
  const elapsedSeconds = simulation.elapsedSeconds + spreadIntervalMs / 1000;
  if (!frontier.size) return { ...simulation, elapsedSeconds, frontier };

  const burning = new Set([...simulation.burning, ...frontier]);
  const route = routeAfterSpread(start, simulation.route, burning, frontier);
  return { ...simulation, elapsedSeconds, burning, frontier, route };
}
