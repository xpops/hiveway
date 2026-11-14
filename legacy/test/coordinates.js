export function toKlausLevel1Point(latitude, longitude) {
  // The calibration uses degree offsets scaled by 100,000.
  const u = (longitude + 84.39629394651023) * 100_000;
  const v = (latitude - 33.776611500433276) * 100_000;
  return {
    x: 0.17780005615519423 * u - 7.291520485654319 * v + 987.8669163466626,
    y: -5.94710006203304 * u + 0.16536069354371685 * v + 306.25636609620267,
  };
}

// Approximate alignment from paired stair and elevator landings in the routing graph.
const levelAlignments = {
  2: [[1.13816297, -0.04390434, 20.13185473], [0.03670552, 1.1115907, -24.48075418]],
  3: [[1.14679972, -0.08691982, 30.98995811], [0.01163404, 1.00710316, 20.87674879]],
};

export function toKlausFloorPoint(latitude, longitude, floor) {
  const point = toKlausLevel1Point(latitude, longitude);
  const alignment = levelAlignments[floor];
  if (!alignment) return point;

  const { x, y } = point;
  const [[a, b, c], [d, e, f]] = alignment;
  return { x: a * x + b * y + c, y: d * x + e * y + f };
}
