import { useEffect, useMemo, useState } from 'react';
import { FloorMap } from './components/FloorMap';
import { FloorPickerDialog } from './components/FloorPickerDialog';
import { useStartLocation } from './location/useStartLocation';
import { exitLabels, findClosestCorridorNode, findNearestExit, floors, nodes, type Point, type Snap } from './routing/routing';
import { spreadFire, spreadIntervalMs, startFire, type FireSimulation } from './simulation/fireSimulation';

export function App() {
  const [activeFloor, setActiveFloor] = useState(1);
  const [startFloor, setStartFloor] = useState<number | null>(null);
  const [start, setStart] = useState<Snap | null>(null);
  const [source, setSource] = useState('');
  const [simulation, setSimulation] = useState<FireSimulation | null>(null);
  const { locating, locationStatus, requestLocation, clearLocationStatus } = useStartLocation();
  const floor = floors.find(item => item.floor === activeFloor)!;
  const initialRoute = useMemo(() => start ? findNearestExit(start) : null, [start]);
  const route = simulation ? simulation.route : initialRoute;
  const spreading = Boolean(simulation?.frontier.size);
  const ignition = simulation ? nodes.get(simulation.ignition) : undefined;

  useEffect(() => {
    if (!start || !spreading) return;
    const timer = window.setInterval(() => {
      setSimulation(current => current?.frontier.size ? spreadFire(start, current) : current);
    }, spreadIntervalMs);
    return () => window.clearInterval(timer);
  }, [start, spreading]);
  const routeFloors = route?.points.filter((point, index, points) => point.floor !== points[index - 1]?.floor)
    .map(point => point.floor) ?? [];

  function placeStart(snap: Snap, label: string) {
    setStart(snap);
    setStartFloor(snap.floor);
    setActiveFloor(snap.floor);
    setSource(label);
    clearLocationStatus();
  }

  function locate(selectedFloor: number) {
    setSimulation(null);
    setStart(null);
    setStartFloor(selectedFloor);
    setActiveFloor(selectedFloor);
    requestLocation(selectedFloor, placeStart);
  }

  function pickPoint(point: Point) {
    if (simulation || locating || startFloor === null || activeFloor !== startFloor) return;
    const snapped = findClosestCorridorNode(point, activeFloor);
    if (snapped) placeStart(snapped, 'Map-selected starting point');
  }

  return (
    <>
      <header className="site-header">
        <div className="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5 28 9.2v13.6L16 29.5 4 22.8V9.2Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M10 21V11m12 10V11m-12 5h12" fill="none" stroke="currentColor" strokeWidth="2.5"/></svg>HiveWay</div>
        <span className="header-label"><span /> Fire evacuation simulation</span>
      </header>
      <main>
        <div className="title-row">
          <div><p className="eyebrow">GEORGIA TECH · KLAUS</p><h1>Evacuation routes</h1><p className="subtitle">Find a route from your starting point to a modeled exit.</p></div>
          <div className="title-actions">
            <FloorPickerDialog floors={floors} locating={locating} onSelect={locate} />
            <button className="navigate simulation-button" disabled={!start || locating} onClick={() => {
              if (simulation) setSimulation(null);
              else if (start) setSimulation(startFire(start, initialRoute));
            }}>{simulation ? 'Reset simulation' : 'Fire simulation'}</button>
          </div>
        </div>
        <div className="layout">
          <section className="map-card" aria-labelledby="map-heading">
            <div className="map-header">
              <div><h2 id="map-heading">Building map</h2><p>Klaus Advanced Computing Building</p></div>
              <div className="floors" role="group" aria-label="Map floor">
                {floors.map(({ floor }) => <button key={floor} aria-pressed={activeFloor === floor} onClick={() => setActiveFloor(floor)}>{floor}</button>)}
              </div>
            </div>
            <div className="map-stage">
              <span className="stage-label">LEVEL {activeFloor}</span>
              <FloorMap floor={floor} route={route} start={start} simulation={simulation} onPick={pickPoint} />
            </div>
            <div className="map-footer">
              <ul className="legend"><li><i className="here" />Start</li><li><i className="route" />Route</li><li><i className="exit" />Exit</li>{simulation && <li><i className="fire" />Fire</li>}</ul>
            </div>
          </section>
          <aside className="controls" aria-label="Route details">
            {start && <section className={`result-card ${route ? '' : 'no-route'}`} aria-live="polite">
              <p className="eyebrow">{route ? 'SIMULATED ROUTE' : 'SIMULATION RESULT'}</p>
              <h2>{route ? exitLabels.get(route.exit.id) ?? 'Modeled exit' : 'No reachable exit'}</h2>
              {route ? <div className="route-stops" aria-label="Route floors">
                {routeFloors.map((level, index) => <span key={index}>{index > 0 && <span aria-hidden="true">→</span>} <button onClick={() => setActiveFloor(level)}>Level {level}</button></span>)}
              </div> : <p>{simulation ? 'Fire has blocked all available routes from this start.' : 'Try a different starting point.'}</p>}
            </section>}
            <section className="panel">
              <h2>Starting position</h2>
              <p>{start ? `${source} · Level ${start.floor}` : startFloor === null ? 'Select Navigate to choose your floor.' : `Level ${startFloor}`}</p>
              {locationStatus && <p role="status">{locationStatus}</p>}
            </section>
            {simulation && ignition && <section className="panel" aria-labelledby="fire-details-heading">
              <h2 id="fire-details-heading">Fire spread</h2>
              <p>Started on Level {ignition.floor} · Node {ignition.id}</p>
              <div role="status">
                <p>{simulation.elapsedSeconds}s elapsed · {simulation.burning.size} burning</p>
                <p>{simulation.elapsedSeconds === 0 ? 'Fire started' : spreading
                  ? `+${simulation.frontier.size} reached in the last ${spreadIntervalMs / 1000}s`
                  : 'Spread complete'}</p>
              </div>
            </section>}
          </aside>
        </div>
        <footer>Simulation only · Follow posted signs and official instructions in an emergency.</footer>
      </main>
    </>
  );
}
