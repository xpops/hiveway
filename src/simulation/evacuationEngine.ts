import { edges, exitLabels, findNearestExit, type Snap } from '../routing/routing';

export type Scenario = 'open' | 'closure' | 'unreachable';

export function calculateEvacuation(start: Snap | null, scenario: Scenario, manuallyClosed: ReadonlySet<string>) {
  const detourClosure = start && scenario === 'closure' ? findDetourClosure(start) : undefined;
  const closedEdges = new Set(manuallyClosed);
  if (detourClosure) closedEdges.add(detourClosure);

  const closedExits = scenario === 'unreachable' ? new Set(exitLabels.keys()) : new Set<string>();
  const route = start ? findNearestExit(start, closedEdges, closedExits) : null;

  return { route, closedEdges, detourClosure };
}

function findDetourClosure(start: Snap): string | undefined {
  const route = findNearestExit(start, new Set());
  return route?.edgeIds.find(id => id !== start.segment.edgeId && edges.get(id)?.kind === 'walk' &&
    findNearestExit(start, new Set([id])) !== null);
}
