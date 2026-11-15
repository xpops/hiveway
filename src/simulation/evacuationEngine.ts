import { edges, findNearestExit, type Snap } from '../routing/routing';

export function calculateEvacuation(start: Snap | null, burning?: ReadonlySet<string>) {
  if (!start) return null;
  if (!burning?.size) return findNearestExit(start);
  const blockedEdges = new Set(
    [...edges.values()].filter(({ source, target }) => burning.has(source) || burning.has(target)).map(edge => edge.id),
  );
  return findNearestExit(start, blockedEdges, burning);
}
