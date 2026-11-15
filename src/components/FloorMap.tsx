import type { MouseEvent } from 'react';
import { useMapCamera } from './useMapCamera';
import { routeStairTransitions } from '../location/routeProgress';
import { toFloorHeading } from '../location/coordinates';
import { floors, nodes, segmentsByFloor, type Point, type Route, type Snap } from '../routing/routing';
import type { FireSimulation } from '../simulation/fireSimulation';

type Props = {
  floor: (typeof floors)[number];
  points: Route['points'];
  exit?: Route['exit'];
  position: Snap | null;
  heading: number | null;
  simulation: FireSimulation | null;
  onPick?: (point: Point) => void;
};

export function FloorMap({ floor, points, exit, position, heading, simulation, onPick }: Props) {
  const { width, height } = floor.coordinateSpace;
  const camera = useMapCamera(floor.coordinateSpace, position?.floor === floor.floor ? position : undefined);
  const path = points.map((point, index) => {
    if (point.floor !== floor.floor) return '';
    const command = points[index - 1]?.floor === floor.floor ? 'L' : 'M';
    return `${command}${point.x},${point.y}`;
  }).join(' ');
  const transitions = routeStairTransitions(points);

  function selectPoint(event: MouseEvent<SVGSVGElement>) {
    if (camera.moved.current) return;
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return;
    onPick?.(point);
  }

  return (
    <div className="map-viewport" ref={camera.viewport} style={{ aspectRatio: width / height }}>
      <svg className={onPick ? "floor-map floor-map-pickable" : "floor-map"} viewBox={camera.viewBox}
        tabIndex={0} onClick={onPick && selectPoint} {...camera.events}
        role="img" aria-label={`Klaus level ${floor.floor} map${onPick ? '. Tap a corridor to set your start.' : ''}`}>
        <image href={`${import.meta.env.BASE_URL}${floor.mapUrl.slice(1)}`} width={width} height={height} />
        <g className="fire-spread">
          {simulation && (segmentsByFloor.get(floor.floor) ?? []).map(({ edgeId, start, end }) =>
            simulation.burning.has(start.id) && simulation.burning.has(end.id) && (
              <line key={edgeId} className="fire-segment" x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
            ),
          )}
        </g>
        <path className="route-halo" d={path} />
        <path className="route-line" d={path} />
        {transitions.map(({ from, to, index }) => from.floor === floor.floor && (
          <g key={index} transform={`translate(${from.x} ${from.y})`}>
            <circle className="step-marker" r="12" />
            <text className="step-label" textAnchor="middle" dominantBaseline="central">{to.floor}</text>
          </g>
        ))}
        {exit?.floor === floor.floor && <circle className="exit-marker" cx={exit.x} cy={exit.y} r="11" />}
        {simulation && [...simulation.burning].map(id => {
          const node = nodes.get(id);
          if (node?.floor !== floor.floor) return null;
          return <circle key={id} className="fire-marker" cx={node.x} cy={node.y} r={id === simulation.ignition ? 9 : 6} />;
        })}
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
      {camera.manual && <button type="button" className="map-recenter" onClick={camera.reset}>
        {position?.floor === floor.floor ? 'Recenter' : 'Fit map'}
      </button>}
    </div>
  );
}
