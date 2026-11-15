import { useDeviceHeading, type OrientationApi } from './location/useDeviceHeading';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { FloorMap } from './components/FloorMap';
import { FloorPickerDialog } from './components/FloorPickerDialog';
import { StairArrivalDialog } from './components/StairArrivalDialog';
import { advanceProgress, nearbyStair, remainingRoutePoints, routeStart, type RouteProgress } from './location/routeProgress';
import { useStepCounter, type MotionApi } from './location/useStepCounter';
import { useStartLocation } from './location/useStartLocation';
import { exitLabels, findClosestCorridor, floors, type Point, type Route, type Snap } from './routing/routing';
import { calculateEvacuation } from './simulation/evacuationEngine';
import { spreadFire, spreadIntervalMs, startFire, type FireSimulation } from './simulation/fireSimulation';

const DEMO_FIRE_NODE = 'l3-n027';

export function App() {
  const [activeFloor, setActiveFloor] = useState(1);
  const [mapSession, setMapSession] = useState(0);
  const [startFloor, setStartFloor] = useState<number | null>(null);
  const [start, setStart] = useState<Snap | null>(null);
  const [livePosition, setLivePosition] = useState<Snap | null>(null);
  const [source, setSource] = useState('');
  const compass = useDeviceHeading();
  const { locating, locationStatus, requestLocation, clearLocationStatus, stopLocation } = useStartLocation(compass.readTrustedHeading);
  const stepCounter = useStepCounter(compass.readNavigationHeading, snap => {
    setLivePosition(snap);
    setSource('Sensor navigation');
  });
  const [simulation, setSimulation] = useState<FireSimulation | null>(null);
  const floor = floors.find(item => item.floor === activeFloor)!;
  const burning = simulation?.burning;
  const spreadNow = useEffectEvent(() => {
    if (!simulation?.frontier.size) return;
    const next = spreadFire(simulation);
    if (next.burning !== burning && livePosition) setStart(livePosition);
    setSimulation(next);
  });
  useEffect(() => {
    if (!simulation?.frontier.size) return;
    const timer = window.setTimeout(() => spreadNow(), spreadIntervalMs);
    return () => window.clearTimeout(timer);
  }, [simulation]);
  const route = useMemo(() => calculateEvacuation(start, burning), [start, burning]);
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
  const [pendingArrival, setPendingArrival] = useState<{
    route: Route;
    stair: NonNullable<ReturnType<typeof nearbyStair>>;
  } | null>(null);
  useEffect(() => {
    if (pendingArrival || !route || route.points[progress.index]?.floor !== startFloor) return;
    const stair = nearbyStair(route, progress);
    if (stair) setPendingArrival({ route, stair });
  }, [route, progress, pendingArrival, startFloor]);

  function requestSensors() {
    void compass.enableHeading();
    void stepCounter.prepare();
  }

  const requestOnLoad = useEffectEvent(() => {
    navigator.geolocation?.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    const orientation = window.DeviceOrientationEvent as OrientationApi | undefined;
    const motion = window.DeviceMotionEvent as MotionApi | undefined;
    // Safari needs a user gesture for sensor APIs that expose requestPermission().
    if (orientation && !orientation.requestPermission) void compass.enableHeading();
    if (motion && !motion.requestPermission) void stepCounter.prepare();
  });
  useEffect(() => { requestOnLoad(); }, []);

  const enableTracking = useEffectEvent(() => {
    const position = livePosition ?? start;
    if (!position || stepCounter.active || !stepCounter.ready || compass.readNavigationHeading() === null) return;
    stopLocation();
    stepCounter.start(position);
    setLivePosition(position);
    setSource('Sensor navigation');
  });
  useEffect(() => { enableTracking(); }, [start, livePosition, stepCounter.ready, stepCounter.active, compass.heading]);

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
    setMapSession(previous => previous + 1);
    stepCounter.stop();
    setSimulation(null);
    setStart(null);
    setLivePosition(null);
    setStartFloor(selectedFloor);
    setActiveFloor(selectedFloor);
    requestLocation(selectedFloor, receivePosition);
  }

  function receivePosition(snap: Snap, label: string, reacquired = false) {
    setStart(previous => reacquired ? snap : previous ?? snap);
    setLivePosition(snap);
    setSource(label);
  }

  function confirmArrival() {
    if (!pendingArrival) return;
    const { stair } = pendingArrival;
    const floor = stair.to.floor;
    const landing = findClosestCorridor(stair.to, floor);
    if (!landing) return;
    if (route && route === pendingArrival.route) {
      setTracked({ route, progress: { index: stair.arrivalIndex, fraction: 0 } });
    } else {
      setStart(landing);
      setTracked(null);
    }
    setPendingArrival(null);
    setLivePosition(landing);
    setStartFloor(floor);
    setActiveFloor(floor);
    setSource('Confirmed stair landing');
    if (stepCounter.active) stepCounter.anchor(landing);
    else requestLocation(floor, receivePosition, landing);
  }

  function pickPoint(point: Point) {
    if (locating || activeFloor !== startFloor) return;
    const snapped = findClosestCorridor(point, activeFloor);
    if (snapped) placeStart(snapped, 'Map-selected position');
  }

  function toggleFire() {
    if (livePosition) setStart(livePosition);
    setSimulation(simulation ? null : startFire());
  }

  function startDemoFire() {
    if (livePosition) setStart(livePosition);
    setSimulation(startFire(DEMO_FIRE_NODE));
    setActiveFloor(3);
  }

  const status = locationStatus || (startFloor === null ? 'Select Navigate to choose your floor.' :
    start ? '' : 'Tap a corridor to set your position.');
  return (
    <>
      <header className="site-header">
        <div className="header-content">
          <div className="brand"><span className="brand-arrow" aria-hidden="true">→</span>HiveWay</div>
          <span className="header-label">Fire evacuation simulation</span>
        </div>
      </header>
      <main>
        <section className="map-card" aria-label={`Klaus floor ${activeFloor}`}>
          <div className="map-toolbar">
            <h1>Klaus</h1>
            <div className="floor-switcher" role="group" aria-label="Map floor">
              <span aria-hidden="true">Level</span>
              {floors.map(({ floor }) => (
                <button type="button" key={floor} aria-label={`Level ${floor}`}
                  aria-pressed={floor === activeFloor} onClick={() => setActiveFloor(floor)}>{floor}</button>
              ))}
            </div>
          </div>
          <FloorMap key={`${mapSession}-${activeFloor}`} floor={floor} points={remainingPoints} exit={route?.exit}
            position={livePosition ?? start} heading={compass.heading} simulation={simulation}
            onPick={!locating && activeFloor === startFloor ? pickPoint : undefined} />
        </section>
        <div className="demo-actions">
          <FloorPickerDialog floors={floors} locating={locating} onOpen={requestSensors} onSelect={locate} />
          <button type="button" className="navigate simulation-button" disabled={!start && !simulation} aria-pressed={Boolean(simulation)} onClick={toggleFire}>
            {simulation ? 'Reset fire' : 'Simulate fire'}
          </button>
          <button type="button" className="navigate simulation-button" onClick={startDemoFire}>Demo fire</button>
        </div>
        <div className="demo-status" role="region" aria-label="Simulation log" tabIndex={0}>
          {simulation && <p role="status">Fire · {simulation.elapsedSeconds}s · {simulation.burning.size} affected {simulation.burning.size === 1 ? 'node' : 'nodes'}</p>}
          {start && <p role="status">{route ? `Exit: ${exitLabels.get(route.exit.id) ?? 'Modeled exit'}` : 'No reachable exit'}</p>}
          {status && <p role="status">{status}</p>}
          {start && <p>{source} · Level {startFloor}{stepCounter.active ? ` · ${stepCounter.gait} · ${stepCounter.steps} steps · ${stepCounter.speed.toFixed(1)} m/s` : ''}</p>}
          {start && !stepCounter.active && (stepCounter.status || compass.headingStatus) && (
            <p>{stepCounter.status || compass.headingStatus}</p>
          )}
        </div>
        {pendingArrival && <StairArrivalDialog floor={pendingArrival.stair.to.floor} onArrival={confirmArrival} />}
        <footer>Simulation only · Follow posted signs and official instructions in an emergency.</footer>
      </main>
    </>
  );
}
