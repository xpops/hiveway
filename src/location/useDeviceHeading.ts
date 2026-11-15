import { useEffect, useRef, useState } from 'react';
import { angleDifference, normalizeHeading } from './coordinates';

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
type OrientationApi = typeof DeviceOrientationEvent & { requestPermission?: (absolute?: boolean) => Promise<PermissionState> };
type HeadingSample = { degrees: number; timestamp: number; accuracy?: number };

export function useDeviceHeading() {
  const [enabled, setEnabled] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [headingStatus, setHeadingStatus] = useState('');
  const latest = useRef<HeadingSample | null>(null);

  useEffect(() => {
    if (!enabled) return;
    function onOrientation(event: CompassEvent) {
      const webkit = event.webkitCompassHeading;
      const accuracy = event.webkitCompassAccuracy;
      let degrees: number;
      if (typeof webkit === 'number' && Number.isFinite(webkit) && webkit >= 0 &&
          (accuracy === undefined || accuracy >= 0)) {
        degrees = webkit;
      } else if (event.absolute && event.alpha !== null && Number.isFinite(event.alpha)) {
        degrees = 360 - event.alpha;
      } else {
        return;
      }

      const orientation = screen.orientation?.angle ?? window.orientation ?? 0;
      degrees = normalizeHeading(degrees + orientation);
      const now = Date.now();
      const previous = latest.current;
      // Smooth along the shortest arc, including across the 0°/360° boundary.
      if (previous && now - previous.timestamp < 1000) {
        degrees = normalizeHeading(previous.degrees + 0.35 * angleDifference(degrees, previous.degrees));
      }
      latest.current = { degrees, timestamp: now, accuracy };
      setHeading(degrees);
    }
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('deviceorientationabsolute', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('deviceorientationabsolute', onOrientation);
      latest.current = null;
    };
  }, [enabled]);

  async function enableHeading() {
    const orientation = window.DeviceOrientationEvent as OrientationApi | undefined;
    if (!orientation) {
      setHeadingStatus('Compass is unavailable on this device.');
      return;
    }
    try {
      if (orientation.requestPermission && await orientation.requestPermission(true) !== 'granted') {
        setHeadingStatus('Compass permission was not granted.');
        return;
      }
      setHeadingStatus('Waiting for compass…');
      setEnabled(true);
    } catch {
      setHeadingStatus('Could not enable the compass.');
    }
  }

  function readTrustedHeading() {
    const sample = latest.current;
    return sample && sample.accuracy !== undefined && sample.accuracy >= 0 &&
      sample.accuracy <= 25 && Date.now() - sample.timestamp <= 1500 ? sample.degrees : null;
  }

  return { heading, headingStatus: heading === null ? headingStatus : '', enabled, enableHeading, readTrustedHeading };
}
