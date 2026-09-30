let applying = false;
let reloading = false;
const reload = () => {
  if (!reloading) {
    reloading = true;
    window.location.reload();
  }
};

export async function applyUpdate() {
  const registration = await navigator.serviceWorker.getRegistration(
    new URL(import.meta.env.BASE_URL, document.baseURI).href,
  );
  const worker = registration?.waiting;
  // Another tab may already have activated the update; the current HTML can still be old.
  if (!worker) {
    reload();
    return;
  }
  applying = true;
  worker.addEventListener("statechange", () => {
    if (worker.state === "activated") reload();
  });
  worker.postMessage({ type: "APPLY_UPDATE" });
}

export function installUpdates() {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "APPLYING_UPDATE") applying = true;
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (applying) reload();
  });
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then((registration) => {
        if (registration.waiting)
          window.dispatchEvent(new Event("audiolab-update-ready"));
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting && navigator.serviceWorker.controller)
              window.dispatchEvent(new Event("audiolab-update-ready"));
          });
        });
      })
      .catch(() => {
        /* Online playback remains available. */
      });
  });
}
