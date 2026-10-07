import { useEffect, useRef, type ReactNode } from "react";
import { ICON_CLOSE } from "./Icons";
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const resize = () => {
      const viewport = window.visualViewport;
      dialog.style.setProperty(
        "--sheet-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      dialog.style.setProperty("--sheet-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    dialog.showModal();
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      dialog.close();
      previous?.focus({ preventScroll: true });
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="v2-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <section className="settings-sheet v2-sheet">
        <header className="settings-sheet-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="icon-button sheet-close"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            {ICON_CLOSE}
          </button>
        </header>
        <div className="v2-sheet-scroll">{children}</div>
      </section>
    </dialog>
  );
}
