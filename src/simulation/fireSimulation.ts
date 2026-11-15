import { edges, nodes } from '../routing/routing';

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
export const spreadIntervalMs = 20000;

export type FireSimulation = {
  ignition: string;
  elapsedSeconds: number;
  burning: ReadonlySet<string>;
  frontier: ReadonlySet<string>;
};

export function startFire(ignition = ignitionCandidates[
  Math.floor(Math.random() * ignitionCandidates.length)
]): FireSimulation {
  const burning = new Set([ignition]);
  return { ignition, elapsedSeconds: 0, burning, frontier: burning };
}

export function spreadFire(simulation: FireSimulation): FireSimulation {
  const frontier = new Set<string>();
  for (const id of simulation.frontier) {
    for (const neighbor of fireNeighbors.get(id) ?? []) {
      if (!simulation.burning.has(neighbor)) frontier.add(neighbor);
    }
  }
  const elapsedSeconds = simulation.elapsedSeconds + spreadIntervalMs / 1000;
  if (!frontier.size) return { ...simulation, elapsedSeconds, frontier };

  const burning = new Set([...simulation.burning, ...frontier]);
  return { ...simulation, elapsedSeconds, burning, frontier };
}
