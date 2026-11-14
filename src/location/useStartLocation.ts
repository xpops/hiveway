import { useState } from 'react';
import { findClosestCorridor, floors, type Snap } from '../routing/routing';
import { toKlausFloorPoint } from './coordinates';

export function useStartLocation() {
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');

  function requestLocation(selectedFloor: number, onStart: (snap: Snap, source: string) => void) {
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
      onStart(snapped, `Device location · ±${Math.ceil(coords.accuracy)} m`);
      if (coords.accuracy > 15 || snapped.distancePx > 90) {
        setLocationStatus('The position is approximate. Check the blue marker and tap the map to correct it.');
      }
    }, () => {
      setLocating(false);
      setLocationStatus('Could not get device location. Tap a corridor to set your start.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  return {
    locating,
    locationStatus,
    requestLocation,
    clearLocationStatus: () => setLocationStatus(''),
  };
}
