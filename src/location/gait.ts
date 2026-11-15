export type Gait = 'Walking' | 'Running';
export const STEP_LENGTH_METERS: Record<Gait, number> = { Walking: 0.72, Running: 1.0 };

export function classifyGait(previous: Gait, cadence: number, intensity: number): Gait {
  // Hold the running state through small changes in cadence or impact.
  const cadenceThreshold = previous === 'Running' ? 2.25 : 2.4;
  const intensityThreshold = previous === 'Running' ? 1.2 : 1.5;
  return cadence >= cadenceThreshold && intensity >= intensityThreshold ? 'Running' : 'Walking';
}
