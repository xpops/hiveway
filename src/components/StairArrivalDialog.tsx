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
    <>
      <button className="secondary" onClick={() => dialog.current?.showModal()}>Confirm Level {floor} arrival</button>
      <dialog ref={dialog} className="floor-dialog" aria-labelledby="stair-dialog-title">
        <h2 id="stair-dialog-title">Have you arrived on Level {floor}?</h2>
        <form method="dialog" className="floor-options" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button className="secondary" autoFocus>Not yet</button>
          <button className="secondary" onClick={onArrival}>I’m on Level {floor}</button>
        </form>
      </dialog>
    </>
  );
}
