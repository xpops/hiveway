import { useRef } from 'react';

type Props = {
  floors: readonly { floor: number }[];
  locating: boolean;
  onOpen: () => void;
  onSelect: (floor: number) => void;
};

export function FloorPickerDialog({ floors, locating, onOpen, onSelect }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  function selectFloor(floor: number) {
    dialog.current?.close();
    onSelect(floor);
  }

  return (
    <>
      <button className="navigate" disabled={locating} onClick={() => { onOpen(); dialog.current?.showModal(); }}>{locating ? 'Locating…' : 'Navigate'}</button>
      <dialog ref={dialog} className="floor-dialog" aria-labelledby="floor-dialog-title">
        <h2 id="floor-dialog-title">Which floor are you on?</h2>
        <div className="floor-options">
          {floors.map(({ floor }) => (
            <button key={floor} className="secondary" onClick={() => selectFloor(floor)}>Level {floor}</button>
          ))}
        </div>
        <form method="dialog" className="floor-dialog-actions">
          <button className="floor-dialog-cancel">Cancel</button>
        </form>
      </dialog>
    </>
  );
}
