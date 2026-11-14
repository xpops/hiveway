export function buildRoutingGraph(graph) {
  const segmentsByFloor = new Map();
  const nodes = new Map();
  const neighbors = new Map();
  const exitLabels = new Map();
  for (const node of graph.nodes) {
    nodes.set(node.id, node);
    neighbors.set(node.id, []);
  }
  for (const landmark of graph.landmarks ?? []) {
    if (landmark.kind === "exit") exitLabels.set(landmark.nodeId, landmark.label);
  }
  for (const edge of graph.edges) {
    const start = nodes.get(edge.source);
    const end = nodes.get(edge.target);
    const cost = edge.cost ?? edge.lengthPx;
    if (edge.kind === "walk" && start.floor === end.floor) {
      if (!segmentsByFloor.has(start.floor)) segmentsByFloor.set(start.floor, []);
      segmentsByFloor.get(start.floor).push({ edgeId: edge.id, start, end, cost });
    }
    neighbors.get(start.id).push({ nodeId: end.id, cost });
    neighbors.get(end.id).push({ nodeId: start.id, cost });
  }
  return { segmentsByFloor, nodes, neighbors, exitLabels };
}

export function findClosestCorridor(x, y, segments) {
  let closest = null;
  for (const segment of segments) {
    const { start, end } = segment;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;

    // Clamp the projection to the segment endpoints.
    const projection = ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared;
    const fraction = Math.max(0, Math.min(1, projection));
    const snapX = start.x + fraction * dx;
    const snapY = start.y + fraction * dy;
    const distancePx = Math.hypot(x - snapX, y - snapY);
    if (!closest || distancePx < closest.distancePx) {
      closest = { segment, fraction, x: snapX, y: snapY, distancePx };
    }
  }
  return closest;
}

export function findNearestExit(snap, { nodes, neighbors }) {
  const { start, end, cost } = snap.segment;
  // Start at the projected point by seeding both corridor endpoints.
  const distances = new Map([
    [start.id, snap.fraction * cost],
    [end.id, (1 - snap.fraction) * cost],
  ]);
  const predecessors = new Map();
  const visited = new Set();

  while (true) {
    let current = null;
    let totalCost = Infinity;
    for (const [nodeId, distance] of distances) {
      if (!visited.has(nodeId) && distance < totalCost) {
        current = nodeId;
        totalCost = distance;
      }
    }
    if (current === null) return null;

    const node = nodes.get(current);
    if (node.kind === "exit") {
      const points = [];
      for (let id = current; id !== undefined; id = predecessors.get(id)) {
        points.push(nodes.get(id));
      }
      return { exit: node, cost: totalCost, points: [{ ...snap, floor: start.floor }, ...points.reverse()] };
    }

    visited.add(current);
    for (const { nodeId, cost } of neighbors.get(current)) {
      const nextDistance = totalCost + cost;
      if (nextDistance < (distances.get(nodeId) ?? Infinity)) {
        distances.set(nodeId, nextDistance);
        predecessors.set(nodeId, current);
      }
    }
  }
}
