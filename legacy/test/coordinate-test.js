import { toKlausFloorPoint } from "./coordinates.js";

const form = document.querySelector("form");
const floorSelect = form.elements.floor;
const viewFloor = document.querySelector("#view-floor");
const floorMap = document.querySelector("#floor-map");
const floorStatus = document.querySelector("#floor-status");
const svg = floorMap.querySelector("svg");
const background = document.querySelector("#floor-background");
const marker = document.querySelector("#position");
const result = document.querySelector("#result");
const corridors = document.querySelector("#corridors");
const snappedMarker = document.querySelector("#snapped-position");
const snapLink = document.querySelector("#snap-link");
const snapResult = document.querySelector("#snap-result");
const exitRoute = document.querySelector("#exit-route");
const routeResult = document.querySelector("#route-result");
const startMarkerStatus = document.querySelector("#start-marker-status");
const showStartFloor = document.querySelector("#show-start-floor");
const coordinateInputs = [form.elements.latitude, form.elements.longitude];
let corridorsByFloor;
let routeRequest = 0;
let floors;
let position;
let snap;
let route;

function renderRoute() {
  const floor = Number(viewFloor.value);
  const showStart = position?.inside && position.floor === floor;
  startMarkerStatus.hidden = !position?.inside || showStart;
  if (!startMarkerStatus.hidden) showStartFloor.textContent = `Level ${position.floor}`;
  marker.setAttribute("visibility", showStart ? "visible" : "hidden");
  snappedMarker.setAttribute("visibility", showStart && snap ? "visible" : "hidden");
  snapLink.setAttribute("visibility", showStart && snap ? "visible" : "hidden");

  // Each floor has its own coordinate system. Break the path at every transition.
  const path = (route?.points ?? []).map((point, index, points) => {
    if (point.floor !== floor) return "";
    const command = points[index - 1]?.floor === floor ? "L" : "M";
    return `${command}${point.x},${point.y}`;
  }).join(" ");
  exitRoute.setAttribute("d", path.trim());
}

async function plotPosition(x, y) {
  const request = ++routeRequest;
  const floor = Number(floorSelect.value);
  const { width, height } = floors.get(floor).coordinateSpace;
  const inside = x >= 0 && x <= width && y >= 0 && y <= height;
  position = { x, y, floor, inside };
  snap = route = null;

  marker.setAttribute("cx", x);
  marker.setAttribute("cy", y);
  result.textContent = `x = ${x.toFixed(2)}, y = ${y.toFixed(2)} px${inside ? "" : " · Outside SVG bounds"}`;
  snapResult.hidden = true;
  routeResult.hidden = !inside;
  routeResult.textContent = inside ? "Calculating route…" : "";
  renderRoute();
  if (!inside) return;

  try {
    const response = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ floor, x, y }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (request !== routeRequest) return;
    ({ snap, route } = data);
  } catch {
    if (request === routeRequest) {
      routeResult.textContent = "Could not calculate the route. Start the routing server with python3 legacy/test/server.py.";
    }
    return;
  }

  snapResult.hidden = !snap;
  routeResult.textContent = "No reachable exit.";
  if (snap) {
    snappedMarker.setAttribute("cx", snap.x);
    snappedMarker.setAttribute("cy", snap.y);
    snapLink.setAttribute("x1", x);
    snapLink.setAttribute("y1", y);
    snapLink.setAttribute("x2", snap.x);
    snapLink.setAttribute("y2", snap.y);
    snapResult.textContent = `Nearest corridor (${snap.edgeId}) · x = ${snap.x.toFixed(2)}, y = ${snap.y.toFixed(2)} px · Distance: ${snap.distancePx.toFixed(2)} px`;
    const levels = route?.points
      .filter((point, index, points) => point.floor !== points[index - 1]?.floor)
      .map(point => `Level ${point.floor}`).join(" → ");
    routeResult.textContent = route
      ? `Nearest exit: ${route.exitLabel} · Route cost: ${route.cost.toFixed(2)} schematic units · ${levels}`
      : "No reachable exit.";
  }
  renderRoute();
}

function renderFloor() {
  const floor = Number(viewFloor.value);
  const { coordinateSpace: { width, height }, mapUrl } = floors.get(floor);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", `Klaus level ${floor} corridors and exit route`);
  background.setAttribute("href", `../../public${mapUrl}`);
  background.setAttribute("width", width);
  background.setAttribute("height", height);
  corridors.replaceChildren();
  for (const { start, end } of corridorsByFloor.get(floor) ?? []) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", start.x);
    line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x);
    line.setAttribute("y2", end.y);
    corridors.append(line);
  }
  renderRoute();
}

function plotCoordinates() {
  const [latitude, longitude] = coordinateInputs.map(input => input.valueAsNumber);
  const { x, y } = toKlausFloorPoint(latitude, longitude, Number(floorSelect.value));
  if (viewFloor.value !== floorSelect.value) {
    viewFloor.value = floorSelect.value;
    renderFloor();
  }
  plotPosition(x, y);
}

function selectStartFloor() {
  routeRequest++;
  position = snap = route = null;
  result.textContent = "";
  snapResult.hidden = routeResult.hidden = true;
  viewFloor.value = floorSelect.value;
  renderFloor();
  floorStatus.hidden = true;
}

try {
  const response = await fetch("../../src/data/klaus/klaus-graph.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  floors = new Map(data.floors.map(floor => [floor.floor, floor]));
  corridorsByFloor = new Map(data.floors.map(({ floor }) => [floor, []]));
  const nodes = new Map(data.nodes.map(node => [node.id, node]));
  for (const edge of data.edges) {
    if (edge.kind !== "walk") continue;
    const start = nodes.get(edge.source);
    const end = nodes.get(edge.target);
    if (start.floor === end.floor) corridorsByFloor.get(start.floor).push({ start, end });
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    plotCoordinates();
  });
  floorSelect.addEventListener("change", selectStartFloor);
  viewFloor.addEventListener("change", renderFloor);
  showStartFloor.addEventListener("click", () => {
    viewFloor.value = floorSelect.value;
    renderFloor();
  });
  window.addEventListener("pageshow", () => {
    for (const input of coordinateInputs) input.value = input.defaultValue;
    selectStartFloor();
  });

  floorMap.hidden = false;
  selectStartFloor();
} catch {
  floorStatus.hidden = false;
  floorStatus.textContent = "Could not load the corridor graph. Run python3 legacy/test/server.py from the repository root.";
}
