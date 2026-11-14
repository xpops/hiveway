import type { MouseEvent } from 'react';
import { floors, nodes, segmentsByFloor, type Point, type Route, type Snap } from '../routing/routing';
import type { FireSimulation } from '../simulation/fireSimulation';

type Props = {
  floor: (typeof floors)[number];
  route: Route | null;
  start: Snap | null;
  simulation: FireSimulation | null;
  onPick: (point: Point) => void;
};

export function FloorMap({ floor, route, start, simulation, onPick }: Props) {
  const { width, height } = floor.coordinateSpace;
  const points = route?.points ?? [];
  const path = points.map((point, index) => {
    if (point.floor !== floor.floor) return '';
    const command = points[index - 1]?.floor === floor.floor ? 'L' : 'M';
    return `${command}${point.x},${point.y}`;
  }).join(' ');
  const transitions = points.flatMap((point, index) => {
    const next = points[index + 1];
    return next && point.floor !== next.floor ? [{ from: point, to: next }] : [];
  });
  const exit = route?.exit.floor === floor.floor ? route.exit : null;

  function selectPoint(event: MouseEvent<SVGSVGElement>) {
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    onPick(point);
  }

  return (
    <svg className="floor-map" viewBox={`0 0 ${width} ${height}`} onClick={selectPoint}
      role="img" aria-label={`Klaus level ${floor.floor} map. Select your location on the map.`}>
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
      {transitions.map(({ from, to }, index) => from.floor === floor.floor && (
        <g key={index} transform={`translate(${from.x} ${from.y})`}>
          <circle className="step-marker" r="12" />
          <text className="step-label" textAnchor="middle" dominantBaseline="central">{to.floor}</text>
        </g>
      ))}
      {exit && <circle className="exit-marker" cx={exit.x} cy={exit.y} r="11" />}
      {start?.floor === floor.floor && (
        <g>
          <line className="start-link" x1={start.inputPoint.x} y1={start.inputPoint.y} x2={start.x} y2={start.y} />
          <circle className="corridor-start-marker" cx={start.x} cy={start.y} r="6" />
          <circle className="start-marker" cx={start.inputPoint.x} cy={start.inputPoint.y} r="9" />
        </g>
      )}
      {simulation && [...simulation.burning].map(id => {
        const node = nodes.get(id);
        if (node?.floor !== floor.floor) return null;
        return <circle key={id} className="fire-marker" cx={node.x} cy={node.y} r={id === simulation.ignition ? 9 : 6} />;
      })}
    </svg>
  );
}
