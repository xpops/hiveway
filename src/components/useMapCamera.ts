import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Point } from '../routing/routing';

type Size = { width: number; height: number };
type Camera = { center: Point; zoom: number };
const portraitLayout = '(max-width: 768px) and (orientation: portrait)';

function gesturePosition(pointers: Map<number, Point>) {
  const [first, second] = pointers.values();
  if (!second) return { center: first, distance: 0 };
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

export function useMapCamera(map: Size, focus?: Point) {
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const moved = useRef(false);
  const [size, setSize] = useState<Size & { portrait: boolean }>({ ...map, portrait: false });
  const [manualCamera, setManualCamera] = useState<Camera | null>(null);

  useLayoutEffect(() => {
    const element = viewport.current!;
    const media = window.matchMedia(portraitLayout);
    function measure() {
      const { clientWidth: width, clientHeight: height } = element;
      if (width && height) setSize({ width, height, portrait: media.matches });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    media.addEventListener('change', measure);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', measure);
    };
  }, []);

  const fit = Math.max(map.width / size.width, map.height / size.height);
  const mapCenter = { x: map.width / 2, y: map.height / 2 };
  const defaultCamera = size.portrait && focus ? { center: focus, zoom: 2.6 } : { center: mapCenter, zoom: 1 };
  const { center, zoom } = manualCamera ?? defaultCamera;
  const viewWidth = size.width * fit / zoom;
  const viewHeight = size.height * fit / zoom;

  function transformCamera(from: Point, to: Point, factor = 1) {
    const { left, top, width, height } = viewport.current!.getBoundingClientRect();
    const middle = { x: left + width / 2, y: top + height / 2 };
    setManualCamera(previous => {
      const current = previous ?? defaultCamera;
      const zoom = Math.min(9, Math.max(1, current.zoom * factor));
      const x = current.center.x + (from.x - middle.x) * fit / current.zoom - (to.x - middle.x) * fit / zoom;
      const y = current.center.y + (from.y - middle.y) * fit / current.zoom - (to.y - middle.y) * fit / zoom;
      return {
        center: { x: Math.max(0, Math.min(map.width, x)), y: Math.max(0, Math.min(map.height, y)) },
        zoom,
      };
    });
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || pointers.current.size >= 2) return;
    if (!pointers.current.size) moved.current = false;
    else moved.current = true;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const active = pointers.current;
    if (!active.has(event.pointerId)) return;
    const before = gesturePosition(active);
    if (!moved.current && Math.hypot(event.clientX - before.center.x, event.clientY - before.center.y) < 6) return;
    moved.current = true;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = gesturePosition(active);
    transformCamera(before.center, after.center, before.distance > 1 ? after.distance / before.distance : 1);
  }

  function endPointer(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
  }

  // Register wheel explicitly so it can prevent page scrolling while zooming the map.
  const applyWheel = useRef(transformCamera);
  useLayoutEffect(() => { applyWheel.current = transformCamera; });
  useEffect(() => {
    const element = viewport.current!;
    function zoomWithWheel(event: WheelEvent) {
      if ((event.target as Element).closest('button')) return;
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      applyWheel.current(point, point, Math.exp(-delta * .002));
    }
    element.addEventListener('wheel', zoomWithWheel, { passive: false });
    return () => element.removeEventListener('wheel', zoomWithWheel);
  }, []);

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const { left, top, width, height } = viewport.current!.getBoundingClientRect();
    const point = { x: left + width / 2, y: top + height / 2 };
    switch (event.key) {
      case '+':
      case '=': transformCamera(point, point, 1.25); break;
      case '-': transformCamera(point, point, .8); break;
      case 'ArrowLeft': transformCamera(point, { ...point, x: point.x + 40 }); break;
      case 'ArrowRight': transformCamera(point, { ...point, x: point.x - 40 }); break;
      case 'ArrowUp': transformCamera(point, { ...point, y: point.y + 40 }); break;
      case 'ArrowDown': transformCamera(point, { ...point, y: point.y - 40 }); break;
      case 'Home': setManualCamera(null); break;
      default: return;
    }
    event.preventDefault();
  }

  return {
    viewport,
    moved,
    viewBox: `${center.x - viewWidth / 2} ${center.y - viewHeight / 2} ${viewWidth} ${viewHeight}`,
    manual: manualCamera !== null,
    reset: () => setManualCamera(null),
    events: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer, onLostPointerCapture: endPointer, onKeyDown },
  };
}
