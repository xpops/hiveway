import { edges, exitLabels, findNearestExit, type Snap } from '../routing/routing';

export type Scenario = 'open' | 'closure' | 'unreachable';

export function calculateEvacuation(
  start: Snap | null, scenario: Scenario, manuallyClosed: ReadonlySet<string>,
  burning: ReadonlySet<string> = new Set(),
) {
  const detourClosure = start && scenario === 'closure' ? findDetourClosure(start) : undefined;
  const closedEdges = new Set(manuallyClosed);
  if (detourClosure) closedEdges.add(detourClosure);

  const routeBlockedEdges = new Set(closedEdges);
  if (burning.size) {
    for (const edge of edges.values()) {
      if (burning.has(edge.source) || burning.has(edge.target)) routeBlockedEdges.add(edge.id);
    }
  }
  const blockedNodes = scenario === 'unreachable' ? new Set([...burning, ...exitLabels.keys()]) : burning;
  const route = start ? findNearestExit(start, routeBlockedEdges, blockedNodes) : null;

  return { route, closedEdges, detourClosure };
}

function findDetourClosure(start: Snap): string | undefined {
  const route = findNearestExit(start, new Set());
  return route?.edgeIds.find(id => id !== start.segment.edgeId && edges.get(id)?.kind === 'walk' &&
    findNearestExit(start, new Set([id])) !== null);
}
