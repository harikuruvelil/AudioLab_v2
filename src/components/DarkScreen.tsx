import { useEffect, useRef } from "react";
import { ICON_CLOSE } from "./Icons";
export function DarkScreen({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dark-lock-overlay v2-dark-screen"
      aria-label="Dark screen"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        type="button"
        className="dark-lock-exit"
        onClick={onClose}
        aria-label="Exit dark screen"
      >
        {ICON_CLOSE}
      </button>
    </dialog>
  );
}
