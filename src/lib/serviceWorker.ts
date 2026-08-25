/**
 * Keeping an installed PWA current.
 *
 * The default registration snippet registers once, on `load`, and never asks
 * again. A home-screen app on iOS is resumed from a frozen state rather than
 * reloaded, so `load` can go days without firing and the device keeps running
 * whatever worker it installed the first time. The fix is to re-check every
 * time the app comes back to the foreground, and — because the worker calls
 * skipWaiting and clientsClaim — to reload as soon as the new one takes over.
 */

/** Two events fire together when an app is foregrounded; one check is enough. */
const MIN_CHECK_INTERVAL_MS = 5_000

export interface RegisterOptions {
  /** Injected so tests can observe the reload instead of performing one. */
  reload?: () => void
}

export function registerServiceWorker({
  reload = () => window.location.reload(),
}: RegisterOptions = {}): void {
  if (!('serviceWorker' in navigator)) {
    return
  }

  // Tracked as it changes, not snapshotted at startup. On the very first
  // visit the page loads uncontrolled and the new worker claims it moments
  // later; treating that one claim as "already controlled" for the rest of
  // the session would swallow the reload for every later version.
  let controlled = Boolean(navigator.serviceWorker.controller)
  let reloaded = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first worker to claim this page cached the code already on screen,
    // so there is nothing stale to replace.
    if (!controlled) {
      controlled = true
      return
    }
    if (reloaded) {
      return
    }
    reloaded = true
    reload()
  })

  const start = () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then((registration) => {
        let lastCheck = 0

        const checkForUpdate = () => {
          if (document.visibilityState !== 'visible') {
            return
          }
          const now = Date.now()
          if (now - lastCheck < MIN_CHECK_INTERVAL_MS) {
            return
          }
          lastCheck = now
          // Rejects while offline, which is not a failure worth surfacing.
          registration.update().catch(() => {})
        }

        checkForUpdate()
        document.addEventListener('visibilitychange', checkForUpdate)
        window.addEventListener('focus', checkForUpdate)
      })
      .catch(() => {
        // No worker means the app still runs, just without offline support.
      })
  }

  // Registering competes with the first paint for bandwidth, so it waits for
  // load — unless load already happened, in which case it never fires again.
  if (document.readyState === 'complete') {
    start()
  } else {
    window.addEventListener('load', start, { once: true })
  }
}
