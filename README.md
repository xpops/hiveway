# HiveWay

A browser demo that reroutes users through Georgia Tech’s Klaus Advanced Computing Building as simulated fire closures change.

> Draft for team review · Georgia Tech Campus Solutions Challenge · Engineering Track

## Project status

| Status | Scope |
| --- | --- |
| Available | SVG maps for levels 1–3, a level 1 graph overlay for inspection, and one combined routing graph with 150 nodes and 159 edges. |
| Implemented demo | Simulated fire rerouting, manual floor selection, an estimated start node from device geolocation, and a route overlay. Live location accuracy still needs a test inside Klaus. |
| Later | Room-to-room wayfinding after we map room entrances to graph nodes using a room-level plan or a manual survey. |

## What the demo does

1. **Locate the start.** Select **Navigate**, choose your current floor, and grant location permission. The app projects the reported latitude and longitude onto that floor's map, then highlights the projected point on the closest corridor. The first usable reading sets the route start. Later readings move the position marker and trim the route as you advance along it. Near a stair on the route, confirm arrival on the next floor to switch the map and location tracking to that floor. Tap a corridor to set or correct the start.
2. **Route to a modeled exit.** Show the path across floors and mark stairs where the user changes levels. Choose the reachable simulation endpoint with the lowest graph cost.
3. **Simulate a fire.** Select **Simulate fire** to ignite a corridor. The app reroutes from the current position as the fire grows and clears the displayed path when there is no reachable exit.

The demo uses modeled fire spread and modeled exits. The CCB Binary Bridge is a simulation endpoint that connects to another building.

## Tech stack

| Layer | Choice | Purpose |
| --- | --- | --- |
| Web app | React, TypeScript, Vite | Floor selector, simulation controls, and a mobile-friendly map view. |
| Starting position | Browser Geolocation API and floor calibration | Convert a device location fix to local SVG coordinates and snap it to a corridor on the selected floor. |
| Map rendering | SVG | Render the base map and route overlay in the same floor-specific `viewBox` so they scale together. |
| Map data | JSON | Load the three-floor graph, including walk and stair connections, a separate vertical elevator network, and landmarks. |
| Routing | Dijkstra in TypeScript | Find a minimum-cost path from the start to an eligible simulation exit. |
| Simulation | Browser state and graph-based fire spread | Track burning nodes and closed corridors or exits, then trigger routing again. |

## Local calculation and offline access

The browser runs the TypeScript routing logic as JavaScript on the user's phone or laptop. Static hosting delivers the app files. After the browser loads the bundle, graph, maps, and scenario data, route updates run on the device with no API calls.

For a laptop demo, serve the built app on `localhost`. The server reads files from disk and the browser computes routes. For offline reopening on phones, a proposed upgrade is to serve the build over HTTPS and use a service worker to cache the app shell, scripts, styles, all three floor maps, graph, and scenarios during an initial online visit. Verify by turning off connectivity and reloading after the cache is ready. Location availability and accuracy depend on the device, so keep map selection available offline.

## How the map and routing fit together

- **Location calibration.** The graph stores SVG pixel coordinates. Geolocation returns latitude, longitude, and an accuracy estimate. Match verified reference points to SVG points for each floor, project the fix into a local planar coordinate system, and fit a transform into that floor's SVG. Start with at least three non-collinear reference points for an affine fit and check the fit against additional points. Indoor fixes can put users in the wrong corridor even after calibration. Show the estimated start and allow correction on the selected floor.
- **Graph:** Nodes have a floor and local `(x, y)` coordinates. Edges define which nodes are connected. Corridor waypoints let a simulation close part of a hallway without blocking the entire zone. Levels 1, 2, and 3 have seven, zero, and one modeled exit nodes, respectively.
- **Search:** Keep the Dijkstra search in `src/routing/routing.ts` independent of React and simulation state. Given the allowed graph, a start, and one or more targets, return the path and total cost, or an explicit unreachable result. Use the graph’s schematic costs; they are not calibrated walking distances or travel times.
- **Simulation engine:** Translate current position, exit candidates, and closures into search inputs. Keep the base graph immutable so resets can restore it.
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

- `src/App.tsx` connects the map, starting position, and scenario controls.
- `src/components/FloorPickerDialog.tsx` displays Navigate and prompts for the current floor.
- `src/components/FloorMap.tsx` renders the floor map and route overlays.
- `src/location/useStartLocation.ts` subscribes to device location with `watchPosition()`, converts each reading with `coordinates.ts`, and snaps it to a corridor on the chosen floor.
- `src/simulation/fireSimulation.ts` spreads fire through the corridor graph.
- `src/simulation/evacuationEngine.ts` blocks burning nodes and their incident edges and calls the search in `src/routing/routing.ts`.

The team's original coordinate test lives in `legacy/test/`.

## Local development

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite. The app requests device location on load. Select **Navigate**, allow compass and motion access if prompted, and choose your current floor. Tap a corridor to set your position if location is unavailable. **Simulate fire** starts the scenario and **Reset fire** clears it. Build with `npm run build` and serve the build locally with `npm run preview`.

## Build order and demo checks

1. Render the three floors and check that the route overlay stays aligned as the map resizes.
2. Calibrate a demo floor and compare several reported locations with known corridor waypoints. Check that selecting a different floor limits snapping to that floor and that a missing fix can be handled with a map tap.
3. Start from a node on an upper floor and route to a modeled exit. Block a segment, then verify that the route updates, skips elevators, and clears when every eligible endpoint is unreachable.
4. Once the offline cache is implemented, reload on a phone in airplane mode and repeat the closure demo with map selection.

## Decisions for team review

- Pick the calibration landmarks and check location accuracy on the phone we will use for the demo.
- Confirm map taps as the backup for weak fixes or denied location permission.
- Decide whether offline reopening on phones belongs in the demo or follows the browser routing milestone.

### Sensor navigation demo

Open the app over HTTPS on your phone. The first **Navigate** tap requests compass and motion access on browsers such as Safari that require a user gesture. Once permission, heading, and a starting position are available, the sensor navigation starts automatically. GPS supplies the starting location and continues tracking when motion or heading is unavailable at startup. Keep the phone aimed in your direction of travel. Sensor Zoo counts steps. Recent cadence and acceleration intensity select a fixed step length of 0.72 m for walking or 1.00 m for running.

A heading change of at least 55° snaps to the closer end of the current corridor and selects the outgoing corridor closest to the new heading. Walking continues on the next step when a connected corridor forms an angle of less than 120° with the phone direction. If none does, the marker waits at the junction. The combined graph marks junctions as `branch` for three or more walk neighbors or `bend` for two walk neighbors with a turn of at least 55°. Same-floor approaches to stairs are also marked as junctions so a turn can snap to the approach before the landing. Elevator nodes and the stair landings themselves remain separate from these junctions. The line below the map shows the estimated gait and speed.
