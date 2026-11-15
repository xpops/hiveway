import { useDeviceHeading } from './location/useDeviceHeading';
import { useEffect, useMemo, useState } from 'react';
import { GpsDiagnostics } from './components/GpsDiagnostics';
import { FloorMap } from './components/FloorMap';
import { FloorPickerDialog } from './components/FloorPickerDialog';
import { StairArrivalDialog } from './components/StairArrivalDialog';
import { advanceProgress, nearbyStair, remainingRoutePoints, routeStart, type RouteProgress } from './location/routeProgress';
import { useStepCounter } from './location/useStepCounter';
import { useStartLocation } from './location/useStartLocation';
import { exitLabels, findClosestCorridor, floors, type Point, type Route, type Snap } from './routing/routing';
import { calculateEvacuation, type Scenario } from './simulation/evacuationEngine';

const scenarios: { id: Scenario; name: string; detail: string }[] = [
  { id: 'open', name: 'Clear corridors', detail: 'Compare the route before a closure.' },
  { id: 'closure', name: 'Corridor closure', detail: 'Block a corridor on the initial route.' },
  { id: 'unreachable', name: 'Exits unavailable', detail: 'Mark every modeled exit unavailable.' },
];

export function App() {
  const [activeFloor, setActiveFloor] = useState(1);
  const [startFloor, setStartFloor] = useState<number | null>(null);
  const [start, setStart] = useState<Snap | null>(null);
  const [livePosition, setLivePosition] = useState<Snap | null>(null);
  const [source, setSource] = useState('');
  const compass = useDeviceHeading();
  const { locating, gpsLog, locationStatus, requestLocation, clearLocationStatus, stopLocation } = useStartLocation(compass.readTrustedHeading);
  const stepCounter = useStepCounter(compass.readNavigationHeading, snap => {
    setLivePosition(snap);
    setSource('Sensor navigation');
  });
  const [scenario, setScenario] = useState<Scenario>('open');
  const [manuallyClosed, setManuallyClosed] = useState<Set<string>>(new Set());
  const [editClosure, setEditClosure] = useState(false);
  const floor = floors.find(item => item.floor === activeFloor)!;
  const { route, closedEdges, detourClosure } = useMemo(
    () => calculateEvacuation(start, scenario, manuallyClosed),
    [start, scenario, manuallyClosed],
  );
  const [tracked, setTracked] = useState<{ route: Route; progress: RouteProgress } | null>(null);
  const progress = tracked?.route === route ? tracked.progress : routeStart;
  useEffect(() => {
    if (!route || !livePosition) return;
    setTracked(previous => {
      const current = previous?.route === route ? previous.progress : routeStart;
      const next = advanceProgress(route.points, current, livePosition);
      return previous?.route === route && next === current ? previous : { route, progress: next };
    });
  }, [route, livePosition]);
  const remainingPoints = route ? remainingRoutePoints(route, progress) : [];
  const stair = route && nearbyStair(route, progress);
  const routeFloors = remainingPoints.filter((point, index, points) => point.floor !== points[index - 1]?.floor)
    .map(point => point.floor);

  function placeStart(snap: Snap, label: string) {
    if (stepCounter.active) stepCounter.anchor(snap);
    setStart(snap);
    setLivePosition(null);
    setStartFloor(snap.floor);
    setActiveFloor(snap.floor);
    setSource(label);
    clearLocationStatus();
  }

  function locate(selectedFloor: number) {
    stepCounter.stop();
    setStart(null);
    setLivePosition(null);
    setStartFloor(selectedFloor);
    setActiveFloor(selectedFloor);
    setEditClosure(false);
    requestLocation(selectedFloor, receivePosition);
  }

  function receivePosition(snap: Snap, label: string, reacquired = false) {
    setStart(previous => reacquired ? snap : previous ?? snap);
    setLivePosition(snap);
    setSource(label);
  }

  function confirmArrival() {
    if (!route || !stair) return;
    const floor = stair.to.floor;
    const landing = findClosestCorridor(stair.to, floor);
    if (!landing) return;
    setTracked({ route, progress: { index: stair.index + 1, fraction: 0 } });
    setLivePosition(landing);
    setStartFloor(floor);
    setActiveFloor(floor);
    setSource('Confirmed stair landing');
    if (stepCounter.active) stepCounter.anchor(landing);
    else requestLocation(floor, receivePosition, landing);
  }

  function startSensorNavigation() {
    const anchor = livePosition ?? start;
    if (!anchor) return;
    void stepCounter.start(anchor, () => {
      stopLocation();
      setLivePosition(anchor);
      setSource('Sensor navigation');
    });
  }

  function resumeGps() {
    stepCounter.stop();
    if (startFloor !== null) {
      setSource('Requesting device location');
      requestLocation(startFloor, receivePosition);
    }
  }

  function rebaseRoute() {
    if (livePosition) setStart(livePosition);
  }

  function pickPoint(point: Point) {
    if (locating || (!editClosure && (startFloor === null || activeFloor !== startFloor))) return;
    const snapped = findClosestCorridor(point, activeFloor);
    if (!snapped) return;
    if (editClosure) {
      if (snapped.distancePx > 40) return;
      rebaseRoute();
      setManuallyClosed(previous => {
        const next = new Set(previous);
        if (next.has(snapped.segment.edgeId)) next.delete(snapped.segment.edgeId);
        else next.add(snapped.segment.edgeId);
        return next;
      });
    } else {
      placeStart(snapped, 'Map-selected starting point');
    }
  }

  function chooseScenario(next: Scenario) {
    rebaseRoute();
    setScenario(next);
    setManuallyClosed(new Set());
    setEditClosure(false);
  }

  return (
    <>
      <header className="site-header">
        <div className="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5 28 9.2v13.6L16 29.5 4 22.8V9.2Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M10 21V11m12 10V11m-12 5h12" fill="none" stroke="currentColor" strokeWidth="2.5"/></svg>HiveWay</div>
        <span className="header-label"><span /> Fire evacuation simulation</span>
      </header>
      <main>
        <div className="title-row">
          <div><p className="eyebrow">GEORGIA TECH · KLAUS</p><h1>Evacuation routes</h1><p className="subtitle">Explore how corridor closures change the route through Klaus.</p></div>
          <FloorPickerDialog floors={floors} locating={locating} onSelect={locate} />
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
              <FloorMap floor={floor} points={remainingPoints} exit={route?.exit} position={livePosition ?? start} heading={compass.heading} closedEdges={closedEdges} onPick={pickPoint} />
            </div>
            <div className="map-footer">
              <ul className="legend"><li><i className="here" />Position</li><li><i className="route" />Route</li><li><i className="blocked" />Closure</li><li><i className="exit" />Exit</li></ul>
              <span>{editClosure ? 'Tap a corridor to toggle a closure' : startFloor === null ? 'Select Navigate to start' : activeFloor === startFloor ? 'Tap a corridor to set or correct your start' : 'View your current floor to adjust your start'}</span>
            </div>
          </section>
          <aside className="controls" aria-label="Simulation controls">
            {start && <section className={`result-card ${route ? '' : 'no-route'}`} aria-live="polite">
              <p className="eyebrow">{route ? 'SIMULATED ROUTE' : 'SIMULATION RESULT'}</p>
              <h2>{route ? exitLabels.get(route.exit.id) ?? 'Modeled exit' : 'No reachable exit'}</h2>
              {route ? <div className="route-stops" aria-label="Route floors">
                {routeFloors.map((level, index) => <span key={index}>{index > 0 && <span aria-hidden="true">→</span>} <button onClick={() => setActiveFloor(level)}>Level {level}</button></span>)}
              </div> : <p>Try a different starting point or change the closures.</p>}
            </section>}
            <section className="panel">
              <h2>Position</h2>
              {startFloor !== null && !compass.enabled && (
                <button type="button" className="secondary compass-button" onClick={compass.enableHeading}>Enable compass</button>
              )}
              {compass.headingStatus && <p role="status">{compass.headingStatus}</p>}
              <p>{start ? `${source} · Level ${startFloor}` : startFloor === null ? 'Select Navigate to choose your floor.' : `Level ${startFloor}`}</p>
              {locationStatus && <p role="status">{locationStatus}</p>}
              {stair && <StairArrivalDialog key={`${stair.index}-${stair.from.floor}-${stair.from.x}-${stair.from.y}-${stair.to.floor}`} floor={stair.to.floor} onArrival={confirmArrival} />}
            </section>
            <section className="panel">
              <h2>Scenario</h2>
              <fieldset className="scenario-options" aria-label="Closure scenario">
                {scenarios.map(item => <label key={item.id} className={scenario === item.id ? 'selected' : ''}>
                  <input type="radio" name="scenario" checked={scenario === item.id} onChange={() => chooseScenario(item.id)} />
                  <span><strong>{item.name}</strong><small>{item.detail}</small></span>
                </label>)}
              </fieldset>
              {start && scenario === 'closure' && !detourClosure && <p role="status">No alternate route from this starting point. Try another start or edit closures on the map.</p>}
              <button className="secondary edit" aria-pressed={editClosure} onClick={() => setEditClosure(!editClosure)}>{editClosure ? 'Done editing closures' : 'Edit closures on map'}</button>
              {manuallyClosed.size > 0 && <button className="plain" onClick={() => { rebaseRoute(); setManuallyClosed(new Set()); }}>Clear custom closures</button>}
            </section>
            <section className="panel">
              <h2>Sensor navigation</h2>
              {stepCounter.active ? (
                <>
                  <p>{stepCounter.gait} · {stepCounter.steps} steps · {stepCounter.speed.toFixed(2)} m/s estimated</p>
                  <button type="button" className="secondary compass-button" onClick={resumeGps}>Resume GPS</button>
                </>
              ) : (
                <>
                  {(!start || compass.heading === null) && <p>Set your starting position and enable the compass.</p>}
                  <button type="button" className="secondary compass-button"
                    disabled={!start || compass.heading === null || stepCounter.pending}
                    onClick={startSensorNavigation}>Start sensor navigation</button>
                </>
              )}
              {stepCounter.status && <p role="status">{stepCounter.status}</p>}
            </section>
            <GpsDiagnostics entries={gpsLog} />
          </aside>
        </div>
        <footer>Simulation only · Follow posted signs and official instructions in an emergency.</footer>
      </main>
    </>
  );
}
