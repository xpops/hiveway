import { useEffect, useRef } from 'react';

type Props = {
  floor: number;
  onArrival: () => void;
};

export function StairArrivalDialog({ floor, onArrival }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="floor-dialog" aria-labelledby="stair-dialog-title"
      aria-describedby="stair-dialog-instruction" onCancel={event => event.preventDefault()}>
      <h2 id="stair-dialog-title">Have you arrived on Level {floor}?</h2>
      <p id="stair-dialog-instruction">Continue on the stairs to Level {floor}, then confirm your arrival.</p>
      <button type="button" className="navigate arrival-confirm" onClick={onArrival}>I’m on Level {floor}</button>
    </dialog>
  );
}
