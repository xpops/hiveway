# HiveWay

A browser demo that shows routes to modeled exits in Georgia Tech’s Klaus Advanced Computing Building.

> Draft for team review · Georgia Tech Campus Solutions Challenge · Engineering Track

## Project status

| Status | Scope |
| --- | --- |
| Available | SVG maps for levels 1–3, a level 1 graph overlay for inspection, and one combined routing graph with 152 nodes and 170 edges. |
| Implemented demo | Exit routing, manual floor selection, an estimated start node from device geolocation, and a route overlay. Live location accuracy still needs a test inside Klaus. |
| Later | Room-to-room wayfinding after we map room entrances to graph nodes using a room-level plan or a manual survey. |

## What the demo does

1. **Locate the start.** Select **Navigate**, choose your current floor, and grant location permission. The app projects the reported latitude and longitude onto that floor's map, then highlights the projected point on the closest corridor as the estimated start. Tap a corridor to set or correct the start.
2. **Route to a modeled exit.** Show the path across floors and mark stairs where the user changes levels. Choose the reachable simulation endpoint with the lowest graph cost.

The CCB Binary Bridge is a simulation endpoint that connects to another building.

## Tech stack

| Layer | Choice | Purpose |
| --- | --- | --- |
| Web app | React, TypeScript, Vite | Floor selector and a mobile-friendly map view. |
| Starting position | Browser Geolocation API and floor calibration | Convert a device location fix to local SVG coordinates and snap it to a corridor on the selected floor. |
| Map rendering | SVG | Render the base map and route overlay in the same floor-specific `viewBox` so they scale together. |
| Map data | JSON | Load the three-floor graph, including walk, stair, and elevator edges, plus landmarks. |
| Routing | Dijkstra in TypeScript | Find a minimum-cost path from the start to an eligible simulation exit. |

## Local calculation and offline access

The browser runs the TypeScript routing logic as JavaScript on the user's phone or laptop. Static hosting delivers the app files. After the browser loads the bundle, graph, and maps, route updates run on the device with no API calls.

For a laptop demo, serve the built app on `localhost`. The server reads files from disk and the browser computes routes. For offline reopening on phones, a proposed upgrade is to serve the build over HTTPS and use a service worker to cache the app shell, scripts, styles, all three floor maps, and graph during an initial online visit. Verify by turning off connectivity and reloading after the cache is ready. Location availability and accuracy depend on the device, so keep map selection available offline.

## How the map and routing fit together

- **Location calibration.** The graph stores SVG pixel coordinates. Geolocation returns latitude, longitude, and an accuracy estimate. Match verified reference points to SVG points for each floor, project the fix into a local planar coordinate system, and fit a transform into that floor's SVG. Start with at least three non-collinear reference points for an affine fit and check the fit against additional points. Indoor fixes can put users in the wrong corridor even after calibration. Show the estimated start and allow correction on the selected floor.
- **Graph:** Nodes have a floor and local `(x, y)` coordinates. Edges define which nodes are connected. Levels 1, 2, and 3 have seven, zero, and one modeled exit nodes, respectively.
- **Search:** Keep the Dijkstra search in `src/routing/routing.ts` independent of React and simulation state. Given the allowed graph, a start, and one or more targets, return the path and total cost, or an explicit unreachable result. Use the graph’s schematic costs; they are not calibrated walking distances or travel times.
- **Rendering:** Split the returned path into floor-specific segments and show floor changes at connector nodes. Draw only the selected floor’s segment in its local coordinate space. Check connector pairings and modeled endpoints on the demo route.

## Repository layout

```text
public/floorplans/
├── klaus-level-1.svg
├── klaus-level-2.svg
├── klaus-level-3.svg
└── klaus-level-1-overlay.svg    # inspection view
src/data/klaus/
├── klaus-graph.json             # app graph covering all three floors
└── klaus-level-1-graph.json     # standalone level 1 reference
README.md
```

The React demo starts at `index.html` and `src/main.tsx`.

- `src/App.tsx` connects the map and starting position.
- `src/components/FloorPickerDialog.tsx` displays Navigate and prompts for the current floor.
- `src/components/FloorMap.tsx` renders the floor map and route overlays.
- `src/location/useStartLocation.ts` requests device location, converts it with `coordinates.ts`, and snaps it to a corridor on the chosen floor.

The team's original coordinate test lives in `legacy/test/`.

## Local development

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite. Select **Navigate** and choose your current floor to calculate an initial route. If location is unavailable, tap a corridor on that floor. Build with `npm run build` and serve the build locally with `npm run preview`.

## Build order and demo checks

1. Render the three floors and check that the route overlay stays aligned as the map resizes.
2. Calibrate a demo floor and compare several reported locations with known corridor waypoints. Check that selecting a different floor limits snapping to that floor and that a missing fix can be handled with a map tap.
3. Start from a node on an upper floor and route to a modeled exit. Verify that the route crosses floors as needed and skips elevators.
4. Once the offline cache is implemented, reload on a phone in airplane mode and test an exit route with map selection.

## Decisions for team review

- Pick the calibration landmarks and check location accuracy on the phone we will use for the demo.
- Confirm map taps as the backup for weak fixes or denied location permission.
- Decide whether offline reopening on phones belongs in the demo or follows the browser routing milestone.
