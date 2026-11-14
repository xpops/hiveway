"""Serve the local routing test page and its same-origin JSON API."""

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from math import isfinite
from pathlib import Path
from urllib.parse import urlsplit

from routing import RoutingGraph


ROOT = Path(__file__).resolve().parents[2]
GRAPH_PATH = "src/data/klaus/klaus-graph.json"
ASSETS = {
    f"/legacy/test/{name}"
    for name in ("coordinate-test.html", "coordinate-test.css", "coordinate-test.js", "coordinates.js")
}
ASSETS.add(f"/{GRAPH_PATH}")


class TestPageHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        if urlsplit(self.path).path not in self.server.assets:
            self.send_error(404)
            return None
        return super().send_head()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/route":
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 2048:
                raise ValueError()
            payload = json.loads(self.rfile.read(size))
            floor, x, y = (payload[key] for key in ("floor", "x", "y"))
            if type(floor) is not int or floor not in self.server.graph.floors:
                raise ValueError()
            if not all(type(value) in (int, float) and isfinite(value) for value in (x, y)):
                raise ValueError()
        except (ValueError, TypeError, KeyError, OverflowError):
            self.send_json(400, {"error": "Provide a valid floor and finite x and y coordinates."})
            return

        self.send_json(200, self.server.graph.route_from(floor, x, y))

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    data = json.loads((ROOT / GRAPH_PATH).read_text(encoding="utf-8"))
    with ThreadingHTTPServer(("127.0.0.1", args.port), TestPageHandler) as server:
        server.graph = RoutingGraph(data)
        server.assets = ASSETS | {"/public" + floor["mapUrl"] for floor in data["floors"]}
        print(f"http://localhost:{server.server_port}/legacy/test/coordinate-test.html", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
