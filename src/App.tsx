import { useMemo, useRef, useState } from 'react';
import { FloorMap } from './components/FloorMap';
import { toKlausFloorPoint } from './location/coordinates';
import { exitLabels, findClosestCorridor, findDetourClosure, findNearestExit, floors, type Point, type Snap } from './routing/routing';

type Scenario = 'open' | 'closure' | 'unreachable';

const scenarios: { id: Scenario; name: string; detail: string }[] = [
  { id: 'open', name: 'Clear corridors', detail: 'Compare the route before a closure.' },
  { id: 'closure', name: 'Corridor closure', detail: 'Block a corridor on the initial route.' },
  { id: 'unreachable', name: 'Exits unavailable', detail: 'Mark every modeled exit unavailable.' },
];

export function App() {
  const [activeFloor, setActiveFloor] = useState(1);
  const [startFloor, setStartFloor] = useState<number | null>(null);
  const floorDialog = useRef<HTMLDialogElement>(null);
  const [start, setStart] = useState<Snap | null>(null);
  const [source, setSource] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  const [locating, setLocating] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('open');
  const [manuallyClosed, setManuallyClosed] = useState<Set<string>>(new Set());
  const [editClosure, setEditClosure] = useState(false);
  const floor = floors.find(item => item.floor === activeFloor)!;
  const detourClosure = useMemo(
    () => start && scenario === 'closure' ? findDetourClosure(start) : undefined,
    [start, scenario],
  );
  const closedEdges = useMemo(() => {
    const edges = new Set(manuallyClosed);
    if (detourClosure) edges.add(detourClosure);
    return edges;
  }, [manuallyClosed, detourClosure]);
  const route = useMemo(() => {
    if (!start) return null;
    const closedExits = scenario === 'unreachable' ? new Set(exitLabels.keys()) : new Set<string>();
    return findNearestExit(start, closedEdges, closedExits);
  }, [start, closedEdges, scenario]);
  const routeFloors = route?.points.filter((point, index, points) => point.floor !== points[index - 1]?.floor)
    .map(point => point.floor) ?? [];

  function placeStart(snap: Snap, label: string) {
    setStart(snap);
    setStartFloor(snap.floor);
    setActiveFloor(snap.floor);
    setSource(label);
    setLocationStatus('');
  }

  function locate(selectedFloor: number) {
    floorDialog.current?.close();
    setStart(null);
    setStartFloor(selectedFloor);
    setActiveFloor(selectedFloor);
    setEditClosure(false);
    if (!navigator.geolocation) {
      setLocationStatus('Location is unavailable. Tap a corridor to set your start.');
      return;
    }
    const level = floors.find(item => item.floor === selectedFloor)!;
    setLocating(true);
    setLocationStatus('Requesting device location…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocating(false);
      const point = toKlausFloorPoint(coords.latitude, coords.longitude, level.floor);
      const { width, height } = level.coordinateSpace;
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
        setLocationStatus('The location estimate is outside this map. Tap a corridor to set your start.');
        return;
      }
      const snapped = findClosestCorridor(point, level.floor);
      if (!snapped) {
        setLocationStatus('No corridor found. Tap a corridor to set your start.');
        return;
      }
      placeStart(snapped, `Device location · ±${Math.ceil(coords.accuracy)} m`);
      if (coords.accuracy > 15 || snapped.distancePx > 90) {
        setLocationStatus('The position is approximate. Check the blue marker and tap the map to correct it.');
      }
    }, () => {
      setLocating(false);
      setLocationStatus('Could not get device location. Tap a corridor to set your start.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  function pickPoint(point: Point) {
    if (locating || (!editClosure && (startFloor === null || activeFloor !== startFloor))) return;
    const snapped = findClosestCorridor(point, activeFloor);
    if (!snapped) return;
    if (editClosure) {
      if (snapped.distancePx > 40) return;
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
          <button className="navigate" disabled={locating} onClick={() => floorDialog.current?.showModal()}>{locating ? 'Locating…' : 'Navigate'}</button>
          <dialog ref={floorDialog} className="floor-dialog" aria-labelledby="floor-dialog-title">
            <h2 id="floor-dialog-title">Which floor are you on?</h2>
            <div className="floor-options">
              {floors.map(({ floor }) => (
                <button key={floor} className="secondary" onClick={() => locate(floor)}>Level {floor}</button>
              ))}
            </div>
            <form method="dialog"><button className="plain">Cancel</button></form>
          </dialog>
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
              <FloorMap floor={floor} route={route} start={start} closedEdges={closedEdges} onPick={pickPoint} />
            </div>
            <div className="map-footer">
              <ul className="legend"><li><i className="here" />Start</li><li><i className="route" />Route</li><li><i className="blocked" />Closure</li><li><i className="exit" />Exit</li></ul>
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
              <h2>Starting position</h2>
              <p>{start ? `${source} · Level ${start.floor}` : startFloor === null ? 'Select Navigate to choose your floor.' : `Level ${startFloor}`}</p>
              {locationStatus && <p role="status">{locationStatus}</p>}
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
              {manuallyClosed.size > 0 && <button className="plain" onClick={() => setManuallyClosed(new Set())}>Clear custom closures</button>}
            </section>
          </aside>
        </div>
        <footer>Simulation only · Follow posted signs and official instructions in an emergency.</footer>
      </main>
    </>
  );
}
