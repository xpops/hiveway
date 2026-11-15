export function toKlausLevel1Point(latitude: number, longitude: number) {
  // The calibration uses degree offsets scaled by 100,000.
  const u = (longitude + 84.39629394651023) * 100_000;
  const v = (latitude - 33.776611500433276) * 100_000;
  return {
    x: 0.17780005615519423 * u - 7.291520485654319 * v + 987.8669163466626,
    y: -5.94710006203304 * u + 0.16536069354371685 * v + 306.25636609620267,
  };
}

// Approximate alignment from paired stair and elevator landings in the routing graph.
const levelAlignments: Partial<Record<number, number[][]>> = {
  2: [[1.13816297, -0.04390434, 20.13185473], [0.03670552, 1.1115907, -24.48075418]],
  3: [[1.14679972, -0.08691982, 30.98995811], [0.01163404, 1.00710316, 20.87674879]],
};

export function toKlausFloorPoint(latitude: number, longitude: number, floor: number) {
  const point = toKlausLevel1Point(latitude, longitude);
  const alignment = levelAlignments[floor];
  if (!alignment) return point;

  const { x, y } = point;
  const [[a, b, c], [d, e, f]] = alignment;
  return { x: a * x + b * y + c, y: d * x + e * y + f };
}

// Convert differences in SVG coordinates to local ground distances using the
// same floor calibration as geolocation. Translation cancels in a difference.
function createFloorAxes(floor: number) {
  const latitude = 33.776611500433276;
  const longitude = -84.39629394651023;
  const degreeStep = 1e-5;
  const origin = toKlausFloorPoint(latitude, longitude, floor);
  const east = toKlausFloorPoint(latitude, longitude + degreeStep, floor);
  const north = toKlausFloorPoint(latitude + degreeStep, longitude, floor);
  const ax = east.x - origin.x;
  const ay = east.y - origin.y;
  const bx = north.x - origin.x;
  const by = north.y - origin.y;
  const determinant = ax * by - ay * bx;
  const northMetersPerStep = 111_132 * degreeStep;
  const eastMetersPerStep = 111_320 * Math.cos(latitude * Math.PI / 180) * degreeStep;

  return {
    east: { x: ax / eastMetersPerStep, y: ay / eastMetersPerStep },
    north: { x: bx / northMetersPerStep, y: by / northMetersPerStep },
    toGroundVector(from: { x: number; y: number }, to: { x: number; y: number }) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const eastSteps = (by * dx - bx * dy) / determinant;
      const northSteps = (ax * dy - ay * dx) / determinant;
      return { east: eastSteps * eastMetersPerStep, north: northSteps * northMetersPerStep };
    },
  };
}

export function normalizeHeading(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

export function angleDifference(a: number, b: number) {
  return normalizeHeading(a - b + 180) - 180;
}

export function createFloorDistance(floor: number) {
  const { toGroundVector } = createFloorAxes(floor);
  return (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const { east, north } = toGroundVector(from, to);
    return Math.hypot(east, north);
  };
}

export function createFloorBearing(floor: number) {
  const { toGroundVector } = createFloorAxes(floor);
  return (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const { east, north } = toGroundVector(from, to);
    return normalizeHeading(Math.atan2(east, north) * 180 / Math.PI);
  };
}

// Rotation in SVG degrees for a shape that starts by pointing up.
export function toFloorHeading(degrees: number, floor: number) {
  const { east, north } = createFloorAxes(floor);
  const angle = degrees * Math.PI / 180;
  const dx = east.x * Math.sin(angle) + north.x * Math.cos(angle);
  const dy = east.y * Math.sin(angle) + north.y * Math.cos(angle);
  return Math.atan2(dx, -dy) * 180 / Math.PI;
}
