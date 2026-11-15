import { AdaptiveStepCounter } from 'sensor-zoo/steps/AdaptiveStepCounter.js';
import { useEffect, useRef, useState } from 'react';
import type { Snap } from '../routing/routing';
import { classifyGait, STEP_LENGTH_METERS, type Gait } from './gait';
import { updateSensorTrack, type SensorTrack } from './demoSensorPosition';

type MotionApi = typeof DeviceMotionEvent & { requestPermission?: () => Promise<PermissionState> };

function readVector(vector: DeviceMotionEventAcceleration | null) {
  const x = vector?.x, y = vector?.y, z = vector?.z;
  return typeof x === 'number' && typeof y === 'number' && typeof z === 'number' &&
    Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
}

export function useStepCounter(readHeading: () => number | null, onPosition: (snap: Snap) => void) {
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [steps, setSteps] = useState(0);
  const [gait, setGait] = useState<Gait | 'Still'>('Still');
  const [speed, setSpeed] = useState(0);
  const track = useRef<SensorTrack | null>(null);
  const callbacks = useRef({ readHeading, onPosition });
  useEffect(() => { callbacks.current = { readHeading, onPosition }; }, [readHeading, onPosition]);
  const permissionRequest = useRef(0);

  useEffect(() => {
    if (!active) return;
    let counter = new AdaptiveStepCounter(2, 0.27, 2);
    let count = 0;
    let previousTimestamp: number | null = null;
    let sampleType: 'linear' | 'gravity' | undefined;
    let gait: Gait = 'Walking';
    let stepTimes: number[] = [];
    let acceleration: { timestamp: number; squared: number }[] = [];
    let stillTimer: ReturnType<typeof setTimeout> | undefined;
    setStatus('Waiting for motion data…');

    function onMotion(event: DeviceMotionEvent) {
      const linear = readVector(event.acceleration);
      const vector = linear ?? readVector(event.accelerationIncludingGravity);
      if (!vector) return;
      const type = linear ? 'linear' : 'gravity';
      const elapsed = previousTimestamp === null ? 0 : event.timeStamp - previousTimestamp;
      if (previousTimestamp !== null && elapsed <= 0) return;
      if (sampleType !== type || elapsed > 1000) {
        counter = new AdaptiveStepCounter(2, 0.27, 2);
        count = 0;
        stepTimes = [];
        acceleration = [];
        sampleType = type;
        setStatus('');
      }
      previousTimestamp = event.timeStamp;

      const { x, y, z } = vector;
      const magnitude = Math.hypot(x, y, z) - (linear ? 0 : 9.81);
      acceleration.push({ timestamp: event.timeStamp, squared: magnitude * magnitude });
      while (acceleration.length && event.timeStamp - acceleration[0].timestamp > 2500) acceleration.shift();
      const next = counter.update(x, y, z, elapsed > 0 && elapsed <= 1000 ? elapsed / 1000 : 0.01).steps;
      const added = next - count;
      count = next;
      if (added <= 0) return;

      setSteps(total => total + added);
      stepTimes = [...stepTimes.filter(time => event.timeStamp - time <= 2000), event.timeStamp];
      const seconds = (event.timeStamp - stepTimes[0]) / 1000;
      const cadence = seconds > 0 ? (stepTimes.length - 1) / seconds : 0;
      const intensity = Math.sqrt(acceleration.reduce((sum, sample) => sum + sample.squared, 0) / acceleration.length);
      if (stepTimes.length >= 3) gait = classifyGait(gait, cadence, intensity);
      const stepLength = STEP_LENGTH_METERS[gait];
      setGait(gait);
      setSpeed(cadence * stepLength);
      clearTimeout(stillTimer);
      stillTimer = setTimeout(() => {
        gait = 'Walking';
        stepTimes = [];
        setGait('Still');
        setSpeed(0);
      }, 1400);

      const heading = callbacks.current.readHeading();
      if (!track.current || heading === null) {
        setStatus('Waiting for compass data.');
        return;
      }
      const update = updateSensorTrack(track.current, added * stepLength, heading);
      const changed = update.track.snap !== track.current.snap;
      track.current = update.track;
      setStatus(update.detail);
      if (changed) callbacks.current.onPosition(update.track.snap);
    }

    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      clearTimeout(stillTimer);
    };
  }, [active]);

  function anchor(snap: Snap) {
    track.current = { snap, hop: null, heading: null };
  }

  async function start(snap: Snap, onStarted: () => void) {
    const motion = window.DeviceMotionEvent as MotionApi | undefined;
    if (!motion) {
      setStatus('Motion sensing is unavailable on this device.');
      return;
    }
    const request = ++permissionRequest.current;
    setPending(true);
    try {
      const permission = motion.requestPermission ? await motion.requestPermission() : 'granted';
      if (request !== permissionRequest.current) return;
      if (permission !== 'granted') {
        setStatus('Motion permission was not granted.');
        return;
      }
      anchor(snap);
      setSteps(0);
      setActive(true);
      onStarted();
    } catch {
      if (request === permissionRequest.current) setStatus('Could not enable motion sensing.');
    } finally {
      if (request === permissionRequest.current) setPending(false);
    }
  }

  function stop() {
    permissionRequest.current++;
    setActive(false);
    setPending(false);
    setStatus('');
    setGait('Still');
    setSpeed(0);
    track.current = null;
  }

  return { active, pending, status, steps, gait, speed, start, stop, anchor };
}
