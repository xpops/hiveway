import type { MouseEvent } from 'react';
import { toFloorHeading } from '../location/coordinates';
import { edges, floors, nodes, type Point, type Route, type Snap } from '../routing/routing';

type Props = {
  floor: (typeof floors)[number];
  points: Route['points'];
  exit?: Route['exit'];
  position: Snap | null;
  heading: number | null;
  closedEdges: ReadonlySet<string>;
  onPick: (point: Point) => void;
};

export function FloorMap({ floor, points, exit, position, heading, closedEdges, onPick }: Props) {
  const { width, height } = floor.coordinateSpace;
  const path = points.map((point, index) => {
    if (point.floor !== floor.floor) return '';
    const command = points[index - 1]?.floor === floor.floor ? 'L' : 'M';
    return `${command}${point.x},${point.y}`;
  }).join(' ');
  const transitions = points.flatMap((point, index) => {
    const next = points[index + 1];
    return next && point.floor !== next.floor ? [{ from: point, to: next }] : [];
  });

  function selectPoint(event: MouseEvent<SVGSVGElement>) {
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    onPick(point);
  }

  return (
    <svg className="floor-map" viewBox={`0 0 ${width} ${height}`} onClick={selectPoint}
      role="img" aria-label={`Klaus level ${floor.floor} map. Tap a corridor to set your start.`}>
      <image href={`${import.meta.env.BASE_URL}${floor.mapUrl.slice(1)}`} width={width} height={height} />
      <path className="route-halo" d={path} />
      <path className="route-line" d={path} />
      {[...closedEdges].map(id => {
        const edge = edges.get(id);
        if (!edge) return null;
        const from = nodes.get(edge.source)!;
        const to = nodes.get(edge.target)!;
        return from.floor === floor.floor && to.floor === floor.floor ? (
          <line key={id} className="closure-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        ) : null;
      })}
      {transitions.map(({ from, to }, index) => from.floor === floor.floor && (
        <g key={index} transform={`translate(${from.x} ${from.y})`}>
          <circle className="step-marker" r="12" />
          <text className="step-label" textAnchor="middle" dominantBaseline="central">{to.floor}</text>
        </g>
      ))}
      {exit?.floor === floor.floor && <circle className="exit-marker" cx={exit.x} cy={exit.y} r="11" />}
      {position?.floor === floor.floor && (
        <g>
          {heading !== null && (
            <path className="position-heading" d="M0 0 L-24 -44 Q0 -57 24 -44 Z"
              transform={`translate(${position.x} ${position.y}) rotate(${toFloorHeading(heading, floor.floor)})`} />
          )}
          <circle className="start-marker" cx={position.x} cy={position.y} r="10" />
        </g>
      )}
    </svg>
  );
}
