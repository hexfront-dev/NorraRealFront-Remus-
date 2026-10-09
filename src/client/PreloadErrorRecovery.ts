/**
 * Self-heal from a failed lazy-chunk load.
 *
 * Vite dispatches `vite:preloadError` on `window` when an `import()` (the
 * lazily-loaded core worker chunk, the debug GUI, etc.) fails to fetch. In
 * production the usual cause is a stale app shell: a page held by a CDN, a
 * service worker, or a long-open tab references a content-hashed chunk that a
 * newer deploy no longer serves (which now 404s — see Master.ts). Without this
 * handler the failure surfaces as an unrecoverable
 * "Failed to fetch dynamically imported module" and the game never starts.
 *
 * Recovery: reload once, with a cache-busting query so a shared cache cannot
 * hand back the same stale shell. A cooldown (kept in sessionStorage) prevents
 * a reload loop when the chunk is genuinely gone (broken deploy / offline);
 * after one attempt within the window we let the error surface normally.
 */
const RELOAD_GUARD_KEY = "openfront:preload-error-reload-at";
const RELOAD_COOLDOWN_MS = 15_000;

function readLastReloadAt(): number {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeLastReloadAt(value: number): void {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(value));
  } catch {
    // Private mode / disabled storage: fall back to no persistence.
  }
}

export function installPreloadErrorRecovery(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (event: Event) => {
    // Vite rethrows by default; take over recovery instead.
    event.preventDefault();

    const now = Date.now();
    if (now - readLastReloadAt() < RELOAD_COOLDOWN_MS) {
      // Already reloaded very recently and it still failed — don't loop.
      return;
    }
    writeLastReloadAt(now);

    // A fresh query key forces a cache miss on the app shell, so the reload
    // cannot be answered with the same stale shell that caused the failure.
    const url = new URL(window.location.href);
    url.searchParams.set("_r", String(now));
    window.location.replace(url.toString());
  });
}

installPreloadErrorRecovery();
