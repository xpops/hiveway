"""Calculate routes across the Klaus floor graph in schematic cost units."""

from collections import defaultdict
from heapq import heappop, heappush
from itertools import count
from math import hypot


class RoutingGraph:
    def __init__(self, graph):
        self.floors = {floor["floor"]: floor for floor in graph["floors"]}
        self.nodes = {node["id"]: node for node in graph["nodes"]}
        self.neighbors = defaultdict(list)
        self.corridors = defaultdict(list)
        self.exit_labels = {
            landmark["nodeId"]: landmark["label"]
            for landmark in graph.get("landmarks", [])
            if landmark["kind"] == "exit"
        }

        for edge in graph["edges"]:
            start = self.nodes[edge["source"]]
            end = self.nodes[edge["target"]]
            cost = edge.get("cost", edge.get("lengthPx"))
            self.neighbors[start["id"]].append((end["id"], cost))
            self.neighbors[end["id"]].append((start["id"], cost))
            if edge["kind"] == "walk" and start["floor"] == end["floor"]:
                self.corridors[start["floor"]].append((edge["id"], start, end, cost))

    def route_from(self, floor, x, y):
        space = self.floors[floor]["coordinateSpace"]
        if not (0 <= x <= space["width"] and 0 <= y <= space["height"]):
            return {"snap": None, "route": None}

        nearest = None
        for edge_id, start, end, cost in self.corridors[floor]:
            dx, dy = end["x"] - start["x"], end["y"] - start["y"]
            length_squared = dx * dx + dy * dy
            if length_squared == 0:
                continue

            # Clamp the projection to the corridor segment.
            projection = ((x - start["x"]) * dx + (y - start["y"]) * dy) / length_squared
            fraction = max(0, min(1, projection))
            snap_x, snap_y = start["x"] + fraction * dx, start["y"] + fraction * dy
            distance = hypot(x - snap_x, y - snap_y)
            if nearest is None or distance < nearest[0]["distancePx"]:
                snap = {
                    "edgeId": edge_id, "x": snap_x, "y": snap_y,
                    "floor": floor, "distancePx": distance,
                }
                nearest = (snap, start["id"], end["id"], cost, fraction)

        if nearest is None:
            return {"snap": None, "route": None}

        snap, start, end, cost, fraction = nearest
        # Seed both endpoints with the cost of walking from the projected point.
        distances = {start: fraction * cost, end: (1 - fraction) * cost}
        route = self._nearest_exit(snap, distances)
        return {"snap": snap, "route": route}

    def _nearest_exit(self, snap, distances):
        queue = []
        order = count()
        previous = {}
        for node_id, cost in distances.items():
            heappush(queue, (cost, next(order), node_id))

        while queue:
            cost, _, node_id = heappop(queue)
            if cost != distances[node_id]:
                continue
            node = self.nodes[node_id]
            if node.get("kind") == "exit":
                points = [node]
                while node_id in previous:
                    node_id = previous[node_id]
                    points.append(self.nodes[node_id])
                return {
                    "exit": node,
                    "exitLabel": self.exit_labels.get(node["id"], node["id"]),
                    "cost": cost,
                    "points": [snap, *reversed(points)],
                }

            for neighbor, edge_cost in self.neighbors[node_id]:
                candidate = cost + edge_cost
                if candidate < distances.get(neighbor, float("inf")):
                    distances[neighbor] = candidate
                    previous[neighbor] = node_id
                    heappush(queue, (candidate, next(order), neighbor))

        return None
