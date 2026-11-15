declare module 'sensor-zoo/steps/AdaptiveStepCounter.js' {
  export class AdaptiveStepCounter {
    constructor(windowSize: number, cooldown: number, minAmplitude: number);
    update(x: number, y: number, z: number, dt: number): { steps: number };
  }
}
