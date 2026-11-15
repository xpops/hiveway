import { useCallback, useEffect, useRef, useState } from 'react';
import { findClosestCorridor, floors, type Snap } from '../routing/routing';
import { toKlausFloorPoint } from './coordinates';
import { hasUsableAccuracy, trackPosition, movementDirection, type PositionMatch, type PositionReading, type TimedSnap } from './movementFilter';

export function useStartLocation(readHeading: () => number | null) {
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');

  const watchId = useRef<number | null>(null);
  const subscription = useRef(0);

  const clearLocationWatch = useCallback(() => {
    subscription.current++;
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  useEffect(() => clearLocationWatch, [clearLocationWatch]);

  function requestLocation(selectedFloor: number, onPosition: (snap: Snap, source: string, reacquired?: boolean) => void, landing?: Snap) {
    clearLocationWatch();
    const currentSubscription = subscription.current;
    if (!navigator.geolocation) {
      setLocationStatus('Location is unavailable. Tap a corridor to set your start.');
      return;
    }
    const level = floors.find(item => item.floor === selectedFloor)!;
    setLocating(true);
    setLocationStatus('Requesting device location…');
    let lastAccepted: TimedSnap | null = landing ? { snap: landing, timestamp: Date.now() } : null;
    let recovery: PositionMatch['recovery'] = null;
    let latestTimestamp = -Infinity;
    let previousReading: PositionReading | null = null;
    watchId.current = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
      if (currentSubscription !== subscription.current) return;
      setLocating(false);
      const point = toKlausFloorPoint(coords.latitude, coords.longitude, level.floor);
      const { width, height } = level.coordinateSpace;
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
        recovery = null;
        setLocationStatus('The location estimate is outside this map. Tap a corridor to set your start.');
        return;
      }
      if (!Number.isFinite(timestamp) || timestamp <= latestTimestamp) return;
      latestTimestamp = timestamp;
      const reading = { ...point, timestamp };
      const direction = movementDirection(level.floor, reading, previousReading, coords.heading, coords.speed, readHeading());
      // A coarse fix should not influence the direction of the next usable fix.
      previousReading = hasUsableAccuracy(coords.accuracy) ? reading : null;
      if (!lastAccepted && !hasUsableAccuracy(coords.accuracy)) {
        setLocationStatus('Waiting for a more accurate location. Tap a corridor to set your start.');
        return;
      }
      const nearest = findClosestCorridor(point, level.floor);
      const match = lastAccepted ? trackPosition(reading, coords.accuracy, lastAccepted, nearest, direction, recovery) : null;
      recovery = match?.recovery ?? null;
      const snapped = match ? match.snap : nearest;
      if (!snapped) {
        setLocationStatus(lastAccepted
          ? 'Holding the last position while location readings settle.'
          : 'No corridor found. Tap a corridor to set your start.');
        return;
      }
      lastAccepted = { snap: snapped, timestamp };
      onPosition(snapped, `Device location · ±${Math.ceil(coords.accuracy)} m`, match?.reacquired);
      setLocationStatus(coords.accuracy > 15 || snapped.distancePx > 90
        ? 'The device location is approximate.'
        : '');
    }, error => {
      if (currentSubscription !== subscription.current) return;
      const reason = error.code === error.PERMISSION_DENIED ? 'Location permission denied.' :
        error.code === error.TIMEOUT ? 'Location request timed out.' : 'Browser could not determine a position.';
      recovery = null;
      if (error.code === error.PERMISSION_DENIED) clearLocationWatch();
      setLocating(false);
      setLocationStatus(`${reason} Tap the map to set your position.`);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  return {
    locating,
    stopLocation: () => {
      clearLocationWatch();
      setLocating(false);
      setLocationStatus('');
    },
    locationStatus,
    requestLocation,
    clearLocationStatus: () => setLocationStatus(''),
  };
}
